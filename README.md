# Bremen Inc. Market-Tool

Installierbares EVE-Online-Tool: verbindet Charaktere per EVE SSO, zeigt Skills (inkl.
Market-Order-Slot-Analyse), Assets an, und berechnet mit echten ESI-Marktdaten + Claude
(Anthropic) lukrative Handelsmoeglichkeiten. Laeuft komplett lokal beim Nutzer - keine
Zentralinstanz, keine Nutzerkonten, keine geteilten Daten.

## Fuer Endnutzer (eigenstaendige Programmdatei)

1. Passende Datei aus den Releases herunterladen (`bremen-inc-market-tool` bzw. `.exe`)
   und den `public/`-Ordner daneben legen (beides zusammen entpacken/kopieren).
2. Datei ausfuehren - startet einen lokalen Server und oeffnet automatisch den Browser.
3. Im Tab **SETTINGS** den eigenen (kostenlosen) Anthropic API Key eintragen
   (console.anthropic.com) - noetig fuer den Tab "Trade Analysis". Ohne Key funktionieren
   Skills/Assets trotzdem.
4. Ueber "+ CHARAKTER VERBINDEN" per EVE SSO einloggen. Die EVE-App-Registrierung ist
   bereits eingebaut - dafuer ist nichts weiter noetig.
5. Alle Daten (Tokens, Einstellungen, Cache) liegen lokal in `data/` neben der Programmdatei.

## Fuer Entwickler (aus dem Quellcode starten)

```bash
npm install
npm run dev
```

Oeffnet automatisch `http://localhost:34199`. Auch hier reicht der Settings-Tab fuer den
Anthropic Key. Fuer eine eigene EVE-Developer-Application (statt der eingebauten) optional
eine `.env` anlegen (siehe `.env.example`) mit `EVE_CLIENT_ID` - dann bei
developers.eveonline.com/applications eine PKCE-Application mit Callback
`http://localhost:34199/auth/callback` und den Scopes aus `src/config.ts` registrieren.

## Eigenstaendige Binary bauen

```bash
npm run build:binary
```

Baut mit Node's Single-Executable-Feature (`node --build-sea`) eine Datei fuer die
**aktuell laufende Plattform** unter `dist-bin/<platform>/`. Node SEA kann nicht
cross-kompilieren - fuer Windows- und macOS-Builds muss der Befehl auf der jeweiligen
Zielplattform laufen (oder in einer CI-Matrix, z.B. GitHub Actions mit
`windows-latest`/`macos-latest`/`ubuntu-latest`). Der `public/`-Ordner wird automatisch
neben die Executable kopiert - beides muss zusammen ausgeliefert werden.

### Publisher-Setup (einmalig, fuer wer das Tool verteilt)

Damit Nutzer nicht selbst eine EVE-Developer-Application anlegen muessen, registriert der
Maintainer einmalig eine gemeinsame App:

1. developers.eveonline.com/applications -> Create New Application, PKCE-faehig.
2. Scopes: `esi-skills.read_skills.v1`, `esi-skills.read_skillqueue.v1`,
   `esi-assets.read_assets.v1`, `esi-wallet.read_character_wallet.v1`,
   `esi-location.read_location.v1`.
3. Callback URL exakt: `http://localhost:34199/auth/callback`
   (funktioniert fuer jede Installation, da `localhost` immer auf den Rechner des jeweiligen
   Nutzers zeigt - PKCE braucht kein Secret, die Client-ID ist unkritisch im Code).
4. Die resultierende Client-ID in `src/config.ts` bei `BUILT_IN_EVE_CLIENT_ID` eintragen.

**Wichtig:** Ein Anthropic API Key darf niemals in die Binary eingebaut werden - jeder
Nutzer traegt seinen eigenen Key im Settings-Tab ein (lokal in seiner eigenen `data/`-DB
gespeichert, verlaesst den eigenen Rechner nur fuer Anfragen an api.anthropic.com).

## Architektur

- `src/appDir.ts` - loest den App-Ordner auf (Verzeichnis der Executable bei SEA-Build,
  Projektwurzel im Dev-Modus) - `data/` und `public/` liegen relativ dazu.
- `src/settings.ts` - Aufloesung von EVE-Client-ID/Anthropic-Key: lokale DB-Einstellung >
  Env-Var > eingebauter Default (nur EVE-Client-ID hat einen Default).
- `src/auth/` - EVE SSO OAuth2/PKCE-Flow.
- `src/esi/` - ESI-API-Client (Charakterdaten, Assets, Universe-Namensaufloesung).
- `src/trading/` - Marktdaten-Abruf, Spread/Arbitrage-Berechnung, Order-Slot-Analyse.
- `src/ai/` - Claude-Anbindung fuer die Trade-Empfehlungen (strukturierte JSON-Antwort).
- `src/db/` - lokale SQLite-Datenbank (`node:sqlite`, keine native Abhaengigkeit) fuer
  Tokens, Settings und Namens-Cache.
- `public/` - Web-Dashboard (EVE-HUD-Optik, kein Build-Schritt fuer die UI selbst).
- `scripts/build-binary.mjs` - esbuild-Bundling + Node SEA Packaging.

## Hinweise

- Die Standard-Watchlist fuer die Handelsanalyse liegt in `src/trading/hubs.ts`
  (`DEFAULT_WATCHLIST`).
- Jede Installation ist komplett unabhaengig - keine geteilten Daten zwischen Nutzern.
