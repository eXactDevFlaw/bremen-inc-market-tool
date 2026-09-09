import { esiGetAuthed, esiGetPublic, esiPostPublic } from "./client.js";
import { cacheTypeNames, getCachedTypeName, listCharacters } from "../db/index.js";
import { TRADE_HUBS } from "../trading/hubs.js";

interface UniverseNameEntry {
  id: number;
  name: string;
  category: string;
}

const CHUNK_SIZE = 1000;

/** Resolves type/skill/location IDs to names, using the local cache first. */
export async function resolveNames(ids: number[]): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const missing: number[] = [];

  for (const id of ids) {
    const cached = getCachedTypeName(id);
    if (cached) result.set(id, cached);
    else missing.push(id);
  }

  for (let i = 0; i < missing.length; i += CHUNK_SIZE) {
    const chunk = missing.slice(i, i + CHUNK_SIZE);
    if (chunk.length === 0) continue;
    const resolved = await esiPostPublic<UniverseNameEntry[]>("/universe/names/", chunk);
    const toCache = resolved.map((r) => ({ typeId: r.id, name: r.name }));
    cacheTypeNames(toCache);
    for (const r of resolved) result.set(r.id, r.name);
  }

  return result;
}

export async function resolveName(id: number): Promise<string> {
  const map = await resolveNames([id]);
  return map.get(id) ?? `#${id}`;
}

interface UniverseIdsResponse {
  inventory_types?: { id: number; name: string }[];
}

/** Resolves item names to type IDs via ESI /universe/ids/ (exact name match, case-sensitive). */
export async function resolveTypeIdsByName(names: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  for (let i = 0; i < names.length; i += CHUNK_SIZE) {
    const chunk = names.slice(i, i + CHUNK_SIZE);
    const resolved = await esiPostPublic<UniverseIdsResponse>("/universe/ids/", chunk);
    for (const t of resolved.inventory_types ?? []) {
      result.set(t.name, t.id);
      cacheTypeNames([{ typeId: t.id, name: t.name }]);
    }
  }
  return result;
}

export interface TypeInfo {
  type_id: number;
  name: string;
  volume?: number;
}

export function getTypeInfo(typeId: number): Promise<TypeInfo> {
  return esiGetPublic<TypeInfo>(`/universe/types/${typeId}/`);
}

// ---------- Freitextsuche (Regionen/Systeme/Stationen) ----------

export type SearchCategory = "region" | "solar_system" | "station";

export interface SearchResult {
  id: number;
  name: string;
  category: SearchCategory;
}

const SEARCH_CATEGORIES: SearchCategory[] = ["region", "solar_system", "station"];

// ESI's /search/ lehnt Suchbegriffe unter 3 Zeichen mit einem Fehler ab
// (nicht nur "keine Treffer") - z.B. "ji" fuer Jita schlaegt fehl, "jit"
// funktioniert. Deshalb hier UND im Frontend (autocomplete.js) einheitlich
// ein Minimum von 3 durchsetzen, statt den Fehler bis zum Nutzer durchsickern
// zu lassen.
const MIN_SEARCH_LENGTH = 3;

// CCP hat die frueher oeffentliche, unauthentifizierte /search/ komplett
// abgeschaltet (seit einigen Jahren nur noch ueber einen eingeloggten
// Charakter erreichbar) - jeder Aufruf schlug deshalb hart fehl, nicht nur
// bei kurzen Suchbegriffen. Fix: ueber /characters/{id}/search/ mit dem
// Token eines beliebigen verbundenen Charakters suchen (das Ergebnis fuer
// Region/System/Station/Item-Typ haengt nicht davon ab, WELCHER Charakter
// authentifiziert, nur bei der Kategorie "structure" waere das relevant -
// die wird hier nicht genutzt). Kein zusaetzlicher ESI-Scope noetig, ein
// gueltiges Token reicht.
class NoCharacterConnectedError extends Error {
  constructor() {
    super("Kein Charakter verbunden - fuer die Suche wird ein verbundener Charakter benoetigt.");
  }
}

function pickAnyCharacterId(): number {
  const first = listCharacters()[0];
  if (!first) throw new NoCharacterConnectedError();
  return first.character_id;
}

/** Freitextsuche ueber die authentifizierte ESI /characters/{id}/search/. */
export async function searchLocations(term: string): Promise<SearchResult[]> {
  const trimmed = term.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) return [];

  const characterId = pickAnyCharacterId();
  const params = new URLSearchParams({
    categories: SEARCH_CATEGORIES.join(","),
    search: trimmed,
    strict: "false",
  });
  const data = await esiGetAuthed<Partial<Record<SearchCategory, number[]>>>(characterId, `/characters/${characterId}/search/?${params.toString()}`);

  const hits: { id: number; category: SearchCategory }[] = [];
  for (const category of SEARCH_CATEGORIES) {
    for (const id of data[category] ?? []) hits.push({ id, category });
  }
  if (hits.length === 0) return [];

  const names = await resolveNames(hits.map((h) => h.id));
  return hits
    .map((h) => ({ id: h.id, category: h.category, name: names.get(h.id) ?? `#${h.id}` }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25);
}

export interface ItemSearchResult {
  typeId: number;
  name: string;
}

/**
 * Freitextsuche fuer Item-Typen (fuer den Item-Picker im Market-Tab: Preis-
 * Verlauf und Zwei-Orte-Rechner). Nutzt dieselbe authentifizierte ESI-Suche
 * mit category=inventory_type (siehe Kommentar bei searchLocations).
 */
export async function searchItemTypes(term: string): Promise<ItemSearchResult[]> {
  const trimmed = term.trim();
  if (trimmed.length < MIN_SEARCH_LENGTH) return [];

  const characterId = pickAnyCharacterId();
  const params = new URLSearchParams({
    categories: "inventory_type",
    search: trimmed,
    strict: "false",
  });
  const data = await esiGetAuthed<{ inventory_type?: number[] }>(characterId, `/characters/${characterId}/search/?${params.toString()}`);
  const ids = data.inventory_type ?? [];
  if (ids.length === 0) return [];

  const names = await resolveNames(ids.slice(0, 50));
  return [...names.entries()]
    .map(([typeId, name]) => ({ typeId, name }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 25);
}

/** Die 5 grossen Handelsknotenpunkte im selben Format wie ein Freitextsuche-Treffer - so lassen sie sich im Orts-Dropdown vorab anzeigen, ohne dass der Nutzer erst tippen muss. */
export function getTradeHubSearchResults(): SearchResult[] {
  return TRADE_HUBS.map((h) => ({ id: h.stationId, name: h.name, category: "station" as const }));
}

// ---------- Ort -> Region aufloesen (fuer die Trade Analysis an frei waehlbaren Orten) ----------

interface StationLookup {
  station_id: number;
  system_id: number;
}

interface SystemLookup {
  system_id: number;
  constellation_id: number;
}

interface ConstellationLookup {
  constellation_id: number;
  region_id: number;
}

const systemToRegionCache = new Map<number, number>();
const constellationToRegionCache = new Map<number, number>();

export async function getRegionForSystem(systemId: number): Promise<number> {
  const cached = systemToRegionCache.get(systemId);
  if (cached !== undefined) return cached;

  const system = await esiGetPublic<SystemLookup>(`/universe/systems/${systemId}/`);
  let regionId = constellationToRegionCache.get(system.constellation_id);
  if (regionId === undefined) {
    const constellation = await esiGetPublic<ConstellationLookup>(`/universe/constellations/${system.constellation_id}/`);
    regionId = constellation.region_id;
    constellationToRegionCache.set(system.constellation_id, regionId);
  }
  systemToRegionCache.set(systemId, regionId);
  return regionId;
}

export interface ResolvedLocation {
  regionId: number;
  systemId: number | null;
  stationId: number | null;
  label: string;
}

const stationSystemCache = new Map<number, number>();

/** Loest eine Station live gegen ESI auf ihr Sonnensystem auf (gecacht) - so muessen Stations-IDs nirgends als zweite, ungeprüfte Konstante mitgefuehrt werden. */
export async function getSystemIdForStation(stationId: number): Promise<number> {
  const cached = stationSystemCache.get(stationId);
  if (cached !== undefined) return cached;
  const station = await esiGetPublic<StationLookup>(`/universe/stations/${stationId}/`);
  stationSystemCache.set(stationId, station.system_id);
  return station.system_id;
}

/** Loest ein Suchergebnis (Region/System/Station) zur Region auf, die die Trade-Analyse fuer ESI-Marktabfragen braucht. */
export async function resolveLocation(category: SearchCategory, id: number, label: string): Promise<ResolvedLocation> {
  if (category === "region") {
    return { regionId: id, systemId: null, stationId: null, label };
  }
  if (category === "solar_system") {
    const regionId = await getRegionForSystem(id);
    return { regionId, systemId: id, stationId: null, label };
  }
  const systemId = await getSystemIdForStation(id);
  const regionId = await getRegionForSystem(systemId);
  return { regionId, systemId, stationId: id, label };
}
