import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";
import { getAppDir } from "../appDir.js";

const dataDir = path.join(getAppDir(), "data");
fs.mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(path.join(dataDir, "market-tool.sqlite"));
db.exec("PRAGMA journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS characters (
    character_id INTEGER PRIMARY KEY,
    character_name TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at INTEGER NOT NULL,
    scopes TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS oauth_states (
    state TEXT PRIMARY KEY,
    code_verifier TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS type_name_cache (
    type_id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
`);

export function getSetting(key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
  ).run(key, value);
}

export function deleteSetting(key: string): void {
  db.prepare(`DELETE FROM settings WHERE key = ?`).run(key);
}

export interface CharacterRow {
  character_id: number;
  character_name: string;
  access_token: string;
  refresh_token: string;
  token_expires_at: number;
  scopes: string;
  created_at: number;
}

export function upsertCharacter(row: Omit<CharacterRow, "created_at">): void {
  db.prepare(
    `INSERT INTO characters (character_id, character_name, access_token, refresh_token, token_expires_at, scopes)
     VALUES ($character_id, $character_name, $access_token, $refresh_token, $token_expires_at, $scopes)
     ON CONFLICT(character_id) DO UPDATE SET
       character_name = excluded.character_name,
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       token_expires_at = excluded.token_expires_at,
       scopes = excluded.scopes`,
  ).run(row);
}

export function getCharacter(characterId: number): CharacterRow | undefined {
  return db
    .prepare(`SELECT * FROM characters WHERE character_id = ?`)
    .get(characterId) as CharacterRow | undefined;
}

export function listCharacters(): CharacterRow[] {
  return db.prepare(`SELECT * FROM characters ORDER BY character_name`).all() as unknown as CharacterRow[];
}

export function deleteCharacter(characterId: number): void {
  db.prepare(`DELETE FROM characters WHERE character_id = ?`).run(characterId);
}

export function saveOauthState(state: string, codeVerifier: string): void {
  db.prepare(`INSERT INTO oauth_states (state, code_verifier) VALUES (?, ?)`).run(
    state,
    codeVerifier,
  );
}

export function consumeOauthState(state: string): string | undefined {
  const row = db.prepare(`SELECT code_verifier FROM oauth_states WHERE state = ?`).get(state) as
    | { code_verifier: string }
    | undefined;
  if (row) {
    db.prepare(`DELETE FROM oauth_states WHERE state = ?`).run(state);
  }
  return row?.code_verifier;
}

export function getCachedTypeName(typeId: number): string | undefined {
  const row = db.prepare(`SELECT name FROM type_name_cache WHERE type_id = ?`).get(typeId) as
    | { name: string }
    | undefined;
  return row?.name;
}

export function cacheTypeNames(entries: { typeId: number; name: string }[]): void {
  if (entries.length === 0) return;
  const insert = db.prepare(
    `INSERT INTO type_name_cache (type_id, name) VALUES (?, ?)
     ON CONFLICT(type_id) DO UPDATE SET name = excluded.name`,
  );
  db.exec("BEGIN");
  try {
    for (const r of entries) insert.run(r.typeId, r.name);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}
