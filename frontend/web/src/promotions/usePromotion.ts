import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { codeValue, selectedCart, validatePromo } from "./model";
import type { Request, Validation } from "./model";
import type { Choice } from "../checkout/model";
export function usePromotion(
  eventId: string,
  choices: Choice[],
  quantities: Record<string, number>,
  request: Request,
) {
  const [params, setParams] = useSearchParams();
  const code = codeValue(params.get("promo") ?? "");
  const cart = useMemo(
    () => selectedCart(choices, quantities),
    [choices, quantities],
  );
  const [revision, retry] = useState(0);
  const key = JSON.stringify([eventId, code, cart, revision]);
  const [state, setState] = useState<{
    key: string;
    result?: Validation;
    error?: boolean;
  }>({ key: "" });
  useEffect(() => {
    if (!code || code.length > 64 || !cart) return;
    const abort = new AbortController();
    void validatePromo(request, eventId, code, cart.ids, abort.signal)
      .then((result) => {
        if (result.discount_amount > cart.subtotal)
          throw new Error("invalid_discount");
        if (!abort.signal.aborted) setState({ key, result });
      })
      .catch(() => {
        if (!abort.signal.aborted) setState({ key, error: true });
      });
    return () => abort.abort();
  }, [code, cart, eventId, request, key, revision]);
  const current = state.key === key ? state : undefined;
  const status = params.get("promo_status");
  return {
    code,
    status,
    cart,
    result: current?.result,
    error: code.length > 64 || current?.error,
    loading: !!code && code.length <= 64 && !!cart && !current,
    blocked: !!code && (!cart || !current?.result?.valid || code.length > 64),
    apply: (value: string) =>
      setParams(
        (old) => {
          const p = new URLSearchParams(old);
          p.delete("promo_status");
          const normalized = codeValue(value).slice(0, 64);
          if (normalized) p.set("promo", normalized);
          else p.delete("promo");
          return p;
        },
        { replace: true },
      ),
    retry: () => retry((n) => n + 1),
  };
}
