import { esiGetAllPagesPublic, esiGetPublic } from "../esi/client.js";

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

export function recentAverageVolume(history: MarketHistoryDay[], days = 7): number {
  if (history.length === 0) return 0;
  const recent = history.slice(-days);
  return recent.reduce((sum, d) => sum + d.volume, 0) / recent.length;
}
