import type { Locale } from "@biletflow/shared";
const en = {
  checkout: "Free registration",
  orders: "My orders",
  tickets: "My tickets",
  back: "Back to events",
  select: "Choose your tickets",
  quantity: "Quantity",
  attendee: "Attendee",
  fullName: "Full name",
  email: "Email",
  details: "Attendee details",
  review: "Review registration",
  edit: "Edit details",
  register: "Register for free",
  working: "Please wait…",
  loading: "Loading…",
  retry: "Try again",
  check: "Check again",
  refresh: "Refresh status",
  total: "Total",
  subtotal: "Ticket subtotal",
  discount: "Discount",
  fee: "Processing fee",
  free: "Free",
  freeHint:
    "No payment details are needed. Your registration is confirmed only after it is accepted.",
  snapshot: "Availability may change before registration is confirmed.",
  unavailable: "Registration is not available for this event right now.",
  assigned:
    "This event requires seat selection. Online seat selection is not available here yet.",
  paid: "Paid registration is not available here yet.",
  noFree: "No free tickets are available right now.",
  limit: "Maximum available for this registration",
  reviewHint: "Check each attendee's name and email before confirming.",
  policy:
    "Refund and cancellation terms are not available here. Confirm the terms with the organizer before registering.",
  unknown:
    "We could not confirm the outcome of your registration. Keep this page open and retry the same registration, or check My orders. Do not start another registration for these tickets yet.",
  lost: "Your previous registration may have completed. Check My orders for your tickets. If you cannot find it, contact the organizer before registering again.",
  repeat: "Retry the same registration",
  existing: "An order is already linked to this registration.",
  another: "Start another registration",
  order: "Order",
  view: "View order",
  viewTicket: "View ticket",
  confirmed: "Registration confirmed",
  preparing:
    "Your registration is confirmed. Tickets are still being prepared. Check again shortly.",
  emailNote:
    "Keep your order number. Your tickets remain available here even if no confirmation email arrives.",
  pending:
    "This order is not confirmed. Check its status before starting another registration. Payment completion is not available here yet.",
  previous: "Previous",
  next: "Next",
  emptyOrders: "You have no orders yet.",
  emptyTickets: "You have no tickets yet.",
  ticket: "Ticket",
  ticketNumber: "Ticket number",
  event: "Event",
  type: "Ticket type",
  seat: "Seat",
  statusLabel: "Status",
  unknownStatus: "Status unavailable",
  qr: "Admission QR code",
  download: "Download printable PDF",
  print:
    "Open the downloaded PDF in your browser or PDF viewer to print on A4. The digital and printed copies use the same ticket.",
  invalidTicket:
    "This ticket is not available for admission. Check its current status or contact the organizer.",
  requestId: "Request ID",
  pollEnded:
    "Automatic checking has paused. Use Check again to get the latest status.",
  error: "The request could not be completed. Try again.",
  network: "Unable to connect. Check your connection and try again.",
  selection:
    "Choose available free tickets and enter one valid name and email for each ticket (up to 100 tickets).",
  conflict:
    "Availability or registration conditions changed. Review the refreshed ticket choices and try again.",
  denied: "This order or ticket is unavailable to this account.",
  session:
    "Your session changed. Sign in again and check My orders before retrying.",
  storage:
    "Your browser cannot save registration recovery information. Enable site storage before registering.",
  notReplayed:
    "Your session was renewed. Review your registration and submit it again.",
  nameRequired: "Enter a full name (1–200 characters).",
  emailRequired: "Enter a valid email address.",
  ticketId: "Ticket ID",
  simulated: "Simulated",
  eventUnavailable:
    "Event details are unavailable. Open your ticket for admission and printable details.",
};
type Text = { [K in keyof typeof en]: string };
const ru: Text = {
  checkout: "Бесплатная регистрация",
  orders: "Мои заказы",
  tickets: "Мои билеты",
  back: "К событиям",
  select: "Выберите билеты",
  quantity: "Количество",
  attendee: "Участник",
  fullName: "Полное имя",
  email: "Электронная почта",
  details: "Данные участников",
  review: "Проверить регистрацию",
  edit: "Изменить данные",
  register: "Зарегистрироваться бесплатно",
  working: "Подождите…",
  loading: "Загрузка…",
  retry: "Повторить",
  check: "Проверить снова",
  refresh: "Обновить статус",
  total: "Итого",
  subtotal: "Стоимость билетов",
  discount: "Скидка",
  fee: "Комиссия",
  free: "Бесплатно",
  freeHint:
    "Платёжные данные не нужны. Регистрация подтверждена только после успешного оформления.",
  snapshot: "Наличие билетов может измениться до подтверждения регистрации.",
  unavailable: "Регистрация на это событие сейчас недоступна.",
  assigned:
    "Для этого события нужно выбрать места. Выбор мест здесь пока недоступен.",
  paid: "Платная регистрация здесь пока недоступна.",
  noFree: "Сейчас нет доступных бесплатных билетов.",
  limit: "Доступный максимум для этой регистрации",
  reviewHint: "Проверьте имя и почту каждого участника перед подтверждением.",
  policy:
    "Условия возврата и отмены здесь недоступны. Уточните их у организатора до регистрации.",
  unknown:
    "Результат регистрации не удалось подтвердить. Не закрывайте страницу: повторите эту же регистрацию или проверьте «Мои заказы». Пока не создавайте новую регистрацию на эти билеты.",
  lost: "Предыдущая регистрация могла завершиться. Проверьте «Мои заказы». Если заказа нет, свяжитесь с организатором перед повторной регистрацией.",
  repeat: "Повторить ту же регистрацию",
  existing: "С этой регистрацией уже связан заказ.",
  another: "Начать другую регистрацию",
  order: "Заказ",
  view: "Открыть заказ",
  viewTicket: "Открыть билет",
  confirmed: "Регистрация подтверждена",
  preparing:
    "Регистрация подтверждена. Билеты ещё готовятся. Проверьте снова немного позже.",
  emailNote:
    "Сохраните номер заказа. Билеты доступны здесь, даже если письмо с подтверждением не придёт.",
  pending:
    "Заказ не подтверждён. Проверьте его статус перед новой регистрацией. Завершение оплаты здесь пока недоступно.",
  previous: "Назад",
  next: "Далее",
  emptyOrders: "У вас пока нет заказов.",
  emptyTickets: "У вас пока нет билетов.",
  ticket: "Билет",
  ticketNumber: "Номер билета",
  event: "Событие",
  type: "Тип билета",
  seat: "Место",
  statusLabel: "Статус",
  unknownStatus: "Статус недоступен",
  qr: "QR-код для входа",
  download: "Скачать PDF для печати",
  print:
    "Откройте скачанный PDF в браузере или программе просмотра и распечатайте на A4. Цифровая и печатная копии — один билет.",
  invalidTicket:
    "Этот билет недоступен для входа. Проверьте статус или свяжитесь с организатором.",
  requestId: "Номер запроса",
  pollEnded:
    "Автоматическая проверка приостановлена. Нажмите «Проверить снова», чтобы обновить статус.",
  error: "Не удалось выполнить запрос. Повторите попытку.",
  network: "Не удалось подключиться. Проверьте соединение и повторите попытку.",
  selection:
    "Выберите доступные бесплатные билеты и укажите корректное имя и почту каждого участника (до 100 билетов).",
  conflict:
    "Наличие билетов или условия регистрации изменились. Проверьте обновлённый список и повторите попытку.",
  denied: "Этот заказ или билет недоступен вашему аккаунту.",
  session:
    "Сеанс изменился. Войдите снова и проверьте «Мои заказы» перед повторной попыткой.",
  storage:
    "Браузер не может сохранить сведения для восстановления регистрации. Разрешите хранение данных для сайта перед регистрацией.",
  notReplayed: "Сеанс обновлён. Проверьте регистрацию и отправьте её ещё раз.",
  nameRequired: "Введите полное имя (1–200 символов).",
  emailRequired: "Введите корректный адрес почты.",
  ticketId: "Идентификатор билета",
  simulated: "Симуляция",
  eventUnavailable:
    "Данные события недоступны. Откройте билет для входа и просмотра печатной версии.",
};
const kk: Text = {
  checkout: "Тегін тіркелу",
  orders: "Менің тапсырыстарым",
  tickets: "Менің билеттерім",
  back: "Іс-шараларға оралу",
  select: "Билеттерді таңдаңыз",
  quantity: "Саны",
  attendee: "Қатысушы",
  fullName: "Толық аты-жөні",
  email: "Электрондық пошта",
  details: "Қатысушылардың деректері",
  review: "Тіркелуді тексеру",
  edit: "Деректерді өзгерту",
  register: "Тегін тіркелу",
  working: "Күтіңіз…",
  loading: "Жүктелуде…",
  retry: "Қайталау",
  check: "Қайта тексеру",
  refresh: "Күйді жаңарту",
  total: "Барлығы",
  subtotal: "Билеттер құны",
  discount: "Жеңілдік",
  fee: "Комиссия",
  free: "Тегін",
  freeHint:
    "Төлем деректері қажет емес. Тіркелу сәтті аяқталғаннан кейін ғана расталады.",
  snapshot:
    "Тіркелу расталғанға дейін қолжетімді билеттер саны өзгеруі мүмкін.",
  unavailable: "Бұл іс-шараға тіркелу қазір қолжетімсіз.",
  assigned:
    "Бұл іс-шарада орын таңдау қажет. Мұнда орын таңдау әзірге қолжетімсіз.",
  paid: "Ақылы тіркелу мұнда әзірге қолжетімсіз.",
  noFree: "Қазір қолжетімді тегін билеттер жоқ.",
  limit: "Осы тіркелу үшін қолжетімді ең көп сан",
  reviewHint:
    "Растау алдында әр қатысушының аты-жөнін және поштасын тексеріңіз.",
  policy:
    "Қайтару және бас тарту шарттары мұнда қолжетімсіз. Тіркелмес бұрын оларды ұйымдастырушыдан нақтылаңыз.",
  unknown:
    "Тіркелу нәтижесін растау мүмкін болмады. Бетті жаппай, осы тіркелуді қайта жіберіңіз немесе «Менің тапсырыстарым» бөлімін тексеріңіз. Әзірге осы билеттерге жаңа тіркелу жасамаңыз.",
  lost: "Алдыңғы тіркелу аяқталған болуы мүмкін. «Менің тапсырыстарым» бөлімін тексеріңіз. Тапсырыс табылмаса, қайта тіркелмес бұрын ұйымдастырушыға хабарласыңыз.",
  repeat: "Осы тіркелуді қайта жіберу",
  existing: "Бұл тіркелуге тапсырыс байланыстырылған.",
  another: "Басқа тіркелуді бастау",
  order: "Тапсырыс",
  view: "Тапсырысты ашу",
  viewTicket: "Билетті ашу",
  confirmed: "Тіркелу расталды",
  preparing:
    "Тіркелу расталды. Билеттер әлі дайындалуда. Біраздан кейін қайта тексеріңіз.",
  emailNote:
    "Тапсырыс нөмірін сақтаңыз. Растау хаты келмесе де, билеттер осы жерден қолжетімді.",
  pending:
    "Тапсырыс расталмаған. Жаңа тіркелу алдында оның күйін тексеріңіз. Төлемді аяқтау мұнда әзірге қолжетімсіз.",
  previous: "Алдыңғы",
  next: "Келесі",
  emptyOrders: "Әзірге тапсырыстарыңыз жоқ.",
  emptyTickets: "Әзірге билеттеріңіз жоқ.",
  ticket: "Билет",
  ticketNumber: "Билет нөмірі",
  event: "Іс-шара",
  type: "Билет түрі",
  seat: "Орын",
  statusLabel: "Күйі",
  unknownStatus: "Күйі қолжетімсіз",
  qr: "Кіруге арналған QR-код",
  download: "Басып шығаруға арналған PDF жүктеу",
  print:
    "Жүктелген PDF файлын браузерде не қарау бағдарламасында ашып, A4 қағазына басып шығарыңыз. Цифрлық және қағаз көшірме — бір билет.",
  invalidTicket:
    "Бұл билетпен кіру қолжетімсіз. Күйін тексеріңіз немесе ұйымдастырушыға хабарласыңыз.",
  requestId: "Сұрау нөмірі",
  pollEnded:
    "Автоматты тексеру тоқтатылды. Күйді жаңарту үшін «Қайта тексеру» түймесін басыңыз.",
  error: "Сұрауды орындау мүмкін болмады. Қайталап көріңіз.",
  network: "Қосылу мүмкін болмады. Байланысты тексеріп, қайталап көріңіз.",
  selection:
    "Қолжетімді тегін билеттерді таңдап, әр қатысушының дұрыс аты-жөні мен поштасын енгізіңіз (100 билетке дейін).",
  conflict:
    "Билеттердің қолжетімділігі не тіркелу шарттары өзгерді. Жаңартылған тізімді тексеріп, қайталап көріңіз.",
  denied: "Бұл тапсырыс не билет аккаунтыңызға қолжетімсіз.",
  session:
    "Сеанс өзгерді. Қайта кіріп, қайталаудан бұрын «Менің тапсырыстарым» бөлімін тексеріңіз.",
  storage:
    "Браузер тіркелуді қалпына келтіру деректерін сақтай алмайды. Тіркелмес бұрын сайт деректерін сақтауға рұқсат беріңіз.",
  notReplayed: "Сеанс жаңартылды. Тіркелуді тексеріп, қайта жіберіңіз.",
  nameRequired: "Толық аты-жөніңізді енгізіңіз (1–200 таңба).",
  emailRequired: "Дұрыс пошта мекенжайын енгізіңіз.",
  ticketId: "Билет идентификаторы",
  simulated: "Симуляция",
  eventUnavailable:
    "Іс-шара деректері қолжетімсіз. Кіру және басып шығару деректері үшін билетті ашыңыз.",
};
const states: Record<Locale, Record<string, string>> = {
  en: {
    free_confirmed: "Free registration confirmed",
    paid: "Paid",
    pending: "Pending",
    failed: "Failed",
    expired: "Expired",
    cancelled: "Cancelled",
    refunded: "Refunded",
    valid: "Valid",
    checked_in: "Already checked in",
  },
  ru: {
    free_confirmed: "Бесплатная регистрация подтверждена",
    paid: "Оплачен",
    pending: "Ожидает",
    failed: "Не выполнен",
    expired: "Срок истёк",
    cancelled: "Отменён",
    refunded: "Возвращён",
    valid: "Действителен",
    checked_in: "Уже использован",
  },
  kk: {
    free_confirmed: "Тегін тіркелу расталды",
    paid: "Төленген",
    pending: "Күтілуде",
    failed: "Орындалмады",
    expired: "Мерзімі өтті",
    cancelled: "Бас тартылған",
    refunded: "Қайтарылған",
    valid: "Жарамды",
    checked_in: "Кіру тіркелген",
  },
};
export type CommerceCopy = Text & { states: Record<string, string> };
export const commerceCopy: Record<Locale, CommerceCopy> = {
  en: { ...en, states: states.en },
  ru: { ...ru, states: states.ru },
  kk: { ...kk, states: states.kk },
};
