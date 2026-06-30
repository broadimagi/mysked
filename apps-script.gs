const MASTER_SPREADSHEET_ID = "1V0hytAPWX0N4Nv5VLBDYkzfJp26rYfEaMV11Xt5oDLA";

const MASTER_OPERATOR_TAB = "operatorSettings";
const GLOBAL_SETTINGS_TAB = "globalSettings";
const LABEL_SETTINGS_TAB = "labelSettings";

const ROUTES_TAB = "operatorRoutes";
const SCHEDULES_TAB = "operatorSchedules";
const ADVISORIES_TAB = "operatorAdvisories";

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const mode = String(params.mode || "").toLowerCase();
    const operatorCode = String(params.operator || "").trim();

    const master = SpreadsheetApp.openById(MASTER_SPREADSHEET_ID);
    const operatorSettingsSheet = master.getSheetByName(MASTER_OPERATOR_TAB);
    const globalSettingsSheet = master.getSheetByName(GLOBAL_SETTINGS_TAB);
    const labelSettingsSheet = master.getSheetByName(LABEL_SETTINGS_TAB);

    const globalSettings = getGlobalSettingsObject(globalSettingsSheet);
    const maintenanceMode = getSettingValue(globalSettings, "MaintenanceMode");
    const maintenanceMessage = getSettingValue(globalSettings, "MaintenanceMessage") || "System maintenance in progress";

    if (isEnabled(maintenanceMode)) {
      return jsonOutput({
        success: false,
        maintenance: true,
        message: maintenanceMessage,
        globalSettings
      });
    }

    if (mode === "operators") {
      return jsonOutput({
        success: true,
        operators: getOperatorsData(operatorSettingsSheet),
        globalSettings
      });
    }

    if (!operatorCode) {
      return jsonOutput({
        success: false,
        code: "NO_OPERATOR",
        error: "No operator selected",
        redirectHomeSeconds: 3,
        globalSettings
      });
    }

    const operatorData = findOperatorData(operatorSettingsSheet, operatorCode);
    if (!operatorData) {
      return jsonOutput({
        success: false,
        code: "OPERATOR_NOT_FOUND",
        error: "Operator not found",
        globalSettings
      });
    }

    const operatorStatus = getField(operatorData, "status");
    if (operatorStatus && String(operatorStatus).toLowerCase() !== "active") {
      return jsonOutput({
        success: false,
        code: "OPERATOR_INACTIVE",
        error: "Operator is not active",
        globalSettings
      });
    }

    const operatorSpreadsheetId = getField(operatorData, "spreadsheetID");
    if (!operatorSpreadsheetId) {
      return jsonOutput({
        success: false,
        code: "MISSING_SPREADSHEET_ID",
        error: "Operator spreadsheet is not configured",
        globalSettings
      });
    }

    const operatorBook = SpreadsheetApp.openById(operatorSpreadsheetId);
    const routesSheet = operatorBook.getSheetByName(ROUTES_TAB);
    const schedulesSheet = operatorBook.getSheetByName(SCHEDULES_TAB);
    const advisoriesSheet = operatorBook.getSheetByName(ADVISORIES_TAB);

    const labelSettings = getLabelSettings(labelSettingsSheet);
    const company = buildCompanySettings(operatorData, labelSettings);

    return jsonOutput({
      success: true,
      lastUpdated: "",
      company,
      globalSettings,
      routes: getSheetData(routesSheet),
      schedules: getSheetData(schedulesSheet),
      advisories: getSheetData(advisoriesSheet),
      operators: getOperatorsData(operatorSettingsSheet)
    });
  } catch (error) {
    return jsonOutput({
      success: false,
      code: "SERVER_ERROR",
      error: error && error.message ? error.message : String(error)
    });
  }
}

function buildCompanySettings(row, labelSettings) {
  return {
    companyName: getField(row, "operatorName") || "Unnamed Operator",
    tagline: getField(row, "tagline") || "Passenger Information System",
    logoURL: getField(row, "logoURL"),
    primaryColor: getField(row, "primaryColor") || "#6A2C91",
    themeMode: getField(row, "themeMode") || "dark",
    refreshSeconds: toNumber(getField(row, "refreshSeconds"), 60),
    cycleSeconds: toNumber(getField(row, "cycleSeconds"), 15),
    footerText: getField(row, "footerText") || "",
    displayColumns: splitList(getField(row, "displayColumns")),
    labelSettings,
    colors: {
      green: splitList(getField(row, "statusGreen")).map(toLower),
      orange: splitList(getField(row, "statusOrange")).map(toLower),
      red: splitList(getField(row, "statusRed")).map(toLower)
    }
  };
}

function getOperatorsData(sheet) {
  return getSheetData(sheet)
    .filter(row => String(getField(row, "status") || "").toLowerCase() === "active")
    .map(row => ({
      code: getField(row, "operatorCode"),
      operatorCode: getField(row, "operatorCode"),
      name: getField(row, "operatorName"),
      companyName: getField(row, "operatorName"),
      tagline: getField(row, "tagline") || getField(row, "footerText") || "",
      description: getField(row, "tagline") || getField(row, "footerText") || "",
      pageURL: getField(row, "pageURL"),
      status: getField(row, "status")
    }))
    .filter(row => row.code && row.name);
}

function findOperatorData(sheet, operatorCode) {
  const cleanTarget = normalizeKey(operatorCode);
  return getSheetData(sheet).find(row => normalizeKey(getField(row, "operatorCode")) === cleanTarget) || null;
}

function getGlobalSettingsObject(sheet) {
  const settings = {};
  if (!sheet) return settings;
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return settings;

  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] || "").trim();
    const value = values[i][1];
    if (!key) continue;
    settings[key] = value;
    settings[normalizeKey(key)] = value;
  }
  return settings;
}

function getLabelSettings(sheet) {
  const labels = {};
  if (!sheet) return labels;
  const rows = getSheetData(sheet);
  rows.forEach(row => {
    const key = getField(row, "key");
    const label = getField(row, "label");
    if (key && label) labels[key] = label;
  });
  return labels;
}

function getSheetData(sheet) {
  if (!sheet) return [];
  const values = sheet.getDataRange().getDisplayValues();
  if (values.length < 2) return [];
  const headers = values[0].map(header => String(header || "").trim());

  return values.slice(1)
    .filter(row => row.some(value => String(value || "").trim() !== ""))
    .map(row => {
      const item = {};
      headers.forEach((header, index) => {
        if (header) item[header] = row[index];
      });
      return item;
    });
}

function getField(row, key) {
  if (!row) return "";
  const cleanKey = normalizeKey(key);
  const matchedKey = Object.keys(row).find(field => normalizeKey(field) === cleanKey);
  return matchedKey ? row[matchedKey] : "";
}

function getSettingValue(settings, key) {
  if (!settings) return "";
  const cleanKey = normalizeKey(key);
  const matchedKey = Object.keys(settings).find(field => normalizeKey(field) === cleanKey);
  return matchedKey ? settings[matchedKey] : "";
}

function normalizeKey(value) {
  return String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
}

function splitList(value) {
  if (!value) return [];
  return String(value).split(",").map(item => item.trim()).filter(Boolean);
}

function toLower(value) {
  return String(value || "").toLowerCase();
}

function toNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function isEnabled(value) {
  return ["true", "yes", "1", "on", "active", "enabled"].includes(String(value || "").trim().toLowerCase());
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
