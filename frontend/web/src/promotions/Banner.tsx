import { useLocation } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { promoCopy, reasonText } from "./copy";
export function PromotionBanner({ locale }: { locale: Locale }) {
  const { search } = useLocation();
  const params = new URLSearchParams(search);
  const code = params.get("promo");
  const reason = params.get("promo_status");
  const t = promoCopy[locale];
  if (!code && !reason) return null;
  return (
    <aside className="notice" aria-label={t.title}>
      {code ? (
        <>
          <p>
            {t.entry}: <strong>{code.slice(0, 64)}</strong>
          </p>
          <p>{t.returnHint}</p>
        </>
      ) : (
        <p role="status">{reasonText(reason, t)}</p>
      )}
    </aside>
  );
}
