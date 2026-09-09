import { Router } from "express";
import { getSettingsStatus, setAnthropicApiKey, setEveClientIdOverride, setGroqApiKey } from "../settings.js";

export const settingsRouter = Router();

settingsRouter.get("/", (_req, res) => {
  res.json(getSettingsStatus());
});

settingsRouter.post("/", (req, res) => {
  const { anthropicApiKey, groqApiKey, eveClientId } = req.body as {
    anthropicApiKey?: string;
    groqApiKey?: string;
    eveClientId?: string;
  };

  if (anthropicApiKey !== undefined) {
    setAnthropicApiKey(anthropicApiKey.trim() || null);
  }
  if (groqApiKey !== undefined) {
    setGroqApiKey(groqApiKey.trim() || null);
  }
  if (eveClientId !== undefined) {
    setEveClientIdOverride(eveClientId.trim() || null);
  }

  res.json(getSettingsStatus());
});
