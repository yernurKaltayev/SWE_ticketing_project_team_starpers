import type { ReactNode } from "react";
import { View } from "react-native";
import type { Locale } from "@biletflow/shared";
import { Action, Body, Callout, Card, Muted, styles as ui } from "../ui";
import { kitCopy } from "./copy";

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <Card>
      <Body>{title}</Body>
      {body ? <Muted>{body}</Muted> : null}
      {action ? <View style={{ marginTop: 8 }}>{action}</View> : null}
    </Card>
  );
}

/** Load failure with the server's error code and a retry. */
export function ErrorState({
  code,
  onRetry,
  locale,
}: {
  code?: string | null;
  onRetry: () => void;
  locale: Locale;
}) {
  const t = kitCopy[locale];
  return (
    <View style={ui.stack}>
      <Callout tone="danger" alert>
        {code ? `${t.loadFailed} (${code})` : t.loadFailed}
      </Callout>
      <Action title={t.retry} variant="primary" onPress={onRetry} />
    </View>
  );
}
