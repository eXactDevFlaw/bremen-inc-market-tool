import { api } from "./api.js";
import { state } from "./state.js";
import { onTabActivate, activateTab } from "./tabs.js";
import { loadSkills } from "./skills.js";
import { loadAssets } from "./assets.js";
import { loadOverview } from "./overview.js";
import { loadBlueprints, initIndustryTab } from "./industry.js";
import { loadSettingsStatus } from "./settings.js";
import { initMarketTab } from "./market.js";
import { getLang, setLang, applyStaticTranslations, t } from "./i18n.js";
import { selectCharacter, updateHeaderPortrait } from "./characterSelection.js";
import "./trading.js";

const characterSelect = document.getElementById("characterSelect");

async function refreshCharacterDependentTabs() {
  await Promise.all([loadSkills(), loadAssets(), loadBlueprints()]);
}

async function loadCharacters() {
  state.characters = await api.getCharacters();
  characterSelect.innerHTML = "";
  if (state.characters.length === 0) {
    characterSelect.innerHTML = `<option value="">${t("common.noPilotConnected")}</option>`;
    document.getElementById("rescopeBanner").classList.add("hidden");
    updateHeaderPortrait();
    return;
  }
  for (const c of state.characters) {
    const opt = document.createElement("option");
    opt.value = c.characterId;
    opt.textContent = c.characterName.toUpperCase();
    characterSelect.appendChild(opt);
  }
  selectCharacter(state.characters[0].characterId);

  const anyOutdated = state.characters.some((c) => c.scopesUpToDate === false);
  document.getElementById("rescopeBanner").classList.toggle("hidden", !anyOutdated);

  await refreshCharacterDependentTabs();
}

// Bewusst zusaetzlich zum gemeinsamen selectCharacter()-Pfad: aendert sich
// der Charakter waehrend z.B. der Skills-Tab schon sichtbar ist (kein
// Tab-Wechsel, also kein activateTab-Trigger), muss dessen Inhalt trotzdem
// neu geladen werden.
characterSelect.addEventListener("change", async () => {
  selectCharacter(Number(characterSelect.value));
  await refreshCharacterDependentTabs();
});

onTabActivate("overview", loadOverview);
onTabActivate("skills", loadSkills);
onTabActivate("assets", loadAssets);
onTabActivate("industry", () => {
  initIndustryTab();
  loadBlueprints();
});
onTabActivate("market", initMarketTab);

// ---------- Sprachwahl (Header-Kurzwahl + Settings-Select teilen sich denselben Zustand) ----------

const headerLangSelect = document.getElementById("langSelect");
const settingsLangSelect = document.getElementById("settingsLangSelect");

function syncLangSelects() {
  const lang = getLang();
  if (headerLangSelect) headerLangSelect.value = lang;
  if (settingsLangSelect) settingsLangSelect.value = lang;
}

function reloadActiveTabContent() {
  const activeTabBtn = document.querySelector("nav.tabs .tab.active");
  const name = activeTabBtn?.dataset.tab;
  if (!name) return;
  if (name === "overview") loadOverview();
  else if (name === "skills") loadSkills();
  else if (name === "industry") {
    initIndustryTab();
    loadBlueprints();
  }
  // assets/trading/market/settings enthalten keine Backend-generierten
  // Fliesstexte, die sich mit der Sprache aendern wuerden, bzw. haengen von
  // einer Nutzerauswahl ab (nicht sinnvoll automatisch neu zu laden).
}

headerLangSelect?.addEventListener("change", () => {
  setLang(headerLangSelect.value);
  applyStaticTranslations();
  syncLangSelects();
  reloadActiveTabContent();
});

document.addEventListener("langchange", () => {
  syncLangSelects();
  reloadActiveTabContent();
});

applyStaticTranslations();
syncLangSelects();

// Startet auf dem Overview-Tab (bereits im HTML als aktiv markiert).
activateTab("overview");

loadSettingsStatus();
loadCharacters();
