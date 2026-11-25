import type { Locale } from "@biletflow/shared";

// Wording follows web/src/checkout/copy.ts so both apps describe tickets the same way.
const en = {
  tab: "Tickets",
  title: "My tickets",
  intro: "Show the QR code at the entrance. The scanner checks it with the server.",
  empty: "You have no tickets yet.",
  signInFirst: "Sign in to see your tickets.",
  loading: "Loading…",
  reload: "Reload",
  loadFailed: "Could not load. Check the connection and reload.",
  open: "Show QR",
  ticketNumber: "Ticket number",
  type: "Ticket type",
  attendee: "Attendee",
  seat: "Seat",
  statusLabel: "Status",
  qrLabel: "Ticket QR code",
  qrFailed: "Could not load the QR code.",
  invalidTicket:
    "This ticket is not available for admission. Check its current status or contact the organizer.",
  status: {
    valid: "Valid",
    checked_in: "Already checked in",
    refunded: "Refunded",
    cancelled: "Cancelled",
  } as Record<string, string>,
};

type TicketsCopy = typeof en;

const ru: TicketsCopy = {
  tab: "Билеты",
  title: "Мои билеты",
  intro: "Покажите QR-код на входе. Сканер проверяет его на сервере.",
  empty: "У вас пока нет билетов.",
  signInFirst: "Войдите, чтобы увидеть свои билеты.",
  loading: "Загрузка…",
  reload: "Обновить",
  loadFailed: "Не удалось загрузить. Проверьте подключение и обновите.",
  open: "Показать QR",
  ticketNumber: "Номер билета",
  type: "Тип билета",
  attendee: "Участник",
  seat: "Место",
  statusLabel: "Статус",
  qrLabel: "QR-код билета",
  qrFailed: "Не удалось загрузить QR-код.",
  invalidTicket:
    "Этот билет недоступен для входа. Проверьте статус или свяжитесь с организатором.",
  status: {
    valid: "Действителен",
    checked_in: "Уже использован",
    refunded: "Возвращён",
    cancelled: "Отменён",
  },
};

const kk: TicketsCopy = {
  tab: "Билеттер",
  title: "Менің билеттерім",
  intro: "QR-кодты кіреберісте көрсетіңіз. Сканер оны сервер арқылы тексереді.",
  empty: "Әзірге билеттеріңіз жоқ.",
  signInFirst: "Билеттеріңізді көру үшін кіріңіз.",
  loading: "Жүктелуде…",
  reload: "Жаңарту",
  loadFailed: "Жүктеу мүмкін болмады. Байланысты тексеріп, жаңартыңыз.",
  open: "QR көрсету",
  ticketNumber: "Билет нөмірі",
  type: "Билет түрі",
  attendee: "Қатысушы",
  seat: "Орын",
  statusLabel: "Күйі",
  qrLabel: "Билеттің QR-коды",
  qrFailed: "QR-кодты жүктеу мүмкін болмады.",
  invalidTicket:
    "Бұл билетпен кіру қолжетімсіз. Күйін тексеріңіз немесе ұйымдастырушыға хабарласыңыз.",
  status: {
    valid: "Жарамды",
    checked_in: "Кіру тіркелген",
    refunded: "Қайтарылған",
    cancelled: "Бас тартылған",
  },
};

export const ticketsCopy: Record<Locale, TicketsCopy> = { en, kk, ru };
