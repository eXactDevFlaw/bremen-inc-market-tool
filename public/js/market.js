import { api } from "./api.js";
import { state } from "./state.js";
import { errorBlock, isk, num, skeleton } from "./format.js";
import { createItemAutocomplete, createLocationAutocomplete } from "./autocomplete.js";
import { t } from "./i18n.js";

const HUB_NAMES = ["Jita", "Amarr", "Dodixie", "Rens", "Hek"];

function renderHubQuickpicks(container, onPick) {
  container.innerHTML = HUB_NAMES.map((name) => `<button class="hub-pick-btn" data-hub="${name}">${name}</button>`).join("");
  container.querySelectorAll(".hub-pick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      container.querySelectorAll(".hub-pick-btn").forEach((b) => b.classList.toggle("active", b === btn));
      onPick({ kind: "hub", name: btn.dataset.hub, label: btn.dataset.hub });
    });
  });
}

function clearHubActive(container) {
  container.querySelectorAll(".hub-pick-btn").forEach((b) => b.classList.remove("active"));
}

// ---------- Sub-nav (Price History <-> Route Calculator) ----------

const viewButtons = document.querySelectorAll("#tab-market .mode-btn");
const historyView = document.getElementById("marketHistoryView");
const routeView = document.getElementById("marketRouteView");

viewButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    viewButtons.forEach((b) => b.classList.toggle("active", b === btn));
    const view = btn.dataset.marketView;
    historyView.classList.toggle("hidden", view !== "history");
    routeView.classList.toggle("hidden", view !== "route");
  });
});

// ---------- Price History ----------

let historyItem = null; // {typeId, name}
let historyLocation = null; // {kind:"hub", name} or {kind:"custom", category, id, label}
let priceChart = null;
let volumeChart = null;

const historyHubQuickpicks = document.getElementById("historyHubQuickpicks");
const historySelectedInfo = document.getElementById("historySelectedInfo");
const historyDaysSelect = document.getElementById("historyDaysSelect");

renderHubQuickpicks(historyHubQuickpicks, (hub) => {
  historyLocation = hub;
  lastHistoryPoint = null;
  renderHistorySelectedInfo();
  loadHistory();
});
// Jita ist der sinnvolle Default (aktivste Region) - vorbelegen.
historyLocation = { kind: "hub", name: "Jita", label: "Jita" };
historyHubQuickpicks.querySelector('[data-hub="Jita"]')?.classList.add("active");

createLocationAutocomplete(document.getElementById("historyLocationInput"), document.getElementById("historyLocationResults"), (result) => {
  clearHubActive(historyHubQuickpicks);
  historyLocation = { kind: "custom", category: result.category, id: result.id, label: result.name };
  lastHistoryPoint = null;
  renderHistorySelectedInfo();
  loadHistory();
});

createItemAutocomplete(document.getElementById("historyItemInput"), document.getElementById("historyItemResults"), (result) => {
  historyItem = { typeId: result.typeId, name: result.name };
  lastHistoryPoint = null;
  renderHistorySelectedInfo();
  loadHistory();
});

let lastHistoryPoint = null; // {average, date} des letzten geladenen Datenpunkts, fuer die Info-Zeile

function renderHistorySelectedInfo() {
  if (!historyItem) {
    historySelectedInfo.classList.add("hidden");
    return;
  }
  const lastInfo = lastHistoryPoint ? ` <span class="muted small-text">${t("market.lastValue", { value: isk(lastHistoryPoint.average), date: lastHistoryPoint.date })}</span>` : "";
  historySelectedInfo.innerHTML = `<span><b>${historyItem.name}</b> @ ${historyLocation.label}</span>${lastInfo}`;
  historySelectedInfo.classList.remove("hidden");
}

historyDaysSelect.addEventListener("change", () => {
  if (historyItem) loadHistory();
});

function locationParams(prefix, loc) {
  if (loc.kind === "hub") return { [`${prefix}Hub`]: loc.name };
  return { [`${prefix}LocationCategory`]: loc.category, [`${prefix}LocationId`]: loc.id, [`${prefix}LocationLabel`]: loc.label };
}

function destroyCharts() {
  priceChart?.destroy();
  volumeChart?.destroy();
  priceChart = null;
  volumeChart = null;
}

const CYAN = "#2ef1ff";
const CYAN_FILL = "rgba(46, 241, 255, 0.10)";
const ORANGE = "#ff9b3d";
const GRID = "rgba(111, 142, 160, 0.15)";
const TICK = "#6f8ea0";

function chartBaseOptions(yTickFormat) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: "#0a1826",
        borderColor: "rgba(41, 241, 255, 0.4)",
        borderWidth: 1,
        titleColor: "#d3e9f2",
        bodyColor: "#2ef1ff",
        padding: 10,
        titleFont: { family: "Share Tech Mono" },
        bodyFont: { family: "Share Tech Mono" },
        callbacks: yTickFormat ? { label: (ctx) => yTickFormat(ctx.parsed.y) } : undefined,
      },
    },
    scales: {
      x: { grid: { color: GRID, display: false }, ticks: { color: TICK, font: { family: "Share Tech Mono", size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
      y: {
        grid: { color: GRID },
        ticks: {
          color: TICK,
          font: { family: "Share Tech Mono", size: 10 },
          callback: (v) => (yTickFormat ? yTickFormat(v) : v),
        },
      },
    },
  };
}

function compactIsk(v) {
  return Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v);
}

async function loadHistory() {
  const el = document.getElementById("historyChartContent");
  if (!historyItem) {
    el.innerHTML = `<div class="empty">${t("market.chooseItem")}</div>`;
    return;
  }
  el.innerHTML = skeleton(3);
  try {
    const params = { typeId: historyItem.typeId, days: historyDaysSelect.value, ...locationParams("", historyLocation) };
    const data = await api.getMarketHistory(params);
    if (!data.history || data.history.length === 0) {
      el.innerHTML = `<div class="empty">${t("market.noData")}</div>`;
      return;
    }

    el.innerHTML = `
      <h3 class="section-label">${t("market.avgPrice")}</h3>
      <div class="chart-box"><canvas id="priceChartCanvas"></canvas></div>
      <h3 class="section-label">${t("market.volume")}</h3>
      <div class="chart-box chart-box-small"><canvas id="volumeChartCanvas"></canvas></div>
    `;

    const labels = data.history.map((d) => d.date.slice(5)); // MM-DD reicht, Jahr steht im Days-Filter
    const avg = data.history.map((d) => d.average);
    const low = data.history.map((d) => d.lowest);
    const high = data.history.map((d) => d.highest);
    const volume = data.history.map((d) => d.volume);

    destroyCharts();

    const priceCtx = document.getElementById("priceChartCanvas").getContext("2d");
    priceChart = new Chart(priceCtx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "high",
            data: high,
            borderWidth: 0,
            pointRadius: 0,
            fill: "+1",
            backgroundColor: CYAN_FILL,
            tension: 0.15,
          },
          {
            label: "low",
            data: low,
            borderWidth: 0,
            pointRadius: 0,
            fill: false,
            tension: 0.15,
          },
          {
            label: t("market.avgPrice"),
            data: avg,
            borderColor: CYAN,
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            pointHoverBackgroundColor: CYAN,
            fill: false,
            tension: 0.15,
          },
        ],
      },
      options: chartBaseOptions((v) => `${compactIsk(v)} ISK`),
    });

    const volumeCtx = document.getElementById("volumeChartCanvas").getContext("2d");
    volumeChart = new Chart(volumeCtx, {
      type: "bar",
      data: {
        labels,
        datasets: [{ label: t("market.volume"), data: volume, backgroundColor: "rgba(255, 155, 61, 0.55)", borderRadius: 1, barPercentage: 0.85, categoryPercentage: 0.9 }],
      },
      options: chartBaseOptions((v) => compactIsk(v)),
    });

    const last = data.history[data.history.length - 1];
    lastHistoryPoint = { average: last.average, date: last.date };
    renderHistorySelectedInfo();
  } catch (err) {
    el.innerHTML = errorBlock(t("common.error", { message: err.message }));
  }
}

// ---------- Route Calculator ----------

let routeFrom = null;
let routeTo = null;
let routeItem = null;

const routeFromHubQuickpicks = document.getElementById("routeFromHubQuickpicks");
const routeToHubQuickpicks = document.getElementById("routeToHubQuickpicks");
const routeFromSelected = document.getElementById("routeFromSelected");
const routeToSelected = document.getElementById("routeToSelected");
const routeItemSelected = document.getElementById("routeItemSelected");
const runRouteBtn = document.getElementById("runRoute");

renderHubQuickpicks(routeFromHubQuickpicks, (hub) => {
  routeFrom = hub;
  renderPickedLocation(routeFromSelected, routeFrom);
});
renderHubQuickpicks(routeToHubQuickpicks, (hub) => {
  routeTo = hub;
  renderPickedLocation(routeToSelected, routeTo);
});
// Vorbelegt passend zum in der Anforderung genannten Beispiel: Rens -> Jita.
routeFrom = { kind: "hub", name: "Rens", label: "Rens" };
routeTo = { kind: "hub", name: "Jita", label: "Jita" };
routeFromHubQuickpicks.querySelector('[data-hub="Rens"]')?.classList.add("active");
routeToHubQuickpicks.querySelector('[data-hub="Jita"]')?.classList.add("active");
renderPickedLocation(routeFromSelected, routeFrom);
renderPickedLocation(routeToSelected, routeTo);

createLocationAutocomplete(document.getElementById("routeFromInput"), document.getElementById("routeFromResults"), (result) => {
  clearHubActive(routeFromHubQuickpicks);
  routeFrom = { kind: "custom", category: result.category, id: result.id, label: result.name };
  renderPickedLocation(routeFromSelected, routeFrom);
});
createLocationAutocomplete(document.getElementById("routeToInput"), document.getElementById("routeToResults"), (result) => {
  clearHubActive(routeToHubQuickpicks);
  routeTo = { kind: "custom", category: result.category, id: result.id, label: result.name };
  renderPickedLocation(routeToSelected, routeTo);
});
createItemAutocomplete(document.getElementById("routeItemInput"), document.getElementById("routeItemResults"), (result) => {
  routeItem = { typeId: result.typeId, name: result.name };
  renderPickedItem();
});

function renderPickedLocation(el, loc) {
  el.innerHTML = `<span><b>${loc.label}</b></span> <button class="link-btn clear-pick">${t("common.change")}</button>`;
  el.classList.remove("hidden");
  el.querySelector(".clear-pick").addEventListener("click", () => {
    el.classList.add("hidden");
    el.innerHTML = "";
    if (el === routeFromSelected) {
      routeFrom = null;
      clearHubActive(routeFromHubQuickpicks);
    } else {
      routeTo = null;
      clearHubActive(routeToHubQuickpicks);
    }
  });
}

function renderPickedItem() {
  if (!routeItem) {
    routeItemSelected.classList.add("hidden");
    return;
  }
  routeItemSelected.innerHTML = `<span><b>${routeItem.name}</b></span> <button class="link-btn clear-pick">${t("common.change")}</button>`;
  routeItemSelected.classList.remove("hidden");
  routeItemSelected.querySelector(".clear-pick").addEventListener("click", () => {
    routeItem = null;
    routeItemSelected.classList.add("hidden");
    routeItemSelected.innerHTML = "";
  });
}

function renderSingleItemResult(data) {
  if (!data.available) {
    return `<p class="risk-medium">${t("market.routeNotAvailable", { item: data.item.name, message: data.message })}</p>`;
  }
  return `
    <div class="route-result-card">
      <h3 class="section-label">${t("market.routeSingleHeading", { item: data.item.name, from: data.from.label, to: data.to.label })}</h3>
      <div class="overview-stat-row">
        <div class="stat"><span class="stat-value">${isk(data.buyPrice)}</span><span class="stat-label">${t("market.routeBuyPrice")}</span></div>
        <div class="stat"><span class="stat-value">${isk(data.sellPrice)}</span><span class="stat-label">${t("market.routeSellPrice")}</span></div>
        <div class="stat"><span class="stat-value">${data.brokerFeePct.toFixed(2)}%</span><span class="stat-label">${t("market.routeBrokerFee")}</span></div>
        <div class="stat"><span class="stat-value">${data.salesTaxPct.toFixed(2)}%</span><span class="stat-label">${t("market.routeSalesTax")}</span></div>
      </div>
      <div class="overview-stat-row">
        <div class="stat"><span class="stat-value" style="color:var(--green)">${isk(data.netProfitPerUnit)}</span><span class="stat-label">${t("market.routeNetProfit")}</span></div>
        <div class="stat"><span class="stat-value">${data.netMarginPct.toFixed(1)}%</span><span class="stat-label">${t("market.routeNetMargin")}</span></div>
      </div>
      ${data.maxUnitsWithinWallet !== null ? `<p class="muted">${t("market.routeMaxUnits", { count: num(data.maxUnitsWithinWallet) })}</p>` : ""}
    </div>`;
}

function renderScanResult(data) {
  const rows = data.recommendations
    .map(
      (r) => `
      <tr>
        <td>${r.itemName}</td>
        <td>${isk(r.netProfitPerUnit)}</td>
        <td>${r.netMarginPct.toFixed(1)}%</td>
        <td><span class="risk-tag risk-${r.riskLevel}" title="${r.riskReason}">${r.riskLevel}</span></td>
        <td class="reasoning">${r.reasoning}</td>
      </tr>`,
    )
    .join("");
  return `
    <h3 class="section-label">${t("market.routeScanHeading", { from: data.from.label, to: data.to.label })}</h3>
    <p>${data.summary}</p>
    ${
      rows
        ? `<table>
      <thead><tr><th>${t("trading.colItem")}</th><th>${t("market.routeNetProfit")}</th><th>${t("market.routeNetMargin")}</th><th>${t("trading.colRisk")}</th><th>${t("trading.colReasoning")}</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`
        : `<p class="empty">${t("trading.noneFound")}</p>`
    }`;
}

runRouteBtn.addEventListener("click", async () => {
  const el = document.getElementById("routeContent");
  if (!routeFrom || !routeTo) {
    el.innerHTML = `<p class="risk-high">${t("market.routeChooseLocationsFirst")}</p>`;
    return;
  }
  runRouteBtn.disabled = true;
  el.innerHTML = skeleton(3);
  try {
    const params = { ...locationParams("from", routeFrom), ...locationParams("to", routeTo) };
    if (state.selectedCharacterId) params.characterId = state.selectedCharacterId;
    if (routeItem) params.typeId = routeItem.typeId;
    const data = await api.getRoute(params);
    el.innerHTML = data.mode === "single_item" ? renderSingleItemResult(data) : renderScanResult(data);
  } catch (err) {
    el.innerHTML = errorBlock(t("common.error", { message: err.message }));
  } finally {
    runRouteBtn.disabled = false;
  }
});

export function initMarketTab() {
  if (historyItem) loadHistory();
}
