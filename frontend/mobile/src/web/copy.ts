import type { Locale } from "@biletflow/shared";

const en = {
  tab: "BiletFlow",
  failed: "The page could not be loaded. Check the connection and reload.",
  reload: "Reload",
  notConfigured: "The web address is not set. Set EXPO_PUBLIC_WEB_ORIGIN or EXPO_PUBLIC_API_ORIGIN.",
};

type WebCopy = typeof en;

const ru: WebCopy = {
  tab: "BiletFlow",
  failed: "Не удалось загрузить страницу. Проверьте подключение и обновите.",
  reload: "Обновить",
  notConfigured: "Адрес сайта не задан. Укажите EXPO_PUBLIC_WEB_ORIGIN или EXPO_PUBLIC_API_ORIGIN.",
};

const kk: WebCopy = {
  tab: "BiletFlow",
  failed: "Бетті жүктеу мүмкін болмады. Байланысты тексеріп, жаңартыңыз.",
  reload: "Жаңарту",
  notConfigured: "Сайт мекенжайы көрсетілмеген. EXPO_PUBLIC_WEB_ORIGIN немесе EXPO_PUBLIC_API_ORIGIN орнатыңыз.",
};

export const webCopy: Record<Locale, WebCopy> = { en, kk, ru };
