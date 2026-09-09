import { api } from "./api.js";
import { state } from "./state.js";
import { activateTab } from "./tabs.js";
import { errorBlock, isk, num, skeleton } from "./format.js";
import { t } from "./i18n.js";
import { corpLogoImg, portraitImg } from "./images.js";
import { onCharacterSelected, selectCharacter } from "./characterSelection.js";

// Haelt die Active-Markierung auf bereits gerenderten Overview-Karten in
// Sync, egal ob die Auswahl ueber das Header-Dropdown, einen Kartenklick
// oder "Go to Skills/Assets" ausgeloest wurde.
onCharacterSelected(() => {
  document.querySelectorAll(".overview-card[data-character-id]").forEach((card) => {
    const isActive = Number(card.dataset.characterId) === state.selectedCharacterId;
    card.classList.toggle("overview-card-active", isActive);
    const head = card.querySelector(".overview-card-head-clickable");
    head?.querySelector(".overview-active-tag")?.remove();
    if (isActive && head) head.insertAdjacentHTML("beforeend", `<span class="overview-active-tag">${t("overview.activeTag")}</span>`);
  });
});

function renderCharacterCard(c) {
  if (c.error) {
    return `
      <div class="overview-card">
        <div class="overview-card-head">
          ${portraitImg(c.characterId, 48, "overview-portrait")}
          <div class="overview-card-titles">
            <span class="overview-card-name" title="${c.characterName}">${c.characterName}</span>
          </div>
        </div>
        <p class="risk-high">${c.error}</p>
      </div>`;
  }
  const slotsPct = c.orderSlots ? Math.min(100, (c.orderSlots.totalSlots / c.orderSlots.maxPossibleSlots) * 100) : 0;
  const isActive = c.characterId === state.selectedCharacterId;
  return `
    <div class="overview-card ${isActive ? "overview-card-active" : ""}" data-character-id="${c.characterId}">
      <div class="overview-card-head overview-card-head-clickable" data-select-character title="${t("overview.selectCharacterHint")}">
        ${portraitImg(c.characterId, 48, "overview-portrait")}
        <div class="overview-card-titles">
          <span class="overview-card-name" title="${c.characterName}">${c.characterName}</span>
          ${
            c.corporationName
              ? `<span class="overview-card-corp" title="${c.corporationName}">${c.corporationId ? corpLogoImg(c.corporationId, 16, "overview-corp-logo") : ""}<span class="overview-card-corp-text">${c.corporationName}</span></span>`
              : ""
          }
        </div>
        ${isActive ? `<span class="overview-active-tag">${t("overview.activeTag")}</span>` : ""}
      </div>
      <div class="overview-stat-row">
        <div class="stat"><span class="stat-value">${c.walletBalance !== null ? isk(c.walletBalance) : "-"}</span><span class="stat-label">${t("overview.wallet")}</span></div>
        <div class="stat"><span class="stat-value">${c.totalSp !== null ? num(c.totalSp) : "-"}</span><span class="stat-label">${t("overview.skillpoints")}</span></div>
        <div class="stat"><span class="stat-value">${num(c.assetCount)}</span><span class="stat-label">${t("overview.assetsStat")}</span></div>
        ${c.assetValue ? `<div class="stat"><span class="stat-value">${isk(c.assetValue)}</span><span class="stat-label">${t("overview.assetValueStat")}</span></div>` : ""}
      </div>
      ${
        c.orderSlots
          ? `<div class="slot-bar-track small"><div class="slot-bar-fill" style="width:${slotsPct}%"></div></div>
             <p class="muted small-text">${t("overview.ordersUsed", { used: c.orderSlots.totalSlots, max: c.orderSlots.maxPossibleSlots })}</p>`
          : ""
      }
      <p class="muted small-text">${t("overview.activeOrders", { count: c.activeOrders.count, sell: c.activeOrders.sellCount, buy: c.activeOrders.buyCount, value: isk(c.activeOrders.sellValue) })}</p>
      <div class="overview-card-actions">
        <button class="link-btn" data-goto-skills>${t("overview.goSkills")}</button>
        <button class="link-btn" data-goto-assets>${t("overview.goAssets")}</button>
      </div>
    </div>`;
}

// Zeigt nur die Kennzahlen, fuer die tatsaechlich Daten vorliegen. Fehlt dem
// verbindenden Charakter schlicht die Corp-Rolle (kein technischer Fehler),
// wird das nicht als erklaerender Hinweistext angezeigt - die betroffene
// Kennzahl (Wallet oder Assets) wird einfach weggelassen. Gleiche Karten-
// Optik wie die Charakter-Karten, statt einer schlichten Liste.
function renderCorp(corp) {
  const walletRows = corp.wallets
    ? corp.wallets.map((w) => `<tr><td>${w.name}</td><td>${isk(w.balance)}</td></tr>`).join("")
    : "";
  const totalBalance = corp.wallets ? corp.wallets.reduce((sum, w) => sum + w.balance, 0) : null;

  const statTiles = [
    totalBalance !== null
      ? `<div class="stat"><span class="stat-value">${isk(totalBalance)}</span><span class="stat-label">${t("overview.corpBalanceStat")}</span></div>`
      : "",
    corp.assetCount !== null
      ? `<div class="stat"><span class="stat-value">${num(corp.assetCount)}</span><span class="stat-label">${t("overview.corpAssetsStat")}</span></div>`
      : "",
    corp.assetValue !== null && corp.assetValue !== undefined
      ? `<div class="stat"><span class="stat-value">${isk(corp.assetValue)}</span><span class="stat-label">${t("overview.corpAssetValueStat")}</span></div>`
      : "",
  ]
    .filter(Boolean)
    .join("");

  return `
    <div class="overview-card">
      <div class="overview-card-head">
        ${corpLogoImg(corp.corporationId, 48, "overview-portrait")}
        <div class="overview-card-titles">
          <span class="overview-card-name" title="${corp.corporationName ?? ""}">${corp.corporationName ?? "#" + corp.corporationId}</span>
          <span class="overview-card-corp"><span class="overview-card-corp-text">${t("overview.corpPrefix")}</span></span>
        </div>
      </div>
      ${statTiles ? `<div class="overview-stat-row">${statTiles}</div>` : ""}
      ${
        corp.wallets
          ? `<table><thead><tr><th>${t("overview.corpWalletDivision")}</th><th>${t("overview.corpBalance")}</th></tr></thead><tbody>${walletRows}</tbody></table>`
          : ""
      }
    </div>`;
}

function jumpTo(characterId, tabName) {
  selectCharacter(characterId);
  activateTab(tabName);
}

function wireCardActions(root) {
  root.querySelectorAll(".overview-card[data-character-id]").forEach((card) => {
    const characterId = Number(card.dataset.characterId);
    card.querySelector("[data-goto-skills]")?.addEventListener("click", () => jumpTo(characterId, "skills"));
    card.querySelector("[data-goto-assets]")?.addEventListener("click", () => jumpTo(characterId, "assets"));
    card.querySelector("[data-select-character]")?.addEventListener("click", () => selectCharacter(characterId));
  });
}

export async function loadOverview() {
  const el = document.getElementById("overviewContent");
  el.innerHTML = skeleton(5);
  try {
    const data = await api.getOverview();
    if (data.characters.length === 0) {
      el.innerHTML = `<div class="empty">${t("overview.empty")}</div>`;
      return;
    }
    const cardsHtml = data.characters.map(renderCharacterCard).join("");
    const corpsHtml = data.corps.map(renderCorp).join("");
    const corpsSection = corpsHtml
      ? `<h3 class="section-label">${t("overview.corpsHeading")}</h3><div class="overview-grid">${corpsHtml}</div>`
      : "";
    el.innerHTML = `<div class="overview-grid">${cardsHtml}</div>${corpsSection}`;
    wireCardActions(el);
  } catch (err) {
    el.innerHTML = errorBlock(t("common.error", { message: err.message }));
  }
}
