import { StyleSheet, Text } from "react-native";
import { color, type } from "../theme";
import { Action, Body, Sheet } from "../ui";

/** A deliberate second step before a destructive or important action. */
export function ConfirmSheet({
  visible,
  title,
  body,
  confirmLabel,
  cancelLabel,
  tone = "primary",
  busy = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  tone?: "danger" | "primary";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={busy ? () => undefined : onCancel}>
      <Text accessibilityRole="header" style={[local.title, tone === "danger" && local.danger]}>
        {title}
      </Text>
      {body ? <Body>{body}</Body> : null}
      <Action title={confirmLabel} variant="primary" busy={busy} disabled={busy} onPress={onConfirm} />
      <Action title={cancelLabel} disabled={busy} onPress={onCancel} />
    </Sheet>
  );
}

const local = StyleSheet.create({
  title: { ...type.heading, color: color.ink },
  danger: { color: color.danger },
});
