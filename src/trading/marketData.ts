import { esiGetAllPagesPublic, esiGetAllPagesPublicConcurrent, esiGetPublic } from "../esi/client.js";

export interface MarketOrder {
  order_id: number;
  type_id: number;
  location_id: number;
  is_buy_order: boolean;
  price: number;
  volume_remain: number;
  volume_total: number;
  min_volume: number;
}

export interface MarketHistoryDay {
  date: string;
  average: number;
  highest: number;
  lowest: number;
  order_count: number;
  volume: number;
}

export function getMarketOrders(regionId: number, typeId: number): Promise<MarketOrder[]> {
  return esiGetAllPagesPublic<MarketOrder>(
    `/markets/${regionId}/orders/?order_type=all&type_id=${typeId}`,
  );
}

export async function getMarketHistory(regionId: number, typeId: number): Promise<MarketHistoryDay[]> {
  try {
    return await esiGetPublic<MarketHistoryDay[]>(
      `/markets/${regionId}/history/?type_id=${typeId}`,
    );
  } catch {
    // Manche Items haben keine Handelshistorie in einer Region - kein Fehlerfall.
    return [];
  }
}

/**
 * Durchschnittliches Tagesvolumen aus der ESI-Historie. Gibt `null` zurueck,
 * wenn keine Historie vorliegt - VORHER (bis DECISIONS.md D013) gab diese
 * Funktion bei fehlender Historie still `0` zurueck, was dann ununterscheidbar
 * von einem tatsaechlich beobachteten Volumen von 0 in die Risikobewertung
 * einging (docs/economic-model.md, "Missing values": "Never silently
 * interpret missing volume as zero"). Aufrufer sollen `null` ueber
 * economics/liquidity.ts#deriveVolumeSignal explizit als "unknown" behandeln,
 * statt es direkt als Zahl weiterzurechnen.
 */
export function recentAverageVolume(history: MarketHistoryDay[], days = 7): number | null {
  if (history.length === 0) return null;
  const recent = history.slice(-days);
  return recent.reduce((sum, d) => sum + d.volume, 0) / recent.length;
}

// ---------- Komplettes Orderbuch je Region (fuer den Vollmarkt-Scan) ----------

interface OrderBookCacheEntry {
  data: MarketOrder[];
  at: number;
}

const orderBookCache = new Map<number, OrderBookCacheEntry>();
const orderBookInflight = new Map<number, Promise<MarketOrder[]>>();
// 12 Minuten: lang genug, dass ein Durchlauf durch alle 5 Hubs nicht bei
// jedem Klick alles neu laden muss, kurz genug fuer einigermassen frische
// Preise. Der erste Abruf pro Region kann mehrere Sekunden dauern (Jita hat
// hunderte Seiten), danach ist es bis zum Ablauf der TTL sofort da.
const ORDER_BOOK_TTL_MS = 12 * 60 * 1000;

/**
 * Laedt das KOMPLETTE aktuell gehandelte Orderbuch einer Region (alle Items,
 * nicht nur eine Watchlist) ueber die oeffentliche ESI /markets/{region}/orders/
 * OHNE type_id-Filter - EIN grosser, aber gecachter Abruf (mit begrenzter
 * Parallelitaet ueber die Seiten) statt tausender Einzelabfragen pro Item.
 * Parallele Aufrufe fuer dieselbe Region waehrend eines laufenden Abrufs
 * teilen sich dasselbe Promise, statt doppelt zu laden.
 */
export async function getFullRegionOrderBook(regionId: number): Promise<MarketOrder[]> {
  const now = Date.now();
  const cached = orderBookCache.get(regionId);
  if (cached && now - cached.at < ORDER_BOOK_TTL_MS) return cached.data;

  const inflight = orderBookInflight.get(regionId);
  if (inflight) return inflight;

  const promise = esiGetAllPagesPublicConcurrent<MarketOrder>(`/markets/${regionId}/orders/?order_type=all`, 15)
    .then((data) => {
      orderBookCache.set(regionId, { data, at: Date.now() });
      orderBookInflight.delete(regionId);
      return data;
    })
    .catch((err: unknown) => {
      orderBookInflight.delete(regionId);
      throw err;
    });
  orderBookInflight.set(regionId, promise);
  return promise;
}

/**
 * Alter (in Sekunden) des zwischengespeicherten Orderbuchs einer Region,
 * fuer dataFreshness in ScoredCandidate (siehe trading/scoring.ts). `null`,
 * wenn noch nichts gecacht ist (sollte nicht vorkommen, wenn direkt nach
 * getFullRegionOrderBook() aufgerufen).
 */
export function getFullRegionOrderBookAgeSeconds(regionId: number): number | null {
  const cached = orderBookCache.get(regionId);
  if (!cached) return null;
  return Math.round((Date.now() - cached.at) / 1000);
}

// ---------- Grobe Durchschnittspreise fuer die Asset-Wertschaetzung ----------

interface TypePriceEntry {
  type_id: number;
  average_price?: number;
  adjusted_price?: number;
}

let priceCache: Map<number, number> | null = null;
let priceCacheAt = 0;
const PRICE_CACHE_TTL_MS = 30 * 60 * 1000; // 30 Minuten - reicht fuer eine grobe Wertschaetzung, spart bei jedem Assets-Aufruf einen Bulk-Call.

/**
 * Liefert einen groben Durchschnittspreis pro Type-ID ueber die oeffentliche
 * ESI /markets/prices/ (EIN Bulk-Call fuer alle Typen mit Marktaktivitaet,
 * statt tausender Einzelabfragen). Gedacht fuer eine ungefaehre Asset-
 * Wertschaetzung - kein Ersatz fuer echte Hub-Preise (die haengen vom
 * gewaehlten Ort ab, siehe Route Calculator).
 */
export async function getAllTypePrices(): Promise<Map<number, number>> {
  const now = Date.now();
  if (priceCache && now - priceCacheAt < PRICE_CACHE_TTL_MS) return priceCache;
  const entries = await esiGetPublic<TypePriceEntry[]>("/markets/prices/");
  const map = new Map<number, number>();
  for (const e of entries) {
    const price = e.average_price ?? e.adjusted_price;
    if (price !== undefined && price > 0) map.set(e.type_id, price);
  }
  priceCache = map;
  priceCacheAt = now;
  return map;
}
