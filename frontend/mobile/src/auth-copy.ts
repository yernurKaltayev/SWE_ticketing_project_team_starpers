import type { Locale } from "@biletflow/shared";

const en = {
  signOut: "Sign out",
  working: "Please wait…",
  signedIn: "Signed in",
  verified: "Email verified",
  unverified: "Email not verified",
  config:
    "The API connection is not configured. Open Connection to check the development address.",
  requestId: "Request ID",
  refresh: "Refresh account",
  logoutIncomplete:
    "The current app session ended, but sign-out could not be fully completed. Check your connection, then sign in and sign out again.",
};

type AuthCopy = { [Key in keyof typeof en]: string };

export const authCopy: Record<Locale, AuthCopy> = {
  en,
  kk: {
    signOut: "Шығу",
    working: "Күте тұрыңыз…",
    signedIn: "Жүйеге кірдіңіз",
    verified: "Электрондық пошта расталған",
    unverified: "Электрондық пошта расталмаған",
    config:
      "API байланысы бапталмаған. Әзірлеу мекенжайын тексеру үшін Байланыс бетін ашыңыз.",
    requestId: "Сұрау идентификаторы",
    refresh: "Тіркелгіні жаңарту",
    logoutIncomplete:
      "Қолданбадағы ағымдағы сеанс аяқталды, бірақ жүйеден толық шығу мүмкін болмады. Байланысты тексеріп, жүйеге қайта кіріп, қайта шығыңыз.",
  },
  ru: {
    signOut: "Выйти",
    working: "Подождите…",
    signedIn: "Вход выполнен",
    verified: "Почта подтверждена",
    unverified: "Почта не подтверждена",
    config:
      "Подключение к API не настроено. Откройте страницу подключения и проверьте адрес сервера разработки.",
    requestId: "Идентификатор запроса",
    refresh: "Обновить учётную запись",
    logoutIncomplete:
      "Текущий сеанс приложения завершён, но выход не удалось полностью выполнить. Проверьте соединение, затем войдите и выйдите снова.",
  },
};
