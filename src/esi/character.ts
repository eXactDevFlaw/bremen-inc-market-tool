import { esiGetAuthed, esiGetPublic } from "./client.js";
import { resolveNames } from "./universe.js";

export interface SkillEntry {
  skill_id: number;
  active_skill_level: number;
  trained_skill_level: number;
  skillpoints_in_skill: number;
}

export interface CharacterSkills {
  skills: SkillEntry[];
  total_sp: number;
  unallocated_sp?: number;
}

export interface SkillQueueEntry {
  skill_id: number;
  finished_level: number;
  queue_position: number;
  start_date?: string;
  finish_date?: string;
  level_start_sp?: number;
  level_end_sp?: number;
  training_start_sp?: number;
}

export interface CharacterPublicInfo {
  name: string;
  corporation_id: number;
  alliance_id?: number;
  race_id: number;
  birthday: string;
}

export interface CharacterMarketOrder {
  order_id: number;
  type_id: number;
  region_id: number;
  location_id: number;
  is_buy_order: boolean;
  price: number;
  volume_remain: number;
  volume_total: number;
  issued: string;
  duration: number;
  range: string;
  escrow?: number;
}

export function getCharacterSkills(characterId: number): Promise<CharacterSkills> {
  return esiGetAuthed<CharacterSkills>(characterId, `/characters/${characterId}/skills/`);
}

export function getCharacterSkillQueue(characterId: number): Promise<SkillQueueEntry[]> {
  return esiGetAuthed<SkillQueueEntry[]>(characterId, `/characters/${characterId}/skillqueue/`);
}

export function getCharacterWalletBalance(characterId: number): Promise<number> {
  return esiGetAuthed<number>(characterId, `/characters/${characterId}/wallet/`);
}

/** Oeffentliche Grunddaten (kein Auth noetig) - u.a. Corp-Zugehoerigkeit und Rasse. */
export function getCharacterPublicInfo(characterId: number): Promise<CharacterPublicInfo> {
  return esiGetPublic<CharacterPublicInfo>(`/characters/${characterId}/`);
}

export function getCharacterMarketOrders(characterId: number): Promise<CharacterMarketOrder[]> {
  return esiGetAuthed<CharacterMarketOrder[]>(characterId, `/characters/${characterId}/orders/`);
}

/** Skill-Level nach Skill-Name - Basis fuer Gebuehren-/Order-Slot-Berechnungen. */
export async function getSkillLevelsByName(characterId: number): Promise<Map<string, number>> {
  const skills = await getCharacterSkills(characterId);
  const names = await resolveNames(skills.skills.map((s) => s.skill_id));
  const map = new Map<string, number>();
  for (const s of skills.skills) {
    const name = names.get(s.skill_id);
    if (name) map.set(name, s.active_skill_level);
  }
  return map;
}
