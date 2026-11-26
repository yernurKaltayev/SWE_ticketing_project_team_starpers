import type { ReactNode } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@biletflow/shared";
import type { ApiRequestOptions, Locale, Session } from "@biletflow/shared";
import { authCopy } from "@biletflow/shared/features/auth/copy";
import { errorMessage } from "@biletflow/shared/features/auth/helpers";
import { api, session, useSessionSnapshot } from "../session";
import { Action, Callout, Muted } from "../ui";
import { kitCopy } from "../kit/copy";
import { resourceKey } from "./resource-key";

export const request: Session["request"] = <T,>(path: string, options?: ApiRequestOptions) => {
  const transport = session?.getSnapshot().user ? session : api;
  if (!transport) return Promise.reject(new ApiError(0, "not_configured", "API not configured"));
  return transport.request<T>(path, options);
};

export function useResource<T>(
  path: string,
  parse: (raw: unknown) => T,
  options: { enabled?: boolean; interval?: number; key?: readonly unknown[] } = {},
) {
  const { user } = useSessionSnapshot();
  const focused = useIsFocused();
  return useQuery({
    queryKey: options.key ?? resourceKey(user?.id, path, parse),
    queryFn: async ({ signal }) => parse(await request(path, { signal })),
    enabled: Boolean(path) && (options.enabled ?? true),
    refetchInterval: focused ? options.interval : false,
    retry: (count, error) => count < 2 && (!(error instanceof ApiError) || error.status === 0 || error.status >= 500),
  });
}

export function Failure({ error, locale, retry }: { error: unknown; locale: Locale; retry?: () => void }) {
  if (!error) return null;
  const denied = error instanceof ApiError && [403, 404].includes(error.status);
  return (
    <>
      <Callout tone="danger" alert>{denied ? authCopy[locale].forbidden : errorMessage(error, locale)}</Callout>
      {retry ? <Action title={kitCopy[locale].retry} onPress={retry} /> : null}
    </>
  );
}

export function Read<T>({ resource, locale, children }: {
  resource: { data?: T; error: unknown; refetch(): unknown };
  locale: Locale;
  children: (data: T) => ReactNode;
}) {
  if (resource.error) return <Failure error={resource.error} locale={locale} retry={() => void resource.refetch()} />;
  if (resource.data === undefined) return <Muted live="polite">{kitCopy[locale].loading}</Muted>;
  return children(resource.data);
}
