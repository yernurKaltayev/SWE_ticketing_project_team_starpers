import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { paymentCopy } from "@biletflow/shared/features/payments/copy";
import { parsePayment } from "@biletflow/shared/features/payments/model";
import type { Payment as PaymentRecord } from "@biletflow/shared/features/payments/model";
import { queryKeys } from "@biletflow/shared/features/query-keys";
import { Failure, request, useResource } from "../features/resource";
import { useWrite } from "../features/use-write";
import { useSessionSnapshot } from "../session";
import { Action, Body, Callout, Card, Heading, Muted } from "../ui";
import { secureStorage } from "./state";
import { storedPaymentIsStale } from "./payment-state";

export function Payment({ startPath, kind, amount, locale, changed }: {
  startPath: string; kind: PaymentRecord["kind"]; amount?: number; locale: Locale; changed?: () => unknown;
}) {
  const t = paymentCopy[locale];
  const { user } = useSessionSnapshot();
  const cache = useQueryClient();
  const storageKey = `biletflow:f4:${user?.id}:${startPath}`;
  const [id, setId] = useState(() => {
    try { return secureStorage.getItem(storageKey) ?? ""; } catch { return ""; }
  });
  const path = id ? `/api/v1/payments/${encodeURIComponent(id)}` : "";
  const record = useResource(path, parsePayment, { interval: 5000, key: queryKeys.payments(user?.id, path) });
  const write = useWrite(`payment:${startPath}`);
  // A remembered id the server refuses, or for another order amount, must not hide "Start payment".
  const stale = Boolean(id) && storedPaymentIsStale({ kind, amount, error: record.error, data: record.data });
  useEffect(() => {
    if (!stale) return;
    try { secureStorage.removeItem(storageKey); } catch { /* nothing persisted to forget */ }
    setId("");
  }, [stale, storageKey]);
  const payment = record.data?.kind === kind && (amount === undefined || record.data.amount === amount) && !record.isError
    ? record.data : undefined;

  function act(outcome?: "succeeded" | "failed") {
    void write.run(async () => {
      const result = parsePayment(await request(outcome ? `${path}/simulate` : startPath, {
        method: "POST", ...(outcome ? { body: { outcome } } : {}),
      }));
      if (result.kind !== kind || (amount !== undefined && result.amount !== amount)) throw new Error("invalid payment");
      try { secureStorage.setItem(storageKey, result.id); } catch { /* the server resumes its pending payment */ }
      setId(result.id);
      const nextPath = `/api/v1/payments/${encodeURIComponent(result.id)}`;
      cache.setQueryData(queryKeys.payments(user?.id, nextPath), result);
      await cache.invalidateQueries({ queryKey: queryKeys.commerceAll() });
      await changed?.();
    }, true).then(() => {
      if (id) void record.refetch();
    });
  }

  const messages = { pending: t.pending, succeeded: t.succeeded, failed: t.failed, cancelled: t.cancelled } as const;

  return <Card>
    <Heading>{t.payment}</Heading>
    <Callout tone="warning">{t.demo}</Callout>
    <Failure error={write.error ?? record.error} locale={locale} retry={id ? () => void record.refetch() : undefined} />
    {write.error ? <Muted>{t.checkFirst}</Muted> : null}
    {!id ? <Action title={kind === "ticket" ? t.startPayment : t.startFee} disabled={write.busy} busy={write.busy}
      onPress={() => act()} /> : null}
    {id && record.isPending ? <Muted>{t.loading}</Muted> : null}
    {payment ? <>
      <Body>{t.amount} {formatPrice(payment.amount, locale, payment.currency)}</Body>
      <Muted>{messages[payment.status as keyof typeof messages] ?? t.unavailable}</Muted>
      {payment.status === "pending" ? <>
        <Action title={t.succeed} disabled={write.busy} onPress={() => act("succeeded")} />
        <Action title={t.fail} disabled={write.busy} onPress={() => act("failed")} />
      </> : null}
      {payment.status === "failed" ? <Action title={t.retryPayment} disabled={write.busy} onPress={() => act()} /> : null}
    </> : null}
    {id ? <Action title={t.refresh} disabled={write.busy} onPress={() => void record.refetch()} /> : null}
  </Card>;
}
