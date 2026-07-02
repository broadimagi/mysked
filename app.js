const API_URL = "https://script.google.com/macros/s/AKfycby778WwSXHTuZcVC2iT4U3wkrn5pYOpXOuCVZQQ3Oo47cuLqbhyFpEm_6RRrgdcF9s/exec";
const SITE_URL = "https://mysked.broadimagi.com";

let appData = { globalSettings: {}, company: {}, routes: [], schedules: [], advisories: [] };
let selectedRoute = null;
let currentDashboardRouteIndex = 0; 
let dashboardCycleInterval = null;
let masterRefreshInterval = null;
let headerRefreshInterval = null;
let themeManuallySet = false;
let lastSyncedAt = null;
let isMaintenanceMode = false;

function getSafeValue(obj, targetKey, fallback = "") {
    if (!obj) return fallback;
    const targets = getColumnAliases(targetKey).map(normalizeColumnKey);
    const matchedKey = Object.keys(obj).find(k => targets.includes(normalizeColumnKey(k)));
    return (matchedKey && obj[matchedKey] !== undefined) ? obj[matchedKey] : fallback;
}

function getColumnAliases(targetKey) {
    const cleanTarget = normalizeColumnKey(targetKey);
    const aliases = {
        route: ["route", "routeName", "name"],
        status: ["status", "routeStatus", "scheduleStatus"],
        route_status: ["routeStatus", "scheduleStatus", "status"],
        departuretime: ["departureTime", "Departure Time", "time"],
        scheduletype: ["scheduleType", "Schedule_Type"],
        schedulecustomtext: ["scheduleCustomText", "Schedule_Custom_Text"],
        companyname: ["companyName", "operatorName", "company"],
        logourl: ["logoURL", "logoUrl"],
        thememode: ["themeMode"],
        primarycolor: ["primaryColor"],
        refreshseconds: ["refreshSeconds"],
        cycleseconds: ["cycleSeconds"],
        footertext: ["footerText"],
        displaycolumns: ["displayColumns"]
    };
    return aliases[cleanTarget] ? [targetKey, ...aliases[cleanTarget]] : [targetKey];
}

function getSettingValue(settings, targetKey, fallback = "") {
    if (!settings) return fallback;
    const cleanTarget = normalizeColumnKey(targetKey);
    const matchedKey = Object.keys(settings).find(key => normalizeColumnKey(key) === cleanTarget);
    const value = matchedKey ? settings[matchedKey] : undefined;
    return value === undefined || value === null || value === "" ? fallback : value;
}

function getPlatformName(globalSettings = {}) {
    return getSettingValue(globalSettings, "PlatformName", "mySked");
}

function getSupportEmail(globalSettings = {}) {
    return getSettingValue(globalSettings, "ContactSupportEmail", "");
}

function getPlatformVersion(globalSettings = {}) {
    return getSettingValue(globalSettings, "PlatformVersion", "");
}

function getMaintenanceRefreshSeconds(globalSettings = {}) {
    return getNumberSetting(
        getSettingValue(globalSettings, "MaintenanceRefresh"),
        getSettingValue(globalSettings, "MaintenanceRefreshSeconds")
    ) || 30;
}

function getOperatorCodeFromURL() {
    const params = new URLSearchParams(window.location.search);
    const queryOperator = String(params.get("operator") || "").trim();
    if (queryOperator) return queryOperator;

    const pathParts = window.location.pathname
        .split("/")
        .map(part => decodeURIComponent(part).trim())
        .filter(Boolean);
    const firstPart = pathParts[0] || "";
    const reservedPaths = ["index.html", "dashboard.html", "404.html", "dist"];
    return reservedPaths.includes(firstPart.toLowerCase()) ? "" : firstPart;
}

function setPageMetadata({ title, description, canonical }) {
    if (title) {
        document.title = title;
        const ogTitle = document.querySelector('meta[property="og:title"]');
        if (ogTitle) ogTitle.setAttribute("content", title);
    }
    if (description) {
        const metaDescription = document.querySelector('meta[name="description"]');
        const ogDescription = document.querySelector('meta[property="og:description"]');
        if (metaDescription) metaDescription.setAttribute("content", description);
        if (ogDescription) ogDescription.setAttribute("content", description);
    }
    if (canonical) {
        const canonicalLink = document.querySelector('link[rel="canonical"]');
        const ogURL = document.querySelector('meta[property="og:url"]');
        if (canonicalLink) canonicalLink.setAttribute("href", canonical);
        if (ogURL) ogURL.setAttribute("content", canonical);
    }
}

function getReadableTextColor(color) {
    const raw = String(color || "").trim();
    const hex = raw.match(/^#?([a-f\d]{3}|[a-f\d]{6})$/i);
    if (!hex) return "#ffffff";
    const fullHex = hex[1].length === 3 ? hex[1].split("").map(char => char + char).join("") : hex[1];
    const red = parseInt(fullHex.slice(0, 2), 16);
    const green = parseInt(fullHex.slice(2, 4), 16);
    const blue = parseInt(fullHex.slice(4, 6), 16);
    const luminance = (0.299 * red + 0.587 * green + 0.114 * blue) / 255;
    return luminance > 0.58 ? "#111827" : "#ffffff";
}

function applyOperatorTheme(primaryColor) {
    if (!primaryColor) return;
    const primaryText = getReadableTextColor(primaryColor);
    const labelBg = primaryText === "#ffffff" ? "rgba(0, 0, 0, 0.28)" : "rgba(255, 255, 255, 0.36)";
    document.documentElement.style.setProperty("--primary", primaryColor);
    document.documentElement.style.setProperty("--primary-contrast", primaryText);
    document.documentElement.style.setProperty("--marquee-bg", primaryColor);
    document.documentElement.style.setProperty("--marquee-text", primaryText);
    document.documentElement.style.setProperty("--marquee-label-bg", labelBg);
    document.documentElement.style.setProperty("--marquee-label-text", primaryText);
}

window.onload = () => {
    let operatorCode = getOperatorCodeFromURL();

    if (!operatorCode) {
        initHomePage();
        return;
    }

    document.getElementById("toggleDashboardBtn").onclick = () => switchViewMode("dashboard");
    document.getElementById("toggleSelectionBtn").onclick = () => switchViewMode("selection");
    document.getElementById("themeToggleBtn").onclick = toggleTheme;

    initApplication(operatorCode);
    updateClock();
    setInterval(updateClock, 1000);
};

function normalizeOperator(op) {
    return {
        code: op.code || op.operatorCode || op.operator || op.companyCode || "",
        name: op.name || op.companyName || op.company || "Unnamed Service",
        desc: op.tagline || op.description || op.footerText || "Passenger Information System"
    };
}

async function initHomePage() {
    document.body.className = "react-home-mode";
    document.documentElement.setAttribute("data-theme", "dark");
    setPageMetadata({
        title: "mySked Live Transport Schedules",
        description: "Select a mySked operator to view live route schedules, advisories, and passenger information dashboards.",
        canonical: `${SITE_URL}/`
    });
    try {
        const response = await fetch(`${API_URL}?mode=operators&t=${Date.now()}`);
        const data = await response.json();
        appData = { ...appData, globalSettings: data.globalSettings || {} };
        if (data.maintenance) {
            renderStaticHome([], {
                maintenance: data.message || getSettingValue(data.globalSettings, "MaintenanceMessage", "System maintenance is in progress.")
            });
            return;
        }
        const operators = data.success && Array.isArray(data.operators)
            ? data.operators.map(normalizeOperator).filter(op => op.code && op.name)
            : [];
        renderStaticHome(operators);
    } catch (error) {
        renderStaticHome([], { error: "Unable to load services. Please try again later." });
    }
}

function renderStaticHome(operators = [], options = {}) {
    const platformName = getPlatformName(appData.globalSettings);
    const supportEmail = getSupportEmail(appData.globalSettings);
    const platformVersion = getPlatformVersion(appData.globalSettings);
    const now = new Date();
    const time = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    const date = now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
    const serviceCount = operators.length === 0 ? "0 services" : `${operators.length} ${operators.length === 1 ? "service" : "services"} ready`;

    document.body.innerHTML = `
        <div class="react-home">
            <header class="header">
                <div class="brand-lockup">
                    <div class="brand-mark">MS</div>
                    <div>
                        <div class="header-title">${escapeHTML(platformName)}</div>
                        <div class="header-kicker">Live transport schedules</div>
                    </div>
                </div>
                <div class="header-clock">
                    <div class="clock-time">${escapeHTML(time)}</div>
                    <div class="clock-date">${escapeHTML(date)}</div>
                </div>
            </header>
            <main class="container">
                <section class="overview-panel">
                    <div>
                        <div class="eyebrow">Passenger Information System</div>
                        <h1 class="content-title">Select your operator.</h1>
                        <p class="content-subtitle">Open a live route dashboard with current departures, advisories, and service information.</p>
                    </div>
                    <div class="status-stack">
                        <div class="status-card"><span class="status-dot"></span><div><div class="status-label">System status</div><div class="status-value">${options.maintenance ? "Maintenance" : "Online"}</div></div></div>
                        <div class="status-card"><span class="status-dot"></span><div><div class="status-label">Data feed</div><div class="status-value">${options.error ? "Check connection" : "Auto synced"}</div></div></div>
                    </div>
                </section>
                <section class="service-panel">
                    <div class="service-panel-head">
                        <div class="service-title">Available Services</div>
                        <div class="service-count">${escapeHTML(serviceCount)}</div>
                    </div>
                    <div class="grid">
                        ${options.maintenance ? `<div class="empty-state"><div class="empty-title">Maintenance in progress</div><div class="empty-text">${escapeHTML(options.maintenance)}</div>${supportEmail ? `<a class="support-link" href="mailto:${escapeHTML(supportEmail)}">${escapeHTML(supportEmail)}</a>` : ""}</div>` : ""}
                        ${options.error ? `<div class="empty-state"><div class="empty-title">Services unavailable</div><div class="empty-text">${escapeHTML(options.error)}</div>${supportEmail ? `<a class="support-link" href="mailto:${escapeHTML(supportEmail)}">${escapeHTML(supportEmail)}</a>` : ""}</div>` : ""}
                        ${!options.maintenance && !options.error && operators.length === 0 ? `<div class="empty-state"><div class="empty-title">No services listed</div><div class="empty-text">Please check the operator settings sheet.</div></div>` : ""}
                        ${!options.maintenance && !options.error ? operators.map(op => `
                            <a href="/${encodeURIComponent(op.code)}" class="operator-card">
                                <div class="meta">
                                    <div class="name">${escapeHTML(op.name)}</div>
                                    <div class="desc">${escapeHTML(op.desc)}</div>
                                </div>
                            </a>
                        `).join("") : ""}
                    </div>
                </section>
            </main>
            <footer><a href="https://broadimagi.com" target="_blank" rel="noopener noreferrer" class="footer-link">${escapeHTML(platformName)} Powered by Broadimagi${platformVersion ? ` <span class="platform-version">${escapeHTML(platformVersion)}</span>` : ""}</a></footer>
        </div>
    `;
}

async function initApplication(operatorCode) {
    await loadDashboardData(operatorCode, true, "all");
    const refreshSeconds = isMaintenanceMode ? getMaintenanceRefreshSeconds(appData.globalSettings) : (getNumberSetting(appData.company.refreshSeconds) || 60);
    const refreshMs = refreshSeconds * 1000;

    clearInterval(masterRefreshInterval);
    masterRefreshInterval = setInterval(() => loadDashboardData(operatorCode, false, "all"), refreshMs);

    clearInterval(headerRefreshInterval);
    headerRefreshInterval = null;
}

async function loadDashboardData(operatorCode, isFirstLoad, refreshScope = "all") {
    try {
        const response = await fetch(`${API_URL}?operator=${operatorCode}&t=${Date.now()}`);
        const data = await response.json();
        
        if (data.maintenance) {
            appData = { ...appData, globalSettings: data.globalSettings || {} };
            isMaintenanceMode = true;
            const platformName = getPlatformName(appData.globalSettings);
            const supportEmail = getSupportEmail(appData.globalSettings);
            const maintenanceRefreshSeconds = getMaintenanceRefreshSeconds(appData.globalSettings);
            document.body.innerHTML = `
                <div style="height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#07090e; color:#fff; font-family:sans-serif; text-align:center; padding:20px;">
                    <h1 style="font-size:40px; margin-bottom:10px; color:var(--fids-amber);">${escapeHTML(platformName)}</h1>
                    <p style="color:#9ca3af; font-size:16px;">${escapeHTML(data.message || getSettingValue(appData.globalSettings, "MaintenanceMessage", "System maintenance is in progress."))}</p>
                    ${supportEmail ? `<a href="mailto:${escapeHTML(supportEmail)}" style="color:#7dd3fc; font-size:13px; font-weight:800; text-decoration:none;">${escapeHTML(supportEmail)}</a>` : ""}
                    <p style="color:#6b7280; font-size:13px; margin-top:14px;">Checking again in ${maintenanceRefreshSeconds}s</p>
                </div>
            `;
            setTimeout(() => { window.location.reload(); }, maintenanceRefreshSeconds * 1000);
            return;
        }

        if (!data.success) {
            appData = { ...appData, globalSettings: data.globalSettings || appData.globalSettings || {} };
            isMaintenanceMode = false;
            if (data.code === "NO_OPERATOR" || data.code === "OPERATOR_NOT_FOUND") {
                showStartupError("Operator not found. Returning to the homepage in 8 seconds.");
                setTimeout(() => { window.location.href = "/"; }, 8000);
            } else if (isFirstLoad) {
                showStartupError(data.error || "Unable to load schedule data.");
            }
            return;
        }
        appData = data;
        isMaintenanceMode = false;
        lastSyncedAt = new Date();
        if (isFirstLoad) {
            const companyName = appData.company.companyName || "mySked";
            setPageMetadata({
                title: `${companyName} Live Schedule | mySked`,
                description: `Live route schedules, advisories, and passenger information for ${companyName}.`,
                canonical: `${SITE_URL}/${encodeURIComponent(operatorCode)}`
            });
        }

        const shouldRefreshHeader = isFirstLoad || refreshScope === "all" || refreshScope === "header";
        const shouldRefreshCards = isFirstLoad || refreshScope === "all" || refreshScope === "cards";

        if (shouldRefreshHeader) {
            applyBrandingColorsThemeMatrix(isFirstLoad);
            renderCompanyMetaProfileBox();
            renderGlobalMarqueeTicker();
            renderUnifiedVariableFooter();
        }

        if (shouldRefreshCards) {
            renderInteractiveSelectionChipsPanel();
            if (!document.getElementById("dashboardView").classList.contains("hidden")) {
                renderActiveDashboardRoute();
                startDashboardCycle();
            } else if (selectedRoute) {
                renderInteractiveScheduleView(selectedRoute);
            }
        }

        if (isFirstLoad) hideLoadingOverlay();
    } catch (err) {
        console.error("Remote Connection Exception: ", err);
        if (isFirstLoad) showStartupError("Unable to connect to the schedule server. Please try again later.");
    }
}

function showStartupError(message) {
    const loadingScreen = document.getElementById("loadingScreen");
    if (!loadingScreen) return;
    const platformName = getPlatformName(appData.globalSettings);
    const supportEmail = getSupportEmail(appData.globalSettings);
    loadingScreen.innerHTML = `
        <div class="startup-message-panel">
            <h1>${escapeHTML(platformName)}</h1>
            <p>${escapeHTML(message)}</p>
            ${supportEmail ? `<a href="mailto:${escapeHTML(supportEmail)}">${escapeHTML(supportEmail)}</a>` : ""}
        </div>
    `;
}

function applyBrandingColorsThemeMatrix(isFirstLoad) {
    if (isFirstLoad && !themeManuallySet) {
        document.documentElement.setAttribute("data-theme", appData.company.themeMode || "dark");
    }
    if (appData.company.primaryColor) {
        applyOperatorTheme(appData.company.primaryColor);
    }
}

function toggleTheme() {
    themeManuallySet = true;
    const tag = document.documentElement;
    tag.setAttribute("data-theme", tag.getAttribute("data-theme") === "light" ? "dark" : "light");
}

function switchViewMode(mode) {
    const dashBtn = document.getElementById("toggleDashboardBtn");
    const selBtn = document.getElementById("toggleSelectionBtn");
    const dashView = document.getElementById("dashboardView");
    const selView = document.getElementById("selectionView");

    if (mode === "dashboard") {
        document.body.classList.remove("selection-mode");
        dashBtn.classList.add("active"); selBtn.classList.remove("active");
        dashView.classList.remove("hidden"); selView.classList.add("hidden");
        renderActiveDashboardRoute(); startDashboardCycle();
    } else {
        document.body.classList.add("selection-mode");
        dashBtn.classList.remove("active"); selBtn.classList.add("active");
        dashView.classList.add("hidden"); selView.classList.remove("hidden");
        clearInterval(dashboardCycleInterval); 
        
        if (!selectedRoute && appData.routes.length > 0) {
            const firstActive = appData.routes.find(r => String(getSafeValue(r, "status")).toLowerCase() === "active");
            if (firstActive) {
                selectedRoute = getSafeValue(firstActive, "routeid") || getSafeValue(firstActive, "routecode");
                setTimeout(() => renderInteractiveSelectionChipsPanel(), 50);
            }
        }
    }
}

function startDashboardCycle() {
    clearInterval(dashboardCycleInterval);
    const cycleMs = (getNumberSetting(appData.company.cycleSeconds) || 15) * 1000; 
    dashboardCycleInterval = setInterval(() => {
        const activeRoutes = appData.routes.filter(r => String(getSafeValue(r, "status")).toLowerCase() === "active");
        if (activeRoutes.length > 0) {
            currentDashboardRouteIndex = (currentDashboardRouteIndex + 1) % activeRoutes.length;
            renderActiveDashboardRoute();
        }
    }, cycleMs); 
}

function formatTimeToHHMM(timeValue) {
    if (!timeValue) return "--:--";
    const timeStr = String(timeValue).trim();
    if (timeStr.includes("T")) {
        try {
            const date = new Date(timeStr);
            if (!isNaN(date.getTime())) {
                return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
            }
        } catch (e) {}
    }
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const ampmMatch = timeStr.match(/(AM|PM)$/i);
        if (ampmMatch) {
            const ampm = ampmMatch[1].toUpperCase();
            if (ampm === "PM" && hours < 12) hours += 12;
            if (ampm === "AM" && hours === 12) hours = 0;
        }
        const date = new Date();
        date.setHours(hours, minutes, 0);
        return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
    }
    return timeStr;
}

function normalizeColumnKey(value) {
    return String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeColumnList(value) {
    if (Array.isArray(value)) return value.map(item => String(item || "").trim()).filter(Boolean);
    if (typeof value === "string") return value.split(",").map(item => item.trim()).filter(Boolean);
    return [];
}

function getNumberSetting(...values) {
    const matched = values.find(value => {
        const number = Number(value);
        return Number.isFinite(number) && number > 0;
    });
    return matched === undefined ? null : Number(matched);
}

function resolveDisplayColumn(column, availableColumns) {
    const cleanColumn = normalizeColumnKey(column);
    const exactMatch = availableColumns.find(key => normalizeColumnKey(key) === cleanColumn);
    if (exactMatch) return exactMatch;
    if (cleanColumn === "status") {
        return availableColumns.find(key => normalizeColumnKey(key).endsWith("status")) || column;
    }
    return column;
}

function getConfiguredLabel(label) {
    const settings = appData.company.labelSettings || appData.company.labels || {};
    if (Array.isArray(settings)) {
        const match = settings.find(item => normalizeColumnKey(item.key) === normalizeColumnKey(label));
        return match && match.label ? match.label : "";
    }
    if (settings && typeof settings === "object") {
        const matchedKey = Object.keys(settings).find(key => normalizeColumnKey(key) === normalizeColumnKey(label));
        return matchedKey ? settings[matchedKey] : "";
    }
    return "";
}

function formatColumnLabel(label) {
    const configuredLabel = getConfiguredLabel(label);
    if (configuredLabel) return configuredLabel;
    return String(label || "")
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, char => char.toUpperCase());
}

function getScheduleColumns(rows) {
    const systemColumns = ["routeid", "routecode"];
    const preferredOrder = ["departureTime", "scheduleStatus", "routeStatus", "Status", "remarks"];
    const displayColumns = normalizeColumnList(appData.company.displayColumns);
    const hasDisplayColumns = displayColumns.length > 0;
    const seen = [];

    rows.forEach(row => {
        Object.keys(row).forEach(key => {
            const cleanKey = normalizeColumnKey(key);
            if (!cleanKey || systemColumns.includes(cleanKey)) return;
            if (!seen.some(existing => normalizeColumnKey(existing) === cleanKey)) seen.push(key);
        });
    });

    if (hasDisplayColumns) {
        return displayColumns
            .filter(column => !systemColumns.includes(normalizeColumnKey(column)))
            .map(column => resolveDisplayColumn(column, seen));
    }

    const nonEmptyColumns = seen.filter(key => rows.some(row => String(getSafeValue(row, key, "")).trim() !== ""));
    const availableColumns = nonEmptyColumns.length > 0 ? nonEmptyColumns : seen;
    const orderedColumns = [];

    preferredOrder.forEach(preferred => {
        const match = availableColumns.find(key => normalizeColumnKey(key) === normalizeColumnKey(preferred));
        if (match && !orderedColumns.includes(match)) orderedColumns.push(match);
    });

    availableColumns.forEach(key => {
        if (!orderedColumns.some(existing => normalizeColumnKey(existing) === normalizeColumnKey(key))) orderedColumns.push(key);
    });

    return orderedColumns.length > 0 ? orderedColumns : preferredOrder;
}

function getScheduleGridTemplate(headersList) {
    return `repeat(${Math.max(1, headersList.length)}, minmax(0, 1fr))`;
}

function getColumnDisplayValue(header, row) {
    const clean = normalizeColumnKey(header);
    const value = getSafeValue(row, header, "");
    if (clean.includes("time")) return formatTimeToHHMM(value) || "";
    return String(value ?? "").trim();
}

function getScheduleContentMetrics(headersList = [], rows = []) {
    const lengths = headersList.flatMap(header => {
        const labelLength = formatColumnLabel(header).length;
        const valueLengths = rows.map(row => getColumnDisplayValue(header, row).length);
        return [labelLength, ...valueLengths];
    });
    return {
        longest: Math.max(1, ...lengths),
        columnCount: Math.max(1, headersList.length)
    };
}

function getScheduleLayoutStyle(headersList = [], rows = [], mainDashboard = false) {
    const metrics = getScheduleContentMetrics(headersList, rows);
    const crowdedColumns = Math.max(0, metrics.columnCount - 4);
    const crowdedContent = Math.max(0, metrics.longest - 12);
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    const minFont = metrics.columnCount >= 7 || metrics.longest >= 22 ? 9 : metrics.columnCount >= 5 || metrics.longest >= 16 ? 10 : 12;
    const maxFont = metrics.columnCount >= 7 || metrics.longest >= 22 ? 12 : metrics.columnCount >= 5 || metrics.longest >= 16 ? 14 : 18;
    const viewportUnit = isMobile
        ? Math.max(2.2, Math.min(3.8, 4.2 - crowdedColumns * 0.32 - crowdedContent * 0.06))
        : Math.max(0.62, Math.min(1.05, 1.12 - crowdedColumns * 0.07 - crowdedContent * 0.012));
    const fontSize = `clamp(${minFont}px, ${viewportUnit.toFixed(2)}vw, ${maxFont}px)`;
    const rowMinHeight = isMobile ? (mainDashboard ? "clamp(46px, 8.5vw, 58px)" : "clamp(38px, 7vw, 50px)") : (metrics.columnCount <= 4 ? "42px" : "38px");
    const paddingX = metrics.columnCount <= 4 ? "24px" : "16px";
    const paddingY = metrics.columnCount <= 4 ? "8px" : "7px";
    const gap = metrics.columnCount <= 4 ? "12px" : "8px";
    return `--schedule-cell-font-size:${fontSize};--schedule-heading-font-size:${fontSize};--schedule-row-min-height:${rowMinHeight};--schedule-row-padding-y:${paddingY};--schedule-row-padding-x:${paddingX};--schedule-row-gap:${gap};`;
}

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"\']/g, char => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "\'": "&#039;"
    }[char]));
}

function splitTrailingPunctuation(value = "") {
    const match = String(value).match(/^(.+?)([.,;:!?)]*)$/);
    return match ? { main: match[1], trailing: match[2] } : { main: value, trailing: "" };
}

function getFooterLinkData(token = "") {
    const markdownMatch = String(token).match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    const label = markdownMatch ? markdownMatch[1] : token;
    const rawTarget = markdownMatch ? markdownMatch[2] : token;
    const { main, trailing } = splitTrailingPunctuation(rawTarget);
    const cleanTarget = main.trim();
    const lowerTarget = cleanTarget.toLowerCase();
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanTarget);
    const phoneDigits = cleanTarget.replace(/[^\d]/g, "");
    const isPhone = phoneDigits.length >= 7 && /^\+?[\d\s().-]+$/.test(cleanTarget);

    if (lowerTarget.startsWith("http://") || lowerTarget.startsWith("https://")) {
        return { label, href: cleanTarget, trailing, external: true };
    }
    if (lowerTarget.startsWith("www.")) {
        return { label, href: `https://${cleanTarget}`, trailing, external: true };
    }
    if (lowerTarget.startsWith("mailto:") || lowerTarget.startsWith("tel:")) {
        return { label, href: cleanTarget, trailing, external: false };
    }
    if (isEmail) {
        return { label, href: `mailto:${cleanTarget}`, trailing, external: false };
    }
    if (isPhone) {
        const telValue = `${cleanTarget.trim().startsWith("+") ? "+" : ""}${phoneDigits}`;
        return { label, href: `tel:${telValue}`, trailing, external: false };
    }
    return null;
}

function renderFooterRichTextHTML(value = "") {
    const text = String(value || "mySked DB");
    const tokenPattern = /(\[[^\]]+\]\((?:https?:\/\/|mailto:|tel:|www\.)[^)\s]+\)|https?:\/\/[^\s<]+|www\.[^\s<]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{6,}\d)/gi;
    let html = "";
    let lastIndex = 0;

    text.replace(tokenPattern, (match, _token, index) => {
        html += escapeHTML(text.slice(lastIndex, index));
        const linkData = getFooterLinkData(match);
        if (linkData) {
            html += `<a class="footer-inline-link" href="${escapeHTML(linkData.href)}"${linkData.external ? ' target="_blank" rel="noopener noreferrer"' : ""}>${escapeHTML(linkData.label)}</a>${escapeHTML(linkData.trailing)}`;
        } else {
            html += escapeHTML(match);
        }
        lastIndex = index + match.length;
        return match;
    });

    html += escapeHTML(text.slice(lastIndex));
    return html;
}

function renderScheduleCell(header, value, compact = false) {
    const clean = normalizeColumnKey(header);

    if (clean.includes("time")) {
        return `<span class="time-col">${escapeHTML(formatTimeToHHMM(value))}</span>`;
    }

    if (clean.endsWith("status")) {
        return `<span><strong class="${statusColorMapper(value)}">${escapeHTML(String(value || "-").toUpperCase())}</strong></span>`;
    }

    return `<span class="text-col">${escapeHTML(value || "-")}</span>`;
}

function getDashboardRowsPerCard() {
    return 10;
}

function splitRowsForDashboard(rows) {
    const rowsPerCard = getDashboardRowsPerCard();
    const isMobileDashboard = window.matchMedia("(max-width: 768px)").matches;

    if (isMobileDashboard) {
        return rows.length > 0 ? [rows] : [];
    }

    const cardCount = Math.min(3, Math.max(1, Math.ceil(rows.length / rowsPerCard)));
    const groups = [];

    for (let i = 0; i < cardCount; i++) {
        groups.push(rows.slice(i * rowsPerCard, (i + 1) * rowsPerCard));
    }

    return groups.filter(group => group.length > 0);
}

function renderActiveDashboardRoute() {
    const viewContainer = document.getElementById("dashboardView");
    viewContainer.innerHTML = "";
    
    const activeRoutes = appData.routes.filter(r => String(getSafeValue(r, "status")).toLowerCase() === "active");
    if (activeRoutes.length === 0) {
        viewContainer.innerHTML = `<div class="fids-empty-msg">No Active Dispatched Routes Found.</div>`;
        return;
    }

    if (currentDashboardRouteIndex >= activeRoutes.length) currentDashboardRouteIndex = 0;
    const currentRoute = activeRoutes[currentDashboardRouteIndex];
    const currentRouteID = String(getSafeValue(currentRoute, "routeid") || getSafeValue(currentRoute, "routecode")).toLowerCase();
    const fare = getSafeValue(currentRoute, "fare");

    let boardHTML = `
        <div class="single-fids-header">
            <div class="fids-main-title-info">
                <span class="route-label-pill" style="background-color: var(--primary)">LIVE DASHBOARD</span>
                <div class="fids-route-title-stack">
                    <h2>${escapeHTML(getSafeValue(currentRoute, "route"))}</h2>
                    ${fare ? `<div class="fids-fare-tag fids-fare-tag-mobile">Fare ${escapeHTML(fare)}</div>` : ""}
                </div>
            </div>
            <div class="fids-header-meta">
                ${fare ? `<div class="fids-fare-tag fids-fare-tag-desktop">Fare ${escapeHTML(fare)}</div>` : ""}
                <div class="fids-cycle-indicator-tag">Cycling every ${appData.company.cycleSeconds}s</div>
            </div>
        </div>
    `;

    const scheduleType = String(getSafeValue(currentRoute, "scheduletype")).toLowerCase();
    const customText = getSafeValue(currentRoute, "schedulecustomtext");
    const isTextMode = scheduleType === "text" || customText !== "";

    if (isTextMode) {
        boardHTML += `
            <div class="fids-text-schedule-panel">
                <div class="fids-text-schedule-message">
                    ${customText || "Interval Operations Active."}
                </div>
            </div>
        `;
    } else {
        const targetSchedules = appData.schedules.filter(s => {
            const rowId = String(getSafeValue(s, "routeid")).toLowerCase();
            return rowId === currentRouteID && currentRouteID !== '';
        });

        const headersList = getScheduleColumns(targetSchedules);
        let gridStyle = `grid-template-columns: ${getScheduleGridTemplate(headersList, true)};`;
        const layoutStyle = getScheduleLayoutStyle(headersList, targetSchedules, true);

        if (targetSchedules.length === 0) {
            boardHTML += `<div class="fids-empty-msg">No departures scheduled for this sector.</div>`;
        } else {
            const rowGroups = splitRowsForDashboard(targetSchedules);
            const cardCount = rowGroups.length;

            boardHTML += `<div class="dashboard-cards-grid" style="--dashboard-card-count:${cardCount};${layoutStyle}">`;

            const renderColumnBlock = (rowsSubset) => {
                const blankRows = Math.max(0, getDashboardRowsPerCard() - rowsSubset.length);
                let subHTML = `
                    <div class="column-block dashboard-card-block">
                        <div class="single-fids-table-headings" style="${gridStyle}">
                            ${headersList.map(h => `<span>${escapeHTML(formatColumnLabel(h))}</span>`).join('')}
                        </div>
                        <div class="fids-adaptive-flow-container">
                `;
                rowsSubset.forEach(row => {
                    subHTML += `
                        <div class="single-fids-row" style="${gridStyle}">
                            ${headersList.map(h => renderScheduleCell(h, getSafeValue(row, h, "-"), true)).join('')}
                        </div>
                    `;
                });
                for (let i = 0; i < blankRows; i++) {
                    subHTML += `
                        <div class="single-fids-row single-fids-row-empty" style="${gridStyle}" aria-hidden="true">
                            ${headersList.map(() => `<span>&nbsp;</span>`).join('')}
                        </div>
                    `;
                }
                subHTML += `</div></div>`;
                return subHTML;
            };

            rowGroups.forEach(group => {
                boardHTML += renderColumnBlock(group);
            });

            boardHTML += `</div>`;
        }
    }

    const monitorCard = document.createElement("section");
    monitorCard.className = "single-fids-board";
    monitorCard.innerHTML = boardHTML;
    viewContainer.appendChild(monitorCard);
}

function getChronologicalNextDeparture(targetSchedules) {
    const invalidStatuses = ["cancelled", "unavailable", "suspended"];
    const validSchedules = targetSchedules.filter(s => {
        const statusVal = String(getSafeValue(s, "route_status") || getSafeValue(s, "status")).trim().toLowerCase();
        return !invalidStatuses.includes(statusVal);
    });

    if (validSchedules.length === 0) return null;

    const parseTimeToMinutes = (timeValue) => {
        if (!timeValue) return null;
        const normalizedTime = formatTimeToHHMM(timeValue);
        const match = String(normalizedTime).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
        if (!match) return null;

        let hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const meridiem = match[3] ? match[3].toUpperCase() : "";

        if (meridiem === "PM" && hours < 12) hours += 12;
        if (meridiem === "AM" && hours === 12) hours = 0;

        return hours * 60 + minutes;
    };

    const now = new Date();
    const currentMinutes = now.getHours() * 60 + now.getMinutes();

    let bestMatch = null;
    let minDifference = Infinity;
    let earliestMatch = null;
    let earliestMinutes = Infinity;

    validSchedules.forEach(s => {
        const schedTimeStr = getSafeValue(s, "departuretime") || getSafeValue(s, "time");
        const schedMinutes = parseTimeToMinutes(schedTimeStr);
        if (schedMinutes === null) return;

        if (schedMinutes < earliestMinutes) {
            earliestMinutes = schedMinutes;
            earliestMatch = s;
        }

        if (schedMinutes >= currentMinutes) {
            const diff = schedMinutes - currentMinutes;
            if (diff < minDifference) {
                minDifference = diff;
                bestMatch = s;
            }
        }
    });

    return bestMatch || earliestMatch; 
}

function renderInteractiveSelectionChipsPanel() {
    const container = document.getElementById("routeContainer");
    container.innerHTML = "";
    const activeList = appData.routes.filter(r => String(getSafeValue(r, "status")).toLowerCase() === "active");
    
    activeList.forEach(route => {
        const chip = document.createElement("button");
        chip.className = "route-chip";
        chip.innerHTML = escapeHTML(getSafeValue(route, "route"));
        
        const matchedId = getSafeValue(route, "routeid") || getSafeValue(route, "routecode");
        if (String(selectedRoute).toLowerCase() === String(matchedId).toLowerCase()) {
            chip.classList.add("active");
        }
        
        chip.onclick = () => {
            document.querySelectorAll(".route-chip, .inactive-route-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active"); 
            selectedRoute = matchedId;
            renderInteractiveScheduleView(matchedId);
        };
        container.appendChild(chip);
    });
    
    if (selectedRoute) {
        renderInteractiveScheduleView(selectedRoute);
    }
    renderInactiveRoutesTrack();
}

function renderInteractiveScheduleView(routeID) {
    const route = appData.routes.find(r => String(getSafeValue(r, "routeid") || getSafeValue(r, "routecode")).toLowerCase() === String(routeID).toLowerCase());
    if (!route) return;

    const routeStatus = String(getSafeValue(route, "status") || "inactive").trim();
    const isRouteActive = routeStatus.toLowerCase() === "active";
    const workspaceBoard = document.querySelector(".schedule-workspace-board");
    if (workspaceBoard) {
        workspaceBoard.classList.toggle("route-inactive", !isRouteActive);
        workspaceBoard.setAttribute("data-route-status", isRouteActive ? "" : routeStatus.toUpperCase());
    }

    document.getElementById("selectedRoute").innerHTML = escapeHTML(getSafeValue(route, "route"));

    const container = document.getElementById("scheduleContainer");
    container.innerHTML = "";
    if (!isRouteActive) {
        container.innerHTML = '<div class="inactive-route-notice">' + escapeHTML(routeStatus || "Not Active") + ' route. Schedule shown for reference.</div>';
    }

    const scheduleType = String(getSafeValue(route, "scheduletype")).toLowerCase();
    const customText = getSafeValue(route, "schedulecustomtext");
    const isTextMode = scheduleType === "text" || customText !== "";

    if (isTextMode) {
        document.getElementById("nextDepartureTime").innerHTML = isRouteActive ? "INTERVAL" : "NOT ACTIVE";
        document.getElementById("nextDepartureStatus").innerHTML = isRouteActive ? "OPERATING" : routeStatus.toUpperCase();
        document.getElementById("nextDepartureStatus").className = isRouteActive ? "on-time" : "cancelled";

        container.innerHTML += '<div style="padding:40px; text-align:center; display:flex; justify-content:center; align-items:center; height:100%;">' +
            '<div style="font-size:16px; font-weight:800; color:var(--time-color); background:var(--surface-accent); padding:25px 35px; border-radius:10px; border:1px solid var(--border); width:100%; max-width:550px; line-height:1.6;">' +
            escapeHTML(customText || "Interval Operations Active For This Path Line.") +
            '</div></div>';
        return;
    }

    const targetSchedules = appData.schedules.filter(s => {
        const rowId = String(getSafeValue(s, "routeid")).toLowerCase();
        return rowId === String(routeID).toLowerCase();
    });

    if (targetSchedules.length === 0) {
        container.innerHTML += "<p class='empty-text' style='padding:40px; text-align:center; color:var(--muted); font-weight:600;'>No timetables matched.</p>";
        document.getElementById("nextDepartureTime").innerHTML = isRouteActive ? "--:--" : "NOT ACTIVE";
        document.getElementById("nextDepartureStatus").innerHTML = isRouteActive ? "-" : routeStatus.toUpperCase();
        document.getElementById("nextDepartureStatus").className = isRouteActive ? "" : "cancelled";
        return;
    }

    const headersList = getScheduleColumns(targetSchedules);
    const colWidths = getScheduleGridTemplate(headersList);
    const layoutStyle = getScheduleLayoutStyle(headersList, targetSchedules, false);
    let gridLayoutPattern = "display:grid; grid-template-columns: " + colWidths + "; gap:var(--schedule-row-gap, 15px); align-items:center; width:100%;";
    if (workspaceBoard) workspaceBoard.setAttribute("style", layoutStyle);

    const timetableHeaderBlock = document.querySelector(".timeline-title");
    if (timetableHeaderBlock) {
        timetableHeaderBlock.style = "display:grid; grid-template-columns: " + colWidths + "; gap:var(--schedule-row-gap, 15px); padding:12px var(--schedule-row-padding-x, 24px); border-bottom:1px solid var(--border); background:var(--background); font-size:var(--schedule-heading-font-size, 11px); font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:0.3px;";
        timetableHeaderBlock.innerHTML = headersList.map(h => "<span>" + escapeHTML(formatColumnLabel(h)) + "</span>").join("");
    }

    const nextDepartureRow = isRouteActive ? getChronologicalNextDeparture(targetSchedules) : null;
    if (!isRouteActive) {
        document.getElementById("nextDepartureTime").innerHTML = "NOT ACTIVE";
        document.getElementById("nextDepartureStatus").innerHTML = routeStatus.toUpperCase();
        document.getElementById("nextDepartureStatus").className = "cancelled";
    } else if (nextDepartureRow) {
        const depTimeVal = getSafeValue(nextDepartureRow, "departuretime") || getSafeValue(nextDepartureRow, "time");
        const statusVal = getSafeValue(nextDepartureRow, "route_status") || getSafeValue(nextDepartureRow, "status");
        document.getElementById("nextDepartureTime").innerHTML = formatTimeToHHMM(depTimeVal) || "--:--";
        document.getElementById("nextDepartureStatus").innerHTML = String(statusVal || "-").toUpperCase();
        document.getElementById("nextDepartureStatus").className = statusColorMapper(statusVal);
    } else {
        document.getElementById("nextDepartureTime").innerHTML = "SUSPENDED";
        document.getElementById("nextDepartureStatus").innerHTML = "NO RUNS";
        document.getElementById("nextDepartureStatus").className = "cancelled";
    }

    targetSchedules.forEach(row => {
        let rowItemsHTML = "";
        headersList.forEach(h => {
            const val = getSafeValue(row, h, "-");
            rowItemsHTML += "<div>" + renderScheduleCell(h, val) + "</div>";
        });

        const rowItemElement = document.createElement("div");
        rowItemElement.className = "schedule-row";
        rowItemElement.style = gridLayoutPattern;
        rowItemElement.innerHTML = rowItemsHTML;
        container.appendChild(rowItemElement);
    });
}

function renderUnifiedVariableFooter() {
    const footerContainer = document.querySelector(".footer-bar-container");
    if (!footerContainer) return;
    const syncDate = lastSyncedAt || new Date();
    const lastUpdatedStr = syncDate.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) + " " +
                           syncDate.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });

    const rawFooterText = appData.company.footerText || "mySked DB";
    const platformName = getPlatformName(appData.globalSettings);
    const platformVersion = getPlatformVersion(appData.globalSettings);

    const footerHTML = `
        <div class="footer-bar-inner">
            <div class="footer-sync">Last Synced: <span>${escapeHTML(lastUpdatedStr)}</span></div>
            <div class="footer-operator-text">${renderFooterRichTextHTML(rawFooterText)}</div>
            <div class="footer-platform">
                <a href="https://broadimagi.com" target="_blank" rel="noopener noreferrer">
                    ${escapeHTML(platformName)} Powered by Broadimagi${platformVersion ? ` <span class="platform-version">${escapeHTML(platformVersion)}</span>` : ""}
                </a>
            </div>
        </div>
    `;
    footerContainer.innerHTML = footerHTML;
}

function statusColorMapper(statusValue) {
    if (!statusValue) return "";
    const cleanVal = String(statusValue).trim().toLowerCase();
    const colors = appData.company.colors || {};

    if (colors.green && colors.green.includes(cleanVal)) return "on-time";
    if (colors.orange && colors.orange.includes(cleanVal)) return "delayed";
    if (colors.red && colors.red.includes(cleanVal)) return "cancelled";
    
    if (["on time", "available", "boarding", "active"].includes(cleanVal)) return "on-time";
    if (["delayed", "full"].includes(cleanVal)) return "delayed";
    if (["cancelled", "unavailable", "suspended"].includes(cleanVal)) return "cancelled";
    return "departed";
}

function showExtendedModalDetails(rowDataJsonStr) {
    const rowData = JSON.parse(rowDataJsonStr.replace(/&quot;/g, '"'));
    document.getElementById("modalOverlay").classList.remove("hidden");
    let containerHTML = `<div style="display:flex; flex-direction:column; gap:12px;">`;
    Object.keys(rowData).forEach(key => {
        if (["routeid", "routecode"].includes(key.toLowerCase())) return; 
        containerHTML += `<p><strong style="color:var(--primary); font-weight:700; text-transform:uppercase; font-size:11px; display:block;">${key}</strong> ${rowData[key] || "-"}</p>`;
    });
    document.getElementById("modalContent").innerHTML = containerHTML + `</div>`;
}

function getCompanyInitials(name) {
    const words = String(name || "mySked").trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(word => word[0]).join("").toUpperCase() || "MS";
}

function normalizeLogoURL(url) {
    const rawURL = String(url || "").trim();
    if (!rawURL) return "";

    const driveIdMatch = rawURL.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]{20,})/);
    if (rawURL.includes("drive.google.com") && driveIdMatch) {
        return "https://drive.google.com/thumbnail?id=" + driveIdMatch[1] + "&sz=w200";
    }

    return rawURL;
}

function showLogoFallback() {
    const logoImg = document.getElementById("companyLogo");
    const fallback = document.getElementById("companyLogoFallback");
    if (logoImg) logoImg.classList.add("hidden");
    if (fallback) {
        fallback.textContent = getCompanyInitials(appData.company.companyName || "mySked");
        fallback.classList.remove("hidden");
    }
}

function renderCompanyMetaProfileBox() {
    document.getElementById("companyName").innerHTML = appData.company.companyName || "mySked";
    document.getElementById("companyTagline").innerHTML = appData.company.tagline || "Passenger Information System";

    const logoImg = document.getElementById("companyLogo");
    const fallback = document.getElementById("companyLogoFallback");
    const logoURL = normalizeLogoURL(appData.company.logoURL);

    if (fallback) {
        fallback.textContent = getCompanyInitials(appData.company.companyName || "mySked");
    }

    if (!logoImg) return;

    logoImg.onload = () => {
        if (logoImg.naturalWidth > 0) {
            logoImg.classList.remove("hidden");
            if (fallback) fallback.classList.add("hidden");
        } else {
            showLogoFallback();
        }
    };
    logoImg.onerror = showLogoFallback;

    if (logoURL) {
        logoImg.src = logoURL;
        if (fallback) fallback.classList.add("hidden");
    } else {
        showLogoFallback();
    }
}

function renderGlobalMarqueeTicker() {
    const tickerBar = document.getElementById("announcementBar");
    const hiddenRules = appData.company.hiddenColumns || [];

    if (hiddenRules.includes("advisories") || hiddenRules.includes("marquee") || hiddenRules.includes("announcement")) {
        if (tickerBar) tickerBar.style.display = "none";
        return;
    } else {
        if (tickerBar) tickerBar.style.display = "flex";
    }

    const activeAdvisories = appData.advisories && appData.advisories.length > 0 
        ? appData.advisories.filter(a => {
            const statusKey = Object.keys(a).find(k => k.toLowerCase() === "status") || "Status";
            return String(a[statusKey] || '').toLowerCase() === "active";
          })
        : [];
    
    let advisoryItems = [];
    if (activeAdvisories.length > 0) {
        advisoryItems = activeAdvisories.map(a => {
            const messageKey = Object.keys(a).find(k => ["message", "text", "advisory"].includes(k.toLowerCase())) || "Message";
            return a[messageKey] ? escapeHTML(a[messageKey]) : "";
        }).filter(Boolean);
    }

    if (advisoryItems.length === 0) {
        advisoryItems = ["Welcome to mySked Control Display Network Panel."];
    }

    const tickerHTML = advisoryItems
        .map(item => `<span class="ticker-item">${item}</span>`)
        .join('<span class="ticker-gap" aria-hidden="true"></span>');
    document.getElementById("ticker").innerHTML = tickerHTML;
}

function renderInactiveRoutesTrack() {
    const container = document.getElementById("inactiveRoutes");
    if (!container) return;
    container.innerHTML = "";
    const filtered = appData.routes.filter(r => String(getSafeValue(r, "status")).toLowerCase() !== "active");
    if (filtered.length === 0) {
        container.innerHTML = '<div class="inactive-route-chip inactive-route-chip-static">All services operational</div>';
        return;
    }

    filtered.forEach(route => {
        const matchedId = getSafeValue(route, "routeid") || getSafeValue(route, "routecode");
        const routeName = getSafeValue(route, "route") || getSafeValue(route, "name");
        const statusText = getSafeValue(route, "status") || "Inactive";
        const chip = document.createElement("button");
        chip.className = "inactive-route-chip";
        if (String(selectedRoute).toLowerCase() === String(matchedId).toLowerCase()) {
            chip.classList.add("active");
        }
        chip.innerHTML = '<span>' + escapeHTML(routeName) + '</span><strong>' + escapeHTML(statusText) + '</strong>';
        chip.onclick = () => {
            document.querySelectorAll(".route-chip, .inactive-route-chip").forEach(c => c.classList.remove("active"));
            chip.classList.add("active");
            selectedRoute = matchedId;
            renderInteractiveScheduleView(matchedId);
        };
        container.appendChild(chip);
    });
}

function updateClock() {
    const now = new Date();
    document.getElementById("currentTime").innerHTML = now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
    document.getElementById("currentDate").innerHTML = now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function hideLoadingOverlay() {
    document.getElementById("loadingScreen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
}

document.getElementById("closeModal").onclick = () => document.getElementById("modalOverlay").classList.add("hidden");
