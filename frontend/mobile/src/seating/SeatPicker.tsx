import { useEffect, useMemo, useState } from "react";
import { PanResponder, ScrollView, View } from "react-native";
import type { GestureResponderEvent } from "react-native";
import Svg, { Circle, Text as SvgText } from "react-native-svg";
import { formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { parseAvailability } from "@biletflow/shared/features/checkout/model";
import { seatingCopy } from "@biletflow/shared/features/seating/copy";
import { categoryMatches, HoldController, parseSeatMap, remainingSeconds } from "@biletflow/shared/features/seating/model";
import type { Seat, SeatOffer, SeatingSelection } from "@biletflow/shared/features/seating/model";
import { seatOffers } from "./offers";
import { useDiscardChanges } from "../auth/Fields";
import { Failure, Read, request, useResource } from "../features/resource";
import { Select } from "../kit/Select";
import { color } from "../theme";
import { Action, Callout, Card, Heading, Muted, Segmented } from "../ui";

export function SeatMap({ seats, selected, canSelect, toggle, locale }: {
  seats: Seat[]; selected: string[]; canSelect: (seat: Seat) => boolean;
  toggle: (seat: Seat) => void; locale: Locale;
}) {
  const [zoom, setZoom] = useState(1);
  const gesture = useMemo(() => {
    let start = 0;
    let current = 1;
    let baseline = 1;
    function distance(event: GestureResponderEvent) {
      const [a, b] = event.nativeEvent.touches;
      return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
    }
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (event) => event.nativeEvent.touches.length === 2,
      onPanResponderGrant: (event) => { start = distance(event); baseline = current; },
      onPanResponderMove: (event) => {
        const width = distance(event);
        if (start && width) { current = Math.max(1, Math.min(2.5, baseline * width / start)); setZoom(current); }
      },
    });
  }, []);
  const rows = new Map<string, Seat[]>();
  for (const seat of seats) {
    const row = `${seat.section} · ${seat.row}`;
    rows.set(row, [...(rows.get(row) ?? []), seat]);
  }
  const width = Math.max(300, 110 + Math.max(1, ...[...rows.values()].map((row) => row.length)) * 48);
  const height = Math.max(80, rows.size * 50 + 10);
  const t = seatingCopy[locale];
  return (
    <View {...gesture.panHandlers}>
      <Muted>{t.schematic}</Muted>
      <ScrollView horizontal>
        <Svg accessibilityLabel={t.map} width={width * zoom} height={height * zoom} viewBox={`0 0 ${width} ${height}`}>
          {[...rows].map(([label, row], y) => <SvgRow key={label} seats={row} label={label} y={y * 50 + 28}
            selected={selected} canSelect={canSelect} toggle={toggle} />)}
        </Svg>
      </ScrollView>
    </View>
  );
}

function SvgRow({ seats, label, y, selected, canSelect, toggle }: {
  seats: Seat[]; label: string; y: number; selected: string[];
  canSelect: (seat: Seat) => boolean; toggle: (seat: Seat) => void;
}) {
  return <>
    <SvgText x={4} y={y + 4} fill={color.ink} fontSize={11}>{label}</SvgText>
    {seats.map((seat, i) => {
      const x = 130 + i * 48;
      const enabled = canSelect(seat);
      return <ViewSeat key={seat.id} x={x} y={y} label={seat.label}
        fill={selected.includes(seat.id) ? color.primary : enabled ? color.primarySoft : color.line}
        text={selected.includes(seat.id) ? color.onPrimary : color.ink}
        onPress={enabled ? () => toggle(seat) : undefined} />;
    })}
  </>;
}

function ViewSeat({ x, y, label, fill, text, onPress }: {
  x: number; y: number; label: string; fill: string; text: string; onPress?: () => void;
}) {
  return <>
    <Circle cx={x} cy={y} r={22} fill={fill} onPress={onPress} />
    <SvgText x={x} y={y + 4} textAnchor="middle" fill={text} fontSize={11} onPress={onPress}>{label}</SvgText>
  </>;
}

export function SeatPicker({ id, locale, onContinue }: {
  id: string; locale: Locale; onContinue: (selection: SeatingSelection) => void;
}) {
  const t = seatingCopy[locale];
  const path = `/api/v1/events/${encodeURIComponent(id)}`;
  const map = useResource(`${path}/seat-map`, parseSeatMap, { interval: 15000 });
  const availability = useResource(`${path}/availability`, parseAvailability, { interval: 15000 });
  const [offerId, setOfferId] = useState("");
  const [ids, setIds] = useState<string[]>([]);
  const [mode, setMode] = useState<"map" | "list">("map");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [now, setNow] = useState(Date.now);
  const controller = useMemo(() => new HoldController(request, id), [id]);
  const hold = controller.hold;
  const offers: SeatOffer[] = seatOffers(
    availability.data,
    hold ? { offerId, heldSeats: hold.seat_ids.length } : null,
  );
  const offer = offers.find((item) => item.id === offerId);
  const expires = hold ? remainingSeconds(hold.expires_at, now) : 0;
  const discard = useDiscardChanges(Boolean(hold || ids.length), locale);
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  useEffect(() => {
    if (!hold) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [hold]);

  function canSelect(seat: Seat) {
    return !busy && !hold && !controller.uncertain && Boolean(offer) && seat.status === "available" &&
      categoryMatches(seat.price_category, offer?.category ?? null) &&
      (ids.includes(seat.id) || ids.length < Math.min(10, offer?.limit ?? 0));
  }

  function toggle(seat: Seat) {
    if (!canSelect(seat)) return;
    setIds((items) => items.includes(seat.id) ? items.filter((value) => value !== seat.id) : [...items, seat.id]);
  }

  async function reserve(release = false) {
    setBusy(true);
    setError(null);
    try {
      if (release) await controller.release();
      else if (map.data && offer && !map.isError) await controller.reserve(map.data, ids, offer);
      setIds([]);
      setNow(Date.now());
      await map.refetch();
    } catch (caught) {
      setError(caught);
      await map.refetch();
    } finally {
      setBusy(false);
    }
  }

  return <>
    <Heading>{t.title}</Heading>
    <Read resource={availability} locale={locale}>{() => <>
      <Select label={t.ticket} locale={locale} value={offerId} disabled={busy || Boolean(hold)}
        options={offers.map((item) => ({ value: item.id, label: `${item.name} · ${formatPrice(item.priceTiyn, locale)}` }))}
        onChange={(value) => { setOfferId(value); setIds([]); }} />
      {offers.length === 0 ? <Muted>{t.empty}</Muted> : null}
    </>}</Read>
    <Failure error={error} locale={locale} />
    {controller.uncertain ? <Callout tone="warning">{t.unknown}</Callout> : null}
    <Read resource={map} locale={locale}>{(value) => <>
      <Segmented value={mode} onChange={setMode} kind="choice" options={[{ value: "map", label: t.map }, { value: "list", label: t.list }]} />
      {mode === "map" ? <SeatMap locale={locale} seats={value.seats} selected={ids} canSelect={canSelect} toggle={toggle} /> :
        value.seats.map((seat) => <Action key={seat.id}
          title={[seat.section, seat.row, seat.label, ids.includes(seat.id) ? t.selected : t[seat.status], seat.accessible ? t.accessible : ""].filter(Boolean).join(" · ")}
          disabled={!canSelect(seat)} variant={ids.includes(seat.id) ? "primary" : "secondary"} onPress={() => toggle(seat)} />)}
      {!hold ? <Action title={`${t.reserve} (${ids.length})`} variant="primary"
        disabled={busy || controller.uncertain || !offer || !ids.length} busy={busy} onPress={() => void reserve()} /> : null}
    </>}</Read>
    {hold ? <Card>
      <Muted>{expires ? `${t.expires} ${expires}` : t.expired}</Muted>
      <Action title={t.release} disabled={busy} onPress={() => void reserve(true)} />
      <Action title={t.proceed} variant="primary" disabled={busy || !expires || !offer} onPress={() => {
        if (!offer) return;
        try {
          const selection = controller.transfer(offer);
          controller.activate();
          setIds([]);
          onContinue(selection);
        } catch (caught) { setError(caught); }
      }} />
    </Card> : null}
    {discard}
  </>;
}
