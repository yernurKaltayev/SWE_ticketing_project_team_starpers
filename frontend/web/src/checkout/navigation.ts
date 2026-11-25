import type { Locale } from "@biletflow/shared";
export const commerceNavigation: Record<
  Locale,
  { orders: string; tickets: string; register: string; buy: string }
> = {
  en: { orders: "My orders", tickets: "My tickets", register: "Register", buy: "Tickets" },
  ru: { orders: "Мои заказы", tickets: "Мои билеты", register: "Регистрация", buy: "Билеты" },
  kk: {
    orders: "Менің тапсырыстарым",
    tickets: "Менің билеттерім",
    register: "Тіркелу",
    buy: "Билеттер",
  },
};

/** "Register" only when every ticket is free; otherwise the action is buying. */
export function commerceAction(
  locale: Locale,
  allFree: boolean | undefined,
): string {
  const t = commerceNavigation[locale];
  return allFree === false ? t.buy : t.register;
}
