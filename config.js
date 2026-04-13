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
    // false — отключить фильтр и показывать все записи с текстом.
    enabled: true,
    // Чем выше minScore, тем строже отбор (рекомендовано 2-3).
    minScore: 2,
    // Минимальная длина текста без пробелов.
    minChars: 8,
    // Минимум слов в тексте (кроме случаев с явными маркерами отзыва).
    minWords: 2,
    // Максимальная доля цифр в тексте (0..1), чтобы отсекать "123456...".
    maxDigitRatio: 0.35,
    // Максимальная подряд идущая последовательность цифр.
    maxDigitRun: 5,
    // Короткие отзывы допускаются только по белому списку фраз.
    shortReviewMaxWords: 4,
    shortReviewMaxChars: 35,
  },
};
