import { api } from "./api.js";
import { t, setLang, applyStaticTranslations } from "./i18n.js";

export async function loadSettingsStatus() {
  const status = await api.getSettings();

  const anthropicStatus = document.getElementById("anthropicKeyStatus");
  anthropicStatus.textContent = status.anthropicKeyConfigured ? t("settings.statusConfigured") : t("settings.statusNotConfigured");
  anthropicStatus.className = `status-tag ${status.anthropicKeyConfigured ? "ok" : "missing"}`;

  const groqStatus = document.getElementById("groqKeyStatus");
  groqStatus.textContent = status.groqKeyConfigured ? t("settings.statusConfigured") : t("settings.statusNotConfigured");
  groqStatus.className = `status-tag ${status.groqKeyConfigured ? "ok" : "missing"}`;

  const eveStatus = document.getElementById("eveClientIdStatus");
  eveStatus.textContent =
    status.eveClientIdSource === "override" ? t("settings.statusOwnApp") : status.eveClientIdSource === "built-in" ? t("settings.statusDefaultApp") : t("settings.statusNotConfigured");
  eveStatus.className = `status-tag ${status.eveClientIdConfigured ? "ok" : "missing"}`;

  document.getElementById("setupBanner").classList.toggle("hidden", status.eveClientIdConfigured);
  return status;
}

document.getElementById("saveSettings").addEventListener("click", async () => {
  const result = document.getElementById("settingsSaveResult");
  const anthropicKey = document.getElementById("anthropicKeyInput").value;
  const groqKey = document.getElementById("groqKeyInput").value;
  const eveClientId = document.getElementById("eveClientIdInput").value;
  result.textContent = t("settings.saving");
  try {
    await api.saveSettings({ anthropicApiKey: anthropicKey, groqApiKey: groqKey, eveClientId });
    document.getElementById("anthropicKeyInput").value = "";
    document.getElementById("groqKeyInput").value = "";
    document.getElementById("eveClientIdInput").value = "";
    await loadSettingsStatus();
    result.textContent = t("settings.saved");
  } catch (err) {
    result.textContent = t("settings.error", { message: err.message });
  }
});

// Sprachwahl in den Settings (zusaetzlich zur Kurzwahl im Header) - beide
// Stellen teilen sich denselben localStorage-Wert ueber i18n.js.
const settingsLangSelect = document.getElementById("settingsLangSelect");
if (settingsLangSelect) {
  settingsLangSelect.addEventListener("change", () => {
    setLang(settingsLangSelect.value);
    applyStaticTranslations();
    document.dispatchEvent(new CustomEvent("langchange"));
  });
}
