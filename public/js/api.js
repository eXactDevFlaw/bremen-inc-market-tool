import { getLang } from "./i18n.js";

async function getJson(url) {
  const res = await fetch(url);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

async function postJson(url, data) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}

/** Haengt an jede GET-Anfrage automatisch die aktuelle UI-Sprache an, damit
 * vom Backend generierte Fliesstexte (summary/reasoning/note...) zur UI passen. */
function withLang(params = {}) {
  return new URLSearchParams({ ...params, lang: getLang() });
}

export const api = {
  getCharacters: () => getJson("/api/characters"),
  getSkills: (characterId, focus) => getJson(`/api/characters/${characterId}/skills?${withLang(focus ? { focus } : {}).toString()}`),
  getAssets: (characterId) => getJson(`/api/characters/${characterId}/assets`),
  getSettings: () => getJson("/api/settings"),
  saveSettings: (data) => postJson("/api/settings", data),
  getOverview: () => getJson("/api/overview"),
  getTradeHubs: () => getJson("/api/universe/hubs"),
  searchLocations: (term) => getJson(`/api/universe/search?q=${encodeURIComponent(term)}&${withLang().toString()}`),
  searchItems: (term) => getJson(`/api/universe/search-items?q=${encodeURIComponent(term)}&${withLang().toString()}`),
  getTradingOpportunities: (params) => getJson(`/api/trading/opportunities?${withLang(params).toString()}`),
  getAiTradeAnalysis: (payload) => postJson(`/api/trading/ai-analysis?${withLang().toString()}`, payload),
  getMarketHistory: (params) => getJson(`/api/trading/history?${withLang(params).toString()}`),
  getRoute: (params) => getJson(`/api/trading/route?${withLang(params).toString()}`),
  getCostIndices: (location) => {
    const params = location
      ? { locationCategory: location.category, locationId: location.id, locationLabel: location.name }
      : {};
    return getJson(`/api/industry/cost-indices?${withLang(params).toString()}`);
  },
  getBlueprints: (characterId) => getJson(`/api/industry/blueprints?characterId=${characterId}`),
};
