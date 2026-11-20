"use strict";

const STORAGE_KEY = "rashody.expenses.v1";
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

function renderTotals() {
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
