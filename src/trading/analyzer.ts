import { resolveTypeIdsByName } from "../esi/universe.js";
import { TRADE_HUBS, DEFAULT_WATCHLIST, type TradeHub } from "./hubs.js";
import { getMarketHistory, getMarketOrders, recentAverageVolume } from "./marketData.js";

export interface StationTradeCandidate {
  kind: "station";
  itemName: string;
  hub: string;
  bestSell: number;
  bestBuy: number;
  spread: number;
  spreadPct: number;
  sellOrderCount: number;
  buyOrderCount: number;
  avgDailyVolume: number;
}

export interface HaulTradeCandidate {
  kind: "haul";
  itemName: string;
  buyHub: string;
  sellHub: string;
  buyPrice: number;
  sellPrice: number;
  profitPerUnit: number;
  profitPct: number;
  avgDailyVolume: number;
}

export type TradeCandidate = StationTradeCandidate | HaulTradeCandidate;

interface HubOrderStats {
  hub: TradeHub;
  bestSell: number | null;
  bestBuy: number | null;
  sellOrderCount: number;
  buyOrderCount: number;
  avgDailyVolume: number;
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
        itemName,
        hub: stat.hub.name,
        bestSell: stat.bestSell,
        bestBuy: stat.bestBuy,
        spread,
        spreadPct: (spread / stat.bestSell) * 100,
        sellOrderCount: stat.sellOrderCount,
        buyOrderCount: stat.buyOrderCount,
        avgDailyVolume: stat.avgDailyVolume,
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
      candidates.push({
        kind: "haul",
        itemName,
        buyHub: buyHubStat.hub.name,
        sellHub: sellHubStat.hub.name,
        buyPrice: buyHubStat.bestSell,
        sellPrice: sellHubStat.bestSell,
        profitPerUnit,
        profitPct: (profitPerUnit / buyHubStat.bestSell) * 100,
        avgDailyVolume: Math.min(buyHubStat.avgDailyVolume, sellHubStat.avgDailyVolume),
      });
    }
  }

  return candidates;
}

export async function findTradeCandidates(watchlist: string[] = DEFAULT_WATCHLIST): Promise<TradeCandidate[]> {
  const nameToId = await resolveTypeIdsByName(watchlist);
  const items = watchlist
    .map((name) => ({ name, typeId: nameToId.get(name) }))
    .filter((x): x is { name: string; typeId: number } => x.typeId !== undefined);

  const perItem = await mapWithConcurrency(items, 4, (item) => analyzeItem(item.name, item.typeId));
  return perItem.flat();
}
