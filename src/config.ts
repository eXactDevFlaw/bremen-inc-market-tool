import "dotenv/config";

// Fest registrierte EVE-Developer-Application (PKCE, kein Secret enthalten -
// unkritisch, diese ID darf im verteilten Programm stehen). Callback-URL bei
// CCP ist exakt http://localhost:<DEFAULT_PORT>/auth/callback registriert.
// TODO: durch die tatsaechliche Client-ID der "Bremen Inc. Market-Tool"-App ersetzen.
export const BUILT_IN_EVE_CLIENT_ID = "REPLACE_WITH_REGISTERED_EVE_CLIENT_ID";

export const DEFAULT_PORT = 34199;

export const config = {
  port: Number(process.env.PORT ?? DEFAULT_PORT),
  eve: {
    // Nur fuer Entwickler/Self-Hosting relevant, die eine eigene EVE-App nutzen wollen.
    callbackUrlOverride: process.env.EVE_CALLBACK_URL,
  },
};

export function getCallbackUrl(): string {
  return config.eve.callbackUrlOverride ?? `http://localhost:${config.port}/auth/callback`;
}

export const ESI_SCOPES = [
  "esi-skills.read_skills.v1",
  "esi-skills.read_skillqueue.v1",
  "esi-assets.read_assets.v1",
  "esi-wallet.read_character_wallet.v1",
  "esi-location.read_location.v1",
] as const;
