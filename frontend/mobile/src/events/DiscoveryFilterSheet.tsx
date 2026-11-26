import { useState } from "react";
import { Platform, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import type { Locale } from "@biletflow/shared";
import { categoryLabel, knownCategories } from "@biletflow/shared/features/events/categories";
import { eventCopy } from "@biletflow/shared/features/events/copy";
import { discoveryCopy } from "@biletflow/shared/features/events/discoveryCopy";
import { isoDay, quickRange } from "@biletflow/shared/features/events/model";
import { cityLabel } from "@biletflow/shared/features/events/venues";
import { FormField } from "../kit/FormField";
import { kitCopy } from "../kit/copy";
import { Action, Callout, Heading, Input, Sheet, styles } from "../ui";
import type { DiscoveryFilters } from "./discovery-filters";

type DateField = "date_from" | "date_to";

const filterCopy = {
  en: { anyCity: "Any city", dateOrder: "The end date must be on or after the start date." },
  kk: { anyCity: "Кез келген қала", dateOrder: "Аяқталу күні басталу күнінен ерте болмауы керек." },
  ru: { anyCity: "Любой город", dateOrder: "Дата окончания должна быть не раньше даты начала." },
};

export function DiscoveryFilterSheet({ filters, cities, locale, onApply, onClose }: {
  filters: DiscoveryFilters;
  cities: string[];
  locale: Locale;
  onApply: (filters: DiscoveryFilters) => void;
  onClose: () => void;
}) {
  const t = eventCopy[locale];
  const d = discoveryCopy[locale];
  const k = kitCopy[locale];
  const [draft, setDraft] = useState(filters);
  const [picker, setPicker] = useState<{ field: DateField; date: Date } | null>(null);
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [choosingCity, setChoosingCity] = useState(false);
  const invalidDates = Boolean(draft.date_from && draft.date_to && draft.date_from > draft.date_to);
  const change = (field: keyof DiscoveryFilters, value: string) =>
    setDraft((current) => ({ ...current, [field]: value }));

  function openDate(field: DateField) {
    const date = draft[field] ? new Date(`${draft[field]}T12:00:00`) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: date,
        mode: "date",
        onChange: (event, picked) => {
          if (event.type === "set" && picked) change(field, isoDay(picked));
        },
      });
    } else {
      setPicker({ field, date });
    }
  }

  return (
    <Sheet visible onClose={onClose}>
      <Heading>{d.filters}</Heading>
      <FormField label={t.category}>
        <Action title={draft.category ? categoryLabel(draft.category, locale) : d.allCategories}
          onPress={() => setChoosingCategory(!choosingCategory)} />
        {choosingCategory ? (
          <>
            {["", ...knownCategories].map((category) => (
              <Action key={category} title={category ? categoryLabel(category, locale) : d.allCategories}
                variant={draft.category === category ? "primary" : "secondary"}
                onPress={() => {
                  change("category", category);
                  setChoosingCategory(false);
                }} />
            ))}
          </>
        ) : null}
      </FormField>
      <FormField label={t.city}>
        <Input accessibilityLabel={t.city} placeholder={filterCopy[locale].anyCity} maxLength={100}
          value={draft.city} onChangeText={(city) => change("city", city)} />
        {cities.length > 0 ? (
          <Action title={choosingCity ? k.close : k.choose} onPress={() => setChoosingCity(!choosingCity)} />
        ) : null}
        {choosingCity ? (
          <>
            {["", ...cities].map((city) => (
              <Action key={city} title={city ? cityLabel(city, locale) : filterCopy[locale].anyCity}
                variant={draft.city === city ? "primary" : "secondary"}
                onPress={() => {
                  change("city", city);
                  setChoosingCity(false);
                }} />
            ))}
          </>
        ) : null}
      </FormField>
      <Heading>{d.dates}</Heading>
      <View style={styles.stack}>
        {(["today", "weekend", "month"] as const).map((range) => (
          <Action key={range} title={d[range]} onPress={() => {
            setPicker(null);
            setDraft((current) => ({ ...current, ...quickRange(range) }));
          }} />
        ))}
        {(["date_from", "date_to"] as const).map((field) => (
          <FormField key={field} label={t[field]}>
            <Action title={draft[field] || k.pickDate} accessibilityHint={t[field]} onPress={() => openDate(field)} />
          </FormField>
        ))}
        {picker ? (
          <DateTimePicker value={picker.date} mode="date" display="inline"
            onChange={(_event, date) => {
              if (!date) return;
              change(picker.field, isoDay(date));
              setPicker({ field: picker.field, date });
            }} />
        ) : null}
        <Action title={d.anyDate} onPress={() => {
          setPicker(null);
          setDraft((current) => ({ ...current, date_from: "", date_to: "" }));
        }} />
      </View>
      {invalidDates ? <Callout tone="warning" alert>{filterCopy[locale].dateOrder}</Callout> : null}
      <Action title={t.filter} variant="primary" disabled={invalidDates} onPress={() => onApply(draft)} />
      <Action title={k.cancel} onPress={onClose} />
    </Sheet>
  );
}
