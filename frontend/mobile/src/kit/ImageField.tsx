import { useState } from "react";
import { Image, Linking, StyleSheet, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import type { Locale } from "@biletflow/shared";
import { coverProblem } from "@biletflow/shared/features/events/cover";
import { eventCopy } from "@biletflow/shared/features/events/copy";
import { color, radius } from "../theme";
import { Action } from "../ui";
import { kitCopy } from "./copy";
import { FormField } from "./FormField";

export type PickedImage = { uri: string; name: string; type: string };

/**
 * Picks one image from the library and checks it against the shared cover rules before the
 * caller uploads it (multipart `file` field, as the web cover editor sends).
 */
export function ImageField({
  label,
  imageUri,
  onPick,
  onRemove,
  busy = false,
  locale,
}: {
  label: string;
  imageUri: string | null;
  onPick: (file: PickedImage) => void;
  onRemove?: () => void;
  busy?: boolean;
  locale: Locale;
}) {
  const t = kitCopy[locale];
  const e = eventCopy[locale];
  const [problem, setProblem] = useState<string | null>(null);
  const [denied, setDenied] = useState(false);

  // The system photo picker needs no library permission on current iOS/Android; asking for one
  // would only add a prompt whose refusal blocks picking. A permission error is still handled.
  async function pick() {
    setProblem(null);
    setDenied(false);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    const type = asset.mimeType ?? null;
    const check = coverProblem({ type, size: asset.fileSize ?? null });
    if (check === "type") return setProblem(e.coverType);
    if (check === "size") return setProblem(e.coverSize);
    onPick({ uri: asset.uri, name: asset.fileName ?? "cover", type: type! });
  }

  return (
    <FormField label={label} error={problem ?? (denied ? t.imageDenied : null)}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={local.preview}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
          accessible
          accessibilityLabel={label}
        />
      ) : null}
      <View style={local.actions}>
        <Action
          title={imageUri ? t.replaceImage : t.pickImage}
          busy={busy}
          disabled={busy}
          onPress={() =>
            void pick().catch((error: unknown) => {
              if (/permission/i.test(String(error))) setDenied(true);
              else setProblem(t.pickFailed);
            })
          }
        />
        {imageUri && onRemove ? (
          <Action title={t.removeImage} disabled={busy} onPress={onRemove} />
        ) : null}
        {denied ? (
          <Action title={t.openSettings} onPress={() => void Linking.openSettings()} />
        ) : null}
      </View>
    </FormField>
  );
}

const local = StyleSheet.create({
  preview: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.card,
    backgroundColor: color.line,
  },
  actions: { gap: 8 },
});
