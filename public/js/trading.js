import { api } from "./api.js";
import { state } from "./state.js";
import { errorBlock, isk, skeleton } from "./format.js";
import { createLocationAutocomplete } from "./autocomplete.js";
import { t } from "./i18n.js";

let mode = "five_hub";
let selectedLocation = null;
// Zwischengespeichertes letztes /opportunities-Ergebnis, damit die
// KI-Analyse (Groq) die bereits berechneten Kandidaten wiederverwenden kann,
// statt alles nochmal neu zu laden.
let lastResult = null;

const modeButtons = document.querySelectorAll(".mode-btn");
const locationPicker = document.getElementById("customLocationPicker");
const selectedLocationEl = document.getElementById("selectedLocation");
const runBtn = document.getElementById("runAnalysis");
const fullMarketHintEl = document.getElementById("fullMarketHint");
const aiSection = document.getElementById("aiAnalysisSection");
const aiRunBtn = document.getElementById("runAiAnalysis");
const aiContentEl = document.getElementById("aiAnalysisContent");

// Reihenfolge "sicheres Einkommen" (niedriges Risiko) zuerst, dann
// aufsteigendes Risiko - so wie der Nutzer typischerweise entscheiden will.
const RISK_BUCKETS = [
  { level: "low", headingKey: "trading.riskBucketLow" },
  { level: "medium", headingKey: "trading.riskBucketMedium" },
  { level: "high", headingKey: "trading.riskBucketHigh" },
];

function updateRunButtonLabel() {
  runBtn.textContent = mode === "custom" && selectedLocation ? t("trading.runAt", { place: selectedLocation.name }) : t("trading.run");
}

function renderSelectedLocation() {
  if (!selectedLocation) {
    selectedLocationEl.classList.add("hidden");
    selectedLocationEl.innerHTML = "";
    return;
  }
  const catLabel = { region: t("trading.locCategoryRegion"), solar_system: t("trading.locCategorySystem"), station: t("trading.locCategoryStation") }[selectedLocation.category] ?? selectedLocation.category;
  selectedLocationEl.innerHTML = `<span>${catLabel}: <b>${selectedLocation.name}</b></span> <button id="clearLocationBtn" class="link-btn">${t("common.change")}</button>`;
  selectedLocationEl.classList.remove("hidden");
  document.getElementById("clearLocationBtn").addEventListener("click", () => {
    selectedLocation = null;
    renderSelectedLocation();
    updateRunButtonLabel();
  });
}

modeButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    mode = btn.dataset.mode;
    modeButtons.forEach((b) => b.classList.toggle("active", b === btn));
    locationPicker.classList.toggle("hidden", mode !== "custom");
    // Der Hinweis auf die laengere erste Ladezeit gilt nur fuer den
    // Vollmarkt-Scan (5-Hub-Vergleich) - der Einzelort-Modus fragt weiterhin
    // gezielt eine Watchlist ab und ist entsprechend schnell.
    fullMarketHintEl.classList.toggle("hidden", mode !== "five_hub");
    updateRunButtonLabel();
  });
});

createLocationAutocomplete(
  document.getElementById("locationSearchInput"),
  document.getElementById("locationSearchResults"),
  (result) => {
    selectedLocation = result;
    renderSelectedLocation();
    updateRunButtonLabel();
  },
);

function renderCandidateRows(recommendations) {
  return recommendations
    .map(
      (r) => `
      <tr title="${r.riskReason}">
        <td>${r.itemName}</td>
        <td class="strategy-tag">${r.strategy === "station_trading" ? t("trading.strategyStation") : t("trading.strategyHaul")}</td>
        <td>${r.route}</td>
        <td>${isk(r.netProfitPerUnit)}</td>
        <td>${r.netMarginPct.toFixed(1)}%</td>
        <td class="reasoning">${r.reasoning}</td>
      </tr>`,
    )
    .join("");
}

// Statt einer einzigen flachen, nach Score sortierten Tabelle: drei
// Abschnitte nach Risikostufe ("sicheres Einkommen" / mittleres / hohes
// Risiko), innerhalb jedes Abschnitts weiterhin nach Score sortiert (die
// Reihenfolge kommt bereits so vom Backend).
function renderRiskBuckets(recommendations) {
  return RISK_BUCKETS.map(({ level, headingKey }) => {
    const items = recommendations.filter((r) => r.riskLevel === level);
    if (items.length === 0) return "";
    const rows = renderCandidateRows(items);
    return `
      <div class="category-block risk-bucket risk-bucket-${level}">
        <h3 class="section-label">${t(headingKey)} <span class="risk-bucket-count">(${items.length})</span></h3>
        <table>
          <thead><tr><th>${t("trading.colItem")}</th><th>${t("trading.colStrategy")}</th><th>${t("trading.colRoute")}</th><th>${t("trading.colNetProfit")}</th><th>${t("trading.colNetMargin")}</th><th>${t("trading.colReasoning")}</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }).join("");
}

function renderResults(data) {
  const el = document.getElementById("tradingContent");
  lastResult = data;

  const feeNote =
    data.skillsSource === "connected_character"
      ? t("trading.feeNoteReal", { broker: data.brokerRelationsLevel, accounting: data.accountingLevel })
      : t("trading.feeNoteDefault");

  el.innerHTML = `
    <h3 class="section-label">${t("trading.summaryLabel")}</h3>
    <p>${data.summary}</p>
    <p class="muted">${t("trading.candidatesChecked", { count: data.candidateCount, wallet: data.walletBalance ? t("trading.walletSuffix", { value: isk(data.walletBalance) }) : "" })}</p>
    <p class="muted">${feeNote}</p>
    ${data.recommendations.length > 0 ? renderRiskBuckets(data.recommendations) : `<p class="empty">${t("trading.noneFound")}</p>`}
  `;

  aiSection.classList.toggle("hidden", data.recommendations.length === 0);
  aiContentEl.innerHTML = "";
}

function riskBucketHeadingKey(level) {
  return RISK_BUCKETS.find((b) => b.level === level)?.headingKey ?? "trading.riskBucketMedium";
}

function renderAiAnalysis(analysis) {
  const bucketsHtml = analysis.buckets
    .map(
      (b) => `
      <div class="ai-bucket ai-bucket-${b.level}">
        <h4>${t(riskBucketHeadingKey(b.level))} — ${b.headline}</h4>
        <p>${b.analysis}</p>
        ${b.topPicks.length ? `<p class="muted small-text">${t("trading.aiAnalysisTopPicks", { items: b.topPicks.join(", ") })}</p>` : ""}
      </div>`,
    )
    .join("");

  aiContentEl.innerHTML = `
    <div class="recommendation-banner ai-overview">${analysis.overview}</div>
    ${bucketsHtml}
    <p class="muted small-text">${t("trading.aiAnalysisNote")}</p>
  `;
}

function renderAiError(err) {
  aiContentEl.innerHTML = `
    ${errorBlock(err.message)}
    <button class="link-btn" data-goto="settings">${t("nav.settings")}</button>
  `;
}

aiRunBtn.addEventListener("click", async () => {
  if (!lastResult) return;
  aiRunBtn.disabled = true;
  aiContentEl.innerHTML = skeleton(2);
  try {
    const analysis = await api.getAiTradeAnalysis({
      recommendations: lastResult.recommendations,
      walletBalance: lastResult.walletBalance ?? null,
    });
    renderAiAnalysis(analysis);
  } catch (err) {
    renderAiError(err);
  } finally {
    aiRunBtn.disabled = false;
  }
});

runBtn.addEventListener("click", async () => {
  const el = document.getElementById("tradingContent");

  if (mode === "custom" && !selectedLocation) {
    el.innerHTML = `<p class="risk-high">${t("trading.chooseLocationFirst")}</p>`;
    return;
  }

  runBtn.disabled = true;
  el.innerHTML = skeleton(3);
  try {
    const params = {};
    if (state.selectedCharacterId) params.characterId = state.selectedCharacterId;
    if (mode === "custom" && selectedLocation) {
      params.locationCategory = selectedLocation.category;
      params.locationId = selectedLocation.id;
      params.locationLabel = selectedLocation.name;
    }
    const data = await api.getTradingOpportunities(params);
    renderResults(data);
  } catch (err) {
    el.innerHTML = errorBlock(t("common.error", { message: err.message }));
  } finally {
    runBtn.disabled = false;
  }
});
