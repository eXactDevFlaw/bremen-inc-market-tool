import { Router } from "express";
import { findTradeCandidates } from "../trading/analyzer.js";
import { getAiTradeRecommendations, MissingAnthropicKeyError } from "../ai/tradeAdvisor.js";
import { getCharacterWalletBalance } from "../esi/character.js";
import { DEFAULT_WATCHLIST } from "../trading/hubs.js";

export const tradingRouter = Router();

tradingRouter.get("/opportunities", async (req, res) => {
  try {
    const watchlistParam = req.query.watchlist as string | undefined;
    const watchlist = watchlistParam ? watchlistParam.split(",").map((s) => s.trim()) : DEFAULT_WATCHLIST;

    const characterId = req.query.characterId ? Number(req.query.characterId) : undefined;
    const walletBalance = characterId
      ? await getCharacterWalletBalance(characterId).catch(() => undefined)
      : undefined;

    const candidates = await findTradeCandidates(watchlist);
    const aiResult = await getAiTradeRecommendations(candidates, walletBalance);

    res.json({ candidateCount: candidates.length, walletBalance, ...aiResult });
  } catch (err) {
    if (err instanceof MissingAnthropicKeyError) {
      res.status(400).json({ error: err.message, code: "missing_anthropic_key" });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});
