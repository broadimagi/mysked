const API_URL = "https://script.google.com/macros/s/AKfycby778WwSXHTuZcVC2iT4U3wkrn5pYOpXOuCVZQQ3Oo47cuLqbhyFpEm_6RRrgdcF9s/exec";

let appData = { globalSettings: {}, company: {}, routes: [], schedules: [], advisories: [] };
let selectedRoute = null;
let currentDashboardRouteIndex = 0; 
let dashboardCycleInterval = null;
let masterRefreshInterval = null;
let headerRefreshInterval = null;
const HEADER_REFRESH_MS = 5 * 60 * 1000;
let themeManuallySet = false;
let lastSyncedAt = null;

function getSafeValue(obj, targetKey, fallback = "") {
    if (!obj) return fallback;
    const cleanTarget = targetKey.toLowerCase().replace(/\s+/g, "");
    const matchedKey = Object.keys(obj).find(k => k.toLowerCase().replace(/\s+/g, "") === cleanTarget);
    return (matchedKey && obj[matchedKey] !== undefined) ? obj[matchedKey] : fallback;
}

window.onload = () => {
    const urlParams = new URLSearchParams(window.location.search);
    let operatorCode = urlParams.get('operator'); 

    if (!operatorCode) {
        window.location.href = "index.html";
        return;
    }

    document.getElementById("toggleDashboardBtn").onclick = () => switchViewMode("dashboard");
    document.getElementById("toggleSelectionBtn").onclick = () => switchViewMode("selection");
    document.getElementById("themeToggleBtn").onclick = toggleTheme;

    initApplication(operatorCode);
    updateClock();
    setInterval(updateClock, 1000);
};

async function initApplication(operatorCode) {
    await loadDashboardData(operatorCode, true, "all");
    const refreshMs = (appData.company.refreshSeconds || 60) * 1000;

    clearInterval(masterRefreshInterval);
    masterRefreshInterval = setInterval(() => loadDashboardData(operatorCode, false, "cards"), refreshMs);

    clearInterval(headerRefreshInterval);
    headerRefreshInterval = setInterval(() => loadDashboardData(operatorCode, false, "header"), HEADER_REFRESH_MS);
}

async function loadDashboardData(operatorCode, isFirstLoad, refreshScope = "all") {
    try {
        const response = await fetch(`${API_URL}?operator=${operatorCode}&t=${Date.now()}`);
        const data = await response.json();
        
        if (data.maintenance) {
            document.body.innerHTML = `
                <div style="height:100vh; display:flex; flex-direction:column; justify-content:center; align-items:center; background:#07090e; color:#fff; font-family:sans-serif; text-align:center; padding:20px;">
                    <h1 style="font-size:40px; margin-bottom:10px; color:var(--fids-amber);">We will be right back</h1>
                    <p style="color:#9ca3af; font-size:16px;">${data.message || "System maintenance is in progress."}</p>
                </div>
            `;
            return;
        }

        if (!data.success) {
            if (isFirstLoad) showStartupError(data.error || "Unable to load schedule data.");
            return;
        }
        appData = data;
        lastSyncedAt = new Date();

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
    loadingScreen.innerHTML = `
        <h1>mySked</h1>
        <p style="max-width:420px; text-align:center; line-height:1.6; text-transform:none; letter-spacing:0; color:#9ca3af;">
            ${message}
        </p>
    `;
}

function applyBrandingColorsThemeMatrix(isFirstLoad) {
    if (isFirstLoad && !themeManuallySet) {
        document.documentElement.setAttribute("data-theme", appData.company.themeMode || "dark");
    }
    if (appData.company.primaryColor) {
        document.documentElement.style.setProperty('--primary', appData.company.primaryColor);
        const annBar = document.getElementById("announcementBar");
        if (annBar) annBar.style.backgroundColor = appData.company.primaryColor;
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
    const cycleMs = (appData.company.cycleSeconds || 15) * 1000; 
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
    return String(value || "").toLowerCase().replace(/\s+/g, "");
}

function isHiddenColumn(columnName) {
    const hiddenRules = appData.company.hiddenColumns || [];
    return hiddenRules.includes(normalizeColumnKey(columnName));
}

function getScheduleColumns(rows) {
    const systemColumns = ["routeid", "routecode"];
    const preferredOrder = ["Departure Time", "Status", "Remarks"];
    const seen = [];

    rows.forEach(row => {
        Object.keys(row).forEach(key => {
            const cleanKey = normalizeColumnKey(key);
            if (!cleanKey || systemColumns.includes(cleanKey) || isHiddenColumn(key)) return;
            if (!seen.some(existing => normalizeColumnKey(existing) === cleanKey)) seen.push(key);
        });
    });

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

    return orderedColumns.length > 0 ? orderedColumns : preferredOrder.filter(key => !isHiddenColumn(key));
}

function getScheduleGridTemplate(headersList, compact = false) {
    return headersList.map(header => {
        const clean = normalizeColumnKey(header);
        if (compact) {
            if (clean.includes("time")) return "minmax(96px, 0.9fr)";
            if (clean === "status") return "minmax(88px, 0.8fr)";
            if (["remarks", "remark", "destination", "terminal", "notes", "note"].some(token => clean.includes(token))) return "minmax(120px, 1.2fr)";
            return "minmax(96px, 1fr)";
        }
        if (clean.includes("time")) return "minmax(130px, 0.8fr)";
        if (clean === "status") return "minmax(110px, 0.7fr)";
        if (["remarks", "remark", "destination", "terminal", "notes", "note"].some(token => clean.includes(token))) return "minmax(180px, 1.4fr)";
        return "minmax(140px, 1fr)";
    }).join(" ");
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

function renderScheduleCell(header, value, compact = false) {
    const clean = normalizeColumnKey(header);
    const fontSize = compact ? "14px" : "15px";

    if (clean.includes("time")) {
        return `<span class="time-col" style="font-size:${fontSize}; font-weight:700;">${escapeHTML(formatTimeToHHMM(value))}</span>`;
    }

    if (clean === "status") {
        return `<span><strong class="${statusColorMapper(value)}" style="font-size:14px; font-weight:700;">${escapeHTML(String(value || "-").toUpperCase())}</strong></span>`;
    }

    return `<span class="text-col" style="font-size:14px; font-weight:600;">${escapeHTML(value || "-")}</span>`;
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

    let boardHTML = `
        <div class="single-fids-header">
            <div class="fids-main-title-info">
                <span class="route-label-pill" style="background-color: var(--primary)">LIVE DASHBOARD</span>
                <h2>${getSafeValue(currentRoute, "route")}</h2>
            </div>
            <div class="fids-cycle-indicator-tag">Cycling every ${appData.company.cycleSeconds}s</div>
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

        if (targetSchedules.length === 0) {
            boardHTML += `<div class="fids-empty-msg">No departures scheduled for this sector.</div>`;
        } else {
            const rowGroups = splitRowsForDashboard(targetSchedules);
            const cardCount = rowGroups.length;

            boardHTML += `<div class="dashboard-cards-grid" style="--dashboard-card-count:${cardCount};">`;

            const renderColumnBlock = (rowsSubset) => {
                const blankRows = Math.max(0, getDashboardRowsPerCard() - rowsSubset.length);
                let subHTML = `
                    <div class="column-block dashboard-card-block">
                        <div class="single-fids-table-headings" style="${gridStyle}">
                            ${headersList.map(h => `<span>${h}</span>`).join('')}
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
        const statusVal = String(getSafeValue(s, "status")).trim().toLowerCase();
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
    let gridLayoutPattern = "display:grid; grid-template-columns: " + colWidths + "; gap:15px; align-items:center; width:100%;";

    const timetableHeaderBlock = document.querySelector(".timeline-title");
    if (timetableHeaderBlock) {
        timetableHeaderBlock.style = "display:grid; grid-template-columns: " + colWidths + "; gap:15px; padding:12px 24px; border-bottom:1px solid var(--border); background:var(--background); font-size:11px; font-weight:800; color:var(--muted); text-transform:uppercase; letter-spacing:0.5px;";
        timetableHeaderBlock.innerHTML = headersList.map(h => "<span>" + escapeHTML(h) + "</span>").join("");
    }

    const nextDepartureRow = isRouteActive ? getChronologicalNextDeparture(targetSchedules) : null;
    if (!isRouteActive) {
        document.getElementById("nextDepartureTime").innerHTML = "NOT ACTIVE";
        document.getElementById("nextDepartureStatus").innerHTML = routeStatus.toUpperCase();
        document.getElementById("nextDepartureStatus").className = "cancelled";
    } else if (nextDepartureRow) {
        const depTimeVal = getSafeValue(nextDepartureRow, "departuretime") || getSafeValue(nextDepartureRow, "time");
        const statusVal = getSafeValue(nextDepartureRow, "status");
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

    const footerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; font-size:12px; color:var(--muted); font-weight:500;">
            <div style="flex: 1; text-align: left;">Last Synced: <span style="color:var(--text-strong); font-weight:600;">${lastUpdatedStr}</span></div>
            <div style="flex: 1; text-align: center; text-transform: none; font-weight: 500; color:var(--text);">${rawFooterText}</div>
            <div style="flex: 1; text-align: right;">
                <a href="https://broadimagi.com" target="_blank" rel="noopener noreferrer" style="color:var(--primary); text-decoration:none; font-weight:600;">
                    MySked Powered by Broadimagi
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