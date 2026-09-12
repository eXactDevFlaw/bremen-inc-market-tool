import { resolveNames, resolveTypeIdsByName, type ResolvedLocation } from "../esi/universe.js";
import { TRADE_HUBS, DEFAULT_WATCHLIST, type TradeHub } from "./hubs.js";
import {
  getFullRegionOrderBook,
  getFullRegionOrderBookAgeSeconds,
  getMarketHistory,
  getMarketOrders,
  recentAverageVolume,
  type MarketOrder,
} from "./marketData.js";
import { pick, type Lang } from "../i18n.js";

export interface StationTradeCandidate {
  kind: "station";
  /**
   * EVE-Type-ID des Items - Schritt 1 von Phase 2 (siehe Projekt-Doku
   * "phase2-trading-intelligence-plan.md"): vorher fehlte diese Identitaet
   * auf den oeffentlichen Candidate-Typen (nur `itemName` als Anzeigetext),
   * obwohl sie an jeder Konstruktionsstelle bereits vorliegt. Noetig, damit
   * eine spaetere Opportunity-Schicht Items eindeutig referenzieren kann statt
   * ueber den Anzeigenamen zu joinen.
   */
  typeId: number;
  itemName: string;
  hub: string;
  bestSell: number;
  bestBuy: number;
  spread: number;
  spreadPct: number;
  sellOrderCount: number;
  buyOrderCount: number;
  avgDailyVolume: number;
  /**
   * false, wenn avgDailyVolume mangels Handelshistorie auf 0 ausgewichen ist
   * (DECISIONS.md D013) - true bedeutet ein tatsaechlich aus der ESI-Historie
   * beobachteter Wert (auch wenn dieser zufaellig 0 ist). Downstream-Code
   * (scoring.ts) soll bei false NICHT von "kein Handel" ausgehen, sondern von
   * "Volumen unbekannt".
   */
  avgDailyVolumeKnown: boolean;
  /**
   * Alter (Sekunden) der zugrundeliegenden Orderdaten, sofern bekannt (siehe
   * marketData.ts#getFullRegionOrderBookAgeSeconds) - undefined, wenn die
   * Daten gerade eben live abgefragt wurden (kein Cache im Spiel), dann als
   * praktisch frisch (0s) zu behandeln. Fuer ScoredCandidate.dataFreshness
   * (trading/scoring.ts).
   */
  dataAgeSeconds?: number;
}

export interface HaulTradeCandidate {
  kind: "haul";
  /** Siehe StationTradeCandidate.typeId. */
  typeId: number;
  itemName: string;
  buyHub: string;
  sellHub: string;
  buyPrice: number;
  sellPrice: number;
  profitPerUnit: number;
  profitPct: number;
  avgDailyVolume: number;
  /** Siehe StationTradeCandidate.avgDailyVolumeKnown. */
  avgDailyVolumeKnown: boolean;
  /** Siehe StationTradeCandidate.dataAgeSeconds. */
  dataAgeSeconds?: number;
}

export type TradeCandidate = StationTradeCandidate | HaulTradeCandidate;

interface HubOrderStats {
  hub: TradeHub;
  bestSell: number | null;
  bestBuy: number | null;
  sellOrderCount: number;
  buyOrderCount: number;
  avgDailyVolume: number | null;
}

/** Kombiniert zwei ggf. unbekannte Tagesvolumen (z.B. Kauf-/Verkaufsort eines Haulings) zum Minimum - `null`, sobald eines der beiden unbekannt ist, statt es stillschweigend als 0 zu behandeln. */
function combineVolume(a: number | null, b: number | null): number | null {
  return a === null || b === null ? null : Math.min(a, b);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current] as T);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

async function analyzeItem(itemName: string, typeId: number): Promise<TradeCandidate[]> {
  const hubStats: HubOrderStats[] = await mapWithConcurrency(TRADE_HUBS, 3, async (hub) => {
    const [orders, history] = await Promise.all([
      getMarketOrders(hub.regionId, typeId),
      getMarketHistory(hub.regionId, typeId),
    ]);
    const stationOrders = orders.filter((o) => o.location_id === hub.stationId);
    const sellOrders = stationOrders.filter((o) => !o.is_buy_order);
    const buyOrders = stationOrders.filter((o) => o.is_buy_order);
    const bestSell = sellOrders.length ? Math.min(...sellOrders.map((o) => o.price)) : null;
    const bestBuy = buyOrders.length ? Math.max(...buyOrders.map((o) => o.price)) : null;
    return {
      hub,
      bestSell,
      bestBuy,
      sellOrderCount: sellOrders.length,
      buyOrderCount: buyOrders.length,
      avgDailyVolume: recentAverageVolume(history),
    };
  });

  const candidates: TradeCandidate[] = [];

  for (const stat of hubStats) {
    if (stat.bestSell != null && stat.bestBuy != null && stat.bestSell > stat.bestBuy) {
      const spread = stat.bestSell - stat.bestBuy;
      candidates.push({
        kind: "station",
        typeId,
        itemName,
        hub: stat.hub.name,
        bestSell: stat.bestSell,
        bestBuy: stat.bestBuy,
        spread,
        spreadPct: (spread / stat.bestSell) * 100,
        sellOrderCount: stat.sellOrderCount,
        buyOrderCount: stat.buyOrderCount,
        avgDailyVolume: stat.avgDailyVolume ?? 0,
        avgDailyVolumeKnown: stat.avgDailyVolume !== null,
      });
    }
  }

  for (const buyHubStat of hubStats) {
    if (buyHubStat.bestSell == null) continue;
    for (const sellHubStat of hubStats) {
      if (sellHubStat.hub.name === buyHubStat.hub.name) continue;
      if (sellHubStat.bestSell == null) continue;
      const profitPerUnit = sellHubStat.bestSell - buyHubStat.bestSell;
      if (profitPerUnit <= 0) continue;
      const combinedVolume = combineVolume(buyHubStat.avgDailyVolume, sellHubStat.avgDailyVolume);
      candidates.push({
        kind: "haul",
        typeId,
        itemName,
        buyHub: buyHubStat.hub.name,
        sellHub: sellHubStat.hub.name,
        buyPrice: buyHubStat.bestSell,
        sellPrice: sellHubStat.bestSell,
        profitPerUnit,
        profitPct: (profitPerUnit / buyHubStat.bestSell) * 100,
        avgDailyVolume: combinedVolume ?? 0,
        avgDailyVolumeKnown: combinedVolume !== null,
      });
    }
  }

  return candidates;
}

/** Standard-Modus: Vergleich der 5 grossen NPC-Hubs untereinander (Station-Trading + Hauling). */
export async function findTradeCandidates(watchlist: string[] = DEFAULT_WATCHLIST): Promise<TradeCandidate[]> {
  const nameToId = await resolveTypeIdsByName(watchlist);
  const items = watchlist
    .map((name) => ({ name, typeId: nameToId.get(name) }))
    .filter((x): x is { name: string; typeId: number } => x.typeId !== undefined);

  const perItem = await mapWithConcurrency(items, 4, (item) => analyzeItem(item.name, item.typeId));
  return perItem.flat();
}

// ---------- Vollmarkt-Modus: wirklich JEDES gehandelte Item, keine Watchlist ----------

interface HubTypeStats {
  bestSell: number | null;
  bestBuy: number | null;
  sellOrderCount: number;
  buyOrderCount: number;
}

/** Fasst das Orderbuch einer Region auf die an EINER Station (dem Hub) stehenden Orders zusammen, gruppiert nach Type-ID. */
function buildHubStatsByType(orders: MarketOrder[], stationId: number): Map<number, HubTypeStats> {
  const map = new Map<number, HubTypeStats>();
  for (const o of orders) {
    if (o.location_id !== stationId) continue;
    let stats = map.get(o.type_id);
    if (!stats) {
      stats = { bestSell: null, bestBuy: null, sellOrderCount: 0, buyOrderCount: 0 };
      map.set(o.type_id, stats);
    }
    if (o.is_buy_order) {
      stats.buyOrderCount++;
      if (stats.bestBuy === null || o.price > stats.bestBuy) stats.bestBuy = o.price;
    } else {
      stats.sellOrderCount++;
      if (stats.bestSell === null || o.price < stats.bestSell) stats.bestSell = o.price;
    }
  }
  return map;
}

interface RawStationCandidate {
  kind: "station";
  typeId: number;
  hub: TradeHub;
  bestSell: number;
  bestBuy: number;
  spread: number;
  spreadPct: number;
  sellOrderCount: number;
  buyOrderCount: number;
  rawScore: number;
}

interface RawHaulCandidate {
  kind: "haul";
  typeId: number;
  buyHub: TradeHub;
  sellHub: TradeHub;
  buyPrice: number;
  sellPrice: number;
  profitPerUnit: number;
  profitPct: number;
  rawScore: number;
}

type RawCandidate = RawStationCandidate | RawHaulCandidate;

// Wie viele Roh-Kandidaten (noch OHNE Handelsvolumen) hoechstens weiterverfolgt
// werden, bevor pro Kandidat ein zusaetzlicher Historie-Abruf faellig wird -
// begrenzt Ladezeit und ESI-Last, ohne die vielversprechendsten Treffer zu verpassen.
const FULL_MARKET_CANDIDATE_CAP = 300;
const FULL_MARKET_HISTORY_CONCURRENCY = 10;

/**
 * Vollmarkt-Modus: laedt pro Hub das KOMPLETTE aktuelle Orderbuch der Region
 * (siehe getFullRegionOrderBook) und wertet wirklich jedes dort gehandelte
 * Item aus - keine Watchlist mehr noetig, keine Beschraenkung auf Mineralien
 * o.ae. Ablauf:
 *   1. Pro Hub den vollen Orderbuch-Dump laden (gecacht, beim ersten Mal
 *      langsamer, danach schnell) und auf Bestpreise je Type-ID an der
 *      Hub-Station verdichten.
 *   2. Daraus Rohkandidaten bilden (Spread pro Item/Hub bzw. Preisdifferenz
 *      zwischen zwei Hubs) - noch OHNE Handelsvolumen, das kostet pro Item
 *      einen zusaetzlichen Abruf.
 *   3. Die vielversprechendsten Rohkandidaten nach einem Score aus Spread-%
 *      und Anzahl konkurrierender Orders (grober Liquiditaets-Proxy, bis das
 *      echte Handelsvolumen vorliegt) auf FULL_MARKET_CANDIDATE_CAP kappen.
 *   4. Nur fuer diese engere Auswahl die Handelshistorie (Tagesvolumen) laden.
 *   5. Namen aufloesen und in die bestehenden TradeCandidate-Formen giessen,
 *      damit rankCandidatesLocally unveraendert weiterverwendet werden kann.
 */
export async function findTradeCandidatesFullMarket(): Promise<TradeCandidate[]> {
  const hubStats = await mapWithConcurrency(TRADE_HUBS, 5, async (hub) => {
    const orders = await getFullRegionOrderBook(hub.regionId);
    return { hub, stats: buildHubStatsByType(orders, hub.stationId) };
  });

  const allTypeIds = new Set<number>();
  for (const { stats } of hubStats) for (const typeId of stats.keys()) allTypeIds.add(typeId);

  const raw: RawCandidate[] = [];

  for (const typeId of allTypeIds) {
    const perHub = hubStats.map(({ hub, stats }) => ({ hub, s: stats.get(typeId) }));

    for (const { hub, s } of perHub) {
      if (!s || s.bestSell == null || s.bestBuy == null || s.bestSell <= s.bestBuy) continue;
      const spread = s.bestSell - s.bestBuy;
      const spreadPct = (spread / s.bestSell) * 100;
      const liquidityProxy = Math.min(s.sellOrderCount, s.buyOrderCount);
      raw.push({
        kind: "station",
        typeId,
        hub,
        bestSell: s.bestSell,
        bestBuy: s.bestBuy,
        spread,
        spreadPct,
        sellOrderCount: s.sellOrderCount,
        buyOrderCount: s.buyOrderCount,
        rawScore: spreadPct * Math.log10(liquidityProxy + 2),
      });
    }

    for (const buyHubStat of perHub) {
      if (!buyHubStat.s || buyHubStat.s.bestSell == null) continue;
      for (const sellHubStat of perHub) {
        if (sellHubStat.hub.name === buyHubStat.hub.name) continue;
        if (!sellHubStat.s || sellHubStat.s.bestSell == null) continue;
        const profitPerUnit = sellHubStat.s.bestSell - buyHubStat.s.bestSell;
        if (profitPerUnit <= 0) continue;
        const profitPct = (profitPerUnit / buyHubStat.s.bestSell) * 100;
        const liquidityProxy = Math.min(buyHubStat.s.sellOrderCount, sellHubStat.s.sellOrderCount);
        raw.push({
          kind: "haul",
          typeId,
          buyHub: buyHubStat.hub,
          sellHub: sellHubStat.hub,
          buyPrice: buyHubStat.s.bestSell,
          sellPrice: sellHubStat.s.bestSell,
          profitPerUnit,
          profitPct,
          rawScore: profitPct * Math.log10(liquidityProxy + 2),
        });
      }
    }
  }

  raw.sort((a, b) => b.rawScore - a.rawScore);
  const shortlisted = raw.slice(0, FULL_MARKET_CANDIDATE_CAP);

  // Historie nur fuer die tatsaechlich benoetigten (Region, Item)-Kombinationen laden - dedupliziert.
  const historyKeys = new Map<string, { regionId: number; typeId: number }>();
  for (const c of shortlisted) {
    if (c.kind === "station") {
      historyKeys.set(`${c.hub.regionId}:${c.typeId}`, { regionId: c.hub.regionId, typeId: c.typeId });
    } else {
      historyKeys.set(`${c.buyHub.regionId}:${c.typeId}`, { regionId: c.buyHub.regionId, typeId: c.typeId });
      historyKeys.set(`${c.sellHub.regionId}:${c.typeId}`, { regionId: c.sellHub.regionId, typeId: c.typeId });
    }
  }
  const historyPairs = await mapWithConcurrency([...historyKeys.values()], FULL_MARKET_HISTORY_CONCURRENCY, async (entry) => {
    const history = await getMarketHistory(entry.regionId, entry.typeId);
    return { key: `${entry.regionId}:${entry.typeId}`, volume: recentAverageVolume(history) };
  });
  const volumeByKey = new Map(historyPairs.map((p) => [p.key, p.volume]));

  const names = await resolveNames(shortlisted.map((c) => c.typeId));

  const candidates: TradeCandidate[] = [];
  for (const c of shortlisted) {
    const itemName = names.get(c.typeId) ?? `#${c.typeId}`;
    if (c.kind === "station") {
      // volumeByKey.get(...) liefert `undefined`, wenn der Key nie abgefragt wurde
      // (sollte hier nicht vorkommen), und `null`, wenn ESI keine Historie hatte -
      // beides zaehlt als "unbekannt", nicht als beobachtete 0.
      const rawVolume = volumeByKey.get(`${c.hub.regionId}:${c.typeId}`) ?? null;
      candidates.push({
        kind: "station",
        typeId: c.typeId,
        itemName,
        hub: c.hub.name,
        bestSell: c.bestSell,
        bestBuy: c.bestBuy,
        spread: c.spread,
        spreadPct: c.spreadPct,
        sellOrderCount: c.sellOrderCount,
        buyOrderCount: c.buyOrderCount,
        avgDailyVolume: rawVolume ?? 0,
        avgDailyVolumeKnown: rawVolume !== null,
        dataAgeSeconds: getFullRegionOrderBookAgeSeconds(c.hub.regionId) ?? undefined,
      });
    } else {
      const buyVolume = volumeByKey.get(`${c.buyHub.regionId}:${c.typeId}`) ?? null;
      const sellVolume = volumeByKey.get(`${c.sellHub.regionId}:${c.typeId}`) ?? null;
      const combinedVolume = combineVolume(buyVolume, sellVolume);
      // Konservativ das AELTERE der beiden Orderbuecher als massgeblich fuer
      // die Freshness nehmen (der schlechtere der beiden Werte).
      const buyAge = getFullRegionOrderBookAgeSeconds(c.buyHub.regionId);
      const sellAge = getFullRegionOrderBookAgeSeconds(c.sellHub.regionId);
      const dataAgeSeconds = buyAge === null && sellAge === null ? undefined : Math.max(buyAge ?? 0, sellAge ?? 0);
      candidates.push({
        kind: "haul",
        typeId: c.typeId,
        itemName,
        buyHub: c.buyHub.name,
        sellHub: c.sellHub.name,
        buyPrice: c.buyPrice,
        sellPrice: c.sellPrice,
        profitPerUnit: c.profitPerUnit,
        profitPct: c.profitPct,
        avgDailyVolume: combinedVolume ?? 0,
        avgDailyVolumeKnown: combinedVolume !== null,
        dataAgeSeconds,
      });
    }
  }

  return candidates;
}

async function analyzeItemAtLocation(
  itemName: string,
  typeId: number,
  location: ResolvedLocation,
  lang: Lang,
): Promise<StationTradeCandidate | null> {
  const [orders, history] = await Promise.all([
    getMarketOrders(location.regionId, typeId),
    getMarketHistory(location.regionId, typeId),
  ]);

  const scoped = location.stationId ? orders.filter((o) => o.location_id === location.stationId) : orders;
  const sellOrders = scoped.filter((o) => !o.is_buy_order);
  const buyOrders = scoped.filter((o) => o.is_buy_order);
  if (sellOrders.length === 0 || buyOrders.length === 0) return null;

  const bestSellOrder = sellOrders.reduce((min, o) => (o.price < min.price ? o : min));
  const bestBuyOrder = buyOrders.reduce((max, o) => (o.price > max.price ? o : max));
  if (bestSellOrder.price <= bestBuyOrder.price) return null;

  let placeLabel = location.label;
  if (!location.stationId) {
    // Region-Modus (keine spezifische Station): zeigen, wo die besten Preise
    // tatsaechlich stehen, falls Kauf- und Verkaufsseite auseinanderfallen.
    const ids = [...new Set([bestSellOrder.location_id, bestBuyOrder.location_id])];
    const names = await resolveNames(ids);
    const sellPlace = names.get(bestSellOrder.location_id) ?? pick(lang, `Structure #${bestSellOrder.location_id}`, `Struktur #${bestSellOrder.location_id}`);
    const buyPlace = names.get(bestBuyOrder.location_id) ?? pick(lang, `Structure #${bestBuyOrder.location_id}`, `Struktur #${bestBuyOrder.location_id}`);
    placeLabel = sellPlace === buyPlace ? sellPlace : pick(lang, `${sellPlace} (sell) / ${buyPlace} (buy)`, `${sellPlace} (verkaufen) / ${buyPlace} (kaufen)`);
  }

  const spread = bestSellOrder.price - bestBuyOrder.price;
  const volume = recentAverageVolume(history);
  return {
    kind: "station",
    typeId,
    itemName,
    hub: placeLabel,
    bestSell: bestSellOrder.price,
    bestBuy: bestBuyOrder.price,
    spread,
    spreadPct: (spread / bestSellOrder.price) * 100,
    sellOrderCount: sellOrders.length,
    buyOrderCount: buyOrders.length,
    avgDailyVolume: volume ?? 0,
    avgDailyVolumeKnown: volume !== null,
  };
}

/**
 * Einzelort-Modus: Station-Trading-Kandidaten an einem frei gewaehlten Ort
 * (Station oder ganze Region). Fragt gezielt pro Item ab (wie der
 * Standard-Modus) statt den kompletten Regions-Orderbuch-Dump zu laden -
 * bleibt dadurch auch fuer sehr aktive Regionen wie The Forge (Jita)
 * performant, prueft dafuer aber nur die Items aus der Watchlist statt
 * wirklich jedes in der Region gehandelten Items.
 */
export async function findTradeCandidatesAtLocation(
  location: ResolvedLocation,
  watchlist: string[],
  lang: Lang = "en",
): Promise<StationTradeCandidate[]> {
  const nameToId = await resolveTypeIdsByName(watchlist);
  const items = watchlist
    .map((name) => ({ name, typeId: nameToId.get(name) }))
    .filter((x): x is { name: string; typeId: number } => x.typeId !== undefined);

  const results = await mapWithConcurrency(items, 6, (item) => analyzeItemAtLocation(item.name, item.typeId, location, lang));
  return results.filter((c): c is StationTradeCandidate => c !== null);
}

// ---------- Explizite Zwei-Orte-Route ("kaufe in Rens, verkaufe in Jita 4-4") ----------

export interface RouteItemQuote {
  itemName: string;
  typeId: number;
  buyPrice: number | null; // bester (niedrigster) Sell-Order-Preis am Einkaufsort - das zahlst du per Instant-Buy
  sellPrice: number | null; // bester (hoechster) Buy-Order-Preis am Verkaufsort - das bekommst du per Instant-Sell
  buyOrderCount: number;
  sellOrderCount: number;
  avgDailyVolume: number;
  /** Siehe StationTradeCandidate.avgDailyVolumeKnown. */
  avgDailyVolumeKnown: boolean;
}

/** Fragt fuer ein Item die Instant-Buy-/Instant-Sell-Preise an zwei unabhaengigen Orten ab. */
export async function quoteItemAtTwoLocations(
  itemName: string,
  typeId: number,
  from: ResolvedLocation,
  to: ResolvedLocation,
): Promise<RouteItemQuote> {
  const sameRegion = from.regionId === to.regionId;
  const [fromOrders, fromHistory, toOrdersRaw, toHistoryRaw] = await Promise.all([
    getMarketOrders(from.regionId, typeId),
    getMarketHistory(from.regionId, typeId),
    sameRegion ? Promise.resolve(null) : getMarketOrders(to.regionId, typeId),
    sameRegion ? Promise.resolve(null) : getMarketHistory(to.regionId, typeId),
  ]);
  const toOrders = toOrdersRaw ?? fromOrders;
  const toHistory = toHistoryRaw ?? fromHistory;

  const fromScoped = from.stationId ? fromOrders.filter((o) => o.location_id === from.stationId) : fromOrders;
  const toScoped = to.stationId ? toOrders.filter((o) => o.location_id === to.stationId) : toOrders;

  const fromSellOrders = fromScoped.filter((o) => !o.is_buy_order);
  const toBuyOrders = toScoped.filter((o) => o.is_buy_order);

  const buyPrice = fromSellOrders.length ? Math.min(...fromSellOrders.map((o) => o.price)) : null;
  const sellPrice = toBuyOrders.length ? Math.max(...toBuyOrders.map((o) => o.price)) : null;
  const combinedVolume = combineVolume(recentAverageVolume(fromHistory), recentAverageVolume(toHistory));

  return {
    itemName,
    typeId,
    buyPrice,
    sellPrice,
    buyOrderCount: fromSellOrders.length,
    sellOrderCount: toBuyOrders.length,
    avgDailyVolume: combinedVolume ?? 0,
    avgDailyVolumeKnown: combinedVolume !== null,
  };
}

/**
 * Scannt die Watchlist auf einer konkreten Zwei-Orte-Route (Einkauf per
 * Instant-Buy am Ursprung, Verkauf per Instant-Sell am Ziel) und liefert
 * Kandidaten im selben Format wie der 5-Hub-Hauling-Vergleich, damit
 * dieselbe Scoring-Engine (rankCandidatesLocally) wiederverwendet werden kann.
 */
export async function findRouteCandidates(
  from: ResolvedLocation,
  to: ResolvedLocation,
  watchlist: string[],
): Promise<HaulTradeCandidate[]> {
  const nameToId = await resolveTypeIdsByName(watchlist);
  const items = watchlist
    .map((name) => ({ name, typeId: nameToId.get(name) }))
    .filter((x): x is { name: string; typeId: number } => x.typeId !== undefined);

  const quotes = await mapWithConcurrency(items, 6, (item) => quoteItemAtTwoLocations(item.name, item.typeId, from, to));

  const candidates: HaulTradeCandidate[] = [];
  for (const q of quotes) {
    if (q.buyPrice == null || q.sellPrice == null) continue;
    const profitPerUnit = q.sellPrice - q.buyPrice;
    if (profitPerUnit <= 0) continue;
    candidates.push({
      kind: "haul",
      typeId: q.typeId,
      itemName: q.itemName,
      buyHub: from.label,
      sellHub: to.label,
      buyPrice: q.buyPrice,
      sellPrice: q.sellPrice,
      profitPerUnit,
      profitPct: (profitPerUnit / q.buyPrice) * 100,
      avgDailyVolume: q.avgDailyVolume,
      avgDailyVolumeKnown: q.avgDailyVolumeKnown,
    });
  }
  return candidates;
}
