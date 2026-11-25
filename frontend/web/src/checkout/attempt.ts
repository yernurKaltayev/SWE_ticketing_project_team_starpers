import type { KeyValueStore, Session } from "@biletflow/shared";
import { CheckoutCoordinator } from "@biletflow/shared/features/checkout/attempt";

export * from "@biletflow/shared/features/checkout/attempt";

const coordinators = new WeakMap<Session, CheckoutCoordinator>();
export function checkoutCoordinator(session: Session) {
  let coordinator = coordinators.get(session);
  if (!coordinator) {
    let storage: KeyValueStore | null;
    try {
      storage = window.localStorage;
    } catch {
      storage = null;
    }
    coordinator = new CheckoutCoordinator(session, storage);
    coordinators.set(session, coordinator);
  }
  return coordinator;
}
