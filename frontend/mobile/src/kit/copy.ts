import type { Locale } from "@biletflow/shared";

const en = {
  choose: "Choose…",
  close: "Close",
  done: "Done",
  cancel: "Cancel",
  pickDate: "Choose date and time",
  zoneMissing: "Choose the event time zone first",
  clear: "Clear",
  dateInvalid: "This time does not exist in the event's time zone (clock change). Choose another.",
  priceInvalid: "Enter an amount in tenge, with at most 2 decimals.",
  pickImage: "Choose image",
  replaceImage: "Replace image",
  removeImage: "Remove image",
  imageDenied: "Photo access is off. Allow it in Settings to choose an image.",
  openSettings: "Open Settings",
  loading: "Loading…",
  loadFailed: "Could not load. Check the connection and try again.",
  pickFailed: "Could not open the photo library. Try again.",
  retry: "Try again",
  loadingMore: "Loading more…",
};

export type KitCopy = typeof en;

const ru: KitCopy = {
  choose: "Выбрать…",
  close: "Закрыть",
  done: "Готово",
  cancel: "Отмена",
  pickDate: "Выберите дату и время",
  zoneMissing: "Сначала выберите часовой пояс события",
  clear: "Очистить",
  dateInvalid: "Такого времени нет в часовом поясе события (перевод часов). Выберите другое.",
  priceInvalid: "Введите сумму в тенге, не более 2 знаков после запятой.",
  pickImage: "Выбрать изображение",
  replaceImage: "Заменить изображение",
  removeImage: "Удалить изображение",
  imageDenied: "Доступ к фото выключен. Разрешите его в Настройках, чтобы выбрать изображение.",
  openSettings: "Открыть Настройки",
  loading: "Загрузка…",
  loadFailed: "Не удалось загрузить. Проверьте подключение и попробуйте снова.",
  pickFailed: "Не удалось открыть фотографии. Попробуйте снова.",
  retry: "Повторить",
  loadingMore: "Загружаем ещё…",
};

const kk: KitCopy = {
  choose: "Таңдау…",
  close: "Жабу",
  done: "Дайын",
  cancel: "Бас тарту",
  pickDate: "Күн мен уақытты таңдаңыз",
  zoneMissing: "Алдымен іс-шараның уақыт белдеуін таңдаңыз",
  clear: "Тазалау",
  dateInvalid: "Бұл уақыт іс-шараның уақыт белдеуінде жоқ (сағат ауысуы). Басқасын таңдаңыз.",
  priceInvalid: "Соманы теңгемен енгізіңіз, үтірден кейін 2 таңбадан аспасын.",
  pickImage: "Сурет таңдау",
  replaceImage: "Суретті ауыстыру",
  removeImage: "Суретті жою",
  imageDenied: "Фотоға рұқсат өшірулі. Сурет таңдау үшін оны Баптауларда қосыңыз.",
  openSettings: "Баптауларды ашу",
  loading: "Жүктелуде…",
  loadFailed: "Жүктеу мүмкін болмады. Байланысты тексеріп, қайталаңыз.",
  pickFailed: "Фотоларды ашу мүмкін болмады. Қайталап көріңіз.",
  retry: "Қайталау",
  loadingMore: "Тағы жүктелуде…",
};

export const kitCopy: Record<Locale, KitCopy> = { en, ru, kk };
