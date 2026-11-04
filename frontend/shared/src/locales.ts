export const locales = ["kk", "ru", "en"] as const;
export type Locale = (typeof locales)[number];

export const localeLabels: Record<Locale, string> = {
  kk: "Қазақша",
  ru: "Русский",
  en: "English",
};

export const intlLocales: Record<Locale, string> = {
  kk: "kk-KZ",
  ru: "ru-KZ",
  en: "en-KZ",
};

const en = {
  appName: "BiletFlow",
  foundationTitle: "Application foundation",
  foundationDescription:
    "Check the shared configuration and API connection before developing features.",
  apiStatus: "API connection",
  checkApi: "Check connection",
  checking: "Checking…",
  ready: "Connected",
  unavailable: "Unavailable",
  notChecked: "Not checked",
  language: "Language",
  sessionStatus: "Session",
  signedOut: "Signed out",
  requestId: "Request ID",
  retry: "Try again",
  error: "Something went wrong",
  unknownError: "The request could not be completed. Please try again.",
  networkError:
    "Unable to connect. Check your internet connection and try again.",
  notImplemented: "This feature is not available yet.",
  cancelled: "Request cancelled",
  mockMode: "Mock API",
  liveMode: "Development API",
  currentEnvironment: "Environment",
};

type Messages = { [Key in keyof typeof en]: string };

export const messages: Record<Locale, Messages> = {
  en,
  kk: {
    appName: "BiletFlow",
    foundationTitle: "Қолданбаның негізгі баптаулары",
    foundationDescription:
      "Мүмкіндіктерді әзірлеу алдында ортақ баптаулар мен API байланысын тексеріңіз.",
    apiStatus: "API байланысы",
    checkApi: "Байланысты тексеру",
    checking: "Тексерілуде…",
    ready: "Қосылды",
    unavailable: "Қолжетімсіз",
    notChecked: "Тексерілмеген",
    language: "Тіл",
    sessionStatus: "Сеанс",
    signedOut: "Жүйеге кірмеген",
    requestId: "Сұрау идентификаторы",
    retry: "Қайталап көру",
    error: "Қате орын алды",
    unknownError: "Сұрауды орындау мүмкін болмады. Қайталап көріңіз.",
    networkError:
      "Қосылу мүмкін болмады. Интернет байланысын тексеріп, қайталап көріңіз.",
    notImplemented: "Бұл мүмкіндік әзірге қолжетімсіз.",
    cancelled: "Сұрау тоқтатылды",
    mockMode: "Сынақ API",
    liveMode: "Әзірлеу API",
    currentEnvironment: "Орта",
  },
  ru: {
    appName: "BiletFlow",
    foundationTitle: "Основа приложения",
    foundationDescription:
      "Проверьте общие настройки и подключение к API перед разработкой функций.",
    apiStatus: "Подключение к API",
    checkApi: "Проверить подключение",
    checking: "Проверка…",
    ready: "Подключено",
    unavailable: "Недоступно",
    notChecked: "Не проверено",
    language: "Язык",
    sessionStatus: "Сеанс",
    signedOut: "Вход не выполнен",
    requestId: "Идентификатор запроса",
    retry: "Повторить",
    error: "Произошла ошибка",
    unknownError: "Не удалось выполнить запрос. Повторите попытку.",
    networkError:
      "Не удалось подключиться. Проверьте интернет и повторите попытку.",
    notImplemented: "Эта функция пока недоступна.",
    cancelled: "Запрос отменён",
    mockMode: "Тестовый API",
    liveMode: "API разработки",
    currentEnvironment: "Окружение",
  },
};

export function isLocale(value: unknown): value is Locale {
  return (
    typeof value === "string" && locales.some((locale) => locale === value)
  );
}
