import { useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@biletflow/shared";
import { ApiError, formatMoney } from "@biletflow/shared";
import { useSeatMap } from "./useSeatMap";
import { seatingCopy } from "./copy";
import { HoldController, remainingSeconds, categoryMatches } from "./model";
import type { Request, SeatOffer, SeatingSelection } from "./model";
import "./seating.css";
/** Mount keyed by user/event. Offers must carry authoritative category and tiyn prices. */
export function SeatPicker({
  eventId,
  request,
  locale,
  offers = [],
  onContinue,
}: {
  eventId: string;
  request: Request;
  locale: Locale;
  offers?: SeatOffer[];
  onContinue?: (take: () => SeatingSelection) => void;
}) {
  const t = seatingCopy[locale];
  const resource = useSeatMap(eventId, request);
  const reload = resource.reload;
  const map = resource.data?.event_id === eventId ? resource.data : undefined;
  const controller = useMemo(
    () => new HoldController(request, eventId),
    [request, eventId],
  );
  const [ids, setIds] = useState<string[]>([]);
  const [offerId, setOfferId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<false | "error" | "conflict">(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const mutation = useRef(false);
  const [now, setNow] = useState(Date.now);
  const offer = offers.find((o) => o.id === offerId);
  useEffect(() => {
    controller.activate();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = () => {
      setNow(Date.now());
      reload();
    };
    const poll = setInterval(() => {
      if (!document.hidden) refresh();
    }, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
      window.removeEventListener("focus", refresh);
    };
  }, [reload]);
  useEffect(() => {
    if (!map) return;
    // Reconcile local choices with refreshed authoritative availability.
    // oxlint-disable-next-line react/set-state-in-effect
    setIds((old) =>
      old.filter((id) =>
        map.seats.some((s) => s.id === id && s.status === "available"),
      ),
    );
  }, [map]);
  const hold = controller.hold;
  const enabled =
    !!offer &&
    !!onContinue &&
    !hold &&
    !busy &&
    !controller.uncertain &&
    !!map &&
    !resource.loading;
  const rows = map
    ? [
        ...new Set(map.seats.map((s) => JSON.stringify([s.section, s.row]))),
      ].map((key) => ({
        key,
        seats: map.seats.filter(
          (s) => JSON.stringify([s.section, s.row]) === key,
        ),
      }))
    : [];
  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);
  function toggle(id: string) {
    const seat = map?.seats.find((s) => s.id === id);
    if (
      !enabled ||
      !offer ||
      !seat ||
      seat.status !== "available" ||
      !categoryMatches(seat.price_category, offer.category)
    )
      return;
    setIds((old) =>
      old.includes(id)
        ? old.filter((x) => x !== id)
        : old.length < Math.min(10, offer.limit)
          ? [...old, id]
          : old,
    );
  }
  async function mutate(release: boolean) {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError(false);
    try {
      if (release) await controller.release();
      else if (map && offer) await controller.reserve(map, ids, offer);
      setIds([]);
    } catch (caught) {
      setError(caught instanceof ApiError && caught.status === 409 ? "conflict" : "error");
    } finally {
      mutation.current = false;
      setBusy(false);
      reload();
    }
  }
  return (
    <section className="seating">
      <h1>{t.title}</h1>
      {(!offers.length || !onContinue) && <p className="notice">{t.gap}</p>}
      <p>{t.reload}</p>
      {(error || !!resource.error) && (
        <p role="alert" tabIndex={-1} ref={errorRef}>
          {error ? t[error] : t.error}
        </p>
      )}
      {controller.uncertain && <p role="alert">{t.unknown}</p>}
      <button onClick={resource.reload} disabled={busy}>
        {t.refresh}
      </button>
      {resource.loading && !map && !resource.error && (
        <p role="status">{t.loading}</p>
      )}
      {offers.length > 0 && (
        <label>
          {t.ticket}
          <select
            value={offerId}
            disabled={busy || !!hold || controller.uncertain}
            onChange={(e) => {
              setOfferId(e.target.value);
              setIds([]);
            }}
          >
            <option value="">—</option>
            {offers.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} · {formatMoney(o.priceTiyn, locale)}
              </option>
            ))}
          </select>
        </label>
      )}
      {map?.seats.length === 0 && <p>{t.empty}</p>}
      {!!rows.length && (
        <>
          <h2>{t.map}</h2>
          <p>{t.schematic}</p>
          <div className="seat-map-scroll">
            <svg
              role="group"
              aria-label={t.map}
              viewBox={`0 0 720 ${rows.length * 48 + 10}`}
            >
              {rows.map((row, y) => (
                <g key={row.key} transform={`translate(0 ${y * 48 + 22})`}>
                  <text x="4" fontSize="12">
                    {row.seats[0]!.section} / {row.seats[0]!.row}
                  </text>
                  {row.seats.map((s, x) => (
                    <g
                      key={s.id}
                      role="button"
                      aria-label={`${s.section} / ${s.row} / ${s.label}: ${t[s.status]}${s.accessible ? ` · ${t.accessible}` : ""}`}
                      aria-pressed={ids.includes(s.id)}
                      aria-disabled={
                        !enabled ||
                        !offer ||
                        !categoryMatches(s.price_category, offer.category) ||
                        s.status !== "available" ||
                        (!ids.includes(s.id) &&
                          ids.length >= Math.min(10, offer.limit))
                      }
                      tabIndex={
                        enabled &&
                        offer &&
                        categoryMatches(s.price_category, offer.category) &&
                        s.status === "available"
                          ? 0
                          : -1
                      }
                      onClick={() => toggle(s.id)}
                      onKeyDown={(e) => {
                        if (e.key === " " || e.key === "Enter") {
                          e.preventDefault();
                          toggle(s.id);
                        }
                      }}
                      transform={`translate(${190 + x * Math.min(42, 490 / row.seats.length)} 0)`}
                    >
                      <circle
                        r="15"
                        className={`seat-dot ${ids.includes(s.id) ? "selected" : s.status}`}
                      />
                      <text textAnchor="middle" y="4" fontSize="10">
                        {s.label}
                      </text>
                      <title>{`${s.section}/${s.row}/${s.label}: ${t[s.status]}`}</title>
                    </g>
                  ))}
                </g>
              ))}
            </svg>
          </div>
          <h2>{t.list}</h2>
          {rows.map((row) => (
            <fieldset key={row.key}>
              <legend>
                {row.seats[0]!.section} / {row.seats[0]!.row}
              </legend>
              <div className="seat-list">
                {row.seats.map((s) => {
                  const selected = ids.includes(s.id);
                  const matches =
                    !!offer &&
                    categoryMatches(s.price_category, offer.category);
                  return (
                    <button
                      type="button"
                      className="secondary"
                      key={s.id}
                      aria-pressed={selected}
                      disabled={
                        !enabled ||
                        !matches ||
                        s.status !== "available" ||
                        (!selected &&
                          ids.length >= Math.min(10, offer?.limit ?? 0))
                      }
                      onClick={() => toggle(s.id)}
                    >
                      {s.label} ·{" "}
                      {hold?.seat_ids.includes(s.id)
                        ? t.confirm
                        : selected
                          ? t.selected
                          : t[s.status]}
                      {s.accessible ? ` · ${t.accessible}` : ""}
                      <br />
                      {s.price_category ?? "—"}
                      {matches
                        ? ` · ${formatMoney(offer!.priceTiyn, locale)}`
                        : ""}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </>
      )}
      {enabled && (
        <button
          disabled={
            !ids.length ||
            ids.some(
              (id) =>
                !map?.seats.some(
                  (s) => s.id === id && s.status === "available",
                ),
            )
          }
          onClick={() => void mutate(false)}
        >
          {t.reserve} ({ids.length})
        </button>
      )}
      {hold && (
        <div className="notice">
          <p role="status">
            {remainingSeconds(hold.expires_at, now) ? t.confirm : t.expired}
          </p>
          <p>
            {t.expires}: {remainingSeconds(hold.expires_at, now)}
          </p>
          <p>{t.expiryHint}</p>
          <button disabled={busy} onClick={() => void mutate(true)}>
            {t.release}
          </button>
          {onContinue && offer && (
            <button
              disabled={busy || !map || !remainingSeconds(hold.expires_at, now)}
              onClick={() => {
                try {
                  onContinue(() => controller.transfer(offer));
                } catch {
                  setError("error");
                }
              }}
            >
              {t.proceed}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
