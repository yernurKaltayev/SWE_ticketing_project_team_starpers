import { ApiError } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";

export type StaffEvent = components["schemas"]["StaffEventOut"];
export type VerifyOut = components["schemas"]["VerifyOut"];
export type Ticket = components["schemas"]["TicketOut"];
export type Attendee = components["schemas"]["AttendeeOut"];
export type AttendeePage = components["schemas"]["PageAttendeeOut"];
export type CheckInStats = components["schemas"]["CheckInStatsOut"];

/**
 * Everything the scanner can show. Server verdicts come straight from the P15 contract;
 * `cancelled` is split out of `invalid` because the backend returns the cancelled ticket
 * with it. `unknown` means the request may or may not have reached the server: the app
 * never admits locally, so staff must retry or check the attendee list.
 */
export type OutcomeKind =
  | "accepted"
  | "already_used"
  | "refunded"
  | "cancelled"
  | "invalid"
  | "wrong_event"
  | "not_a_ticket"
  | "unknown"
  | "denied"
  | "expired"
  | "error";

export type Tone = "admit" | "reject" | "unknown";

export interface Outcome {
  kind: OutcomeKind;
  ticket: Ticket | null;
  /** Server message, shown under the localized headline for accepted/rejected verdicts. */
  message: string | null;
  /** Request-to-result time in milliseconds; null when no request completed. */
  latencyMs: number | null;
  /** For `unknown`: whether the request timed out or never connected. */
  cause?: "timeout" | "network";
  /** For `error`: the API error code, for support. */
  code?: string;
  requestId?: string | null;
  /**
   * A retry after an unknown result came back `already_used`: the earlier attempt most likely
   * admitted this person. Staff should confirm identity rather than turn them away.
   */
  reconciled?: boolean;
}

/** Results that mean "let them in". Everything else blocks admission. */
export function toneOf(kind: OutcomeKind): Tone {
  if (kind === "accepted") return "admit";
  if (kind === "unknown" || kind === "error") return "unknown";
  return "reject";
}

/** Normalize a server verdict into an outcome. */
export function fromVerify(result: VerifyOut, latencyMs: number): Outcome {
  const kind: OutcomeKind =
    result.result === "invalid" && result.ticket?.status === "cancelled"
      ? "cancelled"
      : result.result;
  return { kind, ticket: result.ticket, message: result.message, latencyMs };
}

/** Normalize a failed request. Never returns an admitting outcome. */
export function fromFailure(
  error: unknown,
  latencyMs: number | null,
  timedOut: boolean,
): Outcome {
  const base = { ticket: null, message: null, latencyMs };
  if (timedOut) return { ...base, kind: "unknown", cause: "timeout" };
  if (error instanceof ApiError) {
    if (error.status === 0 || error.code === "network_error")
      return { ...base, kind: "unknown", cause: "network" };
    if (error.status === 401) return { ...base, kind: "expired" };
    if (error.status === 403 || error.status === 404)
      return { ...base, kind: "denied", code: error.code };
    return {
      ...base,
      kind: "error",
      code: error.code,
      requestId: error.requestId,
    };
  }
  return { ...base, kind: "error", code: "unexpected" };
}

/** Flag the likely double-submission after an unknown result for the same code. */
export function reconcile(
  previous: { payload: string; outcome: Outcome } | null,
  payload: string,
  next: Outcome,
): Outcome {
  if (
    previous?.payload === payload &&
    previous.outcome.kind === "unknown" &&
    next.kind === "already_used"
  )
    return { ...next, reconciled: true };
  return next;
}

/** Above this the scanner tells staff the connection is slow (SRS target: under 2 s). */
export const SLOW_AFTER_MS = 2000;
/** Give up waiting and report an unknown result, so the queue keeps moving. */
export const GIVE_UP_AFTER_MS = 10000;

export type Clock = () => number;

/**
 * Run one verification with a timeout and latency measurement.
 *
 * `send` gets an AbortSignal and performs the request. A `request_not_replayed` 401 (the
 * shared session refreshed an expired access token but will not replay a POST) means the
 * server never processed the scan, so it is sent once more.
 */
export async function runVerification(
  send: (signal: AbortSignal) => Promise<VerifyOut>,
  {
    clock = () => Date.now(),
    giveUpAfterMs = GIVE_UP_AFTER_MS,
    signal,
  }: { clock?: Clock; giveUpAfterMs?: number; signal?: AbortSignal } = {},
): Promise<Outcome> {
  const started = clock();
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, giveUpAfterMs);
  const forward = () => controller.abort();
  signal?.addEventListener("abort", forward);
  try {
    let result: VerifyOut;
    try {
      result = await send(controller.signal);
    } catch (error) {
      if (
        error instanceof ApiError &&
        error.code === "request_not_replayed" &&
        !controller.signal.aborted
      )
        result = await send(controller.signal);
      else throw error;
    }
    return fromVerify(result, clock() - started);
  } catch (error) {
    if (signal?.aborted && !timedOut) throw error;
    return fromFailure(error, timedOut ? clock() - started : null, timedOut);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", forward);
  }
}

/**
 * Guards the camera callback. The camera reports the same code many times per second, so
 * only one verification may be in flight, and after a result the scanner stays locked until
 * staff dismiss it. The code just handled is also ignored for a short while after unlocking,
 * because it is usually still in front of the lens.
 */
export interface ScanGate {
  /** True if this payload should be verified now; locks the gate. */
  tryBegin(payload: string): boolean;
  /** Unlock after staff dismissed the result. */
  release(): void;
  readonly busy: boolean;
}

export const REPEAT_COOLDOWN_MS = 3000;

export function createScanGate(
  clock: Clock = () => Date.now(),
  cooldownMs = REPEAT_COOLDOWN_MS,
): ScanGate {
  let locked = false;
  let last: { payload: string; releasedAt: number } | null = null;
  let current: string | null = null;
  return {
    tryBegin(payload) {
      const value = payload.trim();
      if (locked || !value) return false;
      if (
        last &&
        last.payload === value &&
        clock() - last.releasedAt < cooldownMs
      )
        return false;
      locked = true;
      current = value;
      return true;
    },
    release() {
      if (!locked) return;
      locked = false;
      if (current !== null) last = { payload: current, releasedAt: clock() };
      current = null;
    },
    get busy() {
      return locked;
    },
  };
}

/** Only these events offer scanning; support-only assignments are listed but read-only. */
export function scannableEvents(events: StaffEvent[]): StaffEvent[] {
  return events.filter(
    (event) => event.can_check_in && event.status === "published",
  );
}

export function percent(stats: CheckInStats | null | undefined): number {
  if (!stats || stats.registered === 0) return 0;
  return Math.round((stats.checked_in / stats.registered) * 100);
}

/** API paths, kept in one place so screens and tests agree. */
export const paths = {
  staffEvents: "/api/v1/me/staff-events",
  stats: (eventId: string) =>
    `/api/v1/events/${encodeURIComponent(eventId)}/checkin/stats`,
  verify: "/api/v1/checkin/verify",
  manual: "/api/v1/checkin/manual",
  undo: (ticketId: string) =>
    `/api/v1/checkin/${encodeURIComponent(ticketId)}/undo`,
  attendees: (eventId: string, q: string, offset = 0, limit = 25) => {
    const query = new URLSearchParams({
      limit: String(limit),
      offset: String(offset),
    });
    if (q.trim()) query.set("q", q.trim());
    return `/api/v1/events/${encodeURIComponent(eventId)}/attendees?${query}`;
  },
};

export const UNDO_REASON_MAX = 500;

export function validUndoReason(reason: string): boolean {
  const trimmed = reason.trim();
  return trimmed.length > 0 && trimmed.length <= UNDO_REASON_MAX;
}
