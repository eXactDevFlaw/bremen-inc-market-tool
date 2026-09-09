// Loest fuer Charakter-Assets (inkl. verschachtelter Items in Schiffen/
// Containern) den tatsaechlichen Ort auf: NPC-Station, Sonnensystem (Space)
// oder Spieler-Struktur (Citadel). Fuer Struktur-Namen wird der Scope
// esi-universe.read_structures.v1 benoetigt - ohne diesen (z.B. weil der
// Charakter vor der Scope-Erweiterung verbunden wurde) gibt es einen
// nachvollziehbaren Fallback statt eines Fehlers.
import { esiGetAuthed, esiGetPublic, EsiError } from "./client.js";
import { getRegionForSystem, resolveNames } from "./universe.js";
import type { AssetEntry } from "./assets.js";

export interface AssetLocation {
  locationKind: "station" | "structure" | "system" | "unknown";
  systemId: number | null;
  systemName: string | null;
  placeName: string;
  regionId: number | null;
  regionName: string | null;
}

export type AssetWithLocation = AssetEntry & AssetLocation;

interface StationInfo {
  station_id: number;
  name: string;
  system_id: number;
}

interface StructureInfo {
  name: string;
  solar_system_id: number;
}

const stationCache = new Map<number, StationInfo>();
const structureCache = new Map<number, StructureInfo | null>();

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function getStationInfo(stationId: number): Promise<StationInfo | null> {
  if (stationCache.has(stationId)) return stationCache.get(stationId)!;
  try {
    const info = await esiGetPublic<StationInfo>(`/universe/stations/${stationId}/`);
    stationCache.set(stationId, info);
    return info;
  } catch {
    return null;
  }
}

async function getStructureInfo(characterId: number, structureId: number): Promise<StructureInfo | null> {
  if (structureCache.has(structureId)) return structureCache.get(structureId)!;
  try {
    const info = await esiGetAuthed<StructureInfo>(characterId, `/universe/structures/${structureId}/`);
    structureCache.set(structureId, info);
    return info;
  } catch (err) {
    // 403/404 = keine Sichtbarkeit/kein Scope - kein technischer Fehler, einfach unbekannt.
    if (err instanceof EsiError && (err.status === 403 || err.status === 404)) {
      structureCache.set(structureId, null);
      return null;
    }
    structureCache.set(structureId, null);
    return null;
  }
}

/**
 * Findet fuer jedes Asset das oberste (nicht in einem anderen Asset
 * verschachtelte) Root-Item und gibt dessen ESI-Location zurueck.
 */
function findRoot(asset: AssetEntry, byItemId: Map<number, AssetEntry>): AssetEntry {
  let current = asset;
  const visited = new Set<number>();
  let depth = 0;
  while (current.location_type === "item" && depth < 15 && !visited.has(current.item_id)) {
    visited.add(current.item_id);
    const parent = byItemId.get(current.location_id);
    if (!parent) break;
    current = parent;
    depth++;
  }
  return current;
}

export async function resolveAssetLocations(
  characterId: number,
  assets: AssetEntry[],
  characterScopes: string,
): Promise<Map<number, AssetLocation>> {
  const byItemId = new Map(assets.map((a) => [a.item_id, a]));
  const canReadStructures = characterScopes.includes("esi-universe.read_structures.v1");

  // Root pro Asset ermitteln (dedupliziert nach root.location_id, damit wir
  // jede Station/Struktur/System nur einmal aufloesen).
  const rootByAssetId = new Map<number, AssetEntry>();
  for (const asset of assets) {
    rootByAssetId.set(asset.item_id, findRoot(asset, byItemId));
  }

  const stationIds = new Set<number>();
  const structureIds = new Set<number>();
  const directSystemIds = new Set<number>();

  for (const root of rootByAssetId.values()) {
    if (root.location_type === "station") stationIds.add(root.location_id);
    else if (root.location_type === "solar_system") directSystemIds.add(root.location_id);
    else if (root.location_type === "item") continue; // Root nicht auflösbar (Kette abgebrochen)
    else structureIds.add(root.location_id); // "other" - typischerweise Spieler-Struktur
  }

  const stationInfos = await mapWithConcurrency([...stationIds], 5, (id) => getStationInfo(id));
  let structureInfos: (StructureInfo | null)[] = [];
  if (canReadStructures) {
    structureInfos = await mapWithConcurrency([...structureIds], 3, (id) => getStructureInfo(characterId, id));
  } else if (structureIds.size > 0) {
    structureInfos = [...structureIds].map(() => null);
  }

  const stationById = new Map<number, StationInfo | null>();
  [...stationIds].forEach((id, i) => stationById.set(id, stationInfos[i] ?? null));
  const structureById = new Map<number, StructureInfo | null>();
  [...structureIds].forEach((id, i) => structureById.set(id, structureInfos[i] ?? null));

  const allSystemIds = new Set<number>([
    ...directSystemIds,
    ...[...stationById.values()].filter((s): s is StationInfo => !!s).map((s) => s.system_id),
    ...[...structureById.values()].filter((s): s is StructureInfo => !!s).map((s) => s.solar_system_id),
  ]);
  const systemNames = await resolveNames([...allSystemIds]);

  // Region pro System aufloesen (fuer die Assets-Karte: Gruppierung nach
  // Region statt einer langen Flat-Liste). getRegionForSystem cached intern,
  // trotzdem hier begrenzt parallelisiert, um ESI nicht mit vielen
  // gleichzeitigen System-/Konstellations-Abfragen zu fluten.
  const regionBySystemId = new Map<number, number>();
  await mapWithConcurrency([...allSystemIds], 5, async (systemId) => {
    try {
      regionBySystemId.set(systemId, await getRegionForSystem(systemId));
    } catch {
      // Region nicht aufloesbar (z.B. exotisches Wormhole-System) - dann bleibt sie einfach unbekannt.
    }
  });
  const regionNames = await resolveNames([...new Set(regionBySystemId.values())]);

  function regionFor(systemId: number | null): { regionId: number | null; regionName: string | null } {
    if (systemId === null) return { regionId: null, regionName: null };
    const regionId = regionBySystemId.get(systemId) ?? null;
    return { regionId, regionName: regionId !== null ? (regionNames.get(regionId) ?? null) : null };
  }

  const result = new Map<number, AssetLocation>();
  for (const asset of assets) {
    const root = rootByAssetId.get(asset.item_id)!;
    let location: AssetLocation;

    if (root.location_type === "station") {
      const info = stationById.get(root.location_id) ?? null;
      const systemId = info?.system_id ?? null;
      location = {
        locationKind: "station",
        systemId,
        systemName: info ? (systemNames.get(info.system_id) ?? null) : null,
        placeName: info?.name ?? `Station #${root.location_id}`,
        ...regionFor(systemId),
      };
    } else if (root.location_type === "solar_system") {
      location = {
        locationKind: "system",
        systemId: root.location_id,
        systemName: systemNames.get(root.location_id) ?? null,
        placeName: systemNames.get(root.location_id) ?? `System #${root.location_id}`,
        ...regionFor(root.location_id),
      };
    } else if (root.location_type === "item") {
      location = { locationKind: "unknown", systemId: null, systemName: null, placeName: "Unbekannter Ort", regionId: null, regionName: null };
    } else {
      const info = structureById.get(root.location_id) ?? null;
      const systemId = info?.solar_system_id ?? null;
      location = {
        locationKind: "structure",
        systemId,
        systemName: info ? (systemNames.get(info.solar_system_id) ?? null) : null,
        placeName: info?.name ?? (canReadStructures ? `Struktur #${root.location_id} (kein Zugriff)` : `Spieler-Struktur #${root.location_id} (Scope fehlt - Charakter neu verbinden)`),
        ...regionFor(systemId),
      };
    }
    result.set(asset.item_id, location);
  }
  return result;
}
