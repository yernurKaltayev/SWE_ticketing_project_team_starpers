import type { Locale } from "@biletflow/shared";
import type { StaffRole } from "./model";

const en = {
  link: "Event staff",
  title: "Event staff",
  events: "Back to events",
  intro:
    "Give people access to this event only. Check-in staff scan tickets in the BiletFlow Event Admin app; nobody here gets platform administrator rights.",
  appHint:
    "Staff sign in to the Event Admin app with the email of their BiletFlow account. The event appears in their list right away.",
  add: "Add staff member",
  email: "Account email",
  emailHint: "The person must already have a BiletFlow account.",
  role: "Role",
  roles: {
    checkin: "Check-in — scan tickets, search attendees, undo check-ins",
    support: "Support — view attendees and handle support cases",
    manager: "Manager — everything above, plus managing staff",
  } satisfies Record<StaffRole, string>,
  shortRoles: {
    checkin: "Check-in",
    support: "Support",
    manager: "Manager",
  } as Record<string, string>,
  submit: "Add to staff",
  working: "Please wait…",
  added: "Staff member added.",
  removed: "Staff member removed.",
  remove: "Remove",
  confirmRemove: (name: string) =>
    `Remove ${name} from this event's staff? They lose access immediately, including in the app.`,
  confirm: "Remove access",
  cancel: "Cancel",
  empty: "No staff assigned yet.",
  loading: "Loading…",
  name: "Name",
  since: "Added",
  actions: "Actions",
  invalidEmail: "Enter a valid email address.",
  userNotFound:
    "No BiletFlow account uses this email. Ask the person to register first, then add them.",
  duplicate: "This person is already on this event's staff.",
  denied: "Only the organizer or a manager of this event can manage staff.",
  error: "The request could not be completed. Try again.",
  retry: "Retry",
};

type StaffCopy = typeof en;

const kk: StaffCopy = {
  link: "Іс-шара қызметкерлері",
  title: "Іс-шара қызметкерлері",
  events: "Іс-шараларға оралу",
  intro:
    "Адамдарға тек осы іс-шараға рұқсат беріңіз. Тіркеу қызметкерлері билеттерді BiletFlow Event Admin қолданбасында сканерлейді; мұнда ешкім платформа әкімшісі құқығын алмайды.",
  appHint:
    "Қызметкерлер Event Admin қолданбасына BiletFlow аккаунтының email-імен кіреді. Іс-шара олардың тізімінде бірден пайда болады.",
  add: "Қызметкер қосу",
  email: "Аккаунт email-і",
  emailHint: "Адамның BiletFlow аккаунты болуы керек.",
  role: "Рөлі",
  roles: {
    checkin: "Тіркеу — билеттерді сканерлеу, қатысушыларды іздеу, тіркеуді болдырмау",
    support: "Қолдау — қатысушыларды көру және қолдау өтініштерін өңдеу",
    manager: "Менеджер — жоғарыдағының бәрі және қызметкерлерді басқару",
  },
  shortRoles: { checkin: "Тіркеу", support: "Қолдау", manager: "Менеджер" },
  submit: "Қызметкерлерге қосу",
  working: "Күте тұрыңыз…",
  added: "Қызметкер қосылды.",
  removed: "Қызметкер алынып тасталды.",
  remove: "Алып тастау",
  confirmRemove: (name: string) =>
    `${name} осы іс-шара қызметкерлерінен алынсын ба? Рұқсат бірден, қолданбада да жойылады.`,
  confirm: "Рұқсатты алып тастау",
  cancel: "Бас тарту",
  empty: "Әзірге қызметкер тағайындалмаған.",
  loading: "Жүктелуде…",
  name: "Аты",
  since: "Қосылған",
  actions: "Әрекеттер",
  invalidEmail: "Дұрыс email енгізіңіз.",
  userNotFound:
    "Бұл email-мен BiletFlow аккаунты жоқ. Алдымен адамнан тіркелуді сұраңыз, содан кейін қосыңыз.",
  duplicate: "Бұл адам осы іс-шараның қызметкерлері қатарында бар.",
  denied: "Қызметкерлерді тек ұйымдастырушы немесе осы іс-шараның менеджері басқара алады.",
  error: "Сұрауды орындау мүмкін болмады. Қайталап көріңіз.",
  retry: "Қайталау",
};

const ru: StaffCopy = {
  link: "Персонал мероприятия",
  title: "Персонал мероприятия",
  events: "К мероприятиям",
  intro:
    "Дайте людям доступ только к этому мероприятию. Сотрудники регистрации сканируют билеты в приложении BiletFlow Event Admin; никто здесь не получает прав администратора платформы.",
  appHint:
    "Сотрудники входят в приложение Event Admin с email своего аккаунта BiletFlow. Мероприятие сразу появляется в их списке.",
  add: "Добавить сотрудника",
  email: "Email аккаунта",
  emailHint: "У человека уже должен быть аккаунт BiletFlow.",
  role: "Роль",
  roles: {
    checkin: "Регистрация — сканирование билетов, поиск участников, отмена отметки",
    support: "Поддержка — просмотр участников и обработка обращений",
    manager: "Менеджер — всё перечисленное и управление персоналом",
  },
  shortRoles: { checkin: "Регистрация", support: "Поддержка", manager: "Менеджер" },
  submit: "Добавить в персонал",
  working: "Подождите…",
  added: "Сотрудник добавлен.",
  removed: "Сотрудник удалён.",
  remove: "Удалить",
  confirmRemove: (name: string) =>
    `Удалить ${name} из персонала этого мероприятия? Доступ пропадёт сразу, в том числе в приложении.`,
  confirm: "Отозвать доступ",
  cancel: "Отмена",
  empty: "Сотрудники ещё не назначены.",
  loading: "Загрузка…",
  name: "Имя",
  since: "Добавлен",
  actions: "Действия",
  invalidEmail: "Введите корректный email.",
  userNotFound:
    "Аккаунта BiletFlow с этим email нет. Попросите человека сначала зарегистрироваться, затем добавьте его.",
  duplicate: "Этот человек уже в персонале мероприятия.",
  denied: "Управлять персоналом может только организатор или менеджер этого мероприятия.",
  error: "Не удалось выполнить запрос. Попробуйте ещё раз.",
  retry: "Повторить",
};

export const staffCopy: Record<Locale, StaffCopy> = { en, kk, ru };
