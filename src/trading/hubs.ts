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
// Bewusst klein gehalten, da der 5-Hub-Vergleich jedes Item an allen 5 Hubs prueft.
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

// Erweiterte Liste fuer den Einzelort-Scan ("was ist lukrativ in X"): dort
// kostet jedes zusaetzliche Item nur einen Preis- + einen Historie-Abruf
// (kein Multi-Hub-Vergleich), daher hier deutlich mehr Items als in der
// Standard-Watchlist. Deckt Mineralien, Eisprodukte, PI-Materialien, gaengige
// T2-Module/Drohnen/Munition und Deployables ab.
export const EXPANDED_WATCHLIST = [
  ...DEFAULT_WATCHLIST,
  "Morphite",
  "Heavy Water",
  "Liquid Ozone",
  "Strontium Clathrates",
  "Helium Isotopes",
  "Hydrogen Isotopes",
  "Nitrogen Isotopes",
  "Oxygen Isotopes",
  "Water",
  "Oxygen",
  "Coolant",
  "Nanites",
  "Silicate Glass",
  "Mechanical Parts",
  "Consumer Electronics",
  "Robotics",
  "Catalyst",
  "Vexor",
  "Caracal",
  "Drake",
  "Osprey",
  "Damage Control II",
  "1MN Afterburner II",
  "Large Shield Extender II",
  "Medium Shield Extender II",
  "Hobgoblin II",
  "Warrior II",
  "Hammerhead II",
  "Antimatter Charge M",
  "Antimatter Charge L",
  "Republic Fleet EMP L",
  "Mobile Depot",
];
