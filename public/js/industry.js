import { api } from "./api.js";
import { state } from "./state.js";
import { errorBlock, pct, skeleton } from "./format.js";
import { createLocationAutocomplete } from "./autocomplete.js";
import { t } from "./i18n.js";

let extraLocation = null;

async function loadCostIndices() {
  const el = document.getElementById("costIndexContent");
  el.innerHTML = skeleton(3);
  try {
    const data = await api.getCostIndices(extraLocation);
    const rows = data.rows
      .map(
        (r) => `
        <tr class="${r.isSelected ? "row-highlight" : ""}">
          <td>${r.systemName}${r.isHub ? ' <span class="location-kind">HUB</span>' : ""}</td>
          <td>${r.manufacturingCostIndexPct !== null ? pct(r.manufacturingCostIndexPct, 2) : "-"}</td>
        </tr>`,
      )
      .join("");
    el.innerHTML = `
      ${data.regionOnlyNote ? `<p class="risk-medium">${data.regionOnlyNote}</p>` : ""}
      <table><thead><tr><th>${t("industry.colSystem")}</th><th>${t("industry.colCostIndex")}</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="muted">${data.note}</p>
    `;
  } catch (err) {
    el.innerHTML = errorBlock(t("common.error", { message: err.message }));
  }
}

createLocationAutocomplete(
  document.getElementById("industryLocationSearchInput"),
  document.getElementById("industryLocationSearchResults"),
  (result) => {
    extraLocation = result;
    loadCostIndices();
  },
);

export async function loadBlueprints() {
  const el = document.getElementById("blueprintsContent");
  if (!state.selectedCharacterId) {
    el.innerHTML = `<div class="empty">${t("common.noCharacterConnected")}</div>`;
    return;
  }
  el.innerHTML = skeleton(3);
  try {
    const blueprints = await api.getBlueprints(state.selectedCharacterId);
    if (blueprints.length === 0) {
      el.innerHTML = `<div class="empty">${t("industry.blueprintsEmpty")}</div>`;
      return;
    }
    const rows = blueprints
      .map(
        (b) => `
        <tr>
          <td>${b.typeName}</td>
          <td>${b.isOriginal ? t("industry.original") : t("industry.copy", { runs: b.runsRemaining })}</td>
          <td>ME ${b.materialEfficiency} / TE ${b.timeEfficiency}</td>
        </tr>`,
      )
      .join("");
    el.innerHTML = `<table><thead><tr><th>${t("industry.colBlueprint")}</th><th>${t("industry.colType")}</th><th>${t("industry.colEfficiency")}</th></tr></thead><tbody>${rows}</tbody></table>`;
  } catch (err) {
    el.innerHTML = errorBlock(t("common.error", { message: err.message }));
  }
}

export function initIndustryTab() {
  loadCostIndices();
}
