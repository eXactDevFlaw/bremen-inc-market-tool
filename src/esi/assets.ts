import { esiGetAllPagesAuthed } from "./client.js";
import { resolveNames } from "./universe.js";

export interface AssetEntry {
  item_id: number;
  type_id: number;
  quantity: number;
  location_id: number;
  location_flag: string;
  location_type: string;
  is_singleton: boolean;
}

export interface AssetWithName extends AssetEntry {
  type_name: string;
}

export function getCharacterAssets(characterId: number): Promise<AssetEntry[]> {
  return esiGetAllPagesAuthed<AssetEntry>(characterId, `/characters/${characterId}/assets/`);
}

export async function getCharacterAssetsWithNames(characterId: number): Promise<AssetWithName[]> {
  const assets = await getCharacterAssets(characterId);
  const uniqueTypeIds = [...new Set(assets.map((a) => a.type_id))];
  const names = await resolveNames(uniqueTypeIds);
  return assets.map((a) => ({ ...a, type_name: names.get(a.type_id) ?? `Type ${a.type_id}` }));
}
