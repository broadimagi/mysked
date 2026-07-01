import React, { useEffect, useState } from 'react';

const API_URL = "https://script.google.com/macros/s/AKfycby778WwSXHTuZcVC2iT4U3wkrn5pYOpXOuCVZQQ3Oo47cuLqbhyFpEm_6RRrgdcF9s/exec";
const emptyData = { globalSettings: {}, company: {}, routes: [], schedules: [], advisories: [] };

function getSafeValue(obj, targetKey, fallback = "") {
    if (!obj) return fallback;
    const targets = getColumnAliases(targetKey).map(normalizeColumnKey);
    const matchedKey = Object.keys(obj).find(k => targets.includes(normalizeColumnKey(k)));
    return matchedKey && obj[matchedKey] !== undefined ? obj[matchedKey] : fallback;
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

function setPageMetadata({ title, description, canonical }) {
    if (title) document.title = title;
    if (description) {
        let metaDescription = document.querySelector('meta[name="description"]');
        if (!metaDescription) {
            metaDescription = document.createElement("meta");
            metaDescription.setAttribute("name", "description");
            document.head.appendChild(metaDescription);
        }
        metaDescription.setAttribute("content", description);
    }
    if (canonical) {
        let canonicalLink = document.querySelector('link[rel="canonical"]');
        if (!canonicalLink) {
            canonicalLink = document.createElement("link");
            canonicalLink.setAttribute("rel", "canonical");
            document.head.appendChild(canonicalLink);
        }
        canonicalLink.setAttribute("href", canonical);
    }
}

function normalizeColumnKey(value) {
    return String(value || "").toLowerCase().replace(/[\s_-]+/g, "");
}

function normalizeRouteId(value) {
    return String(value || "").trim().toLowerCase();
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

function getConfiguredLabel(label, company = {}) {
    const settings = company.labelSettings || company.labels || {};
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

function formatColumnLabel(label, company = {}) {
    const configuredLabel = getConfiguredLabel(label, company);
    if (configuredLabel) return configuredLabel;
    return String(label || "")
        .replace(/[_-]+/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, char => char.toUpperCase());
}

function getScheduleColumns(rows, company) {
    const systemColumns = ["routeid", "routecode"];
    const preferredOrder = ["departureTime", "scheduleStatus", "routeStatus", "Status", "remarks"];
    const displayColumns = normalizeColumnList(company.displayColumns);
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

function getScheduleGridTemplate(headersList, compact = false) {
    return headersList.map(header => {
        const clean = normalizeColumnKey(header);
        if (compact) {
            if (clean.includes("time")) return "minmax(96px, 0.9fr)";
            if (clean.endsWith("status")) return "minmax(88px, 0.8fr)";
            if (["remarks", "remark", "destination", "terminal", "notes", "note"].some(token => clean.includes(token))) return "minmax(120px, 1.2fr)";
            return "minmax(96px, 1fr)";
        }
        if (clean.includes("time")) return "minmax(130px, 0.8fr)";
        if (clean.endsWith("status")) return "minmax(110px, 0.7fr)";
        if (["remarks", "remark", "destination", "terminal", "notes", "note"].some(token => clean.includes(token))) return "minmax(180px, 1.4fr)";
        return "minmax(140px, 1fr)";
    }).join(" ");
}

function formatTimeToHHMM(timeValue) {
    if (!timeValue) return "--:--";
    const timeStr = String(timeValue).trim();
    if (timeStr.includes("T")) {
        const date = new Date(timeStr);
        if (!Number.isNaN(date.getTime())) {
            return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
        }
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

function statusColorMapper(statusValue, company = {}) {
    if (!statusValue) return "";
    const cleanVal = String(statusValue).trim().toLowerCase();
    const colors = company.colors || {};
    if (colors.green && colors.green.includes(cleanVal)) return "on-time";
    if (colors.orange && colors.orange.includes(cleanVal)) return "delayed";
    if (colors.red && colors.red.includes(cleanVal)) return "cancelled";
    if (["on time", "available", "boarding", "active"].includes(cleanVal)) return "on-time";
    if (["delayed", "full"].includes(cleanVal)) return "delayed";
    if (["cancelled", "unavailable", "suspended"].includes(cleanVal)) return "cancelled";
    return "departed";
}

function getChronologicalNextDeparture(targetSchedules) {
    const validSchedules = targetSchedules.filter(s => !["cancelled", "unavailable", "suspended"].includes(String(getSafeValue(s, "route_status") || getSafeValue(s, "status")).trim().toLowerCase()));
    if (validSchedules.length === 0) return null;

    const parseTimeToMinutes = (timeValue) => {
        if (!timeValue) return null;
        const match = String(formatTimeToHHMM(timeValue)).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
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
        const schedMinutes = parseTimeToMinutes(getSafeValue(s, "departuretime") || getSafeValue(s, "time"));
        if (schedMinutes === null) return;
        if (schedMinutes < earliestMinutes) {
            earliestMinutes = schedMinutes;
            earliestMatch = s;
        }
        if (schedMinutes >= currentMinutes && schedMinutes - currentMinutes < minDifference) {
            minDifference = schedMinutes - currentMinutes;
            bestMatch = s;
        }
    });
    return bestMatch || earliestMatch;
}

function getCompanyInitials(name) {
    return String(name || "mySked").trim().split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join("").toUpperCase() || "MS";
}

function normalizeLogoURL(url) {
    const rawURL = String(url || "").trim();
    if (!rawURL) return "";
    const driveIdMatch = rawURL.match(/(?:\/d\/|id=)([a-zA-Z0-9_-]{20,})/);
    if (rawURL.includes("drive.google.com") && driveIdMatch) return "https://drive.google.com/thumbnail?id=" + driveIdMatch[1] + "&sz=w200";
    return rawURL;
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

function useClock() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);
    return {
        time: now.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true }),
        date: now.toLocaleDateString("en-PH", { weekday: "long", year: "numeric", month: "long", day: "numeric" })
    };
}

function normalizeOperator(op) {
    return {
        code: op.code || op.operatorCode || op.operator || op.companyCode || "",
        name: op.name || op.companyName || op.company || "Unnamed Service",
        desc: op.tagline || op.description || op.footerText || "Passenger Information System"
    };
}

function HomePage() {
    const clock = useClock();
    const [operators, setOperators] = useState([]);
    const [loading, setLoading] = useState(true);
    const [maintenance, setMaintenance] = useState(null);
    const [globalSettings, setGlobalSettings] = useState({});
    const platformName = getPlatformName(globalSettings);
    const supportEmail = getSupportEmail(globalSettings);
    const platformVersion = getPlatformVersion(globalSettings);
    const maintenanceRefreshSeconds = getMaintenanceRefreshSeconds(globalSettings);

    useEffect(() => {
        document.body.className = "react-home-mode";
        document.documentElement.setAttribute("data-theme", "dark");
        setPageMetadata({
            title: "mySked Live Transport Schedules",
            description: "Select a mySked operator to view live route schedules, advisories, and passenger information dashboards.",
            canonical: "https://mysked.broadimagi.com/"
        });
    }, []);

    useEffect(() => {
        let alive = true;
        async function loadOperators() {
            try {
                const response = await fetch(`${API_URL}?mode=operators&t=${Date.now()}`);
                const data = await response.json();
                if (!alive) return;
                setGlobalSettings(data.globalSettings || {});
                if (data.maintenance) {
                    setMaintenance({
                        message: data.message || getSettingValue(data.globalSettings, "MaintenanceMessage", "We're performing scheduled maintenance."),
                        time: new Date().toLocaleTimeString("en-PH")
                    });
                    setLoading(false);
                    return;
                }
                if (data.success && Array.isArray(data.operators)) {
                    setOperators(data.operators.map(normalizeOperator).filter(op => op.code && op.name));
                    setLoading(false);
                    return;
                }
                throw new Error(data.error || "Failed to fetch operator data");
            } catch (err) {
                if (!alive) return;
                setOperators([{ code: "ubeexpress", name: "UBE Express", desc: "Airport Premium Bus Service" }]);
                setLoading(false);
            }
        }
        loadOperators();
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        if (!maintenance) return undefined;
        const timer = setTimeout(() => {
            window.location.reload();
        }, maintenanceRefreshSeconds * 1000);
        return () => clearTimeout(timer);
    }, [maintenance, maintenanceRefreshSeconds]);

    const serviceCount = loading ? "Loading services..." : operators.length === 0 ? "0 services" : `${operators.length} ${operators.length === 1 ? "service" : "services"} ready`;

    return (
        <div className="react-home">
            <div className="header">
                <div className="brand-lockup">
                    <div className="brand-mark">{getCompanyInitials(platformName)}</div>
                    <div>
                        <div className="header-title">{platformName} Portal</div>
                        <div className="header-kicker">Passenger information workspace</div>
                    </div>
                </div>
                <div className="header-clock">
                    <div className="clock-time">{clock.time}</div>
                    <div className="clock-date">{clock.date}</div>
                </div>
            </div>

            <main className="container">
                <section className="overview-panel">
                    <div>
                        <div className="eyebrow">Live display access</div>
                        <h1 className="content-title">Select an operations display</h1>
                        <p className="content-subtitle">Open the passenger information dashboard for the service you want to monitor.</p>
                    </div>
                    <div className="status-stack">
                        <div className="status-card"><span className="status-dot"></span><div><div className="status-label">System status</div><div className="status-value">Online</div></div></div>
                        <div className="status-card"><span className="status-dot"></span><div><div className="status-label">Data feed</div><div className="status-value">Auto synced</div></div></div>
                    </div>
                </section>

                <section className="service-panel">
                    <div className="service-panel-head">
                        <div className="service-title">Available services</div>
                        <div className="service-count">{serviceCount}</div>
                    </div>
                    {operators.length > 0 ? (
                        <div className="grid">
                            {operators.map(op => (
                                <a key={op.code} href={`/?operator=${encodeURIComponent(op.code)}`} className="operator-card">
                                    <div className="meta"><div className="name">{op.name}</div><div className="desc">{op.desc}</div></div>
                                </a>
                            ))}
                        </div>
                    ) : (
                        <div className="empty-state"><div className="empty-title">{loading ? "Loading Services" : "No Services Available"}</div><div className="empty-text">{loading ? "Connecting to the operations feed." : "Please check back later or contact support."}</div></div>
                    )}
                </section>
            </main>

            {maintenance && (
                <div className="maintenance-overlay">
                    <div className="maintenance-content">
                        <h1 className="maintenance-title">We'll be right back</h1>
                        <p className="maintenance-message">{maintenance.message}</p>
                        {supportEmail && <a className="support-link" href={`mailto:${supportEmail}`}>{supportEmail}</a>}
                        <div style={{ color: "#6b7280", fontSize: 13 }}>Checking again in {maintenanceRefreshSeconds}s <span className="loading"></span><span className="loading"></span><span className="loading"></span></div>
                        <div className="maintenance-time">{maintenance.time}</div>
                    </div>
                </div>
            )}

            <footer><a href="https://broadimagi.com" target="_blank" rel="noopener noreferrer" className="footer-link">{platformName} Powered by Broadimagi{platformVersion && <span className="platform-version"> {platformVersion}</span>}</a></footer>
        </div>
    );
}

function LoadingScreen({ error, platformName = "mySked", supportEmail = "", maintenanceRefreshSeconds = 0 }) {
    return (
        <div id="loadingScreen">
            {error ? <><h1>{platformName}</h1><p style={{ maxWidth: 420, textAlign: "center", lineHeight: 1.6, textTransform: "none", letterSpacing: 0, color: "#9ca3af" }}>{error}</p>{maintenanceRefreshSeconds > 0 && <p style={{ marginTop: 10 }}>Checking again in {maintenanceRefreshSeconds}s</p>}{supportEmail && <a className="support-link" href={`mailto:${supportEmail}`}>{supportEmail}</a>}</> : <><div className="loader"></div><h1>{platformName}</h1><p>Syncing Live Variable Workspace Pipelines...</p></>}
        </div>
    );
}

function MissingOperatorNotice() {
    useEffect(() => {
        const timer = setTimeout(() => {
            window.location.href = "/";
        }, 3000);
        return () => clearTimeout(timer);
    }, []);

    return <LoadingScreen error="No operator was selected. Returning to the homepage in 3 seconds." />;
}

function CompanyLogo({ company }) {
    const logoURL = normalizeLogoURL(company.logoURL);
    const [failed, setFailed] = useState(false);
    const showImage = logoURL && !failed;
    return (
        <>
            {showImage && <img id="companyLogo" src={logoURL} alt="Logo" onError={() => setFailed(true)} />}
            {!showImage && <div id="companyLogoFallback" className="logo-fallback">{getCompanyInitials(company.companyName || "mySked")}</div>}
        </>
    );
}

function Header({ company, viewMode, setViewMode, toggleTheme, clock }) {
    return (
        <header id="header">
            <div className="company">
                <CompanyLogo company={company} />
                <div><h1 id="companyName">{company.companyName || "mySked"}</h1><p id="companyTagline">{company.tagline || "Passenger Information System"}</p></div>
            </div>
            <div className="view-controls">
                <button className={`nav-btn ${viewMode === "dashboard" ? "active" : ""}`} onClick={() => setViewMode("dashboard")}>DASHBOARD</button>
                <button className={`nav-btn ${viewMode === "selection" ? "active" : ""}`} onClick={() => setViewMode("selection")}>ROUTES</button>
            </div>
            <div className="header-right">
                <button id="themeToggleBtn" className="theme-btn" onClick={toggleTheme}><span className="sun-icon">Light</span><span className="moon-icon">Dark</span></button>
                <div className="clock-display"><div id="currentTime">{clock.time}</div><div id="currentDate">{clock.date}</div></div>
            </div>
        </header>
    );
}

function Ticker({ data }) {
    const hiddenRules = data.company.hiddenColumns || [];
    if (hiddenRules.includes("advisories") || hiddenRules.includes("marquee") || hiddenRules.includes("announcement")) return null;
    const activeAdvisories = data.advisories && data.advisories.length > 0
        ? data.advisories.filter(a => {
            const statusKey = Object.keys(a).find(k => k.toLowerCase() === "status") || "Status";
            return String(a[statusKey] || "").toLowerCase() === "active";
        })
        : [];
    const messages = activeAdvisories.map(a => {
        const messageKey = Object.keys(a).find(k => ["message", "text", "advisory"].includes(k.toLowerCase())) || "Message";
        return a[messageKey] || "";
    }).filter(Boolean);
    const tickerItems = messages.length > 0 ? messages : ["Welcome to mySked Control Display Network Panel."];
    return (
        <div id="announcementBar">
            <div className="ticker-title">Advisory</div>
            <div className="ticker-wrap">
                <div id="ticker">{tickerItems.map((item, index) => <React.Fragment key={index}><span className="ticker-item">{item}</span>{index < tickerItems.length - 1 && <span className="ticker-gap" aria-hidden="true"></span>}</React.Fragment>)}</div>
            </div>
        </div>
    );
}

function ScheduleCell({ header, value, compact, company }) {
    const clean = normalizeColumnKey(header);
    const fontSize = compact ? "14px" : "15px";
    if (clean.includes("time")) return <span className="time-col" style={{ fontSize, fontWeight: 700 }}>{formatTimeToHHMM(value)}</span>;
    if (clean.endsWith("status")) return <span><strong className={statusColorMapper(value, company)} style={{ fontSize: 14, fontWeight: 700 }}>{String(value || "-").toUpperCase()}</strong></span>;
    return <span className="text-col" style={{ fontSize: 14, fontWeight: 600 }}>{value || "-"}</span>;
}

function getDashboardRowsPerCard() { return 10; }

function splitRowsForDashboard(rows) {
    const rowsPerCard = getDashboardRowsPerCard();
    const isMobileDashboard = window.matchMedia && window.matchMedia("(max-width: 768px)").matches;
    if (isMobileDashboard) return rows.length > 0 ? [rows] : [];
    const cardCount = Math.min(3, Math.max(1, Math.ceil(rows.length / rowsPerCard)));
    return Array.from({ length: cardCount }, (_, i) => rows.slice(i * rowsPerCard, (i + 1) * rowsPerCard)).filter(group => group.length > 0);
}

function DashboardRoute({ data, routeIndex }) {
    const activeRoutes = data.routes.filter(r => String(getSafeValue(r, "status")).toLowerCase() === "active");
    if (activeRoutes.length === 0) return <div className="fids-empty-msg">No Active Dispatched Routes Found.</div>;
    const currentRoute = activeRoutes[routeIndex % activeRoutes.length];
    const currentRouteID = normalizeRouteId(getSafeValue(currentRoute, "routeid") || getSafeValue(currentRoute, "routecode"));
    const scheduleType = String(getSafeValue(currentRoute, "scheduletype")).toLowerCase();
    const customText = getSafeValue(currentRoute, "schedulecustomtext");
    const isTextMode = scheduleType === "text" || customText !== "";
    const targetSchedules = data.schedules.filter(s => normalizeRouteId(getSafeValue(s, "routeid")) === currentRouteID && currentRouteID !== "");
    const headersList = getScheduleColumns(targetSchedules, data.company);
    const gridTemplateColumns = getScheduleGridTemplate(headersList, true);
    const rowGroups = splitRowsForDashboard(targetSchedules);
    const cycleSeconds = getNumberSetting(data.company.cycleSeconds) || 15;

    return (
        <section className="single-fids-board">
            <div className="single-fids-header">
                <div className="fids-main-title-info"><span className="route-label-pill" style={{ backgroundColor: "var(--primary)" }}>LIVE DASHBOARD</span><h2>{getSafeValue(currentRoute, "route")}</h2></div>
                <div className="fids-cycle-indicator-tag">Cycling every {cycleSeconds}s</div>
            </div>
            {isTextMode ? (
                <div className="fids-text-schedule-panel"><div className="fids-text-schedule-message">{customText || "Interval Operations Active."}</div></div>
            ) : targetSchedules.length === 0 ? (
                <div className="fids-empty-msg">No departures scheduled for this sector.</div>
            ) : (
                <div className="dashboard-cards-grid" style={{ "--dashboard-card-count": rowGroups.length }}>
                    {rowGroups.map((group, groupIndex) => {
                        const blankRows = Math.max(0, getDashboardRowsPerCard() - group.length);
                        return (
                            <div className="column-block dashboard-card-block" key={groupIndex}>
                                <div className="single-fids-table-headings" style={{ gridTemplateColumns }}>{headersList.map(h => <span key={h}>{formatColumnLabel(h, data.company)}</span>)}</div>
                                <div className="fids-adaptive-flow-container">
                                    {group.map((row, rowIndex) => <div key={rowIndex} className="single-fids-row" style={{ gridTemplateColumns }}>{headersList.map(h => <ScheduleCell key={h} header={h} value={getSafeValue(row, h, "-")} compact company={data.company} />)}</div>)}
                                    {Array.from({ length: blankRows }, (_, i) => <div key={`blank-${i}`} className="single-fids-row single-fids-row-empty" style={{ gridTemplateColumns }} aria-hidden="true">{headersList.map(h => <span key={h}>&nbsp;</span>)}</div>)}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
}

function RoutesView({ data, selectedRoute, setSelectedRoute }) {
    const activeList = data.routes.filter(r => String(getSafeValue(r, "status")).toLowerCase() === "active");
    const inactiveList = data.routes.filter(r => String(getSafeValue(r, "status")).toLowerCase() !== "active");
    const selected = data.routes.find(r => normalizeRouteId(getSafeValue(r, "routeid") || getSafeValue(r, "routecode")) === normalizeRouteId(selectedRoute)) || activeList[0];
    const matchedId = selected ? getSafeValue(selected, "routeid") || getSafeValue(selected, "routecode") : "";
    const routeStatus = String(getSafeValue(selected, "status") || "inactive").trim();
    const isRouteActive = routeStatus.toLowerCase() === "active";
    const scheduleType = String(getSafeValue(selected, "scheduletype")).toLowerCase();
    const customText = getSafeValue(selected, "schedulecustomtext");
    const isTextMode = scheduleType === "text" || customText !== "";
    const targetSchedules = data.schedules.filter(s => normalizeRouteId(getSafeValue(s, "routeid")) === normalizeRouteId(matchedId));
    const headersList = getScheduleColumns(targetSchedules, data.company);
    const colWidths = getScheduleGridTemplate(headersList);
    const nextDepartureRow = isRouteActive ? getChronologicalNextDeparture(targetSchedules) : null;
    const nextTime = !isRouteActive ? "NOT ACTIVE" : isTextMode ? "INTERVAL" : nextDepartureRow ? formatTimeToHHMM(getSafeValue(nextDepartureRow, "departuretime") || getSafeValue(nextDepartureRow, "time")) : targetSchedules.length ? "SUSPENDED" : "--:--";
    const nextStatus = !isRouteActive ? routeStatus.toUpperCase() : isTextMode ? "OPERATING" : nextDepartureRow ? String(getSafeValue(nextDepartureRow, "route_status") || getSafeValue(nextDepartureRow, "status") || "-").toUpperCase() : targetSchedules.length ? "NO RUNS" : "-";

    function chooseRoute(route) {
        setSelectedRoute(getSafeValue(route, "routeid") || getSafeValue(route, "routecode"));
    }

    return (
        <div className="selection-grid-layout">
            <div className="sidebar-panel-wrapper">
                <div className="routes-card-box">
                    <div className="section-head-title">Active Routes</div>
                    <div className="scroll-chips-track">{activeList.map(route => {
                        const id = getSafeValue(route, "routeid") || getSafeValue(route, "routecode");
                        return <button key={id} className={`route-chip ${normalizeRouteId(selectedRoute) === normalizeRouteId(id) ? "active" : ""}`} onClick={() => chooseRoute(route)}>{getSafeValue(route, "route")}</button>;
                    })}</div>
                </div>
                <div className="routes-card-box">
                    <div className="section-head-title">Non Active Routes</div>
                    <div className="scroll-chips-track">{inactiveList.length === 0 ? <div className="inactive-route-chip inactive-route-chip-static">All services operational</div> : inactiveList.map(route => {
                        const id = getSafeValue(route, "routeid") || getSafeValue(route, "routecode");
                        return <button key={id} className={`inactive-route-chip ${normalizeRouteId(selectedRoute) === normalizeRouteId(id) ? "active" : ""}`} onClick={() => chooseRoute(route)}><span>{getSafeValue(route, "route") || getSafeValue(route, "name")}</span><strong>{getSafeValue(route, "status") || "Inactive"}</strong></button>;
                    })}</div>
                </div>
            </div>

            <div className={`schedule-workspace-board ${!isRouteActive ? "route-inactive" : ""}`} data-route-status={isRouteActive ? "" : routeStatus.toUpperCase()}>
                <div className="workspace-header-hero">
                    <div className="workspace-meta-details"><h3>TRACKED OPERATIONS LINE</h3><h2 id="selectedRoute">{selected ? getSafeValue(selected, "route") : "Select a route segment..."}</h2></div>
                    <div id="nextDepartureCard"><div className="label">NEXT DEPARTURE</div><div id="nextDepartureTime">{nextTime || "--:--"}</div><div id="nextDepartureStatus" className={isRouteActive ? statusColorMapper(nextStatus, data.company) : "cancelled"}>{nextStatus}</div></div>
                </div>

                {!isTextMode && targetSchedules.length > 0 && <div className="timeline-title" style={{ gridTemplateColumns: colWidths }}>{headersList.map(h => <span key={h}>{formatColumnLabel(h, data.company)}</span>)}</div>}
                {isTextMode ? (
                    <div className="scrollable-content"><div style={{ padding: 40, textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}><div style={{ fontSize: 16, fontWeight: 800, color: "var(--time-color)", background: "var(--surface-accent)", padding: "25px 35px", borderRadius: 10, border: "1px solid var(--border)", width: "100%", maxWidth: 550, lineHeight: 1.6 }}>{customText || "Interval Operations Active For This Path Line."}</div></div></div>
                ) : (
                    <div className="scrollable-content"><div className="schedule-list">{!isRouteActive && <div className="inactive-route-notice">{routeStatus || "Not Active"} route. Schedule shown for reference.</div>}{targetSchedules.length === 0 ? <p className="empty-text" style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>No timetables matched.</p> : targetSchedules.map((row, rowIndex) => <div key={rowIndex} className="schedule-row" style={{ display: "grid", gridTemplateColumns: colWidths, gap: 15, alignItems: "center", width: "100%" }}>{headersList.map(h => <div key={h}><ScheduleCell header={h} value={getSafeValue(row, h, "-")} company={data.company} /></div>)}</div>)}</div></div>
                )}
            </div>
        </div>
    );
}

function Footer({ data, lastSyncedAt }) {
    const syncDate = lastSyncedAt || new Date();
    const lastUpdatedStr = syncDate.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) + " " + syncDate.toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit", hour12: true });
    const rawFooterText = data.company.footerText || "mySked DB";
    const platformName = getPlatformName(data.globalSettings);
    const platformVersion = getPlatformVersion(data.globalSettings);
    return <footer className="footer-bar-container"><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", fontSize: 12, color: "var(--muted)", fontWeight: 500 }}><div style={{ flex: 1, textAlign: "left" }}>Last Synced: <span style={{ color: "var(--text-strong)", fontWeight: 600 }}>{lastUpdatedStr}</span></div><div style={{ flex: 1, textAlign: "center", textTransform: "none", fontWeight: 500, color: "var(--text)" }}>{rawFooterText}</div><div style={{ flex: 1, textAlign: "right" }}><a href="https://broadimagi.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", textDecoration: "none", fontWeight: 600 }}>{platformName} Powered by Broadimagi{platformVersion && <span className="platform-version"> {platformVersion}</span>}</a></div></div></footer>;
}

function DashboardPage({ operatorCode }) {
    const clock = useClock();
    const [data, setData] = useState(emptyData);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [viewMode, setViewMode] = useState("dashboard");
    const [selectedRoute, setSelectedRoute] = useState("");
    const [routeIndex, setRouteIndex] = useState(0);
    const [theme, setTheme] = useState("dark");
    const [themeManuallySet, setThemeManuallySet] = useState(false);
    const [lastSyncedAt, setLastSyncedAt] = useState(null);
    const [maintenanceMode, setMaintenanceMode] = useState(false);
    const globalSettings = data.globalSettings || {};
    const platformName = getPlatformName(globalSettings);
    const supportEmail = getSupportEmail(globalSettings);
    const refreshSeconds = getNumberSetting(data.company.refreshSeconds) || 60;
    const maintenanceRefreshSeconds = getMaintenanceRefreshSeconds(globalSettings);
    const activeRefreshSeconds = maintenanceMode ? maintenanceRefreshSeconds : refreshSeconds;
    const cycleSeconds = getNumberSetting(data.company.cycleSeconds) || 15;

    useEffect(() => { document.body.className = viewMode === "selection" ? "selection-mode" : ""; }, [viewMode]);
    useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
    useEffect(() => { applyOperatorTheme(data.company.primaryColor); }, [data.company.primaryColor]);
    useEffect(() => {
        if (!data.company.companyName) return;
        const title = `${data.company.companyName} Live Schedule | mySked`;
        const description = `Live route schedules, advisories, and passenger information for ${data.company.companyName}.`;
        setPageMetadata({
            title,
            description,
            canonical: `https://mysked.broadimagi.com/?operator=${encodeURIComponent(operatorCode)}`
        });
    }, [data.company.companyName, operatorCode]);

    useEffect(() => {
        let alive = true;
        async function loadData(isFirstLoad = false) {
            try {
                const response = await fetch(`${API_URL}?operator=${operatorCode}&t=${Date.now()}`);
                const next = await response.json();
                if (!alive) return;
                if (next.maintenance) {
                    setData(current => ({ ...current, globalSettings: next.globalSettings || current.globalSettings || {} }));
                    setError(next.message || getSettingValue(next.globalSettings, "MaintenanceMessage", "System maintenance is in progress."));
                    setMaintenanceMode(true);
                    setLoading(false);
                    return;
                }
                if (!next.success) {
                    setData(current => ({ ...current, globalSettings: next.globalSettings || current.globalSettings || {} }));
                    setMaintenanceMode(false);
                    if (next.code === "NO_OPERATOR") {
                        setError("No operator was selected. Returning to the homepage in 3 seconds.");
                        setTimeout(() => { window.location.href = "/"; }, 3000);
                    } else if (isFirstLoad) {
                        setError(next.error || "Unable to load schedule data.");
                    }
                    setLoading(false);
                    return;
                }
                setData(next);
                setError("");
                setMaintenanceMode(false);
                setLastSyncedAt(new Date());
                if (isFirstLoad && !themeManuallySet) setTheme(next.company.themeMode || "dark");
                const firstActive = next.routes.find(r => String(getSafeValue(r, "status")).toLowerCase() === "active");
                if (!selectedRoute && firstActive) setSelectedRoute(getSafeValue(firstActive, "routeid") || getSafeValue(firstActive, "routecode"));
                setLoading(false);
            } catch (err) {
                if (!alive) return;
                if (isFirstLoad) setError("Unable to connect to the schedule server. Please try again later.");
                setLoading(false);
            }
        }
        loadData(true);
        const master = setInterval(() => loadData(false), activeRefreshSeconds * 1000);
        return () => { alive = false; clearInterval(master); };
    }, [operatorCode, activeRefreshSeconds]);

    useEffect(() => {
        const cycleMs = cycleSeconds * 1000;
        const timer = setInterval(() => {
            const activeRoutes = data.routes.filter(r => String(getSafeValue(r, "status")).toLowerCase() === "active");
            if (activeRoutes.length > 0 && viewMode === "dashboard") setRouteIndex(index => (index + 1) % activeRoutes.length);
        }, cycleMs);
        return () => clearInterval(timer);
    }, [data.routes, cycleSeconds, viewMode]);

    function toggleTheme() {
        setThemeManuallySet(true);
        setTheme(current => current === "light" ? "dark" : "light");
    }

    if (loading || error) return <LoadingScreen error={error} platformName={platformName} supportEmail={supportEmail} maintenanceRefreshSeconds={maintenanceMode ? maintenanceRefreshSeconds : 0} />;

    return (
        <div id="app">
            <Header company={data.company} viewMode={viewMode} setViewMode={setViewMode} toggleTheme={toggleTheme} clock={clock} />
            <Ticker data={data} />
            <main className="main-viewport-body">
                <div id="dashboardView" className={`view-panel ${viewMode === "dashboard" ? "" : "hidden"}`}><DashboardRoute data={data} routeIndex={routeIndex} /></div>
                <div id="selectionView" className={`view-panel ${viewMode === "selection" ? "" : "hidden"}`}><RoutesView data={data} selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute} /></div>
            </main>
            <Footer data={data} lastSyncedAt={lastSyncedAt} />
        </div>
    );
}

function App() {
    const params = new URLSearchParams(window.location.search);
    const operatorCode = params.get("operator");
    if (params.has("operator") && !operatorCode) return <MissingOperatorNotice />;
    return operatorCode ? <DashboardPage operatorCode={operatorCode} /> : <HomePage />;
}

export default App;
