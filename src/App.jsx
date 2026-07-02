import React, { useEffect, useRef, useState } from 'react';

const API_URL = "https://script.google.com/macros/s/AKfycby778WwSXHTuZcVC2iT4U3wkrn5pYOpXOuCVZQQ3Oo47cuLqbhyFpEm_6RRrgdcF9s/exec";
const emptyData = { globalSettings: {}, company: {}, routes: [], schedules: [], advisories: [] };
const SOUND_PERMISSION_KEY = "myskedScheduleSoundPreference";

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

function renderFooterRichText(value = "") {
    const text = String(value || "mySked DB");
    const tokenPattern = /(\[[^\]]+\]\((?:https?:\/\/|mailto:|tel:|www\.)[^)\s]+\)|https?:\/\/[^\s<]+|www\.[^\s<]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+?\d[\d\s().-]{6,}\d)/gi;
    const parts = [];
    let lastIndex = 0;

    text.replace(tokenPattern, (match, _token, index) => {
        if (index > lastIndex) parts.push(text.slice(lastIndex, index));
        const linkData = getFooterLinkData(match);
        if (linkData) {
            parts.push(
                <React.Fragment key={`${index}-${match}`}>
                    <a className="footer-inline-link" href={linkData.href} target={linkData.external ? "_blank" : undefined} rel={linkData.external ? "noopener noreferrer" : undefined}>{linkData.label}</a>
                    {linkData.trailing}
                </React.Fragment>
            );
        } else {
            parts.push(match);
        }
        lastIndex = index + match.length;
        return match;
    });

    if (lastIndex < text.length) parts.push(text.slice(lastIndex));
    return parts.length > 0 ? parts : text;
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

function isActiveSetting(value) {
    return ["active", "enabled", "on", "true", "yes", "1"].includes(String(value || "").trim().toLowerCase());
}

function getScheduleIdentity(row) {
    return [
        normalizeRouteId(getSafeValue(row, "routeid") || getSafeValue(row, "route")),
        normalizeColumnKey(getSafeValue(row, "departureTime")),
        normalizeColumnKey(getSafeValue(row, "route") || getSafeValue(row, "routeName"))
    ].join("|");
}

function getScheduleStatusSnapshot(schedules = []) {
    const snapshot = new Map();
    schedules.forEach(row => {
        const key = getScheduleIdentity(row);
        if (!key.replace(/\|/g, "")) return;
        snapshot.set(key, {
            status: String(getSafeValue(row, "scheduleStatus") || getSafeValue(row, "status") || "").trim(),
            row
        });
    });
    return snapshot;
}

function getRouteNameForSchedule(row, routes = []) {
    const routeName = getSafeValue(row, "route") || getSafeValue(row, "routeName");
    if (routeName) return routeName;
    const rowRouteId = normalizeRouteId(getSafeValue(row, "routeid"));
    const matchedRoute = routes.find(route => normalizeRouteId(getSafeValue(route, "routeid") || getSafeValue(route, "routecode")) === rowRouteId);
    return matchedRoute ? getSafeValue(matchedRoute, "route") || getSafeValue(matchedRoute, "routeName") : "Schedule";
}

function getRouteForSchedule(row, routes = []) {
    const rowRouteId = normalizeRouteId(getSafeValue(row, "routeid"));
    const rowRouteName = normalizeColumnKey(getSafeValue(row, "route") || getSafeValue(row, "routeName"));
    return routes.find(route => {
        const routeId = normalizeRouteId(getSafeValue(route, "routeid") || getSafeValue(route, "routecode"));
        const routeName = normalizeColumnKey(getSafeValue(route, "route") || getSafeValue(route, "routeName"));
        return (rowRouteId && routeId === rowRouteId) || (rowRouteName && routeName === rowRouteName);
    });
}

function isScheduleRouteActive(row, routes = []) {
    const matchedRoute = getRouteForSchedule(row, routes);
    if (!matchedRoute) return false;
    return normalizeColumnKey(getSafeValue(matchedRoute, "status")) === "active";
}

function findScheduleStatusChanges(previousSnapshot, nextData) {
    if (!previousSnapshot) return [];
    const nextSnapshot = getScheduleStatusSnapshot(nextData.schedules);
    const changes = [];
    for (const [key, nextItem] of nextSnapshot.entries()) {
        const previousItem = previousSnapshot.get(key);
        if (!previousItem) continue;
        if (!isScheduleRouteActive(nextItem.row, nextData.routes)) continue;
        const previousStatus = normalizeColumnKey(previousItem.status);
        const nextStatus = normalizeColumnKey(nextItem.status);
        if (previousStatus && nextStatus && previousStatus !== nextStatus) {
            changes.push({
                routeName: getRouteNameForSchedule(nextItem.row, nextData.routes),
                departureTime: formatTimeToHHMM(getSafeValue(nextItem.row, "departureTime")),
                previousStatus: previousItem.status,
                nextStatus: nextItem.status,
                remarks: getSafeValue(nextItem.row, "remarks")
            });
        }
    }
    return changes;
}

function playFallbackPopupChime() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    try {
        const context = new AudioContext();
        const now = context.currentTime;
        const masterGain = context.createGain();
        masterGain.gain.setValueAtTime(0.0001, now);
        masterGain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
        masterGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.72);
        masterGain.connect(context.destination);

        [740, 988].forEach((frequency, index) => {
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const start = now + index * 0.16;
            oscillator.type = "sine";
            oscillator.frequency.setValueAtTime(frequency, start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.9, start + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.28);
            oscillator.connect(gain);
            gain.connect(masterGain);
            oscillator.start(start);
            oscillator.stop(start + 0.32);
        });

        setTimeout(() => context.close().catch(() => {}), 900);
    } catch (error) {
        // Browsers may block audio until the user interacts with the page.
    }
}

function getSoundPreference() {
    try {
        return localStorage.getItem(SOUND_PERMISSION_KEY) || "";
    } catch (error) {
        return "";
    }
}

function setSoundPreference(value) {
    try {
        localStorage.setItem(SOUND_PERMISSION_KEY, value);
    } catch (error) {
        // Storage can be unavailable in private browsing; the current click still unlocks this page.
    }
}

async function unlockSchedulePopupSound(company = {}) {
    window.__myskedScheduleSoundUnlocked = true;

    if (navigator.permissions && navigator.permissions.query) {
        try {
            await navigator.permissions.query({ name: "speaker-selection" });
        } catch (error) {
            // Most browsers do not expose a sound-output permission; the user click below is enough.
        }
    }

    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
        try {
            const context = new AudioContext();
            if (context.state === "suspended") await context.resume();
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            gain.gain.setValueAtTime(0.0001, context.currentTime);
            oscillator.connect(gain);
            gain.connect(context.destination);
            oscillator.start();
            oscillator.stop(context.currentTime + 0.05);
            setTimeout(() => context.close().catch(() => {}), 120);
        } catch (error) {
            // Some browsers only unlock the HTML audio element below.
        }
    }

    const soundURL = getSettingValue(company, "schedulePopupSound", getSettingValue(company, "schedulePopupSoundURL", "/schedule-popup.mp3"));
    if (!soundURL) return;
    try {
        const audio = new Audio(soundURL);
        audio.muted = true;
        audio.volume = 0;
        await audio.play();
        audio.pause();
        audio.currentTime = 0;
    } catch (error) {
        // The user's click still helps unlock future AudioContext playback.
    }
}

function playSchedulePopupSound(company = {}) {
    if (getSoundPreference() !== "enabled" && !window.__myskedScheduleSoundUnlocked) return;
    const soundURL = getSettingValue(company, "schedulePopupSound", getSettingValue(company, "schedulePopupSoundURL", "/schedule-popup.mp3"));
    if (!soundURL) {
        playFallbackPopupChime();
        return;
    }
    try {
        const audio = new Audio(soundURL);
        audio.volume = 0.9;
        audio.play().catch(() => playFallbackPopupChime());
    } catch (error) {
        playFallbackPopupChime();
    }
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

function getColumnDisplayValue(header, row) {
    const clean = normalizeColumnKey(header);
    const value = getSafeValue(row, header, "-");
    if (clean.includes("time")) return formatTimeToHHMM(value);
    if (clean.endsWith("status")) return String(value || "-").toUpperCase();
    return String(value || "-");
}

function getColumnWeight(header, rows = [], compact = false, company = {}) {
    const clean = normalizeColumnKey(header);
    const labelLength = formatColumnLabel(header, company).length;
    const valueLength = rows.reduce((longest, row) => Math.max(longest, getColumnDisplayValue(header, row).length), 0);
    const contentLength = Math.max(labelLength, valueLength, 1);
    let weight = Math.sqrt(contentLength);

    if (clean.includes("time")) weight += 0.6;
    if (clean.endsWith("status")) weight += 1.2;
    if (["remarks", "remark", "destination", "terminal", "notes", "note"].some(token => clean.includes(token))) weight += 1.4;
    if (contentLength <= 2) weight *= 0.55;

    const minimum = compact ? 0.45 : 0.55;
    const maximum = compact ? 1.8 : 2.15;
    return Math.max(minimum, Math.min(maximum, Number(weight.toFixed(2))));
}

function getScheduleGridTemplate(headersList) {
    return `repeat(${Math.max(1, headersList.length)}, minmax(0, 1fr))`;
}

function getScheduleContentMetrics(headersList = [], rows = [], company = {}) {
    const lengths = headersList.flatMap(header => {
        const labelLength = formatColumnLabel(header, company).length;
        const valueLengths = rows.map(row => getColumnDisplayValue(header, row).length);
        return [labelLength, ...valueLengths];
    });
    return {
        longest: Math.max(1, ...lengths),
        columnCount: Math.max(1, headersList.length),
        rowCount: Math.max(1, rows.length)
    };
}

function getScheduleLayoutVars(headersList, options = {}) {
    const columnCount = Math.max(1, headersList.length);
    const isNarrow = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(max-width: 1024px)").matches;
    const isMainDashboard = Boolean(options.mainDashboard);
    const longestContent = Math.max(1, options.longestContent || 1);
    const crowdedColumns = Math.max(0, columnCount - 4);
    const crowdedContent = Math.max(0, longestContent - 12);

    if (isNarrow) {
        const minFont = columnCount >= 7 || longestContent >= 22 ? 9 : columnCount >= 5 || longestContent >= 16 ? 10 : 12;
        const maxFont = columnCount >= 7 || longestContent >= 22 ? 12 : columnCount >= 5 || longestContent >= 16 ? 14 : 17;
        const vwSize = Math.max(2.2, Math.min(3.8, 4.2 - crowdedColumns * 0.32 - crowdedContent * 0.06));
        const fontSize = `clamp(${minFont}px, ${vwSize.toFixed(2)}vw, ${maxFont}px)`;
        return {
            "--schedule-cell-font-size": fontSize,
            "--schedule-heading-font-size": fontSize,
            "--schedule-row-min-height": columnCount <= 4
                ? (isMainDashboard ? "clamp(52px, 10vw, 66px)" : "clamp(44px, 8vw, 58px)")
                : (isMainDashboard ? "clamp(46px, 8.5vw, 58px)" : "clamp(38px, 7vw, 50px)"),
            "--schedule-row-padding-y": columnCount <= 4 ? (isMainDashboard ? "11px" : "9px") : (isMainDashboard ? "8px" : "6px"),
            "--schedule-row-padding-x": columnCount <= 4 ? "10px" : "6px",
            "--schedule-row-gap": columnCount <= 4 ? "7px" : "4px"
        };
    }

    if (options.mainDashboard && options.rowsPerCard) {
        const viewportHeight = options.viewportHeight || window.innerHeight || 800;
        const reservedHeight = 280;
        const availableHeight = Math.max(380, viewportHeight - reservedHeight);
        const rowHeight = Math.max(42, Math.min(68, Math.floor(availableHeight / options.rowsPerCard)));
        const fontScale = columnCount <= 3 ? 0.36 : columnCount === 4 ? 0.32 : columnCount <= 6 ? 0.27 : 0.23;
        const contentPenalty = Math.min(4, Math.floor(crowdedContent / 5));
        const columnPenalty = Math.min(3, Math.floor(crowdedColumns / 2));
        const fontSize = Math.max(columnCount <= 4 ? 12 : 9, Math.min(columnCount <= 4 ? 22 : 16, Math.floor(rowHeight * fontScale) - contentPenalty - columnPenalty));
        const paddingY = Math.max(6, Math.floor((rowHeight - fontSize * 1.15) / 2));
        return {
            "--schedule-cell-font-size": `${fontSize}px`,
            "--schedule-heading-font-size": `${fontSize}px`,
            "--schedule-row-min-height": `${rowHeight}px`,
            "--schedule-row-padding-y": `${paddingY}px`,
            "--schedule-row-padding-x": columnCount <= 4 ? "24px" : "16px",
            "--schedule-row-gap": columnCount <= 4 ? "12px" : "8px"
        };
    }

    const desktopMin = columnCount >= 7 || longestContent >= 22 ? 9 : columnCount >= 5 || longestContent >= 16 ? 10 : 12;
    const desktopMax = columnCount >= 7 || longestContent >= 22 ? 12 : columnCount >= 5 || longestContent >= 16 ? 14 : 18;
    const desktopVw = Math.max(0.62, Math.min(1.05, 1.12 - crowdedColumns * 0.07 - crowdedContent * 0.012));
    const fontSize = `clamp(${desktopMin}px, ${desktopVw.toFixed(2)}vw, ${desktopMax}px)`;
    return {
        "--schedule-cell-font-size": fontSize,
        "--schedule-heading-font-size": fontSize,
        "--schedule-row-min-height": columnCount <= 4 ? "42px" : "38px",
        "--schedule-row-padding-y": columnCount <= 4 ? "8px" : "7px",
        "--schedule-row-padding-x": columnCount <= 4 ? "24px" : "16px",
        "--schedule-row-gap": columnCount <= 4 ? "12px" : "8px"
    };
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

function useViewportSize() {
    const getSize = () => ({
        width: typeof window !== "undefined" ? window.innerWidth : 0,
        height: typeof window !== "undefined" ? window.innerHeight : 0
    });
    const [size, setSize] = useState(getSize);
    useEffect(() => {
        let frame = null;
        const update = () => {
            if (frame) cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => setSize(getSize()));
        };
        window.addEventListener("resize", update);
        window.addEventListener("orientationchange", update);
        return () => {
            if (frame) cancelAnimationFrame(frame);
            window.removeEventListener("resize", update);
            window.removeEventListener("orientationchange", update);
        };
    }, []);
    return size;
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
    if (clean.includes("time")) return <span className="time-col">{formatTimeToHHMM(value)}</span>;
    if (clean.endsWith("status")) return <span><strong className={statusColorMapper(value, company)}>{String(value || "-").toUpperCase()}</strong></span>;
    return <span className="text-col">{value || "-"}</span>;
}

function getDashboardRowContentSize(headersList = [], rows = []) {
    return rows.reduce((longest, row) => {
        const rowLongest = headersList.reduce((rowMax, header) => Math.max(rowMax, getColumnDisplayValue(header, row).length), 0);
        return Math.max(longest, rowLongest);
    }, 0);
}

function getDashboardRowsPerCard(headersList = [], rows = [], viewportHeight = 0) {
    const isMobileDashboard = window.matchMedia && window.matchMedia("(max-width: 1024px)").matches;
    if (isMobileDashboard) return 1;
    const height = viewportHeight || window.innerHeight || 800;
    const availableHeight = Math.max(260, height - 280);
    const longestContent = getDashboardRowContentSize(headersList, rows);
    const contentBoost = Math.max(0, Math.min(22, (longestContent - 12) * 1.8));
    const comfortableRowHeight = 50 + contentBoost;
    return Math.max(5, Math.min(10, Math.floor(availableHeight / comfortableRowHeight)));
}

function splitRowsForDashboard(rows, rowsPerCard) {
    const isMobileDashboard = window.matchMedia && window.matchMedia("(max-width: 1024px)").matches;
    if (isMobileDashboard) return rows.length > 0 ? [rows] : [];
    const cardCount = Math.max(1, Math.ceil(rows.length / rowsPerCard));
    return Array.from({ length: cardCount }, (_, i) => rows.slice(i * rowsPerCard, (i + 1) * rowsPerCard)).filter(group => group.length > 0);
}

function DashboardRoute({ data, routeIndex, viewport }) {
    const activeRoutes = data.routes.filter(r => String(getSafeValue(r, "status")).toLowerCase() === "active");
    if (activeRoutes.length === 0) return <div className="fids-empty-msg">No Active Dispatched Routes Found.</div>;
    const currentRoute = activeRoutes[routeIndex % activeRoutes.length];
    const currentRouteID = normalizeRouteId(getSafeValue(currentRoute, "routeid") || getSafeValue(currentRoute, "routecode"));
    const scheduleType = String(getSafeValue(currentRoute, "scheduletype")).toLowerCase();
    const customText = getSafeValue(currentRoute, "schedulecustomtext");
    const isTextMode = scheduleType === "text" || customText !== "";
    const targetSchedules = data.schedules.filter(s => normalizeRouteId(getSafeValue(s, "routeid")) === currentRouteID && currentRouteID !== "");
    const headersList = getScheduleColumns(targetSchedules, data.company);
    const gridTemplateColumns = getScheduleGridTemplate(headersList);
    const dashboardRowsPerCard = getDashboardRowsPerCard(headersList, targetSchedules, viewport?.height);
    const contentMetrics = getScheduleContentMetrics(headersList, targetSchedules, data.company);
    const scheduleLayoutVars = getScheduleLayoutVars(headersList, { mainDashboard: true, rowsPerCard: dashboardRowsPerCard, viewportHeight: viewport?.height, longestContent: contentMetrics.longest });
    const rowGroups = splitRowsForDashboard(targetSchedules, dashboardRowsPerCard);
    const cycleSeconds = getNumberSetting(data.company.cycleSeconds) || 15;
    const fare = getSafeValue(currentRoute, "fare");

    return (
        <section className="single-fids-board">
            <div className="single-fids-header">
                <div className="fids-main-title-info">
                    <span className="route-label-pill" style={{ backgroundColor: "var(--primary)" }}>LIVE DASHBOARD</span>
                    <div className="fids-route-title-stack">
                        <h2>{getSafeValue(currentRoute, "route")}</h2>
                        {fare && <div className="fids-fare-tag fids-fare-tag-mobile"><span className="fids-fare-label">Fare</span><span className="fids-fare-value-main">{fare}</span></div>}
                    </div>
                </div>
                <div className="fids-header-meta">
                    {fare && <div className="fids-fare-tag fids-fare-tag-desktop"><span className="fids-fare-label">Fare</span><span className="fids-fare-value-main">{fare}</span></div>}
                    <div className="fids-cycle-indicator-tag">Cycling every {cycleSeconds}s</div>
                </div>
            </div>
            {isTextMode ? (
                <div className="fids-text-schedule-panel"><div className="fids-text-schedule-message">{customText || "Interval Operations Active."}</div></div>
            ) : targetSchedules.length === 0 ? (
                <div className="fids-empty-msg">No departures scheduled for this sector.</div>
            ) : (
                <div className="dashboard-cards-grid" style={{ "--dashboard-card-count": rowGroups.length, ...scheduleLayoutVars }}>
                    {rowGroups.map((group, groupIndex) => {
                        const fillerRows = Math.max(0, dashboardRowsPerCard - group.length);
                        return (
                            <div className="column-block dashboard-card-block" key={groupIndex}>
                                <div className="single-fids-table-headings" style={{ gridTemplateColumns }}>{headersList.map(h => <span key={h}>{formatColumnLabel(h, data.company)}</span>)}</div>
                                <div className="fids-adaptive-flow-container" style={{ "--dashboard-row-count": Math.max(dashboardRowsPerCard, group.length, 1) }}>
                                    {group.map((row, rowIndex) => <div key={rowIndex} className="single-fids-row" style={{ gridTemplateColumns }}>{headersList.map(h => <ScheduleCell key={h} header={h} value={getSafeValue(row, h, "-")} compact company={data.company} />)}</div>)}
                                    {Array.from({ length: fillerRows }, (_, i) => (
                                        <div key={`filler-${i}`} className="single-fids-row single-fids-row-empty" style={{ gridTemplateColumns }} aria-hidden="true">
                                            {headersList.map(h => <span key={h}>&nbsp;</span>)}
                                        </div>
                                    ))}
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
    const contentMetrics = getScheduleContentMetrics(headersList, targetSchedules, data.company);
    const scheduleLayoutVars = getScheduleLayoutVars(headersList, { longestContent: contentMetrics.longest });
    const nextDepartureRow = isRouteActive ? getChronologicalNextDeparture(targetSchedules) : null;
    const nextTime = !isRouteActive ? "NOT ACTIVE" : isTextMode ? "INTERVAL" : nextDepartureRow ? formatTimeToHHMM(getSafeValue(nextDepartureRow, "departuretime") || getSafeValue(nextDepartureRow, "time")) : targetSchedules.length ? "SUSPENDED" : "--:--";
    const nextStatus = !isRouteActive ? routeStatus.toUpperCase() : isTextMode ? "OPERATING" : nextDepartureRow ? String(getSafeValue(nextDepartureRow, "route_status") || getSafeValue(nextDepartureRow, "status") || "-").toUpperCase() : targetSchedules.length ? "NO RUNS" : "-";
    const fare = selected ? getSafeValue(selected, "fare") : "";

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

            <div className={`schedule-workspace-board ${!isRouteActive ? "route-inactive" : ""}`} data-route-status={isRouteActive ? "" : routeStatus.toUpperCase()} style={scheduleLayoutVars}>
                <div className="workspace-header-hero">
                    <div className="workspace-meta-details"><h3>TRACKED OPERATIONS LINE</h3><h2 id="selectedRoute">{selected ? getSafeValue(selected, "route") : "Select a route segment..."}</h2></div>
                    <div className="workspace-header-actions">
                        {fare && <div className="route-fare-card"><div className="label">FARE</div><div className="route-fare-value">{fare}</div></div>}
                        <div id="nextDepartureCard"><div className="label">NEXT DEPARTURE</div><div id="nextDepartureTime">{nextTime || "--:--"}</div><div id="nextDepartureStatus" className={isRouteActive ? statusColorMapper(nextStatus, data.company) : "cancelled"}>{nextStatus}</div></div>
                    </div>
                </div>

                {!isTextMode && targetSchedules.length > 0 && <div className="timeline-title" style={{ gridTemplateColumns: colWidths }}>{headersList.map(h => <span key={h}>{formatColumnLabel(h, data.company)}</span>)}</div>}
                {isTextMode ? (
                    <div className="scrollable-content"><div style={{ padding: 40, textAlign: "center", display: "flex", justifyContent: "center", alignItems: "center", height: "100%" }}><div style={{ fontSize: 16, fontWeight: 800, color: "var(--time-color)", background: "var(--surface-accent)", padding: "25px 35px", borderRadius: 10, border: "1px solid var(--border)", width: "100%", maxWidth: 550, lineHeight: 1.6 }}>{customText || "Interval Operations Active For This Path Line."}</div></div></div>
                ) : (
                    <div className="scrollable-content"><div className="schedule-list">{!isRouteActive && <div className="inactive-route-notice">{routeStatus || "Not Active"} route. Schedule shown for reference.</div>}{targetSchedules.length === 0 ? <p className="empty-text" style={{ padding: 40, textAlign: "center", color: "var(--muted)", fontWeight: 600 }}>No timetables matched.</p> : targetSchedules.map((row, rowIndex) => <div key={rowIndex} className="schedule-row" style={{ display: "grid", gridTemplateColumns: colWidths, gap: "var(--schedule-row-gap, 15px)", alignItems: "center", width: "100%" }}>{headersList.map(h => <div key={h}><ScheduleCell header={h} value={getSafeValue(row, h, "-")} company={data.company} /></div>)}</div>)}</div></div>
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
    return <footer className="footer-bar-container"><div className="footer-bar-inner"><div className="footer-sync">Last Synced: <span>{lastUpdatedStr}</span></div><div className="footer-operator-text">{renderFooterRichText(rawFooterText)}</div><div className="footer-platform"><a href="https://broadimagi.com" target="_blank" rel="noopener noreferrer">{platformName} Powered by Broadimagi{platformVersion && <span className="platform-version"> {platformVersion}</span>}</a></div></div></footer>;
}

function ScheduleStatusPopup({ alerts, company }) {
    if (!alerts || alerts.length === 0) return null;
    return (
        <div className="schedule-status-popup-overlay" role="status" aria-live="polite">
            <div className="schedule-status-popup">
                <div className="schedule-status-popup-title">Schedule Status Updated</div>
                <div className="schedule-status-popup-subtitle">{alerts.length} schedule{alerts.length === 1 ? "" : "s"} changed</div>
                <div className="schedule-status-popup-list">
                    {alerts.map((alert, index) => (
                        <div className="schedule-status-popup-item" key={`${alert.routeName}-${alert.departureTime}-${index}`}>
                            <div className="schedule-status-popup-route">{alert.routeName}</div>
                            <div className="schedule-status-popup-details">
                                <span>{alert.departureTime || "--:--"}</span>
                                <strong className={statusColorMapper(alert.nextStatus, company)}>{String(alert.nextStatus || "-").toUpperCase()}</strong>
                            </div>
                            {alert.remarks && <div className="schedule-status-popup-remarks">{alert.remarks}</div>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function SoundPermissionPrompt({ company, onDone }) {
    async function enableSound() {
        await unlockSchedulePopupSound(company);
        setSoundPreference("enabled");
        onDone();
    }

    function dismissSound() {
        setSoundPreference("dismissed");
        onDone();
    }

    return (
        <div className="sound-permission-overlay" role="dialog" aria-modal="true" aria-labelledby="soundPermissionTitle">
            <div className="sound-permission-card">
                <div id="soundPermissionTitle" className="sound-permission-title">Enable Schedule Alerts?</div>
                <div className="sound-permission-copy">Allow sound for schedule status popups on this device.</div>
                <div className="sound-permission-actions">
                    <button type="button" className="sound-permission-primary" onClick={enableSound}>Enable Sound</button>
                    <button type="button" className="sound-permission-secondary" onClick={dismissSound}>Not Now</button>
                </div>
            </div>
        </div>
    );
}

function DashboardPage({ operatorCode }) {
    const clock = useClock();
    const viewport = useViewportSize();
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
    const [scheduleAlert, setScheduleAlert] = useState(null);
    const [showSoundPrompt, setShowSoundPrompt] = useState(false);
    const previousScheduleStatusRef = useRef(null);
    const scheduleAlertTimerRef = useRef(null);
    const globalSettings = data.globalSettings || {};
    const platformName = getPlatformName(globalSettings);
    const supportEmail = getSupportEmail(globalSettings);
    const refreshSeconds = getNumberSetting(data.company.refreshSeconds) || 60;
    const maintenanceRefreshSeconds = getMaintenanceRefreshSeconds(globalSettings);
    const activeRefreshSeconds = maintenanceMode ? maintenanceRefreshSeconds : refreshSeconds;
    const cycleSeconds = getNumberSetting(data.company.cycleSeconds) || 15;
    const schedulePopupActive = isActiveSetting(getSettingValue(data.company, "schedulePopup"));

    useEffect(() => { document.body.className = viewMode === "selection" ? "selection-mode" : ""; }, [viewMode]);
    useEffect(() => { document.documentElement.setAttribute("data-theme", theme); }, [theme]);
    useEffect(() => { applyOperatorTheme(data.company.primaryColor); }, [data.company.primaryColor]);
    useEffect(() => {
        if (schedulePopupActive && getSoundPreference() === "") setShowSoundPrompt(true);
    }, [schedulePopupActive]);
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
                const statusChanges = findScheduleStatusChanges(previousScheduleStatusRef.current, next);
                previousScheduleStatusRef.current = getScheduleStatusSnapshot(next.schedules);
                if (!isFirstLoad && isActiveSetting(getSettingValue(next.company, "schedulePopup")) && statusChanges.length > 0) {
                    setScheduleAlert(statusChanges);
                    playSchedulePopupSound(next.company);
                    if (scheduleAlertTimerRef.current) clearTimeout(scheduleAlertTimerRef.current);
                    scheduleAlertTimerRef.current = setTimeout(() => setScheduleAlert(null), 8000);
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
        return () => {
            alive = false;
            clearInterval(master);
            if (scheduleAlertTimerRef.current) clearTimeout(scheduleAlertTimerRef.current);
        };
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
                <div id="dashboardView" className={`view-panel ${viewMode === "dashboard" ? "" : "hidden"}`}><DashboardRoute data={data} routeIndex={routeIndex} viewport={viewport} /></div>
                <div id="selectionView" className={`view-panel ${viewMode === "selection" ? "" : "hidden"}`}><RoutesView data={data} selectedRoute={selectedRoute} setSelectedRoute={setSelectedRoute} /></div>
            </main>
            {viewMode === "dashboard" && schedulePopupActive && <ScheduleStatusPopup alerts={scheduleAlert} company={data.company} />}
            {viewMode === "dashboard" && schedulePopupActive && showSoundPrompt && <SoundPermissionPrompt company={data.company} onDone={() => setShowSoundPrompt(false)} />}
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
