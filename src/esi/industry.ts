import { esiGetAuthed, esiGetPublic } from "./client.js";

export interface SystemCostIndexEntry {
  activity: string;
  cost_index: number;
}

export interface SystemCostIndices {
  solar_system_id: number;
  cost_indices: SystemCostIndexEntry[];
}

// Der komplette Datensatz (alle Sonnensysteme) kommt in einem einzigen
// Request und aendert sich nur langsam (CCP aktualisiert taeglich) - daher
// simpler In-Memory-Cache statt bei jeder Anfrage neu zu laden.
let cache: { data: SystemCostIndices[]; fetchedAt: number } | null = null;
const CACHE_TTL_MS = 60 * 60 * 1000;

export async function getAllCostIndices(): Promise<SystemCostIndices[]> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache.data;
  const data = await esiGetPublic<SystemCostIndices[]>(`/industry/systems/`);
  cache = { data, fetchedAt: Date.now() };
  return data;
}

export function findCostIndices(all: SystemCostIndices[], systemId: number): SystemCostIndexEntry[] {
  return all.find((s) => s.solar_system_id === systemId)?.cost_indices ?? [];
}

export interface BlueprintEntry {
  item_id: number;
  type_id: number;
  location_id: number;
  location_flag: string;
  quantity: number;
  material_efficiency: number;
  time_efficiency: number;
  runs: number;
}

export function getCharacterBlueprints(characterId: number): Promise<BlueprintEntry[]> {
  return esiGetAuthed<BlueprintEntry[]>(characterId, `/characters/${characterId}/blueprints/`);
}
