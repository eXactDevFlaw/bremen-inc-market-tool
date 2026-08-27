import crypto from "node:crypto";
import { ESI_SCOPES, getCallbackUrl } from "../config.js";
import { getEveClientId } from "../settings.js";

const AUTHORIZE_URL = "https://login.eveonline.com/v2/oauth/authorize";
const TOKEN_URL = "https://login.eveonline.com/v2/oauth/token";

export interface PkcePair {
  codeVerifier: string;
  codeChallenge: string;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface CharacterIdentity {
  characterId: number;
  characterName: string;
}

function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function generatePkcePair(): PkcePair {
  const codeVerifier = base64UrlEncode(crypto.randomBytes(32));
  const codeChallenge = base64UrlEncode(
    crypto.createHash("sha256").update(codeVerifier).digest(),
  );
  return { codeVerifier, codeChallenge };
}

export function generateState(): string {
  return base64UrlEncode(crypto.randomBytes(16));
}

export class MissingEveClientIdError extends Error {
  constructor() {
    super("Keine EVE Client-ID konfiguriert - bitte in den Einstellungen hinterlegen");
  }
}

function requireClientId(): string {
  const clientId = getEveClientId();
  if (!clientId) throw new MissingEveClientIdError();
  return clientId;
}

export function buildAuthorizationUrl(state: string, codeChallenge: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", getCallbackUrl());
  url.searchParams.set("client_id", requireClientId());
  url.searchParams.set("scope", ESI_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

async function postForm(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Host: "login.eveonline.com",
    },
    body: new URLSearchParams(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`EVE SSO Token-Request fehlgeschlagen (${res.status}): ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

export function exchangeCodeForToken(code: string, codeVerifier: string): Promise<TokenResponse> {
  return postForm({
    grant_type: "authorization_code",
    code,
    client_id: requireClientId(),
    code_verifier: codeVerifier,
  });
}

export function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  return postForm({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: requireClientId(),
  });
}

/**
 * EVE SSO access tokens are JWTs signed by CCP. We only need the claims and the
 * token arrives directly from EVE's token endpoint over TLS, so we decode the
 * payload without re-verifying the signature.
 */
export function decodeCharacterFromAccessToken(accessToken: string): CharacterIdentity {
  const parts = accessToken.split(".");
  if (parts.length !== 3 || !parts[1]) {
    throw new Error("Access Token ist kein gueltiges JWT");
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
    sub: string;
    name: string;
  };
  const characterId = Number(payload.sub.split(":").pop());
  return { characterId, characterName: payload.name };
}
