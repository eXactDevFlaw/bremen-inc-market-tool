import { api } from "./api.js";
import { state } from "./state.js";
import { animateStats, errorBlock, isk, num, skeleton } from "./format.js";
import { t } from "./i18n.js";
import { portraitImg, typeIconImg } from "./images.js";

// Statt einer einzigen langen Flat-Liste (schwer zu durchsuchen, wenn viele
// Systeme/Stationen belegt sind): zuerst eine "Karte" aus Regions-Kacheln
// (nur Regionen, in denen tatsaechlich Assets liegen), Klick auf eine
// Kachel zeigt die Systeme/Stationen dieser Region im Detail. Zustand ist
// bewusst modulweit statt in state.js, da er rein UI-seitig ist und beim
// Charakterwechsel bzw. Neu-Laden ohnehin zurueckgesetzt wird.
let currentAssets = [];
let view = "map"; // "map" | "region"
let selectedRegionKey = null;

function renderProfileStrip(characterId) {
  const character = state.characters.find((c) => c.characterId === characterId);
  if (!character) return "";
  return `<div class="tab-profile-strip">${portraitImg(characterId, 36, "overview-portrait")}<span class="tab-profile-strip-name" title="${character.characterName}">${character.characterName}</span></div>`;
}

function locationKindLabel(kind) {
  return (
    {
      station: t("assets.kind.station"),
      structure: t("assets.kind.structure"),
      system: t("assets.kind.system"),
      unknown: t("assets.kind.unknown"),
    }[kind] ?? kind
  );
}

function regionKeyOf(asset) {
  return asset.regionId !== null && asset.regionId !== undefined ? String(asset.regionId) : "unknown";
}

/**
 * Gruppiert eine (bereits auf eine Region eingeschraenkte) Asset-Liste nach
 * System -> Ort -> Item-Typ. Zaehlt und summiert dabei den Wert
 * (unitPrice/totalValue kommen vom Backend, grob geschaetzt ueber die
 * ESI-Bulk-Durchschnittspreise). Blueprint-Original/-Kopie hat laut
 * ESI-Konvention quantity -1/-2 statt eines Stack-Counts - hier als 1 Stueck
 * gezaehlt statt den Count negativ zu verfaelschen.
 */
function renderAssetGroups(assets) {
  const systems = new Map(); // sysName -> Map(placeName -> {kind, items: Map(typeId -> {name, qty, value, hasValue}), placeValue})
  let grandTotal = 0;
  let grandTotalKnown = false;

  for (const a of assets) {
    const sysKey = a.systemName || "?";
    const placeKey = a.placeName || sysKey;
    if (!systems.has(sysKey)) systems.set(sysKey, new Map());
    const places = systems.get(sysKey);
    if (!places.has(placeKey)) places.set(placeKey, { kind: a.locationKind, items: new Map(), placeValue: 0 });
    const place = places.get(placeKey);

    const effectiveQuantity = a.quantity < 0 ? 1 : a.quantity;
    const existing = place.items.get(a.type_id) ?? { name: a.type_name, typeId: a.type_id, qty: 0, value: 0, hasValue: false };
    existing.qty += effectiveQuantity;
    if (a.totalValue !== null && a.totalValue !== undefined) {
      existing.value += a.totalValue;
      existing.hasValue = true;
      place.placeValue += a.totalValue;
      grandTotal += a.totalValue;
      grandTotalKnown = true;
    }
    place.items.set(a.type_id, existing);
  }

  const sortedSystems = [...systems.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  let rowsRendered = 0;
  const ROW_CAP = 400;
  let truncated = false;

  const sections = sortedSystems
    .map(([sysName, places]) => {
      const placeBlocks = [...places.entries()]
        .map(([placeName, { kind, items, placeValue }]) => {
          // Wertvollstes zuerst - das ist meist die interessantere Frage als reine Stueckzahl.
          const sorted = [...items.values()].sort((a, b) => b.value - a.value || b.qty - a.qty);
          const visible = [];
          for (const entry of sorted) {
            if (rowsRendered >= ROW_CAP) {
              truncated = true;
              break;
            }
            visible.push(entry);
            rowsRendered++;
          }
          const rows = visible
            .map(
              (entry) => `
              <tr>
                <td class="asset-item-cell">${typeIconImg(entry.typeId, 24, "asset-icon")}<span>${entry.name}</span></td>
                <td>${num(entry.qty)}</td>
                <td class="asset-value-cell">${entry.hasValue ? isk(entry.value) : "—"}</td>
              </tr>`,
            )
            .join("");
          return `
            <div class="location-block">
              <div class="location-head">
                <span class="location-name">${placeName}</span>
                <span class="location-kind">${locationKindLabel(kind)}</span>
              </div>
              <table>
                <thead><tr><th>${t("assets.colItem")}</th><th>${t("assets.colQty")}</th><th>${t("assets.colValue")}</th></tr></thead>
                <tbody>${rows}</tbody>
              </table>
              ${placeValue > 0 ? `<p class="muted small-text asset-location-total">${t("assets.locationValue", { value: isk(placeValue) })}</p>` : ""}
            </div>`;
        })
        .join("");
      return `
        <div class="system-group">
          <h3 class="section-label">${sysName}</h3>
          ${placeBlocks}
        </div>`;
    })
    .join("");

  return { html: sections, systemCount: systems.size, truncated, grandTotal, grandTotalKnown };
}

/** Gruppiert die komplette Asset-Liste nach Region - Basis fuer die Karten-Kacheln. */
function summarizeRegions(assets) {
  const regions = new Map(); // key -> {name, entryCount, placeNames: Set, value, valueKnown}
  for (const a of assets) {
    const key = regionKeyOf(a);
    if (!regions.has(key)) {
      regions.set(key, { key, name: a.regionName || t("assets.unknownRegion"), entryCount: 0, placeNames: new Set(), value: 0, valueKnown: false });
    }
    const r = regions.get(key);
    r.entryCount++;
    r.placeNames.add(a.placeName || a.systemName || "?");
    if (a.totalValue !== null && a.totalValue !== undefined) {
      r.value += a.totalValue;
      r.valueKnown = true;
    }
  }
  return [...regions.values()]
    .map((r) => ({ key: r.key, name: r.name, entryCount: r.entryCount, placeCount: r.placeNames.size, value: r.value, valueKnown: r.valueKnown }))
    .sort((a, b) => b.value - a.value || b.entryCount - a.entryCount || a.name.localeCompare(b.name));
}

function renderMapView(assets) {
  const regions = summarizeRegions(assets);
  const tiles = regions
    .map(
      (r) => `
      <button type="button" class="region-tile" data-region-key="${r.key}">
        <span class="region-tile-name">${r.name}</span>
        <span class="region-tile-value">${r.valueKnown ? isk(r.value) : "—"}</span>
        <span class="region-tile-meta">${t("assets.regionTileMeta", { entries: num(r.entryCount), places: num(r.placeCount) })}</span>
      </button>`,
    )
    .join("");
  return `
    <p class="panel-desc">${t("assets.mapHint")}</p>
    <div class="region-map">${tiles}</div>`;
}

function renderRegionView(regionKey, assets) {
  const regionAssets = assets.filter((a) => regionKeyOf(a) === regionKey);
  const regionName = regionAssets[0]?.regionName || t("assets.unknownRegion");
  const { html, truncated, grandTotal, grandTotalKnown } = renderAssetGroups(regionAssets);
  return `
    <button type="button" class="link-btn" data-back-to-map>${t("assets.backToMap")}</button>
    <h3 class="section-label region-view-heading">${regionName}${grandTotalKnown ? ` — ${isk(grandTotal)}` : ""}</h3>
    ${html || `<div class="empty">${t("assets.empty")}</div>`}
    ${truncated ? `<p class="muted">${t("assets.truncated")}</p>` : ""}
  `;
}

function renderBody(el) {
  const body = view === "region" && selectedRegionKey !== null ? renderRegionView(selectedRegionKey, currentAssets) : renderMapView(currentAssets);
  const uniqueTypes = new Set(currentAssets.map((a) => a.type_id)).size;
  const regionCount = new Set(currentAssets.map(regionKeyOf)).size;
  const grandTotal = currentAssets.reduce((sum, a) => sum + (a.totalValue ?? 0), 0);
  const grandTotalKnown = currentAssets.some((a) => a.totalValue !== null && a.totalValue !== undefined);

  el.innerHTML = `
    ${renderProfileStrip(state.selectedCharacterId)}
    <div class="stat-row">
      <div class="stat"><span class="stat-value" data-count="${currentAssets.length}">0</span><span class="stat-label">${t("assets.entries")}</span></div>
      <div class="stat"><span class="stat-value" data-count="${uniqueTypes}">0</span><span class="stat-label">${t("assets.itemTypes")}</span></div>
      <div class="stat"><span class="stat-value" data-count="${regionCount}">0</span><span class="stat-label">${t("assets.regions")}</span></div>
      ${grandTotalKnown ? `<div class="stat"><span class="stat-value">${isk(grandTotal)}</span><span class="stat-label">${t("assets.totalValueStat")}</span></div>` : ""}
    </div>
    ${currentAssets.length > 0 ? body : `<div class="empty">${t("assets.empty")}</div>`}
    ${grandTotalKnown ? `<p class="muted small-text">${t("assets.priceNote")}</p>` : ""}
  `;
  animateStats(el);

  el.querySelectorAll("[data-region-key]").forEach((tile) => {
    tile.addEventListener("click", () => {
      selectedRegionKey = tile.dataset.regionKey;
      view = "region";
      renderBody(el);
    });
  });
  el.querySelector("[data-back-to-map]")?.addEventListener("click", () => {
    view = "map";
    selectedRegionKey = null;
    renderBody(el);
  });
}

export async function loadAssets() {
  const el = document.getElementById("assetsContent");
  if (!state.selectedCharacterId) {
    el.innerHTML = `<div class="empty">${t("common.noCharacterConnected")}</div>`;
    return;
  }
  el.innerHTML = skeleton(4);
  view = "map";
  selectedRegionKey = null;
  try {
    currentAssets = await api.getAssets(state.selectedCharacterId);
    renderBody(el);
  } catch (err) {
    el.innerHTML = errorBlock(t("common.error", { message: err.message }));
  }
}
