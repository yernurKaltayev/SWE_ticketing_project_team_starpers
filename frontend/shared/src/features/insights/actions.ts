import type { Locale } from "../../index";

type Text = [en: string, ru: string, kk: string];
const index: Record<Locale, number> = { en: 0, ru: 1, kk: 2 };

/** Audit `action_type` names (see backend app/services/audit_categories.py). */
const actions: Record<string, Text> = {
  event_created: ["Event draft created", "Создан черновик мероприятия", "Іс-шара жобасы жасалды"],
  event_updated: ["Event details changed", "Изменены данные мероприятия", "Іс-шара деректері өзгертілді"],
  event_published: ["Event published", "Мероприятие опубликовано", "Іс-шара жарияланды"],
  event_unpublished: ["Event unpublished", "Мероприятие снято с публикации", "Іс-шара жариялаудан алынды"],
  event_duplicated: ["Event duplicated", "Создана копия мероприятия", "Іс-шараның көшірмесі жасалды"],
  event_cancelled: ["Event cancelled", "Мероприятие отменено", "Іс-шара тоқтатылды"],
  "event.suspended": ["Event suspended by the platform", "Мероприятие приостановлено платформой", "Іс-шараны платформа тоқтатты"],
  "event.resumed": ["Event reinstated by the platform", "Мероприятие восстановлено платформой", "Іс-шараны платформа қалпына келтірді"],
  ticket_type_created: ["Ticket type added", "Добавлен тип билета", "Билет түрі қосылды"],
  ticket_type_updated: ["Ticket type changed", "Изменён тип билета", "Билет түрі өзгертілді"],
  staff_assigned: ["Staff member added", "Добавлен сотрудник", "Қызметкер қосылды"],
  staff_removed: ["Staff member removed", "Сотрудник удалён", "Қызметкер жойылды"],
  "refund_policy.updated": ["Refund policy changed", "Изменены правила возврата", "Қайтару ережелері өзгертілді"],
  "order.created": ["Order placed", "Оформлен заказ", "Тапсырыс рәсімделді"],
  "order.paid": ["Order paid", "Заказ оплачен", "Тапсырыс төленді"],
  "order.cancelled": ["Order cancelled", "Заказ отменён", "Тапсырыс тоқтатылды"],
  "tickets.issued": ["Tickets issued", "Выпущены билеты", "Билеттер берілді"],
  "payment.created": ["Payment started", "Начата оплата", "Төлем басталды"],
  "payment.pending": ["Payment pending", "Оплата ожидается", "Төлем күтілуде"],
  "payment.succeeded": ["Payment succeeded", "Оплата прошла", "Төлем өтті"],
  "payment.failed": ["Payment failed", "Оплата не прошла", "Төлем өтпеді"],
  "payment.cancelled": ["Payment cancelled", "Оплата отменена", "Төлем тоқтатылды"],
  "payout.paid": ["Payout sent", "Выплата отправлена", "Төлем жіберілді"],
  "payout_account.created": ["Payout account added", "Добавлен счёт для выплат", "Төлем шоты қосылды"],
  "payout_account.updated": ["Payout account changed", "Изменён счёт для выплат", "Төлем шоты өзгертілді"],
  "payout_account.deleted": ["Payout account removed", "Удалён счёт для выплат", "Төлем шоты жойылды"],
  "paid_sales.activated": ["Paid sales enabled", "Платные продажи включены", "Ақылы сату қосылды"],
  "paid_sales.identity_verified": ["Identity verified", "Личность подтверждена", "Жеке басы расталды"],
  "paid_sales.suspended": ["Paid sales suspended", "Платные продажи приостановлены", "Ақылы сату тоқтатылды"],
  "paid_sales.updated": ["Paid sales checklist updated", "Обновлён чек-лист платных продаж", "Ақылы сату тізімі жаңартылды"],
  "refund.completed": ["Refund completed", "Возврат выполнен", "Қайтару орындалды"],
  "promo.created": ["Campaign created", "Создана промоакция", "Промоакция жасалды"],
  "promo.updated": ["Campaign changed", "Изменена промоакция", "Промоакция өзгертілді"],
  "promo.disabled": ["Campaign disabled", "Промоакция отключена", "Промоакция өшірілді"],
  "support.case_created": ["Support request opened", "Создано обращение", "Өтініш ашылды"],
  "support.assigned": ["Support request assigned", "Обращение назначено", "Өтініш тағайындалды"],
  "support.status_changed": ["Support request status changed", "Изменён статус обращения", "Өтініш күйі өзгертілді"],
  "checkin.accepted": ["Ticket checked in", "Билет отмечен на входе", "Билет кіреберісте белгіленді"],
  "checkin.reverted": ["Check-in undone", "Отметка входа отменена", "Кіру белгісі алынды"],
  "event_report.created": ["Event reported", "Подана жалоба на мероприятие", "Іс-шараға шағым түсті"],
  "event_report.reviewed": ["Report reviewed", "Жалоба рассмотрена", "Шағым қаралды"],
  "event_report.dismissed": ["Report dismissed", "Жалоба отклонена", "Шағым қабылданбады"],
  "event_report.actioned": ["Action taken on report", "По жалобе приняты меры", "Шағым бойынша шара қолданылды"],
  "settings.updated": ["Platform settings changed", "Изменены настройки платформы", "Платформа баптаулары өзгертілді"],
  "user.suspended": ["Account suspended", "Аккаунт заблокирован", "Аккаунт бұғатталды"],
  "user.resumed": ["Account reinstated", "Аккаунт восстановлен", "Аккаунт қалпына келтірілді"],
};

/** A readable name for an audit action; unknown names fall back to plain words. */
export function actionLabel(action: string, locale: Locale): string {
  const known = actions[action];
  if (known) return known[index[locale]];
  const words = action.replace(/[._]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}
