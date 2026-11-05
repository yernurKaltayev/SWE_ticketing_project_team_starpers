import type { Locale } from "@biletflow/shared";

const en = {
  title: "Event Admin sign in",
  description:
    "Sign in with the account assigned to your events. Event access is checked by the server.",
  email: "Email",
  password: "Password",
  signIn: "Sign in",
  signOut: "Sign out",
  checking: "Checking your session…",
  working: "Please wait…",
  signedIn: "Signed in",
  verified: "Email verified",
  unverified: "Email not verified",
  next: "Assigned events and admission tools will be available in the check-in module.",
  invalidInput: "Enter a valid email and your password.",
  invalidCredentials:
    "The email or password is incorrect. Check them and try again.",
  emailNotVerified:
    "Confirm your email using the link sent to you, then sign in. Request a new link from the BiletFlow website if needed.",
  suspended: "This account is suspended. Contact platform support.",
  expired: "Your session ended. Sign in again to continue.",
  network: "Unable to connect. Check your connection and try again.",
  rateLimited: "Too many attempts. Wait before trying again.",
  denied: "This account cannot access this action. Contact your organizer.",
  unavailable: "The request could not be completed. Try again.",
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
    title: "Іс-шара әкімшісінің кіруі",
    description:
      "Іс-шараларға тағайындалған тіркелгімен кіріңіз. Қолжетімділікті сервер тексереді.",
    email: "Электрондық пошта",
    password: "Құпиясөз",
    signIn: "Кіру",
    signOut: "Шығу",
    checking: "Сеанс тексерілуде…",
    working: "Күте тұрыңыз…",
    signedIn: "Жүйеге кірдіңіз",
    verified: "Электрондық пошта расталған",
    unverified: "Электрондық пошта расталмаған",
    next: "Тағайындалған іс-шаралар мен кіруді тексеру құралдары тіркеу модулінде қолжетімді болады.",
    invalidInput: "Дұрыс электрондық пошта мен құпиясөзді енгізіңіз.",
    invalidCredentials:
      "Электрондық пошта немесе құпиясөз қате. Тексеріп, қайталап көріңіз.",
    emailNotVerified:
      "Жіберілген сілтеме арқылы электрондық поштаңызды растап, қайта кіріңіз. Қажет болса, BiletFlow сайтынан жаңа сілтеме сұраңыз.",
    suspended: "Бұл тіркелгі бұғатталған. Платформа қолдауына хабарласыңыз.",
    expired: "Сеанс аяқталды. Жалғастыру үшін қайта кіріңіз.",
    network: "Қосылу мүмкін болмады. Байланысты тексеріп, қайталап көріңіз.",
    rateLimited: "Әрекет саны тым көп. Біраз күтіп, қайталап көріңіз.",
    denied: "Бұл әрекетке рұқсатыңыз жоқ. Ұйымдастырушыға хабарласыңыз.",
    unavailable: "Сұрауды орындау мүмкін болмады. Қайталап көріңіз.",
    config:
      "API байланысы бапталмаған. Әзірлеу мекенжайын тексеру үшін Байланыс бетін ашыңыз.",
    requestId: "Сұрау идентификаторы",
    refresh: "Тіркелгіні жаңарту",
    logoutIncomplete:
      "Қолданбадағы ағымдағы сеанс аяқталды, бірақ жүйеден толық шығу мүмкін болмады. Байланысты тексеріп, жүйеге қайта кіріп, қайта шығыңыз.",
  },
  ru: {
    title: "Вход для администратора мероприятия",
    description:
      "Войдите в учётную запись, назначенную на ваши мероприятия. Доступ проверяет сервер.",
    email: "Электронная почта",
    password: "Пароль",
    signIn: "Войти",
    signOut: "Выйти",
    checking: "Проверяем сеанс…",
    working: "Подождите…",
    signedIn: "Вход выполнен",
    verified: "Почта подтверждена",
    unverified: "Почта не подтверждена",
    next: "Назначенные мероприятия и инструменты проверки входа появятся в модуле регистрации посетителей.",
    invalidInput: "Введите корректную почту и пароль.",
    invalidCredentials:
      "Неверная почта или пароль. Проверьте их и попробуйте снова.",
    emailNotVerified:
      "Подтвердите почту по отправленной ссылке, затем войдите. При необходимости запросите новую ссылку на сайте BiletFlow.",
    suspended:
      "Эта учётная запись заблокирована. Обратитесь в поддержку платформы.",
    expired: "Сеанс завершён. Войдите снова, чтобы продолжить.",
    network:
      "Не удалось подключиться. Проверьте соединение и повторите попытку.",
    rateLimited: "Слишком много попыток. Подождите перед следующей попыткой.",
    denied: "У вас нет доступа к этому действию. Обратитесь к организатору.",
    unavailable: "Не удалось выполнить запрос. Повторите попытку.",
    config:
      "Подключение к API не настроено. Откройте страницу подключения и проверьте адрес сервера разработки.",
    requestId: "Идентификатор запроса",
    refresh: "Обновить учётную запись",
    logoutIncomplete:
      "Текущий сеанс приложения завершён, но выход не удалось полностью выполнить. Проверьте соединение, затем войдите и выйдите снова.",
  },
};
