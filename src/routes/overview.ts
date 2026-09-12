import { Router } from "express";
import { listCharacters } from "../db/index.js";
import { getCharacterMarketOrders, getCharacterSkills, getCharacterWalletBalance } from "../esi/character.js";
import { getCharacterAssets } from "../esi/assets.js";
import { getCorpAssets, getCorpWalletsWithNames } from "../esi/corp.js";
import { resolveNames } from "../esi/universe.js";
import { computeOrderSlotAnalysis, type OrderSlotAnalysis } from "../trading/orderSlots.js";
import { getAllTypePrices } from "../trading/marketData.js";
import { totalAssetValue } from "../economics/assetValue.js";

export const overviewRouter = Router();

// Aggregierte Sicht ueber ALLE verbundenen Charaktere (nicht nur den aktiven)
// plus Corp-Block, wenn ein verbundener Charakter einer Corp angehoert und
// die noetige Rolle hat. Einzelne fehlgeschlagene Abfragen (z.B. abgelaufener
// Token, fehlende Rolle) werfen den ganzen Endpoint nicht um - der jeweilige
// Block bekommt stattdessen eine Fehlermeldung/einen Hinweis.
//
// Fehlt einem Charakter schlicht die Corp-Rolle fuer Wallet/Assets (kein
// technischer Fehler, sondern "keine Berechtigung"), wird das NICHT als
// erklaerender Hinweistext im UI angezeigt - der Corp-Block bzw. die
// betroffene Kennzahl wird dann einfach weggelassen, statt den Nutzer mit
// einer Rollen-Erklaerung zu konfrontieren, die er nicht aendern kann.
overviewRouter.get("/", async (_req, res) => {
  const characters = listCharacters();
  const prices = await getAllTypePrices().catch(() => new Map<number, number>());

  const characterSummaries = await Promise.all(
    characters.map(async (c) => {
      try {
        const [skills, wallet, orders, assets] = await Promise.all([
          getCharacterSkills(c.character_id).catch(() => null),
          getCharacterWalletBalance(c.character_id).catch(() => null),
          getCharacterMarketOrders(c.character_id).catch(() => []),
          getCharacterAssets(c.character_id).catch(() => []),
        ]);

        let orderSlots: OrderSlotAnalysis | null = null;
        if (skills) {
          const names = await resolveNames(skills.skills.map((s) => s.skill_id));
          const levelByName = new Map(skills.skills.map((s) => [names.get(s.skill_id) ?? "", s.active_skill_level]));
          orderSlots = computeOrderSlotAnalysis(levelByName);
        }

        const sellOrders = orders.filter((o) => !o.is_buy_order);
        const buyOrders = orders.filter((o) => o.is_buy_order);

        return {
          characterId: c.character_id,
          characterName: c.character_name,
          corporationId: c.corporation_id,
          corporationName: c.corporation_name,
          totalSp: skills?.total_sp ?? null,
          walletBalance: wallet,
          orderSlots,
          activeOrders: {
            count: orders.length,
            sellCount: sellOrders.length,
            buyCount: buyOrders.length,
            sellValue: sellOrders.reduce((sum, o) => sum + o.price * o.volume_remain, 0),
            buyValue: buyOrders.reduce((sum, o) => sum + o.price * o.volume_remain, 0),
          },
          assetCount: assets.length,
          assetValue: totalAssetValue(assets, prices),
        };
      } catch (err) {
        return {
          characterId: c.character_id,
          characterName: c.character_name,
          error: (err as Error).message,
        };
      }
    }),
  );

  const corpGroups = new Map<number, { corporationId: number; corporationName: string | null; actingCharacterId: number }>();
  for (const c of characters) {
    if (c.corporation_id && !corpGroups.has(c.corporation_id)) {
      corpGroups.set(c.corporation_id, {
        corporationId: c.corporation_id,
        corporationName: c.corporation_name,
        actingCharacterId: c.character_id,
      });
    }
  }

  const corpResults = await Promise.all(
    [...corpGroups.values()].map(async (group) => {
      const [wallets, assets] = await Promise.all([
        getCorpWalletsWithNames(group.actingCharacterId, group.corporationId).catch(() => null),
        getCorpAssets(group.actingCharacterId, group.corporationId).catch(() => null),
      ]);

      return {
        corporationId: group.corporationId,
        corporationName: group.corporationName,
        wallets,
        assetCount: assets ? assets.length : null,
        assetValue: assets ? totalAssetValue(assets, prices) : null,
      };
    }),
  );

  // Corps, bei denen weder Wallet noch Assets abrufbar sind (keine passende
  // Rolle), werden komplett weggelassen statt mit einer leeren Karte samt
  // Rollen-Hinweis angezeigt zu werden.
  const corps = corpResults.filter((c) => c.wallets !== null || c.assetCount !== null);

  res.json({ characters: characterSummaries, corps });
});
