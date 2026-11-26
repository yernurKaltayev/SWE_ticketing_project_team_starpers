import type { ReactNode } from "react";
import type { Locale } from "@biletflow/shared";
import { commerceCopy } from "@biletflow/shared/features/checkout/copy";
import { Action, Screen, Title } from "../ui";
import { Read } from "./resource";

type Page<T> = { items: T[]; total: number; offset: number; limit: number };

export function PageNav({ page, locale, change }: { page: Page<unknown>; locale: Locale; change: (offset: number) => void }) {
  const t = commerceCopy[locale];
  return (
    <>
      {page.offset > 0 ? <Action title={t.previous} onPress={() => change(Math.max(0, page.offset - page.limit))} /> : null}
      {page.offset + page.items.length < page.total && page.items.length > 0 ? (
        <Action title={t.next} onPress={() => change(page.offset + page.limit)} />
      ) : null}
    </>
  );
}

export function RecordPage<T>({ title, empty, locale, resource, change, header, render }: {
  title: string; empty: string; locale: Locale;
  resource: { data?: Page<T>; error: unknown; refetch(): unknown };
  change: (offset: number) => void;
  header?: ReactNode;
  render: (item: T) => ReactNode;
}) {
  return (
    <Screen>
      <Title>{title}</Title>
      {header}
      <Read resource={resource} locale={locale}>{(page) => <>
        {page.items.length ? page.items.map(render) : <Title>{empty}</Title>}
        <PageNav page={page} locale={locale} change={change} />
      </>}</Read>
    </Screen>
  );
}
