import { Router } from "express";
import { getSettingsStatus, setAnthropicApiKey, setEveClientIdOverride } from "../settings.js";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json(getSettingsStatus());
});

settingsRouter.post("/", (req, res) => {
  const { anthropicApiKey, eveClientId } = req.body as {
    anthropicApiKey?: string;
    eveClientId?: string;
  };

  if (anthropicApiKey !== undefined) {
    setAnthropicApiKey(anthropicApiKey.trim() || null);
  }
  if (eveClientId !== undefined) {
    setEveClientIdOverride(eveClientId.trim() || null);
  }

  res.json(getSettingsStatus());
});
