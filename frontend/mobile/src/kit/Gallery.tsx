import { useState } from "react";
import { Text, View } from "react-native";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { queryKeys } from "@biletflow/shared/features/query-keys";
import { coverProblem } from "@biletflow/shared/features/events/cover";
import { useAuthedQuery } from "../data";
import { useSessionSnapshot } from "../session";
import { ticketPaths } from "../tickets/model";
import type { TicketPage } from "../tickets/model";
import { color, type } from "../theme";
import { Action, Card, Heading, Muted } from "../ui";
import {
  ConfirmSheet,
  DateTimeField,
  downloadAndShare,
  EmptyState,
  ErrorState,
  ImageField,
  ListScreen,
  MoneyInput,
  Select,
} from "./index";
import type { PickedImage } from "./index";

const rows = Array.from({ length: 50 }, (_, i) => ({ id: String(i + 1) }));

/**
 * Development-only gallery of every kit component, for checking them on a real phone
 * (React Native components cannot render in the vitest environment). Not shipped to users.
 */
export function KitGallery({ locale }: { locale: Locale }) {
  const userId = useSessionSnapshot().user?.id ?? null;
  const tickets = useAuthedQuery<TicketPage>(
    queryKeys.commerce(userId, ticketPaths.mine()),
    ticketPaths.mine(),
    { enabled: userId !== null },
  );
  const [zone, setZone] = useState<"Europe/Moscow" | "Asia/Almaty">("Europe/Moscow");
  const [starts, setStarts] = useState<string | null>("2027-03-10T16:00:00.000Z");
  const [price, setPrice] = useState<number | null>(150050);
  const [image, setImage] = useState<PickedImage | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [confirmed, setConfirmed] = useState("");
  const [shareResult, setShareResult] = useState("");
  const firstTicket = tickets.data?.items[0];

  return (
    <ListScreen
      locale={locale}
      data={rows}
      keyExtractor={(row) => row.id}
      refreshing={false}
      onRefresh={() => undefined}
      onRetry={() => undefined}
      empty={<EmptyState title="Empty" />}
      renderItem={({ item }) => <Muted>{`List row ${item.id}`}</Muted>}
      header={
        <View style={{ gap: 16 }}>
          <Heading>UI kit (development only)</Heading>
          <Select
            label="Event time zone"
            value={zone}
            options={[
              { value: "Europe/Moscow", label: "Europe/Moscow" },
              { value: "Asia/Almaty", label: "Asia/Almaty" },
            ]}
            onChange={setZone}
            locale={locale}
          />
          <DateTimeField label="Starts" zone={zone} value={starts} onChange={setStarts} locale={locale} />
          <Muted>{`Saved instant: ${starts ?? "none"}`}</Muted>
          <MoneyInput label="Price" amount={price} onChange={setPrice} locale={locale} />
          <Muted>{`Saved tiyn: ${price ?? "none"}`}</Muted>
          <ImageField
            label="Cover"
            imageUri={image?.uri ?? null}
            onPick={setImage}
            onRemove={() => setImage(null)}
            locale={locale}
          />
          {image ? (
            <Muted>{`${image.name} · ${image.type} · rule check: ${coverProblem({ type: image.type }) ?? "ok"}`}</Muted>
          ) : null}
          <Card>
            <Text style={{ ...type.label, color: color.ink }}>Share a ticket PDF</Text>
            <Action
              title={firstTicket ? `Share ${firstTicket.ticket_number}.pdf` : "Sign in with a ticket first"}
              disabled={!firstTicket}
              onPress={() => {
                if (!firstTicket) return;
                setShareResult("…");
                void downloadAndShare(firstTicket.pdf_url, firstTicket.ticket_number, "pdf")
                  .then(setShareResult)
                  .catch((error: unknown) =>
                    setShareResult(error instanceof ApiError ? error.code : String(error)),
                  );
              }}
            />
            {shareResult ? <Muted>{`Result: ${shareResult}`}</Muted> : null}
          </Card>
          <Action title="Open confirm sheet" onPress={() => setConfirm(true)} />
          {confirmed ? <Muted>{confirmed}</Muted> : null}
          <ConfirmSheet
            visible={confirm}
            title="Cancel this registration?"
            body="The ticket stops working immediately."
            confirmLabel="Cancel registration"
            cancelLabel="Keep it"
            tone="danger"
            onConfirm={() => {
              setConfirm(false);
              setConfirmed("Confirmed");
            }}
            onCancel={() => {
              setConfirm(false);
              setConfirmed("Kept");
            }}
          />
          <EmptyState title="Nothing here yet" body="Empty state example." />
          <ErrorState code="network_error" onRetry={() => undefined} locale={locale} />
        </View>
      }
    />
  );
}
