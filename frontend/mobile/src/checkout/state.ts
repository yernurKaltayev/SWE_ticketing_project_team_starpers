import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { CheckoutCoordinator } from "@biletflow/shared/features/checkout/attempt";
import type { SeatingSelection } from "@biletflow/shared/features/seating/model";
import { createSecureKeyValueStore } from "../secure-key-value-store";
import { session } from "../session";

export const secureStorage = createSecureKeyValueStore(SecureStore);
export const coordinator = session ? new CheckoutCoordinator(session, secureStorage, randomUUID) : null;

const selections = new Map<string, SeatingSelection>();
session?.subscribe(() => {
  if (!session?.getSnapshot().user) selections.clear();
});

export function saveSelection(value: SeatingSelection) {
  selections.set(value.eventId, value);
}

export function consumeSelection(eventId: string) {
  const value = selections.get(eventId);
  selections.delete(eventId);
  return value && Date.parse(value.expiresAt) > Date.now() ? value : undefined;
}
