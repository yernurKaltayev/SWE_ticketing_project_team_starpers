import { ApiError } from "@biletflow/shared";

/**
 * A remembered payment id is stale when the server definitely refuses it (4xx other than an
 * expired session) or it belongs to another kind or amount. The card then forgets it and offers
 * a new payment instead of waiting forever on a record that will never load.
 */
export function storedPaymentIsStale(state: {
  kind: string;
  amount: number | undefined;
  error: unknown;
  data: { kind: string; amount: number } | undefined;
}): boolean {
  if (state.error instanceof ApiError)
    return state.error.status >= 400 && state.error.status < 500 && state.error.status !== 401;
  if (!state.data) return false;
  return state.data.kind !== state.kind || (state.amount !== undefined && state.data.amount !== state.amount);
}
