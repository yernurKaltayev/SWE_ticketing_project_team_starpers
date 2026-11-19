import type { Locale } from "@biletflow/shared";

const en = {
  title: "Add to calendar",
  download: "Download .ics file",
  downloadUpdated: "Download updated .ics file",
  hint: "The file works with Apple Calendar, Outlook and other calendar apps. BiletFlow never asks for access to your calendar.",
  zone: (zone: string) => `Times are shown in the event's time zone (${zone}).`,
  newTab: "opens in a new tab",
  cancelled:
    "This event was cancelled. If you already added it to a calendar, download the updated file so the entry is marked as cancelled.",
  working: "Please wait…",
  unavailable: "The calendar file is not available for this event.",
  network: "Unable to connect. Check your connection and try again.",
  error: "The calendar file could not be downloaded. Try again.",
};
type Copy = typeof en;

const ru: Copy = {
  title: "Добавить в календарь",
  download: "Скачать файл .ics",
  downloadUpdated: "Скачать обновлённый файл .ics",
  hint: "Файл подходит для Apple Calendar, Outlook и других приложений календаря. BiletFlow не запрашивает доступ к вашему календарю.",
  zone: (zone) => `Время указано в часовом поясе мероприятия (${zone}).`,
  newTab: "откроется в новой вкладке",
  cancelled:
    "Мероприятие отменено. Если вы уже добавили его в календарь, скачайте обновлённый файл, чтобы запись была отмечена как отменённая.",
  working: "Подождите…",
  unavailable: "Файл календаря для этого мероприятия недоступен.",
  network: "Не удалось подключиться. Проверьте соединение и повторите попытку.",
  error: "Не удалось скачать файл календаря. Повторите попытку.",
};

const kk: Copy = {
  title: "Күнтізбеге қосу",
  download: ".ics файлын жүктеу",
  downloadUpdated: "Жаңартылған .ics файлын жүктеу",
  hint: "Файл Apple Calendar, Outlook және басқа күнтізбе қолданбаларымен жұмыс істейді. BiletFlow күнтізбеңізге қол жеткізуді сұрамайды.",
  zone: (zone) => `Уақыт іс-шараның уақыт белдеуінде (${zone}) көрсетілген.`,
  newTab: "жаңа қойындыда ашылады",
  cancelled:
    "Іс-шара тоқтатылды. Егер оны күнтізбеге қосқан болсаңыз, жазба тоқтатылған деп белгіленуі үшін жаңартылған файлды жүктеңіз.",
  working: "Күте тұрыңыз…",
  unavailable: "Бұл іс-шараның күнтізбе файлы қолжетімсіз.",
  network: "Қосылу мүмкін болмады. Байланысты тексеріп, қайталап көріңіз.",
  error: "Күнтізбе файлын жүктеу мүмкін болмады. Қайталап көріңіз.",
};

export const calendarCopy: Record<Locale, Copy> = { en, ru, kk };
