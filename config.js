window.SHEET_CONFIG = {
  // Вставьте ID таблицы из URL:
  // https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit
  sheetId: "195R58r71VxUuDyv606PHX2BDfSjSthOKnkz3ou6fXNw",

  // Название вкладки (листа) в таблице.
  sheetName: "Лист1",

  // Частота автообновления страницы в миллисекундах.
  refreshIntervalMs: 45000,

  // Фильтр случайных/нерелевантных сообщений.
  reviewFilter: {
    // false — отключить фильтр совсем.
    enabled: true,
    // Отсекает строки без букв, где длинная последовательность цифр >= maxDigitRun.
    maxDigitRun: 8,
  },
};
