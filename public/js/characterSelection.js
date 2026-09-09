import { state } from "./state.js";
import { characterPortraitUrl } from "./images.js";

const characterSelectEl = document.getElementById("characterSelect");
const headerPortraitEl = document.getElementById("headerPortrait");
const listeners = [];

/**
 * Registriert eine Funktion, die bei jeder Charakterauswahl laeuft (Header-
 * Dropdown, Klick auf eine Overview-Karte, "Go to Skills/Assets"). Bewusst
 * leichtgewichtig halten - das Nachladen der Skills/Assets/Blueprints-Tabs
 * haengt main.js separat an den Header-Select (siehe dort), weil dort ein
 * sichtbarer Tab-Inhalt ohne Tab-Wechsel veralten koennte.
 */
export function onCharacterSelected(fn) {
  listeners.push(fn);
}

export function updateHeaderPortrait() {
  if (!headerPortraitEl) return;
  if (state.selectedCharacterId) {
    headerPortraitEl.src = characterPortraitUrl(state.selectedCharacterId, 64);
    headerPortraitEl.classList.remove("hidden");
  } else {
    headerPortraitEl.classList.add("hidden");
  }
}

/**
 * Waehlt einen Charakter aus - gemeinsamer Pfad fuer das Header-Dropdown,
 * einen Klick auf eine Overview-Karte und die "Go to Skills/Assets"-Buttons,
 * damit ueberall konsistent Auswahl-Status, Header-Portrait und die
 * Active-Markierung in der Overview aktualisiert werden.
 */
export function selectCharacter(characterId) {
  if (!characterId || characterId === state.selectedCharacterId) return;
  state.selectedCharacterId = characterId;
  if (characterSelectEl) characterSelectEl.value = String(characterId);
  updateHeaderPortrait();
  listeners.forEach((fn) => fn());
}
