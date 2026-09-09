import "dotenv/config";

// Fest registrierte EVE-Developer-Application (PKCE, kein Secret enthalten -
// unkritisch, diese ID darf im verteilten Programm stehen). Callback-URL bei
// CCP ist exakt http://localhost:<DEFAULT_PORT>/auth/callback registriert.
export const BUILT_IN_EVE_CLIENT_ID = "9ff4d52f15504800a2421a69ab9d3b6b";

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
  // Fuer die Namensaufloesung von Spieler-Strukturen (Citadels) in der
  // Asset-Uebersicht. Charaktere, die VOR dieser Aenderung verbunden wurden,
  // muessen sich einmal neu verbinden, damit ihr Token diesen Scope hat -
  // bis dahin greift ein Fallback ("Scope fehlt") statt eines Fehlers.
  "esi-universe.read_structures.v1",
  // Ab hier: Ausbaustufe "Overview/Corp/Industry". Ebenfalls erst nach
  // erneutem Connect wirksam.
  "esi-markets.read_character_orders.v1", // eigene aktive Market-Orders (Overview)
  "esi-characters.read_blueprints.v1", // eigene Blueprints (Industry-Tab)
  "esi-wallet.read_corporation_wallets.v1", // Corp-Wallet (braucht Accountant/Junior_Accountant-Rolle)
  "esi-assets.read_corporation_assets.v1", // Corp-Assets (braucht Director-Rolle)
  "esi-corporations.read_divisions.v1", // Namen der Wallet-/Hangar-Divisions (braucht Director-Rolle)
  // Fuer die Orts-/Item-Suche (Trade Analysis, Market-Tab): ESI hat die frueher
  // unauthentifizierte /search/ komplett abgeschaltet, /characters/{id}/search/
  // verlangt dafuer diesen Scope - auch fuer Region/System/Station/Item-Suche,
  // nicht nur fuer Spieler-Strukturen. Ebenfalls erst nach erneutem Connect wirksam.
  "esi-search.search_structures.v1",
] as const;
