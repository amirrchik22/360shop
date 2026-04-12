"use strict";

const DEFAULT_CONFIG = {
  sheetId: "PASTE_GOOGLE_SHEET_ID",
  sheetName: "Лист1",
  refreshIntervalMs: 45000,
  reviewFilter: {
    enabled: true,
    minScore: 3,
    minChars: 8,
    minWords: 2,
  },
};

const NAME_KEYS = ["имя", "name", "author", "откого", "кто", "клиент"];
const REVIEW_KEYS = ["отзыв", "текст", "review", "message", "комментарий", "feedback"];
const TELEGRAM_KEYS = [
  "ссылканателеграм",
  "ссылканателеграмм",
  "telegram",
  "telegramusername",
  "tgusername",
  "username",
  "телеграм",
  "ссылканатг",
  "telegramlink",
  "tglink",
];
const REVIEW_MODERATION_KEYS = [
  "isreview",
  "approved",
  "publish",
  "show",
  "показывать",
  "публиковать",
  "модерация",
  "проверено",
];

const REVIEW_SIGNAL_PATTERNS = [
  /отзыв/iu,
  /рекоменд/iu,
  /понрав/iu,
  /спасибо/iu,
  /класс/iu,
  /супер/iu,
  /отлич/iu,
  /хорош/iu,
  /удоб/iu,
  /полез/iu,
  /помог/iu,
  /работает/iu,
  /сервис/iu,
  /поддержк/iu,
  /быстр/iu,
  /плох/iu,
  /ужас/iu,
  /совет/iu,
  /заказ/iu,
  /товар/iu,
  /доставк/iu,
  /бот/iu,
  /магазин/iu,
];

const SHORT_REVIEW_PATTERNS = [
  /^(все\s+)?(супер|класс|огонь|топ|шикарно|прекрасно|отлично|отлич|хорошо|нормально|понравилось|не\s+понравилось|рекомендую|советую|спасибо)(\s+\S+){0,2}[!?.…]*$/iu,
  /^(да|нет)\s*(норм|супер|отлично|плохо)?[!?.…]*$/iu,
];

const FIRST_PERSON_PATTERN =
  /(^|\s)(я|мне|меня|мой|моя|мои|мое|мы|нам|наш|наша|наши|использую|пользуюсь|купил|купила|заказал|заказала|обратился|обратилась)\b/iu;

const NON_REVIEW_PATTERNS = [
  /напишите\s+(свой\s+)?отзыв/iu,
  /остав(ьте|ить)\s+отзыв/iu,
  /обратн(ую|ая)\s+связ/iu,
  /сегодня\s+хочу/iu,
  /на\s+связи/iu,
  /мой\s+чат[-\s]?бот/iu,
  /важно\s+понимать/iu,
  /ниже\s+вы\s+найдете/iu,
  /что\s+вам\s+было\s+бы/iu,
  /сделать\s+его\s+еще\s+более\s+полезным/iu,
  /я\s+каждый\s+день\s+создаю/iu,
  /любои?\s+ваш\s+комментарий\s+очень\s+ценен/iu,
];

const HARD_REJECT_PATTERNS = [
  /client[_\s-]?unsubscribed/iu,
  /^\s*unsubscribed\s*$/iu,
  /^\s*(none|null|n\/a|na)\s*$/iu,
  /^\s*test\s*$/iu,
  /^\s*ok\s*$/iu,
];

const runtimeConfig =
  typeof window.SHEET_CONFIG === "object" && window.SHEET_CONFIG ? window.SHEET_CONFIG : {};

const CONFIG = {
  ...DEFAULT_CONFIG,
  ...runtimeConfig,
  ...readQueryConfig(),
};

CONFIG.sheetId = extractSheetId(CONFIG.sheetId);
CONFIG.reviewFilter = normalizeReviewFilter(CONFIG.reviewFilter);

const elements = {
  feed: document.getElementById("chatFeed"),
  status: document.getElementById("statusText"),
  count: document.getElementById("reviewsCount"),
  empty: document.getElementById("emptyState"),
};

let refreshTimer = null;
let previousFingerprint = "";
let previousCount = 0;

document.addEventListener("DOMContentLoaded", init);

function init() {
  if (!isSheetConfigured(CONFIG.sheetId)) {
    setStatus("Укажите sheetId в config.js");
    setEmptyMessage(
      "Вставьте ID Google таблицы в файл config.js, затем обновите страницу.",
      "Нужна настройка"
    );
    return;
  }

  loadAndRender({ isAutoRefresh: false });
  refreshTimer = window.setInterval(() => {
    loadAndRender({ isAutoRefresh: true });
  }, Number(CONFIG.refreshIntervalMs) || DEFAULT_CONFIG.refreshIntervalMs);

  window.addEventListener("beforeunload", () => {
    if (refreshTimer) {
      clearInterval(refreshTimer);
    }
  });
}

async function loadAndRender({ isAutoRefresh }) {
  setStatus(isAutoRefresh ? "Проверяем обновления..." : "Загружаем отзывы...");

  try {
    const shouldStickToBottom = isNearBottom();
    const table = await loadSheetTable();
    const rows = tableToRows(table);
    const reviews = [];
    let filteredOutCount = 0;

    rows.forEach((row, idx) => {
      const review = toReview(row, idx);

      if (review) {
        reviews.push(review);
        return;
      }

      const possibleText = pickValue(row, REVIEW_KEYS);
      if (possibleText) {
        filteredOutCount += 1;
      }
    });

    const fingerprint = reviews
      .map((item) => `${item.name}|${item.text}|${item.telegramUsername}`)
      .join("\n");

    const hasChanges = fingerprint !== previousFingerprint;

    if (hasChanges) {
      renderReviews(reviews);
      previousFingerprint = fingerprint;

      if (!isAutoRefresh || shouldStickToBottom) {
        scrollToBottom();
      }
    }

    if (isAutoRefresh && reviews.length > previousCount) {
      setStatus(
        `Новые отзывы: +${reviews.length - previousCount}. Обновлено в ${formatTime(new Date())}. Отфильтровано: ${filteredOutCount}`
      );
    } else {
      setStatus(`Обновлено в ${formatTime(new Date())}. Отфильтровано: ${filteredOutCount}`);
    }

    previousCount = reviews.length;
    elements.count.textContent = String(reviews.length);
  } catch (error) {
    console.error(error);
    setStatus("Ошибка загрузки");

    if (!elements.feed.querySelector(".message")) {
      setEmptyMessage(
        "Не получилось прочитать таблицу. Проверьте доступ: «Открыть доступ -> Все, у кого есть ссылка -> Читатель».",
        "Нет доступа к Google Sheets"
      );
    }
  }
}

function renderReviews(reviews) {
  elements.feed.innerHTML = "";

  if (!reviews.length) {
    setEmptyMessage("Добавьте первую строку с отзывом в таблицу, и она появится здесь.", "Пока пусто");
    return;
  }

  reviews.forEach((review, index) => {
    const card = document.createElement("article");
    card.className = "message";
    card.style.animationDelay = `${Math.min(index * 35, 280)}ms`;

    const head = document.createElement("div");
    head.className = "message__head";

    const author = document.createElement("span");
    author.className = "message__author";
    author.textContent = review.name;

    const id = document.createElement("span");
    id.className = "message__id";
    id.textContent = `#${index + 1}`;

    head.append(author, id);

    const text = document.createElement("p");
    text.className = "message__text";
    text.textContent = review.text;

    card.append(head, text);

    if (review.telegramLink) {
      const actions = document.createElement("div");
      actions.className = "message__actions";

      const button = document.createElement("a");
      button.className = "message__tg";
      button.href = review.telegramLink;
      button.target = "_blank";
      button.rel = "noopener noreferrer";
      button.textContent = `Telegram: @${review.telegramUsername}`;

      actions.append(button);
      card.append(actions);
    }

    elements.feed.append(card);
  });
}

function setEmptyMessage(message, title) {
  elements.feed.innerHTML = "";

  const card = document.createElement("article");
  card.className = "empty-state";

  const heading = document.createElement("h2");
  heading.textContent = title;

  const text = document.createElement("p");
  text.textContent = message;

  card.append(heading, text);
  elements.feed.append(card);
}

function tableToRows(table) {
  const headers = (table.cols || []).map((col, idx) => {
    const header = String(col.label || col.id || `col_${idx + 1}`).trim();
    return header || `col_${idx + 1}`;
  });

  return (table.rows || []).map((row) => {
    const output = {};

    headers.forEach((header, idx) => {
      const cell = row?.c?.[idx];
      const value = cell?.f ?? cell?.v ?? "";
      output[header] = String(value).trim();
    });

    return output;
  });
}

function toReview(row, index) {
  const name = pickValue(row, NAME_KEYS) || `Пользователь ${index + 1}`;
  const text = pickValue(row, REVIEW_KEYS);
  const moderationFlag = readModerationFlag(row);

  if (!text) {
    return null;
  }

  if (moderationFlag === false) {
    return null;
  }

  if (moderationFlag !== true && !isLikelyReview(text, CONFIG.reviewFilter)) {
    return null;
  }

  const rawTelegram = pickValue(row, TELEGRAM_KEYS);
  const telegramUsername = normalizeTelegramUsername(rawTelegram);

  return {
    name,
    text,
    telegramUsername,
    telegramLink: telegramUsername ? `https://t.me/${telegramUsername}` : "",
  };
}

function pickValue(row, allowedKeys) {
  const normalized = {};

  Object.entries(row).forEach(([key, value]) => {
    if (!value) {
      return;
    }

    const normalizedKey = normalizeKey(key);
    if (!normalized[normalizedKey]) {
      normalized[normalizedKey] = String(value).trim();
    }
  });

  for (const key of allowedKeys) {
    const value = normalized[key];
    if (value) {
      return value;
    }
  }

  return "";
}

function readModerationFlag(row) {
  const raw = pickValue(row, REVIEW_MODERATION_KEYS);
  if (!raw) {
    return null;
  }

  const value = normalizeKey(raw);

  if (["1", "true", "yes", "da", "да", "ok", "on", "show"].includes(value)) {
    return true;
  }

  if (["0", "false", "no", "net", "нет", "off", "hide", "skip"].includes(value)) {
    return false;
  }

  return null;
}

function normalizeKey(value) {
  return String(value)
    .toLowerCase()
    .replaceAll("ё", "е")
    .replace(/[^a-zа-я0-9]+/gi, "");
}

function normalizeTelegramUsername(value) {
  if (!value) {
    return "";
  }

  let candidate = String(value).trim();

  if (!candidate) {
    return "";
  }

  const containsLink = /t\.me\//i.test(candidate);

  if (/^https?:\/\//i.test(candidate) || containsLink) {
    try {
      const parsed =
        /^https?:\/\//i.test(candidate) ? new URL(candidate) : new URL(`https://${candidate}`);

      if (/t\.me$/i.test(parsed.hostname) || /\.t\.me$/i.test(parsed.hostname)) {
        candidate = parsed.pathname;
      }
    } catch {
      if (containsLink) {
        const split = candidate.split(/t\.me\//i);
        candidate = split[1] || candidate;
      }
    }
  }

  candidate = candidate.replace(/^\/+/, "");
  candidate = candidate.replace(/^@+/, "");
  candidate = candidate.split(/[/?#\s]/)[0];
  candidate = candidate.replace(/[^a-zA-Z0-9_]/g, "");

  return candidate;
}

function loadSheetTable() {
  return new Promise((resolve, reject) => {
    const callbackName = `sheetCb_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeoutMs = 15000;

    let completed = false;

    const cleanup = () => {
      delete window[callbackName];
      script.remove();
      clearTimeout(timeoutId);
    };

    const timeoutId = window.setTimeout(() => {
      if (completed) {
        return;
      }

      completed = true;
      cleanup();
      reject(new Error("Google Sheets не ответил вовремя"));
    }, timeoutMs);

    window[callbackName] = (response) => {
      if (completed) {
        return;
      }

      completed = true;
      cleanup();

      if (!response || response.status !== "ok" || !response.table) {
        const reason =
          response?.errors?.[0]?.detailed_message ||
          response?.errors?.[0]?.message ||
          "Google Sheets вернул ошибку";

        reject(new Error(reason));
        return;
      }

      resolve(response.table);
    };

    const params = new URLSearchParams({
      sheet: String(CONFIG.sheetName || DEFAULT_CONFIG.sheetName),
      headers: "1",
      tq: "select *",
      tqx: `out:json;responseHandler:${callbackName}`,
    });

    script.async = true;
    script.src = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(CONFIG.sheetId)}/gviz/tq?${params.toString()}`;

    script.onerror = () => {
      if (completed) {
        return;
      }

      completed = true;
      cleanup();
      reject(new Error("Ошибка сети при загрузке таблицы"));
    };

    document.body.append(script);
  });
}

function scrollToBottom() {
  elements.feed.scrollTop = elements.feed.scrollHeight;
}

function isNearBottom() {
  const delta = elements.feed.scrollHeight - elements.feed.scrollTop - elements.feed.clientHeight;
  return delta < 140;
}

function formatTime(date) {
  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function setStatus(text) {
  elements.status.textContent = text;
}

function isSheetConfigured(sheetId) {
  if (!sheetId) {
    return false;
  }

  return String(sheetId).trim() !== "PASTE_GOOGLE_SHEET_ID";
}

function normalizeReviewFilter(input) {
  const source = input && typeof input === "object" ? input : {};

  return {
    enabled: source.enabled !== false,
    minScore: clampNumber(source.minScore, 3, 1, 6),
    minChars: clampNumber(source.minChars, 8, 3, 100),
    minWords: clampNumber(source.minWords, 2, 1, 20),
    maxDigitRatio: clampFloat(source.maxDigitRatio, 0.35, 0.05, 0.95),
    maxDigitRun: clampNumber(source.maxDigitRun, 5, 3, 20),
    shortReviewMaxWords: clampNumber(source.shortReviewMaxWords, 4, 1, 10),
    shortReviewMaxChars: clampNumber(source.shortReviewMaxChars, 35, 8, 80),
  };
}

function clampNumber(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function clampFloat(value, fallback, min, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, parsed));
}

function isLikelyReview(text, filterConfig) {
  if (!filterConfig?.enabled) {
    return true;
  }

  const source = String(text || "").trim();
  if (!source) {
    return false;
  }

  const normalized = source.toLowerCase().replaceAll("ё", "е");
  const compact = normalized.replace(/\s+/g, " ").trim();
  const charCount = compact.replace(/\s/g, "").length;
  const wordCount = compact ? compact.split(" ").length : 0;
  const questionCount = (source.match(/\?/g) || []).length;
  const linkCount = (normalized.match(/https?:\/\/|t\.me\/|www\./gi) || []).length;
  const letterCount = (compact.match(/[a-zа-я]/gi) || []).length;
  const digitGroups = compact.match(/\d+/g) || [];
  const digitCount = digitGroups.reduce((sum, group) => sum + group.length, 0);
  const maxDigitRun = digitGroups.reduce((max, group) => Math.max(max, group.length), 0);
  const digitRatio = digitCount / Math.max(1, charCount);
  const bulletLines = source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[-•*]\s+/.test(line)).length;
  const compactNoSpaces = compact.replace(/\s/g, "");

  if (charCount < filterConfig.minChars) {
    return false;
  }

  if (!letterCount) {
    return false;
  }

  if (HARD_REJECT_PATTERNS.some((pattern) => pattern.test(compact))) {
    return false;
  }

  if (maxDigitRun >= filterConfig.maxDigitRun) {
    return false;
  }

  if (digitRatio > filterConfig.maxDigitRatio) {
    return false;
  }

  if (/(.)\1{6,}/u.test(compactNoSpaces)) {
    return false;
  }

  const isShortCandidate =
    wordCount <= filterConfig.shortReviewMaxWords && charCount <= filterConfig.shortReviewMaxChars;
  if (isShortCandidate) {
    return SHORT_REVIEW_PATTERNS.some((pattern) => pattern.test(compact));
  }

  const hasReviewSignal = REVIEW_SIGNAL_PATTERNS.some((pattern) => pattern.test(normalized));
  const hasFirstPerson = FIRST_PERSON_PATTERN.test(normalized);
  const hasNonReviewSignal = NON_REVIEW_PATTERNS.some((pattern) => pattern.test(normalized));
  const hasOpinionSignal =
    hasReviewSignal ||
    hasFirstPerson ||
    /(нрав|понрав|рекоменд|советую|удобно|круто|супер|отлич|плохо|ужас|довол)/iu.test(normalized);

  if (!hasOpinionSignal) {
    return false;
  }

  let score = 0;

  if (hasReviewSignal) {
    score += 2;
  }

  if (hasFirstPerson) {
    score += 1;
  }

  if (wordCount >= Math.max(filterConfig.minWords, 4)) {
    score += 1;
  }

  if (/[.!?]/.test(source)) {
    score += 1;
  }

  if (/⭐|★|5\/5|10\/10|рейтинг|оценк/iu.test(normalized)) {
    score += 1;
  }

  if (hasNonReviewSignal) {
    score -= 3;
  }

  if (hasNonReviewSignal && (questionCount >= 1 || bulletLines >= 1 || wordCount > 25)) {
    return false;
  }

  if (questionCount >= 3 && !hasReviewSignal) {
    score -= 2;
  }

  if (bulletLines >= 2) {
    score -= 2;
  }

  if (linkCount >= 2) {
    score -= 2;
  }

  if (wordCount > 180) {
    score -= 1;
  }

  if (wordCount < filterConfig.minWords && !hasReviewSignal) {
    return false;
  }

  if (hasNonReviewSignal && !hasReviewSignal) {
    return false;
  }

  if (score >= filterConfig.minScore) {
    return true;
  }

  return hasReviewSignal && !hasNonReviewSignal && wordCount >= filterConfig.minWords;
}

function extractSheetId(input) {
  const value = String(input || "").trim();

  if (!value) {
    return "";
  }

  const directMatch = value.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (directMatch?.[1]) {
    return directMatch[1];
  }

  return value;
}

function readQueryConfig() {
  const params = new URLSearchParams(window.location.search);
  const config = {};

  const sheetId = params.get("sheetId");
  const sheetName = params.get("sheetName");

  if (sheetId) {
    config.sheetId = sheetId;
  }

  if (sheetName) {
    config.sheetName = sheetName;
  }

  return config;
}
