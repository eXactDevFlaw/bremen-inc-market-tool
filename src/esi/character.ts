import { esiGetAuthed } from "./client.js";

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

export function getCharacterSkills(characterId: number): Promise<CharacterSkills> {
  return esiGetAuthed<CharacterSkills>(characterId, `/characters/${characterId}/skills/`);
}

export function getCharacterSkillQueue(characterId: number): Promise<SkillQueueEntry[]> {
  return esiGetAuthed<SkillQueueEntry[]>(characterId, `/characters/${characterId}/skillqueue/`);
}

export function getCharacterWalletBalance(characterId: number): Promise<number> {
  return esiGetAuthed<number>(characterId, `/characters/${characterId}/wallet/`);
}
