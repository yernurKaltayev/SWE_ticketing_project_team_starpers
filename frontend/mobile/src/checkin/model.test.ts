import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@biletflow/shared";
import {
  createScanGate,
  fromFailure,
  fromVerify,
  paths,
  percent,
  reconcile,
  runVerification,
  scannableEvents,
  toneOf,
  validUndoReason,
} from "./model";
import type { StaffEvent, Ticket, VerifyOut } from "./model";

const ticket: Ticket = {
  id: "t-1",
  ticket_number: "TKT-1",
  event_id: "e-1",
  ticket_type: "General",
  attendee_name: "Aruzhan",
  seat: null,
  status: "checked_in",
  qr_url: "/qr",
  pdf_url: "/pdf",
};

function verify(result: VerifyOut["result"], extra: Partial<VerifyOut> = {}) {
  return { result, ticket: null, message: `server ${result}`, ...extra };
}

describe("outcomes", () => {
  it("passes server verdicts through and only admits on accepted", () => {
    for (const result of [
      "accepted",
      "already_used",
      "refunded",
      "invalid",
      "wrong_event",
      "not_a_ticket",
    ] as const) {
      const outcome = fromVerify(verify(result), 120);
      expect(outcome.kind).toBe(result);
      expect(outcome.latencyMs).toBe(120);
      expect(toneOf(outcome.kind)).toBe(
        result === "accepted" ? "admit" : "reject",
      );
    }
  });

  it("shows a cancelled ticket as cancelled, not as a forged code", () => {
    const outcome = fromVerify(
      verify("invalid", { ticket: { ...ticket, status: "cancelled" } }),
      80,
    );
    expect(outcome.kind).toBe("cancelled");
    expect(toneOf(outcome.kind)).toBe("reject");
  });

  it("treats connection failures and timeouts as unknown, never as invalid", () => {
    const network = fromFailure(
      new ApiError(0, "network_error", "down"),
      null,
      false,
    );
    expect(network).toMatchObject({ kind: "unknown", cause: "network" });
    expect(fromFailure(new Error("abort"), 10000, true)).toMatchObject({
      kind: "unknown",
      cause: "timeout",
      latencyMs: 10000,
    });
    expect(toneOf("unknown")).toBe("unknown");
  });

  it("maps auth failures to session and permission states", () => {
    expect(fromFailure(new ApiError(401, "invalid_token", "x"), 5, false).kind).toBe(
      "expired",
    );
    expect(
      fromFailure(new ApiError(403, "event_access_denied", "x"), 5, false),
    ).toMatchObject({ kind: "denied", code: "event_access_denied" });
    expect(
      fromFailure(new ApiError(500, "internal_error", "x", null, "req-1"), 5, false),
    ).toMatchObject({ kind: "error", code: "internal_error", requestId: "req-1" });
  });

  it("flags already_used after an unknown attempt for the same code", () => {
    const unknown = fromFailure(new ApiError(0, "network_error", ""), null, false);
    const used = fromVerify(verify("already_used", { ticket }), 300);
    expect(reconcile({ payload: "BF1.a", outcome: unknown }, "BF1.a", used).reconciled).toBe(
      true,
    );
    expect(
      reconcile({ payload: "BF1.b", outcome: unknown }, "BF1.a", used).reconciled,
    ).toBeUndefined();
    expect(reconcile(null, "BF1.a", used).reconciled).toBeUndefined();
  });
});

describe("runVerification", () => {
  it("measures request-to-result latency", async () => {
    let now = 1000;
    const outcome = await runVerification(
      async () => {
        now += 420;
        return verify("accepted", { ticket });
      },
      { clock: () => now },
    );
    expect(outcome).toMatchObject({ kind: "accepted", latencyMs: 420 });
  });

  it("gives up after the deadline and reports an unknown result", async () => {
    vi.useFakeTimers();
    try {
      const pending = runVerification(
        (signal) =>
          new Promise<VerifyOut>((_, reject) =>
            signal.addEventListener("abort", () =>
              reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
            ),
          ),
        { giveUpAfterMs: 50 },
      );
      await vi.advanceTimersByTimeAsync(60);
      expect(await pending).toMatchObject({ kind: "unknown", cause: "timeout" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("resends once when the session refreshed but did not replay the POST", async () => {
    const send = vi
      .fn<(signal: AbortSignal) => Promise<VerifyOut>>()
      .mockRejectedValueOnce(new ApiError(401, "request_not_replayed", "again"))
      .mockResolvedValueOnce(verify("accepted", { ticket }));
    const outcome = await runVerification(send);
    expect(send).toHaveBeenCalledTimes(2);
    expect(outcome.kind).toBe("accepted");
  });

  it("does not resend other failures", async () => {
    const send = vi
      .fn<(signal: AbortSignal) => Promise<VerifyOut>>()
      .mockRejectedValue(new ApiError(0, "network_error", "down"));
    const outcome = await runVerification(send);
    expect(send).toHaveBeenCalledTimes(1);
    expect(outcome.kind).toBe("unknown");
  });

  it("rethrows when the caller cancels (screen closed)", async () => {
    const controller = new AbortController();
    const pending = runVerification(
      (signal) =>
        new Promise<VerifyOut>((_, reject) =>
          signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("aborted"), { name: "AbortError" })),
          ),
        ),
      { signal: controller.signal },
    );
    controller.abort();
    await expect(pending).rejects.toThrow("aborted");
  });
});

describe("scan gate", () => {
  it("lets exactly one frame through while a verification is in flight", () => {
    const gate = createScanGate(() => 0);
    expect(gate.tryBegin("BF1.a")).toBe(true);
    expect(gate.tryBegin("BF1.a")).toBe(false);
    expect(gate.tryBegin("BF1.b")).toBe(false);
    expect(gate.busy).toBe(true);
  });

  it("ignores the same code briefly after release but accepts a new one", () => {
    let now = 0;
    const gate = createScanGate(() => now, 3000);
    gate.tryBegin("BF1.a");
    gate.release();
    now = 1000;
    expect(gate.tryBegin("BF1.a")).toBe(false);
    expect(gate.tryBegin("BF1.b")).toBe(true);
    gate.release();
    now = 5000;
    expect(gate.tryBegin("BF1.a")).toBe(true);
  });

  it("ignores empty payloads", () => {
    const gate = createScanGate();
    expect(gate.tryBegin("   ")).toBe(false);
    expect(gate.busy).toBe(false);
  });
});

describe("helpers", () => {
  const base: StaffEvent = {
    event_id: "e-1",
    title: "Show",
    starts_at: "2026-12-01T15:00:00Z",
    ends_at: "2026-12-01T18:00:00Z",
    timezone: "Asia/Almaty",
    status: "published",
    venue_name: "Hall",
    venue_city: "Almaty",
    role: "checkin",
    can_check_in: true,
  };

  it("offers scanning only for published events with check-in rights", () => {
    const events = [
      base,
      { ...base, event_id: "e-2", role: "support" as const, can_check_in: false },
      { ...base, event_id: "e-3", status: "cancelled" },
    ];
    expect(scannableEvents(events).map((e) => e.event_id)).toEqual(["e-1"]);
  });

  it("computes the checked-in percentage safely", () => {
    expect(percent({ registered: 0, checked_in: 0 })).toBe(0);
    expect(percent({ registered: 3, checked_in: 1 })).toBe(33);
    expect(percent(null)).toBe(0);
  });

  it("builds encoded attendee search paths", () => {
    expect(paths.attendees("e 1", " Aru ", 25)).toBe(
      "/api/v1/events/e%201/attendees?limit=25&offset=25&q=Aru",
    );
    expect(paths.attendees("e1", "")).toBe(
      "/api/v1/events/e1/attendees?limit=25&offset=0",
    );
  });

  it("requires a non-empty undo reason within the server limit", () => {
    expect(validUndoReason("  ")).toBe(false);
    expect(validUndoReason("Scanned the wrong person")).toBe(true);
    expect(validUndoReason("x".repeat(501))).toBe(false);
  });
});
