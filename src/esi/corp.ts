// Corp-Endpoints - erfordern jeweils eine bestimmte Corp-Rolle des
// verbundenen Charakters (Director fuer Assets/Divisions, Accountant oder
// Junior_Accountant fuer Wallets). Fehlt die Rolle, antwortet ESI mit 403 -
// das behandeln aufrufende Routen als "nicht verfuegbar", nicht als Fehler.
import { esiGetAllPagesAuthed, esiGetAuthed } from "./client.js";
import { resolveNames } from "./universe.js";
import type { AssetEntry } from "./assets.js";

export interface CorpDivisions {
  wallet?: { division: number; name: string }[];
  hangar?: { division: number; name: string }[];
}

export interface CorpWallet {
  division: number;
  balance: number;
}

export interface CorpWalletWithName extends CorpWallet {
  name: string;
}

export function getCorpDivisions(characterId: number, corporationId: number): Promise<CorpDivisions> {
  return esiGetAuthed<CorpDivisions>(characterId, `/corporations/${corporationId}/divisions/`);
}

export function getCorpWallets(characterId: number, corporationId: number): Promise<CorpWallet[]> {
  return esiGetAuthed<CorpWallet[]>(characterId, `/corporations/${corporationId}/wallets/`);
}

/** Wallets mit den vom Spieler vergebenen Division-Namen (z.B. "Trading", "Master Wallet"). */
export async function getCorpWalletsWithNames(characterId: number, corporationId: number): Promise<CorpWalletWithName[]> {
  const [wallets, divisions] = await Promise.all([
    getCorpWallets(characterId, corporationId),
    getCorpDivisions(characterId, corporationId).catch(() => ({}) as CorpDivisions),
  ]);
  const nameByDivision = new Map((divisions.wallet ?? []).map((d) => [d.division, d.name]));
  return wallets
    .map((w) => ({ ...w, name: nameByDivision.get(w.division) ?? `Division ${w.division}` }))
    .sort((a, b) => a.division - b.division);
}

export interface CorpAssetEntry extends AssetEntry {
  is_blueprint_copy?: boolean;
}

export function getCorpAssets(characterId: number, corporationId: number): Promise<CorpAssetEntry[]> {
  return esiGetAllPagesAuthed<CorpAssetEntry>(characterId, `/corporations/${corporationId}/assets/`);
}

export interface CorpAssetWithName extends CorpAssetEntry {
  type_name: string;
}

export async function getCorpAssetsWithNames(characterId: number, corporationId: number): Promise<CorpAssetWithName[]> {
  const assets = await getCorpAssets(characterId, corporationId);
  const uniqueTypeIds = [...new Set(assets.map((a) => a.type_id))];
  const names = await resolveNames(uniqueTypeIds);
  return assets.map((a) => ({ ...a, type_name: names.get(a.type_id) ?? `Type ${a.type_id}` }));
}
