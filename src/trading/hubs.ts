export interface TradeHub {
  name: string;
  regionId: number;
  stationId: number;
}

// Die fuenf grossen NPC-Handelsknotenpunkte in New Eden. Diese IDs sind seit
// Jahren stabil und in der EVE-Community allgemein bekannt.
export const TRADE_HUBS: TradeHub[] = [
  { name: "Jita", regionId: 10000002, stationId: 60003760 },
  { name: "Amarr", regionId: 10000043, stationId: 60008494 },
  { name: "Dodixie", regionId: 10000032, stationId: 60011866 },
  { name: "Rens", regionId: 10000030, stationId: 60004588 },
  { name: "Hek", regionId: 10000042, stationId: 60005686 },
];

// Standard-Watchlist: liquide, haeufig gehandelte Items. Namen statt IDs,
// damit die IDs zur Laufzeit ueber ESI aufgeloest werden (kein Rateraten von Type-IDs).
export const DEFAULT_WATCHLIST = [
  "Tritanium",
  "Pyerite",
  "Mexallon",
  "Isogen",
  "Nocxium",
  "Zydrine",
  "Megacyte",
  "PLEX",
  "Large Skill Injector",
  "Small Skill Injector",
  "Rifter",
  "Venture",
  "Retriever",
  "Mobile Tractor Unit",
];
