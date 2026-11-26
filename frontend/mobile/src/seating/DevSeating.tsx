import { useState } from "react";
import type { Locale } from "@biletflow/shared";
import { seatingCopy } from "@biletflow/shared/features/seating/copy";
import type { Seat } from "@biletflow/shared/features/seating/model";
import { Action, Screen, Title } from "../ui";
import { SeatMap } from "./SeatPicker";

const sample: Seat[] = ["A", "B"].flatMap((row) => Array.from({ length: 12 }, (_, index) => ({
  id: `${row}-${index + 1}`, row, section: "1", label: String(index + 1), price_category: null,
  accessible: index === 0, status: index % 5 === 2 ? "sold" : "available",
})));

export function DevSeating({ locale }: { locale: Locale }) {
  const [chosen, setChosen] = useState<string[]>([]);
  return <Screen>
    <Title>{seatingCopy[locale].map}</Title>
    <SeatMap seats={sample} locale={locale} selected={chosen} canSelect={(seat) => seat.status === "available"}
      toggle={(seat) => setChosen((values) => values.includes(seat.id)
        ? values.filter((id) => id !== seat.id) : [...values, seat.id])} />
    <Action title={seatingCopy[locale].release} disabled={!chosen.length} onPress={() => setChosen([])} />
  </Screen>;
}
