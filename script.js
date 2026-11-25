"use strict";

const STORAGE_KEY = "rashody.expenses.v1";
const BUDGET_KEY_PREFIX = "rashody.budgets.v1.";
const categories = ["Еда", "Транспорт", "Дом", "Секции", "Другое", "Траты"];
const byId = (id) => document.getElementById(id);
const form = byId("expense-form");
const amountInput = byId("amount");
const dateInput = byId("date");
const periodStart = byId("period-start");
const periodEnd = byId("period-end");
const money = (amount) => `${String(amount).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} ₸`;

function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T12:00:00`);
  return !Number.isNaN(date.getTime()) && localDate(date) === value;
}

function validExpense(item) {
  return item && Number.isSafeInteger(item.amount) && item.amount > 0 &&
    categories.includes(item.category) && validDate(item.date) && typeof item.comment === "string";
}

let expenses = [];
let storageReady = true;
try {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw !== null) {
    const saved = JSON.parse(raw);
    let sum = 0;
    if (!Array.isArray(saved) || !saved.every((item) => {
      if (!validExpense(item)) return false;
      sum += item.amount;
      return Number.isSafeInteger(sum);
    })) throw new Error("Invalid stored expenses");
    expenses = saved;
  }
} catch {
  storageReady = false;
  byId("storage-message").textContent = "Не удалось прочитать сохранённые траты. Добавление приостановлено, чтобы не потерять данные. Проверьте доступ к хранилищу браузера и обновите страницу.";
}

function fieldError(input, message) {
  input.setAttribute("aria-invalid", String(Boolean(message)));
  byId(`${input.id}-error`).textContent = message;
}

let budgetMonth = "";
let budgetLimits = {};
let budgetStorageReady = true;

function validLimits(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  let sum = 0;
  return Object.entries(value).every(([category, limit]) => {
    if (!categories.includes(category) || !Number.isSafeInteger(limit) || limit < 0) return false;
    sum += limit;
    return Number.isSafeInteger(sum);
  });
}

function syncBudgetMonth() {
  const now = new Date();
  const month = localDate(now).slice(0, 7);
  if (month === budgetMonth) return false;
  budgetMonth = month;
  budgetLimits = {};
  budgetStorageReady = true;
  byId("budget-storage-message").textContent = "";
  byId("budget-status").textContent = "";
  try {
    const raw = localStorage.getItem(BUDGET_KEY_PREFIX + month);
    if (raw !== null) {
      const saved = JSON.parse(raw);
      if (!validLimits(saved)) throw new Error("Invalid stored limits");
      budgetLimits = saved;
    }
  } catch {
    budgetStorageReady = false;
    byId("budget-storage-message").textContent = "Не удалось прочитать лимиты. Изменение приостановлено, чтобы не потерять данные. Проверьте доступ к хранилищу браузера и обновите страницу.";
  }
  byId("budget-month").textContent = now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  const container = byId("budget-categories");
  container.replaceChildren();
  categories.forEach((category, index) => {
    const categoryForm = document.createElement("form");
    categoryForm.className = "budget-category";
    categoryForm.noValidate = true;
    categoryForm.setAttribute("aria-labelledby", `budget-category-${index}`);
    // Категории и идентификаторы берутся только из фиксированного списка выше.
    categoryForm.innerHTML = `
      <h3 id="budget-category-${index}">${category}</h3>
      <p id="budget-limit-${index}" class="budget-limit"></p>
      <label for="budget-input-${index}">Лимит, ₸</label>
      <input id="budget-input-${index}" type="text" inputmode="numeric" placeholder="Например, 15 000" aria-describedby="budget-limit-${index} budget-input-${index}-error" required>
      <p id="budget-input-${index}-error" class="error" role="alert"></p>
      <div class="budget-actions"><button type="submit">Сохранить</button><button type="button">Убрать лимит</button></div>`;
    const input = categoryForm.querySelector("input");
    const saveButton = categoryForm.querySelector('[type="submit"]');
    const removeButton = categoryForm.querySelector('[type="button"]');
    function updateLimit() {
      const hasLimit = Object.hasOwn(budgetLimits, category);
      byId(`budget-limit-${index}`).textContent = !budgetStorageReady ? "Лимит: недоступен" :
        hasLimit ? `Лимит: ${money(budgetLimits[category])}` : "Лимит: Не задан";
      input.value = hasLimit ? String(budgetLimits[category]).replace(/\B(?=(\d{3})+(?!\d))/g, " ") : "";
      input.disabled = saveButton.disabled = !budgetStorageReady;
      removeButton.disabled = !budgetStorageReady || !hasLimit;
    }
    function saveLimit(remove) {
      // Старое поле при смене месяца не должно записать значение в новый месяц.
      if (syncBudgetMonth()) {
        byId("budget-status").textContent = "Месяц изменился. Задайте лимит для нового месяца.";
        return;
      }
      byId("budget-status").textContent = "";
      if (!budgetStorageReady) return;
      const next = { ...budgetLimits };
      let error = "";
      if (remove) {
        delete next[category];
      } else {
        const value = input.value.trim();
        const amount = Number(value.replace(/[ \u00a0\u202f]/g, ""));
        if (!/^\d+(?:[ \u00a0\u202f]\d+)*$/.test(value) || !Number.isSafeInteger(amount) || amount < 0) {
          error = "Введите целый лимит от 0 ₸, например 15 000.";
        } else {
          next[category] = amount;
          if (!validLimits(next)) error = "Сумма лимитов слишком велика. Укажите меньший лимит.";
        }
      }
      fieldError(input, error);
      if (error) {
        input.focus();
        return;
      }
      try {
        localStorage.setItem(BUDGET_KEY_PREFIX + budgetMonth, JSON.stringify(next));
      } catch {
        byId("budget-storage-message").textContent = "Не удалось сохранить лимиты. Прежние лимиты остаются в силе. Проверьте свободное место и доступ к хранилищу браузера, затем попробуйте ещё раз.";
        return;
      }
      budgetLimits = next;
      byId("budget-storage-message").textContent = "";
      updateLimit();
      byId("budget-status").textContent = `${category}: ${remove ? "лимит убран" : "лимит сохранён"}.`;
      if (remove) input.focus();
    }
    categoryForm.addEventListener("submit", (event) => {
      event.preventDefault();
      saveLimit(false);
    });
    removeButton.addEventListener("click", () => saveLimit(true));
    container.append(categoryForm);
    updateLimit();
  });
  return true;
}

function renderTotals() {
  syncBudgetMonth();
  const now = new Date();
  const month = localDate(now).slice(0, 7);
  byId("month-name").textContent = now.toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  byId("month-total").textContent = money(expenses.reduce((sum, item) => sum + (item.date.startsWith(month) ? item.amount : 0), 0));
  const valid = validDate(periodStart.value) && validDate(periodEnd.value) && periodStart.value <= periodEnd.value;
  byId("period-error").textContent = valid ? "" : "Укажите обе даты. Начало периода должно быть не позже конца.";
  periodStart.setAttribute("aria-invalid", String(!valid));
  periodEnd.setAttribute("aria-invalid", String(!valid));
  byId("period-total").textContent = valid ? money(expenses.reduce((sum, item) => sum + (item.date >= periodStart.value && item.date <= periodEnd.value ? item.amount : 0), 0)) : "—";
}

function render() {
  const list = byId("expense-list");
  list.replaceChildren();
  byId("empty-list").hidden = expenses.length > 0;
  for (const item of expenses) {
    const li = document.createElement("li");
    li.className = "expense";
    const category = document.createElement("strong");
    category.textContent = item.category;
    const amount = document.createElement("strong");
    amount.textContent = money(item.amount);
    const date = document.createElement("time");
    date.dateTime = item.date;
    date.textContent = item.date.split("-").reverse().join(".");
    li.append(category, amount, date);
    if (item.comment) {
      const comment = document.createElement("p");
      comment.textContent = item.comment;
      li.append(comment);
    }
    list.append(li);
  }
  renderTotals();
}

function choosePeriod(preset) {
  const end = new Date();
  const start = new Date(end);
  if (preset === "month") {
    start.setDate(1);
    end.setMonth(end.getMonth() + 1, 0);
  } else {
    start.setDate(start.getDate() - Number(preset) + 1);
  }
  periodStart.value = localDate(start);
  periodEnd.value = localDate(end);
  document.querySelectorAll("[data-days]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.days === preset)));
  renderTotals();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  byId("save-status").textContent = "";
  const value = amountInput.value.trim();
  const digits = value.replace(/[ \u00a0\u202f]/g, "");
  const amount = Number(digits);
  let amountError = !/^\d+(?:[ \u00a0\u202f]\d+)*$/.test(value) || !Number.isSafeInteger(amount) || amount <= 0
    ? "Введите положительную сумму в целых тенге, например 5 000." : "";
  if (!amountError && !Number.isSafeInteger(expenses.reduce((sum, item) => sum + item.amount, amount))) {
    amountError = "Сумма слишком велика. Введите меньшую сумму.";
  }
  const dateError = validDate(dateInput.value) ? "" : "Выберите корректную дату.";
  fieldError(amountInput, amountError);
  fieldError(dateInput, dateError);
  if (amountError || dateError) {
    (amountError ? amountInput : dateInput).focus();
    return;
  }
  const category = byId("category").value;
  if (!categories.includes(category) || !storageReady) return;
  const next = [{ amount, category, date: dateInput.value, comment: byId("comment").value.trim() }, ...expenses];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    byId("storage-message").textContent = "Не удалось сохранить трату. Проверьте свободное место и доступ к хранилищу браузера, затем попробуйте ещё раз.";
    return;
  }
  expenses = next;
  byId("storage-message").textContent = "";
  amountInput.value = "";
  byId("comment").value = "";
  dateInput.value = localDate();
  render();
  byId("save-status").textContent = "Трата добавлена.";
  amountInput.focus();
});

document.querySelectorAll("[data-days]").forEach((button) => button.addEventListener("click", () => choosePeriod(button.dataset.days)));
for (const input of [periodStart, periodEnd]) {
  input.addEventListener("change", () => {
    document.querySelectorAll("[data-days]").forEach((button) => button.setAttribute("aria-pressed", "false"));
    renderTotals();
  });
}
window.addEventListener("pageshow", renderTotals);
document.addEventListener("visibilitychange", () => { if (!document.hidden) renderTotals(); });
// Обновляем текущий месяц и при переходе через полночь в открытой вкладке.
setInterval(renderTotals, 60000);
dateInput.value = localDate();
choosePeriod("month");
render();
