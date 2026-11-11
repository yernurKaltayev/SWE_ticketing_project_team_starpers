import { useState } from "react";
import type { Locale } from "@biletflow/shared";
import { useEventRequest } from "../events/data";
import { seatingCopy } from "./copy";
import { SeatPicker } from "./SeatPicker";
import { seatingDemoEventId, seatingDemoOffers } from "../mocks/seating";
import type { SeatingSelection } from "./model";
/** Development-only integration harness, never a customer checkout. */
export default function SeatingDemo({ locale }: { locale: Locale }) {
  const request = useEventRequest();
  const [handoff, setHandoff] = useState<SeatingSelection>();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState(false);
  return (
    <>
      <p className="environment-notice">
        {locale === "kk"
          ? "Орындарды брондау үлгісі. Тапсырыс пен билет жасалмайды."
          : locale === "ru"
            ? "Демонстрация бронирования. Заказ и билет не создаются."
            : "Seating demonstration. No order or ticket is created."}
      </p>
      {handoff ? (
        <>
          <h1>
            {locale === "kk"
              ? "Бронь деректері"
              : locale === "ru"
                ? "Данные брони"
                : "Hold handoff preview"}
          </h1>
          <pre className="seating-handoff">
            {JSON.stringify(handoff, null, 2)}
          </pre>
          {error && <p role="alert">{seatingCopy[locale].error}</p>}
          <button disabled={busy}
            onClick={() => {
              setBusy(true);setError(false);
              void request(
                `/api/v1/events/${seatingDemoEventId}/holds/${handoff.holdIds[0]}`,
                { method: "DELETE" },
              ).then(() => setHandoff(undefined)).catch(()=>setError(true)).finally(()=>setBusy(false));
            }}
          >
            {seatingCopy[locale].release}
          </button>
        </>
      ) : (
        <SeatPicker
          eventId={seatingDemoEventId}
          request={request}
          locale={locale}
          offers={seatingDemoOffers}
          onContinue={(take) => setHandoff(take())}
        />
      )}
    </>
  );
}
