import { useEffect, useRef, useState } from "react";
import { ApiError, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { commerceCopy } from "@biletflow/shared/features/checkout/copy";
import { makeOrderBody, parseAvailability, parseEvent, registrationOpen } from "@biletflow/shared/features/checkout/model";
import type { Attendee, Availability, Event, OrderBody } from "@biletflow/shared/features/checkout/model";
import { paymentCopy } from "@biletflow/shared/features/payments/copy";
import { promoCopy, reasonText } from "@biletflow/shared/features/promotions/copy";
import { codeValue, selectedCart, validatePromo } from "@biletflow/shared/features/promotions/model";
import { seatingCopy } from "@biletflow/shared/features/seating/copy";
import { remainingSeconds } from "@biletflow/shared/features/seating/model";
import type { SeatingSelection } from "@biletflow/shared/features/seating/model";
import { AuthField, useDiscardChanges } from "../auth/Fields";
import { Failure, Read, request, useResource } from "../features/resource";
import { SeatPicker } from "../seating/SeatPicker";
import { session, useSessionSnapshot } from "../session";
import { Action, Body, Callout, Card, Heading, Muted, Screen, Title } from "../ui";
import { consumeSelection, coordinator, saveSelection } from "./state";

type Props = { id: string; locale: Locale; search: string; open: (path: string) => void };

export function Seats({ id, locale, search, open }: Props) {
  return <Screen><SeatPicker id={id} locale={locale} onContinue={(value) => {
    saveSelection(value);
    open(`/events/${encodeURIComponent(id)}/checkout${search}`);
  }} /></Screen>;
}

export function Checkout({ id, locale, search, open }: Props) {
  const path = `/api/v1/events/${encodeURIComponent(id)}`;
  const event = useResource(path, parseEvent);
  const availability = useResource(`${path}/availability`, parseAvailability);
  return <Screen>
    <Title>{paymentCopy[locale].checkout}</Title>
    <Read resource={event} locale={locale}>{(value) =>
      <Read resource={availability} locale={locale}>{(current) =>
        <CheckoutForm id={id} event={value} availability={current} locale={locale} search={search} open={open}
          reload={() => Promise.all([event.refetch(), availability.refetch()])} />
      }</Read>
    }</Read>
  </Screen>;
}

function CheckoutForm({ id, event, availability, locale, search, open, reload }: Props & {
  event: Event; availability: Availability; reload: () => Promise<unknown>;
}) {
  const t = commerceCopy[locale];
  const p = paymentCopy[locale];
  const promo = promoCopy[locale];
  const s = seatingCopy[locale];
  const { user } = useSessionSnapshot();
  const [seat, setSeat] = useState<SeatingSelection | undefined>(() => consumeSelection(id));
  const [now, setNow] = useState(Date.now);
  const [initial, setInitial] = useState(() => coordinator?.draft(id));
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries((initial?.items ?? seat?.items ?? []).map((item) => [item.ticket_type_id, item.quantity])));
  const [attendees, setAttendees] = useState<Attendee[]>(initial?.attendees ?? []);
  const [code, setCode] = useState(initial?.promo_code ?? new URLSearchParams(search).get("promo") ?? "");
  const [review, setReview] = useState<OrderBody | null>(initial ?? null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [subtotal, setSubtotal] = useState<number | null>(null);
  const [orderId, setOrderId] = useState<string | undefined>(() => coordinator?.recovery(id)?.orderId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [codeError, setCodeError] = useState<string | null>(null);
  const flight = useRef(false);
  const submitted = useRef(false);
  const transferred = useRef(seat);
  useEffect(() => { transferred.current = seat; }, [seat]);
  useEffect(() => () => {
    if (submitted.current || !transferred.current || !session?.getSnapshot().user) return;
    for (const hold of transferred.current.holdIds) {
      void session.request(
        `/api/v1/events/${encodeURIComponent(id)}/holds/${encodeURIComponent(hold)}`, { method: "DELETE" },
      ).catch(() => undefined);
    }
  }, [id]);
  const recovery = coordinator?.recovery(id);
  const frozen = coordinator?.draft(id);
  const assigned = event.seating_mode === "assigned";
  const expires = seat ? remainingSeconds(seat.expiresAt, now) : 0;
  const choices = availability.choices;
  const cart = selectedCart(choices, quantities);
  const discard = useDiscardChanges(Boolean(!orderId && (seat || attendees.some((a) => a.email || a.full_name))), locale);
  useEffect(() => {
    if (!seat) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [seat]);

  const defaultAttendee = (index: number) => index === 0
    ? { full_name: user?.full_name ?? "", email: user?.email ?? "" }
    : { full_name: "", email: "" };

  function setSelection(next: Record<string, number>) {
    const count = Math.min(100, Object.values(next).reduce((a, b) => a + b, 0));
    setQuantities(next);
    setAttendees((old) => Array.from({ length: count }, (_, index) => old[index] ?? defaultAttendee(index)));
    setDiscount(null);
    setSubtotal(null);
    setCodeError(null);
  }

  // A transferred hold already owns the authoritative seats. Use the current type and the
  // reserved seat count for local validation, then pass its IDs to P5 for server verification.
  function makeBody(currentEvent: Event, current: Availability) {
    if (!registrationOpen(currentEvent, current, Date.now(), assigned)) throw new ApiError(409, "registration_closed", t.unavailable);
    if (assigned && (!seat || !remainingSeconds(seat.expiresAt))) throw new ApiError(409, "hold_expired", s.expired);
    const check = seat ? current.choices.map((choice) => ({
      ...choice, available: Math.max(choice.available, quantities[choice.id] ?? 0),
    })) : current.choices;
    const draft = makeOrderBody(id, check, quantities,
      attendees.length ? attendees : Array.from({ length: cart?.ids.length ?? 0 }, (_, i) => defaultAttendee(i)),
      currentEvent.paid_sales_status === "active");
    return {
      ...draft,
      ...(seat ? { items: seat.items, hold_ids: seat.holdIds } : {}),
      promo_code: codeValue(code) || null,
    };
  }

  async function run(action: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    setCodeError(null);
    try { await action(); } catch (caught) {
      setError(caught);
      if (caught instanceof ApiError && caught.status === 409) await reload();
    } finally { flight.current = false; setBusy(false); }
  }

  async function quote(body: OrderBody) {
    if (!body.promo_code) return 0;
    const ids = body.items.flatMap((item) => Array<string>(item.quantity).fill(item.ticket_type_id));
    const result = await validatePromo(request, id, body.promo_code, ids);
    if (!result.valid) {
      setCodeError(reasonText(result.reason, promo));
      return null;
    }
    return result.discount_amount;
  }

  const openOrder = (one: string) => open(`/account/orders/${encodeURIComponent(one)}`);
  const hasUnconfirmed = !orderId && Boolean(recovery && !frozen);
  return <>
    <Heading>{event.title}</Heading>
    {event.refund_policy?.summary ? <Muted>{event.refund_policy.summary}</Muted> : null}
    <Failure error={error} locale={locale} />
    {error instanceof ApiError && error.code === "selection_invalid" ? <Muted>{t.selection}</Muted> : null}
    {codeError ? <Callout tone="warning">{codeError}</Callout> : null}
    {orderId ? <>
      <Callout tone="success">{t.existing}</Callout>
      <Action title={t.view} variant="primary" onPress={() => openOrder(orderId)} />
      <Action title={t.another} disabled={busy} onPress={() => void run(async () => {
        if (!coordinator) return;
        await coordinator.startAnother(id);
        submitted.current = false;
        setInitial(undefined);
        setOrderId(undefined);
        setSeat(undefined);
        setReview(null);
        setSelection({});
      })} />
    </> : hasUnconfirmed ? <>
      <Callout tone="warning">{t.lost}</Callout>
      <Action title={t.orders} onPress={() => open("/account/orders")} />
    </> : review ? <>
      <Heading>{t.reviewTitle}</Heading>
      {review.items.map((item) => <Body key={item.ticket_type_id}>
        {choices.find((choice) => choice.id === item.ticket_type_id)?.name ?? item.ticket_type_id} × {item.quantity}
      </Body>)}
      {review.attendees.map((attendee, index) => <Muted key={index}>{attendee.full_name} · {attendee.email}</Muted>)}
      {subtotal !== null ? <Muted>{p.estimate} {formatPrice(subtotal, locale)}</Muted> : null}
      {discount !== null && discount > 0 ? <Muted>{t.discount} {formatPrice(discount, locale)}</Muted> : null}
      <Muted>{p.authoritative}</Muted>
      {frozen ? <Callout tone="warning">{t.unknown}</Callout> : null}
      <Action title={frozen ? t.repeat : subtotal === 0 ? t.register : p.continue} variant="primary" busy={busy}
        disabled={busy || !coordinator} onPress={() => void run(async () => {
          let body = frozen;
          if (!body) {
            const path = `/api/v1/events/${encodeURIComponent(id)}`;
            const [latestEvent, latest] = await Promise.all([request(path).then(parseEvent), request(`${path}/availability`).then(parseAvailability)]);
            body = makeBody(latestEvent, latest);
            const updatedDiscount = await quote(body);
            if (updatedDiscount === null) return;
            const latestCart = selectedCart(latest.choices, quantities);
            if (!latestCart || latestCart.subtotal !== subtotal || discount !== updatedDiscount) {
              setReview(null);
              throw new ApiError(409, "inventory_unavailable", t.conflict);
            }
          }
          submitted.current = true;
          const order = await coordinator!.submit(body).catch((caught: unknown) => {
            if (!coordinator!.recovery(id)) submitted.current = false;
            throw caught;
          });
          setOrderId(order.id);
          openOrder(order.id);
        })} />
      {!frozen ? <Action title={t.edit} disabled={busy} onPress={() => setReview(null)} /> : null}
    </> : assigned && !seat && !initial ? (
      <SeatPicker id={id} locale={locale} onContinue={(value) => {
        setNow(Date.now());
        setSeat(value);
        setSelection(Object.fromEntries(value.items.map((item) => [item.ticket_type_id, item.quantity])));
      }} />
    ) : !registrationOpen(event, availability, now, assigned) ? <Callout tone="warning">{t.unavailable}</Callout> : <>
      {assigned ? <>
        <Muted>{expires ? `${s.expires} ${expires}` : s.expired}</Muted>
        <Action title={s.release} disabled={busy} onPress={() => void run(async () => {
          if (seat && remainingSeconds(seat.expiresAt)) {
            await Promise.all(seat.holdIds.map((hold) => request(
              `/api/v1/events/${encodeURIComponent(id)}/holds/${encodeURIComponent(hold)}`, { method: "DELETE" })));
          }
          setSeat(undefined);
          setSelection({});
        })} />
      </> : <>
        <Heading>{t.select}</Heading>
        {choices.filter((choice) => choice.open && choice.available > 0 &&
          (choice.free || (event.paid_sales_status === "active" && choice.price !== undefined))).map((choice) => (
          <Card key={choice.id}>
            <Heading>{choice.name}</Heading>
            <Muted>{choice.free ? t.free : formatPrice(choice.price ?? 0, locale)}</Muted>
            <AuthField label={t.quantity} value={quantities[choice.id] ? String(quantities[choice.id]) : ""}
              inputMode="numeric" maxLength={3} editable={!busy} onChangeText={(value) => {
                const quantity = Number(value.replace(/\D/g, ""));
                const others = Object.entries(quantities).reduce((sum, [key, count]) => key === choice.id ? sum : sum + count, 0);
                setSelection({ ...quantities, [choice.id]: Math.min(quantity, choice.available, choice.limit, 100 - others) });
              }} />
          </Card>
        ))}
      </>}
      {cart ? <>
        <Muted>{p.estimate} {formatPrice(cart.subtotal, locale)}</Muted>
        {Array.from({ length: cart.ids.length }, (_, index) => {
          const attendee = attendees[index] ?? defaultAttendee(index);
          const update = (key: keyof Attendee, value: string) =>
            setAttendees(Array.from({ length: cart.ids.length }, (_unused, at) =>
              at === index ? { ...attendee, [key]: value } : attendees[at] ?? defaultAttendee(at)));
          return <Card key={index}>
            <Heading>{t.attendee} {index + 1}</Heading>
            <AuthField label={t.fullName} value={attendee.full_name} onChangeText={(value) => update("full_name", value)} maxLength={200} editable={!busy} />
            <AuthField label={t.email} value={attendee.email} onChangeText={(value) => update("email", value)}
              inputMode="email" autoCapitalize="none" editable={!busy} />
          </Card>;
        })}
        <AuthField label={promo.code} value={code} onChangeText={setCode} autoCapitalize="characters" maxLength={256} editable={!busy} />
      </> : null}
      <Action title={t.review} variant="primary" disabled={busy || !cart || (assigned && !expires)}
        busy={busy} onPress={() => void run(async () => {
          const body = makeBody(event, availability);
          const result = await quote(body);
          if (result === null) return;
          setDiscount(result);
          setSubtotal(cart?.subtotal ?? null);
          setReview(body);
        })} />
    </>}
    {discard}
  </>;
}
