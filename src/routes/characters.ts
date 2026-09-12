import { Router } from "express";
import { getCharacter, listCharacters } from "../db/index.js";
import { getCharacterSkillQueue, getCharacterSkills, getCharacterWalletBalance } from "../esi/character.js";
import { getCharacterAssetsWithNames } from "../esi/assets.js";
import { resolveAssetLocations } from "../esi/locations.js";
import { resolveNames } from "../esi/universe.js";
import { EsiError } from "../esi/client.js";
import { buildFocusedSkillPlan, buildTradingSkillProfile, type ProfitFocus } from "../trading/skillAdvisor.js";
import { getAllTypePrices } from "../trading/marketData.js";
import { assetUnitValue } from "../economics/assetValue.js";
import { ESI_SCOPES } from "../config.js";
import { parseLang } from "../i18n.js";

export const charactersRouter = Router();

const CURRENT_SCOPES = ESI_SCOPES.join(" ");

const VALID_FOCI: ProfitFocus[] = ["trading", "hauling", "production"];
function parseFocus(raw: unknown): ProfitFocus | null {
  return typeof raw === "string" && (VALID_FOCI as string[]).includes(raw) ? (raw as ProfitFocus) : null;
}

charactersRouter.get("/", (_req, res) => {
  const characters = listCharacters().map((c) => ({
    characterId: c.character_id,
    characterName: c.character_name,
    corporationName: c.corporation_name,
    // false = Charakter wurde vor einer Scope-Erweiterung verbunden (z.B. Corp-/Struktur-Zugriff)
    // - manche neueren Funktionen greifen dann erst nach erneutem "+ CHARAKTER VERBINDEN".
    scopesUpToDate: c.scopes === CURRENT_SCOPES,
  }));
  res.json(characters);
});

charactersRouter.get("/:id/skills", async (req, res) => {
  const characterId = Number(req.params.id);
  const lang = parseLang(req.query.lang);
  const focus = parseFocus(req.query.focus);
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
    const character = getCharacter(characterId);
    const tradingSkills = buildTradingSkillProfile(levelByName, character?.race_id ?? null, lang);
    const focusedPlan = focus ? buildFocusedSkillPlan(levelByName, focus, lang, character?.race_id ?? null) : null;

    res.json({
      totalSp: skills.total_sp,
      unallocatedSp: skills.unallocated_sp ?? 0,
      skills: namedSkills.sort((a, b) => b.skillpoints_in_skill - a.skillpoints_in_skill),
      queue,
      tradingSkills,
      focusedPlan,
    });
  } catch (err) {
    handleEsiError(err, res);
  }
});

charactersRouter.get("/:id/assets", async (req, res) => {
  const characterId = Number(req.params.id);
  try {
    const character = getCharacter(characterId);
    const [assets, prices] = await Promise.all([
      getCharacterAssetsWithNames(characterId),
      getAllTypePrices().catch(() => new Map<number, number>()),
    ]);
    const locations = await resolveAssetLocations(characterId, assets, character?.scopes ?? "");
    const withLocations = assets.map((a) => {
      const unitPrice = prices.get(a.type_id) ?? null;
      return {
        ...a,
        ...(locations.get(a.item_id) ?? {
          locationKind: "unknown" as const,
          systemId: null,
          systemName: null,
          placeName: "Unbekannter Ort",
          regionId: null,
          regionName: null,
        }),
        unitPrice,
        // Gemeinsame Bewertungslogik (Blueprint-Original/-Kopie -1/-2 als 1
        // Stueck gewertet) - siehe economics/assetValue.ts. Vorher hier und
        // in routes/overview.ts unabhaengig dupliziert.
        totalValue: assetUnitValue(unitPrice, a.quantity),
      };
    });
    res.json(withLocations);
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
