import { deleteSetting, getSetting, setSetting } from "./db/index.js";
import { BUILT_IN_EVE_CLIENT_ID } from "./config.js";

const EVE_CLIENT_ID_KEY = "eve_client_id";
const ANTHROPIC_API_KEY_KEY = "anthropic_api_key";
const GROQ_API_KEY_KEY = "groq_api_key";

/** DB-Override > Env-Var > eingebaute Standard-App. Erst wenn keine davon greift: null. */
export function getEveClientId(): string | null {
  const fromDb = getSetting(EVE_CLIENT_ID_KEY);
  if (fromDb) return fromDb;
  if (process.env.EVE_CLIENT_ID) return process.env.EVE_CLIENT_ID;
  if (BUILT_IN_EVE_CLIENT_ID && !BUILT_IN_EVE_CLIENT_ID.startsWith("REPLACE_WITH_")) {
    return BUILT_IN_EVE_CLIENT_ID;
  }
  return null;
}

export function setEveClientIdOverride(clientId: string | null): void {
  if (clientId) setSetting(EVE_CLIENT_ID_KEY, clientId);
  else deleteSetting(EVE_CLIENT_ID_KEY);
}

/** DB > Env-Var. Es gibt bewusst keinen eingebauten Default - der Key bleibt lokal beim Nutzer. */
export function getAnthropicApiKey(): string | null {
  const fromDb = getSetting(ANTHROPIC_API_KEY_KEY);
  if (fromDb) return fromDb;
  if (process.env.ANTHROPIC_API_KEY) return process.env.ANTHROPIC_API_KEY;
  return null;
}

export function setAnthropicApiKey(apiKey: string | null): void {
  if (apiKey) setSetting(ANTHROPIC_API_KEY_KEY, apiKey);
  else deleteSetting(ANTHROPIC_API_KEY_KEY);
}

/** DB > Env-Var. Kostenloser API Key (console.groq.com) fuer die optionale KI-Tagesanalyse im Trade-Analysis-Tab. */
export function getGroqApiKey(): string | null {
  const fromDb = getSetting(GROQ_API_KEY_KEY);
  if (fromDb) return fromDb;
  if (process.env.GROQ_API_KEY) return process.env.GROQ_API_KEY;
  return null;
}

export function setGroqApiKey(apiKey: string | null): void {
  if (apiKey) setSetting(GROQ_API_KEY_KEY, apiKey);
  else deleteSetting(GROQ_API_KEY_KEY);
}

export interface SettingsStatus {
  eveClientIdConfigured: boolean;
  eveClientIdSource: "override" | "built-in" | "none";
  anthropicKeyConfigured: boolean;
  groqKeyConfigured: boolean;
}

export function getSettingsStatus(): SettingsStatus {
  const dbClientId = getSetting(EVE_CLIENT_ID_KEY) ?? process.env.EVE_CLIENT_ID;
  const clientId = getEveClientId();
  return {
    eveClientIdConfigured: clientId !== null,
    eveClientIdSource: dbClientId ? "override" : clientId ? "built-in" : "none",
    anthropicKeyConfigured: getAnthropicApiKey() !== null,
    groqKeyConfigured: getGroqApiKey() !== null,
  };
}
