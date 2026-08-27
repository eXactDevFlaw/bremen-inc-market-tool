import { esiGetPublic, esiPostPublic } from "./client.js";
import { cacheTypeNames, getCachedTypeName } from "../db/index.js";

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
