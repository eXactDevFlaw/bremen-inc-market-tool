import { Router } from "express";
import {
  buildAuthorizationUrl,
  decodeCharacterFromAccessToken,
  exchangeCodeForToken,
  generatePkcePair,
  generateState,
  MissingEveClientIdError,
} from "../auth/eveSso.js";
import { consumeOauthState, deleteCharacter, saveOauthState, upsertCharacter } from "../db/index.js";
import { ESI_SCOPES } from "../config.js";

export const authRouter = Router();

authRouter.get("/login", (_req, res) => {
  try {
    const { codeVerifier, codeChallenge } = generatePkcePair();
    const state = generateState();
    saveOauthState(state, codeVerifier);
    res.redirect(buildAuthorizationUrl(state, codeChallenge));
  } catch (err) {
    if (err instanceof MissingEveClientIdError) {
      res.redirect("/?setup=eve_client_id");
      return;
    }
    res.status(500).send((err as Error).message);
  }
});

authRouter.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  if (!code || !state) {
    res.status(400).send("Fehlender code/state Parameter");
    return;
  }

  const codeVerifier = consumeOauthState(state);
  if (!codeVerifier) {
    res.status(400).send("Ungueltiger oder abgelaufener OAuth-State");
    return;
  }

  try {
    const tokens = await exchangeCodeForToken(code, codeVerifier);
    const identity = decodeCharacterFromAccessToken(tokens.access_token);
    upsertCharacter({
      character_id: identity.characterId,
      character_name: identity.characterName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: Date.now() + tokens.expires_in * 1000,
      scopes: ESI_SCOPES.join(" "),
    });
    res.redirect("/?connected=" + encodeURIComponent(identity.characterName));
  } catch (err) {
    res.status(500).send(`Login fehlgeschlagen: ${(err as Error).message}`);
  }
});

authRouter.post("/logout/:characterId", (req, res) => {
  deleteCharacter(Number(req.params.characterId));
  res.json({ ok: true });
});
