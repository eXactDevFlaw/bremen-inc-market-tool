import { Router } from "express";
import { listCharacters } from "../db/index.js";
import { getCharacterSkillQueue, getCharacterSkills, getCharacterWalletBalance } from "../esi/character.js";
import { getCharacterAssetsWithNames } from "../esi/assets.js";
import { resolveNames } from "../esi/universe.js";
import { EsiError } from "../esi/client.js";
import { computeOrderSlotAnalysis } from "../trading/orderSlots.js";

export const charactersRouter = Router();

charactersRouter.get("/", (_req, res) => {
  const characters = listCharacters().map((c) => ({
    characterId: c.character_id,
    characterName: c.character_name,
  }));
  res.json(characters);
});

charactersRouter.get("/:id/skills", async (req, res) => {
  const characterId = Number(req.params.id);
  try {
    const [skills, queue] = await Promise.all([
      getCharacterSkills(characterId),
      getCharacterSkillQueue(characterId),
    ]);
    const skillIds = skills.skills.map((s) => s.skill_id);
    const names = await resolveNames(skillIds);
    const namedSkills = skills.skills.map((s) => ({
      ...s,
      name: names.get(s.skill_id) ?? `Skill ${s.skill_id}`,
    }));

    const levelByName = new Map(namedSkills.map((s) => [s.name, s.active_skill_level]));
    const orderSlots = computeOrderSlotAnalysis(levelByName);

    res.json({
      totalSp: skills.total_sp,
      unallocatedSp: skills.unallocated_sp ?? 0,
      skills: namedSkills.sort((a, b) => b.skillpoints_in_skill - a.skillpoints_in_skill),
      queue,
      orderSlots,
    });
  } catch (err) {
    handleEsiError(err, res);
  }
});

charactersRouter.get("/:id/assets", async (req, res) => {
  const characterId = Number(req.params.id);
  try {
    const assets = await getCharacterAssetsWithNames(characterId);
    res.json(assets);
  } catch (err) {
    handleEsiError(err, res);
  }
});

charactersRouter.get("/:id/wallet", async (req, res) => {
  const characterId = Number(req.params.id);
  try {
    const balance = await getCharacterWalletBalance(characterId);
    res.json({ balance });
  } catch (err) {
    handleEsiError(err, res);
  }
});

function handleEsiError(err: unknown, res: import("express").Response): void {
  if (err instanceof EsiError) {
    res.status(err.status >= 400 && err.status < 600 ? err.status : 502).json({ error: err.message });
    return;
  }
  res.status(500).json({ error: (err as Error).message });
}
