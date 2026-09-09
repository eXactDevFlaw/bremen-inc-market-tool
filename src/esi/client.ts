import { getCharacter, upsertCharacter } from "../db/index.js";
import { refreshAccessToken } from "../auth/eveSso.js";

const ESI_BASE = "https://esi.evetech.net/latest";

export class EsiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function ensureFreshToken(characterId: number): Promise<string> {
  const character = getCharacter(characterId);
  if (!character) {
    throw new EsiError(404, `Charakter ${characterId} ist nicht verbunden`);
  }
  const bufferMs = 60_000;
  if (Date.now() + bufferMs < character.token_expires_at) {
    return character.access_token;
  }
  const refreshed = await refreshAccessToken(character.refresh_token);
  upsertCharacter({
    character_id: character.character_id,
    character_name: character.character_name,
    access_token: refreshed.access_token,
    refresh_token: refreshed.refresh_token,
    token_expires_at: Date.now() + refreshed.expires_in * 1000,
    scopes: character.scopes,
  });
  return refreshed.access_token;
}

async function request<T>(pathname: string, accessToken?: string): Promise<{ data: T; pages: number }> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const res = await fetch(`${ESI_BASE}${pathname}`, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new EsiError(res.status, `ESI ${pathname} -> ${res.status}: ${text}`);
  }
  const pages = Number(res.headers.get("x-pages") ?? "1");
  const data = (await res.json()) as T;
  return { data, pages };
}

export async function esiGetPublic<T>(pathname: string): Promise<T> {
  const { data } = await request<T>(pathname);
  return data;
}

export async function esiGetAuthed<T>(characterId: number, pathname: string): Promise<T> {
  const token = await ensureFreshToken(characterId);
  const { data } = await request<T>(pathname, token);
  return data;
}

/** For ESI endpoints that paginate arrays via the X-Pages header. */
export async function esiGetAllPagesAuthed<T>(characterId: number, pathname: string): Promise<T[]> {
  const token = await ensureFreshToken(characterId);
  const separator = pathname.includes("?") ? "&" : "?";
  const first = await request<T[]>(`${pathname}${separator}page=1`, token);
  const results = [...first.data];
  for (let page = 2; page <= first.pages; page++) {
    const next = await request<T[]>(`${pathname}${separator}page=${page}`, token);
    results.push(...next.data);
  }
  return results;
}

export async function esiPostPublic<T>(pathname: string, body: unknown): Promise<T> {
  const res = await fetch(`${ESI_BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new EsiError(res.status, `ESI ${pathname} -> ${res.status}: ${text}`);
  }
  return (await res.json()) as T;
}

export async function esiGetAllPagesPublic<T>(pathname: string): Promise<T[]> {
  const separator = pathname.includes("?") ? "&" : "?";
  const first = await request<T[]>(`${pathname}${separator}page=1`);
  const results = [...first.data];
  for (let page = 2; page <= first.pages; page++) {
    const next = await request<T[]>(`${pathname}${separator}page=${page}`);
    results.push(...next.data);
  }
  return results;
}

/**
 * Wie esiGetAllPagesPublic, laedt die Folgeseiten aber mit begrenzter
 * Parallelitaet statt strikt sequenziell. Noetig fuer sehr grosse oeffentliche
 * Endpunkte wie den kompletten Orderbuch-Dump einer Region (Jita/The Forge
 * hat je nach Marktaktivitaet mehrere hundert Seiten) - sequenziell waere das
 * viel zu langsam. Seite 1 wird zuerst geladen (liefert ueber den
 * X-Pages-Header die Gesamtzahl), danach holt ein kleiner Worker-Pool die
 * restlichen Seiten parallel.
 */
export async function esiGetAllPagesPublicConcurrent<T>(pathname: string, concurrency = 15): Promise<T[]> {
  const separator = pathname.includes("?") ? "&" : "?";
  const first = await request<T[]>(`${pathname}${separator}page=1`);
  if (first.pages <= 1) return first.data;

  const pageNumbers = Array.from({ length: first.pages - 1 }, (_, i) => i + 2);
  const pageResults: T[][] = new Array(pageNumbers.length);
  let cursor = 0;
  async function worker() {
    while (cursor < pageNumbers.length) {
      const idx = cursor++;
      const page = pageNumbers[idx] as number;
      const next = await request<T[]>(`${pathname}${separator}page=${page}`);
      pageResults[idx] = next.data;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, pageNumbers.length) }, worker));
  return [first.data, ...pageResults].flat();
}
