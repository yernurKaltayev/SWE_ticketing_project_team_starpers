import { useState } from "react";
import { definiteFailure } from "@biletflow/shared/features/support/model";
import { session } from "../session";

const journal = new Set<string>();
const flights = new Map<string, symbol>();
let owner = session?.getSnapshot().user?.id;
session?.subscribe(() => {
  const next = session?.getSnapshot().user?.id;
  if (next !== owner) {
    journal.clear();
    flights.clear();
  }
  owner = next;
});

/** Prevent duplicate writes while one is in flight or its result is unknown. */
export function useWrite(scope: string) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const uncertain = journal.has(scope);

  async function run<T>(operation: () => Promise<T>, idempotent = false): Promise<T | undefined> {
    if (flights.has(scope) || journal.has(scope) || !owner) return;
    const user = owner;
    const flight = Symbol(scope);
    flights.set(scope, flight);
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await operation();
      if (user !== owner) return;
      setSaved(true);
      return result;
    } catch (caught) {
      if (user === owner) {
        setError(caught);
        if (!idempotent && !definiteFailure(caught)) journal.add(scope);
      }
    } finally {
      if (flights.get(scope) === flight) flights.delete(scope);
      setBusy(false);
    }
  }

  return { busy, error, saved, uncertain, run, clearUncertain: () => {
    journal.delete(scope);
    setError(null);
  } };
}
