"use strict";

const DEFAULT_CONFIG = {
  sheetId: "PASTE_GOOGLE_SHEET_ID",
  sheetName: "Лист1",
  refreshIntervalMs: 45000,
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

const runtimeConfig =
  typeof window.SHEET_CONFIG === "object" && window.SHEET_CONFIG ? window.SHEET_CONFIG : {};

const CONFIG = {
  ...DEFAULT_CONFIG,
  ...runtimeConfig,
  ...readQueryConfig(),
};

CONFIG.sheetId = extractSheetId(CONFIG.sheetId);

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
    const reviews = rows.map((row, idx) => toReview(row, idx)).filter(Boolean);

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
        `Новые отзывы: +${reviews.length - previousCount}. Обновлено в ${formatTime(new Date())}`
      );
    } else {
      setStatus(`Обновлено в ${formatTime(new Date())}`);
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

  if (!text) {
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
