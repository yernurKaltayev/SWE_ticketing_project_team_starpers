import type { Locale } from "@biletflow/shared";
export const commerceNavigation: Record<
  Locale,
  { orders: string; tickets: string; register: string }
> = {
  en: { orders: "My orders", tickets: "My tickets", register: "Registration" },
  ru: { orders: "Мои заказы", tickets: "Мои билеты", register: "Регистрация" },
  kk: {
    orders: "Менің тапсырыстарым",
    tickets: "Менің билеттерім",
    register: "Тіркелу",
  },
};
