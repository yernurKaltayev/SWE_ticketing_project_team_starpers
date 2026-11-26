import { useState } from "react";
import { useNavigation, usePreventRemove } from "@react-navigation/native";
import type { NavigationAction } from "@react-navigation/native";
import type { TextInputProps } from "react-native";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { errorMessage } from "@biletflow/shared/features/auth/helpers";
import { ConfirmSheet } from "../kit/ConfirmSheet";
import { FormField } from "../kit/FormField";
import { pendingChangesCopy } from "../kit/changes-copy";
import { Callout, Input, Muted } from "../ui";
import { authCopy } from "../auth-copy";

export function AuthField({
  label,
  error,
  hint,
  ...props
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  return (
    <FormField label={label} error={error} hint={hint}>
      <Input accessibilityLabel={label} {...props} />
    </FormField>
  );
}

export function AuthError({ error, locale }: { error: unknown; locale: Locale }) {
  if (!error) return null;
  const requestId = error instanceof ApiError ? error.requestId : null;
  return (
    <Callout tone="danger" alert title={errorMessage(error, locale)}>
      {requestId ? <Muted>{authCopy[locale].requestId} {requestId}</Muted> : null}
    </Callout>
  );
}

export function useDiscardChanges(dirty: boolean, locale: Locale) {
  const [action, setAction] = useState<NavigationAction | null>(null);
  const navigation = useNavigation();
  const t = pendingChangesCopy[locale];
  usePreventRemove(dirty, ({ data }) => setAction(data.action));
  return (
    <ConfirmSheet
      visible={action !== null}
      title={t.title}
      confirmLabel={t.discard}
      cancelLabel={t.keep}
      onCancel={() => setAction(null)}
      onConfirm={() => {
        setAction(null);
        if (action) navigation.dispatch(action);
      }}
    />
  );
}
