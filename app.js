const storageKey = "hours-tracker-rows";
const fixedFirstName = "Caitlin";
const fixedLastName = "Beaty";
const fixedHourlyRate = 18;

const seededWeekRecords = [
  { id: "seed-2026-05-24", dateWorked: "2026-05-24", hoursQty: 2.25 },
  { id: "seed-2026-05-25", dateWorked: "2026-05-25", hoursQty: 8 },
  { id: "seed-2026-05-26", dateWorked: "2026-05-26", hoursQty: 7.5 },
  { id: "seed-2026-05-27", dateWorked: "2026-05-27", hoursQty: 8 },
  { id: "seed-2026-05-28", dateWorked: "2026-05-28", hoursQty: 8.75 },
  { id: "seed-2026-05-29", dateWorked: "2026-05-29", hoursQty: 8.75 },
];

const fields = [
  { key: "dateWorked", header: "Date", date: true },
  { key: "hoursQty", header: "Hours", numeric: true },
  { key: "cashAmount", header: "Amount per hour", numeric: true, money: true },
  { key: "totalForDate", header: "Total for date", numeric: true, money: true },
];

const exportFields = fields;
const excelColumnWidths = {
  dateWorked: 16,
  hoursQty: 12,
  cashAmount: 18,
  totalForDate: 18,
};

const form = document.querySelector("#entryForm");
const recordsBody = document.querySelector("#recordsBody");
const rowTemplate = document.querySelector("#rowTemplate");
const searchInput = document.querySelector("#searchInput");
const exportButton = document.querySelector("#exportCsv");
const exportExcelButton = document.querySelector("#exportExcel");
const excelFileNameInput = document.querySelector("#excelFileName");
const importButton = document.querySelector("#importFileButton");
const importInput = document.querySelector("#fileImport");
const clearAllButton = document.querySelector("#clearAll");
const cancelEditButton = document.querySelector("#cancelEdit");
const formTitle = document.querySelector("#formTitle");
const submitLabel = document.querySelector("#submitLabel");
const emptyState = document.querySelector("#emptyState");
const hoursInput = document.querySelector("#hoursQty");
const dateTotalInput = document.querySelector("#dateTotal");

const totals = {
  hours: document.querySelector("#totalHours"),
  cash: document.querySelector("#totalCash"),
  entries: document.querySelector("#entryCount"),
  days: document.querySelector("#dayCount"),
};

let records = loadRecords();
let sortState = { key: "dateWorked", direction: "ascending" };

function loadRecords() {
  const seededRecords = mergeSeededWeekRecords(readStoredRecords());
  persistRecords(seededRecords);
  return seededRecords;
}

function saveRecords() {
  persistRecords(records);
}

function readStoredRecords() {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(stored) ? stored.map(normaliseRecord) : [];
  } catch {
    return [];
  }
}

function persistRecords(items) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(items));
  } catch {}
}

function normaliseRecord(record) {
  return {
    ...record,
    firstName: fixedFirstName,
    lastName: fixedLastName,
    cashAmount: fixedHourlyRate,
  };
}

function mergeSeededWeekRecords(existingRecords) {
  const seededIds = new Set(seededWeekRecords.map((record) => record.id));
  const customRecords = existingRecords.filter((record) => !seededIds.has(record.id));
  return [...seededWeekRecords.map(normaliseRecord), ...customRecords];
}

function money(value) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);
}

function number(value) {
  return (Number(value) || 0).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function makeId() {
  if (globalThis.crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random()}`;
}

function getFormValues() {
  return {
    id: document.querySelector("#editingId").value || makeId(),
    dateWorked: document.querySelector("#dateWorked").value,
    comments: "",
    firstName: fixedFirstName,
    lastName: fixedLastName,
    cashAmount: fixedHourlyRate,
    hoursQty: Number(hoursInput.value || 0),
  };
}

function setFormValues(record) {
  document.querySelector("#editingId").value = record.id || "";
  document.querySelector("#dateWorked").value = record.dateWorked || "";
  document.querySelector("#cashAmount").value = fixedHourlyRate.toFixed(2);
  hoursInput.value = record.hoursQty ?? "";
  updateDateTotal();
}

function resetForm() {
  form.reset();
  document.querySelector("#editingId").value = "";
  document.querySelector("#cashAmount").value = fixedHourlyRate.toFixed(2);
  updateDateTotal();
  formTitle.textContent = "Add hours";
  submitLabel.textContent = "Save hours";
  cancelEditButton.hidden = true;
}

function rowTotal(record) {
  return (Number(record.cashAmount) || fixedHourlyRate) * (Number(record.hoursQty) || 0);
}

function getFieldValue(record, field) {
  if (field.key === "totalForDate") return rowTotal(record);
  if (field.key === "cashAmount") return Number(record.cashAmount) || fixedHourlyRate;
  if (field.key === "dateWorked") return normaliseDate(record.dateWorked);
  return record[field.key];
}

function formatFieldValue(record, field) {
  const value = getFieldValue(record, field);
  if (field.date) return formatDateForExport(value);
  if (field.money) return money(value);
  if (field.numeric) return number(value);
  return value || "";
}

function updateDateTotal() {
  dateTotalInput.value = money(fixedHourlyRate * (Number(hoursInput.value) || 0));
}

function filteredRecords() {
  const query = searchInput.value.trim().toLowerCase();

  return records.filter((record) => {
    return !query || fields.some((field) => formatFieldValue(record, field).toLowerCase().includes(query));
  });
}

function sortedRecords(items) {
  const { key, direction } = sortState;
  const multiplier = direction === "ascending" ? 1 : -1;

  return [...items].sort((a, b) => {
    const field = fields.find((item) => item.key === key) || fields[0];
    const rawA = getFieldValue(a, field);
    const rawB = getFieldValue(b, field);
    const valueA = field.numeric ? Number(rawA) || 0 : String(rawA ?? "").toLowerCase();
    const valueB = field.numeric ? Number(rawB) || 0 : String(rawB ?? "").toLowerCase();

    if (valueA < valueB) return -1 * multiplier;
    if (valueA > valueB) return 1 * multiplier;
    return 0;
  });
}

function renderTotals() {
  const visibleRecords = filteredRecords();
  const hours = visibleRecords.reduce((sum, record) => sum + (Number(record.hoursQty) || 0), 0);
  const cash = visibleRecords.reduce(
    (sum, record) => sum + (Number(record.cashAmount) || 0) * (Number(record.hoursQty) || 0),
    0,
  );
  const days = new Set(visibleRecords.map((record) => record.dateWorked).filter(Boolean));

  totals.hours.textContent = number(hours);
  totals.cash.textContent = money(cash);
  totals.entries.textContent = visibleRecords.length.toLocaleString("en-GB");
  totals.days.textContent = days.size.toLocaleString("en-GB");
}

function renderSortIndicators() {
  document.querySelectorAll("thead button[data-sort]").forEach((button) => {
    if (button.dataset.sort === sortState.key) {
      button.setAttribute("aria-sort", sortState.direction);
    } else {
      button.removeAttribute("aria-sort");
    }
  });
}

function renderTable() {
  recordsBody.innerHTML = "";
  const rows = sortedRecords(filteredRecords());

  for (const record of rows) {
    const row = rowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.id = record.id;

    for (const field of fields) {
      const cell = row.querySelector(`[data-field="${field.key}"]`);
      if (!cell) continue;
      cell.textContent = formatFieldValue(record, field);
    }

    row.querySelector(".edit-row").addEventListener("click", () => startEdit(record.id));
    row.querySelector(".delete-row").addEventListener("click", () => deleteRecord(record.id));
    recordsBody.append(row);
  }

  emptyState.hidden = rows.length > 0;
  renderSortIndicators();
  renderTotals();
}

function render() {
  renderTable();
}

function saveRecord(event) {
  event.preventDefault();

  const record = getFormValues();
  const existingIndex = records.findIndex((item) => item.id === record.id);

  if (existingIndex >= 0) {
    records[existingIndex] = record;
    showToast("Hours row updated.");
  } else {
    records.unshift(record);
    showToast("Hours row saved.");
  }

  saveRecords();
  resetForm();
  render();
}

function startEdit(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  setFormValues(record);
  formTitle.textContent = "Edit hours";
  submitLabel.textContent = "Update hours";
  cancelEditButton.hidden = false;
  document.querySelector("#dateWorked").focus();
}

function deleteRecord(id) {
  const record = records.find((item) => item.id === id);
  if (!record) return;

  if (!confirm("Delete this hours row?")) return;

  records = records.filter((item) => item.id !== id);
  saveRecords();
  render();
  showToast("Hours row deleted.");
}

function clearAllRecords() {
  if (!records.length) return;
  if (!confirm("Clear all hours rows?")) return;

  records = [];
  saveRecords();
  resetForm();
  render();
  showToast("All hours rows cleared.");
}

function exportCsv() {
  const csv = workbookRows()
    .map((row) => row.map(csvEscape).join(","))
    .join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  downloadBlob(blob, `${getBaseExportName("hours-tracker")}.csv`);
}

function exportExcel() {
  const fileName = getExcelExportFileName();
  if (!fileName) return;

  const xlsx = globalThis.XLSX;
  if (!xlsx) {
    showToast("Excel support could not load. CSV export is still available.");
    return;
  }

  const worksheet = xlsx.utils.aoa_to_sheet(workbookRows());
  worksheet["!cols"] = exportFields.map((field) => ({ wch: excelColumnWidths[field.key] || 14 }));
  formatExcelMoneyColumns(xlsx, worksheet);

  const workbook = xlsx.utils.book_new();
  xlsx.utils.book_append_sheet(workbook, worksheet, "Hours");
  xlsx.writeFile(workbook, `${fileName}.xlsx`);
}

function formatExcelMoneyColumns(xlsx, worksheet) {
  const range = xlsx.utils.decode_range(worksheet["!ref"] || "A1");
  exportFields.forEach((field, index) => {
    if (!field.money) return;
    for (let rowIndex = range.s.r + 1; rowIndex <= range.e.r; rowIndex += 1) {
      const address = xlsx.utils.encode_cell({ r: rowIndex, c: index });
      if (worksheet[address]) worksheet[address].z = '"\u00a3"#,##0.00';
    }
  });
}

function workbookRows() {
  const rows = sortedRecords(filteredRecords());
  return [
    exportFields.map((field) => field.header),
    ...rows.map((record) => exportFields.map((field) => exportValue(record, field.key))),
  ];
}

function exportValue(record, key) {
  if (key === "dateWorked") return formatDateForExport(record[key]);
  if (key === "cashAmount") return Number((Number(record.cashAmount) || fixedHourlyRate).toFixed(2));
  if (key === "totalForDate") return Number(rowTotal(record).toFixed(2));
  return record[key] ?? "";
}

function getExcelExportFileName() {
  const value = excelFileNameInput.value.trim();
  const pattern = /^(January|February|March|April|May|June|July|August|September|October|November|December)_[0-9]{4}_Caitlin_Beaty$/;

  if (!pattern.test(value)) {
    excelFileNameInput.focus();
    showToast("Excel name must be Month_Year_Caitlin_Beaty.");
    return "";
  }

  return value;
}

function getBaseExportName(fallback) {
  return getExcelExportFileName() || `${fallback}-${new Date().toISOString().slice(0, 10)}`;
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  if (value || row.length) {
    row.push(value);
    rows.push(row);
  }

  return rows.filter((items) => items.some((item) => item.trim()));
}

function headerToKey(header) {
  const normalised = header.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const aliases = {
    date: "dateWorked",
    dateworkedwc: "dateWorked",
    dateworked: "dateWorked",
    wc: "dateWorked",
    comments: "comments",
    firstname: "firstName",
    first_name: "firstName",
    lastname: "lastName",
    last_name: "lastName",
    eeearnamtcash: "cashAmount",
    eeearnamt: "cashAmount",
    cash: "cashAmount",
    amountperhour: "cashAmount",
    rate: "cashAmount",
    eeearnqtyhours: "hoursQty",
    eeearnqty: "hoursQty",
    hours: "hoursQty",
    totalfordate: "totalForDate",
    total: "totalForDate",
  };
  return aliases[normalised] || fields.find((field) => header === field.header)?.key;
}

async function importFile(event) {
  const [file] = event.target.files;
  if (!file) return;

  try {
    const extension = file.name.split(".").pop()?.toLowerCase();
    const rows = extension === "xls" || extension === "xlsx" ? await readExcelRows(file) : parseCsv(await file.text());
    const imported = rowsToRecords(rows);

    records = [...imported, ...records];
    saveRecords();
    render();
    showToast(`${imported.length} hours row${imported.length === 1 ? "" : "s"} imported.`);
  } catch (error) {
    showToast(error.message || "Import failed.");
  } finally {
    importInput.value = "";
  }
}

async function readExcelRows(file) {
  const xlsx = globalThis.XLSX;
  if (!xlsx) {
    throw new Error("Excel support could not load. Try CSV instead.");
  }

  const workbook = xlsx.read(await file.arrayBuffer(), {
    type: "array",
    cellDates: true,
  });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!firstSheet) return [];

  return xlsx.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: "",
    blankrows: false,
    raw: false,
  });
}

function rowsToRecords(rows) {
  const dataRows = rows.filter((row) => row.some((value) => String(value ?? "").trim()));
  const [headers = [], ...body] = dataRows;
  let mappedHeaders = headers.map(headerToKey);

  if (!mappedHeaders.some(Boolean)) {
    mappedHeaders = exportFields.map((field) => field.key);
    body.unshift(headers);
  }

  return body
    .map((row) => {
      const record = {
        id: makeId(),
        firstName: fixedFirstName,
        lastName: fixedLastName,
        cashAmount: fixedHourlyRate,
      };
      row.forEach((value, index) => {
        const key = mappedHeaders[index];
        if (!key || key === "firstName" || key === "lastName" || key === "cashAmount" || key === "totalForDate") return;
        record[key] = normaliseImportedValue(key, value);
      });
      return record;
    })
    .filter((record) => record.dateWorked || record.hoursQty);
}

function normaliseImportedValue(key, value) {
  if (key === "dateWorked") return normaliseDate(value);
  if (key === "cashAmount" || key === "hoursQty") return parseAmount(value);
  return String(value ?? "").trim();
}

function parseAmount(value) {
  const cleaned = String(value ?? "").replace(/[^0-9.-]/g, "");
  return Number(cleaned || 0);
}

function normaliseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return dateToIso(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return dateToIso(new Date(Math.round((value - 25569) * 86400 * 1000)));
  }

  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const numericDate = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (numericDate) {
    const first = Number(numericDate[1]);
    const second = Number(numericDate[2]);
    const year = Number(numericDate[3].length === 2 ? `20${numericDate[3]}` : numericDate[3]);
    const day = second > 12 ? second : first;
    const month = second > 12 ? first : second;
    return makeIsoDate(year, month, day) || text;
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.valueOf()) ? text : dateToIso(parsed);
}

function formatDateForExport(value) {
  const isoDate = normaliseDate(value);
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(value ?? "").trim();

  const [, year, month, day] = match;
  return `${day}-${month}-${year.slice(-2)}`;
}

function dateToIso(date) {
  return makeIsoDate(date.getFullYear(), date.getMonth() + 1, date.getDate()) || "";
}

function makeIsoDate(year, month, day) {
  if (!year || !month || !day || month < 1 || month > 12 || day < 1 || day > 31) return "";
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function downloadBlob(blob, filename) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

function showToast(message) {
  document.querySelector(".toast")?.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.textContent = message;
  document.body.append(toast);
  setTimeout(() => toast.remove(), 2600);
}

form.addEventListener("submit", saveRecord);
cancelEditButton.addEventListener("click", resetForm);
hoursInput.addEventListener("input", updateDateTotal);
searchInput.addEventListener("input", renderTable);
exportButton.addEventListener("click", exportCsv);
exportExcelButton.addEventListener("click", exportExcel);
importButton.addEventListener("click", () => importInput.click());
importInput.addEventListener("change", importFile);
clearAllButton.addEventListener("click", clearAllRecords);

document.querySelectorAll("thead button[data-sort]").forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sort;
    const sameKey = sortState.key === key;
    sortState = {
      key,
      direction: sameKey && sortState.direction === "ascending" ? "descending" : "ascending",
    };
    renderTable();
  });
});

render();
