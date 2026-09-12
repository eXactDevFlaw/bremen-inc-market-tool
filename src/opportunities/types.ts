// Phase 2, Schritt 5 (siehe Projekt-Doku "phase2-trading-intelligence-plan.md"
// und DECISIONS.md D017): erste normalisierte Opportunity-Form fuer die neue
// src/opportunities/-Schicht. Reine Typdefinitionen - keine Berechnung, kein
// ESI-/DB-/HTTP-/AI-Zugriff hier oder in trading.ts (siehe dort).
//
// WICHTIG: Dieser Typ ist bewusst NICHT identisch mit
// economics/types.ts#Opportunity (dem langfristigen, domainuebergreifenden
// Zielvertrag aus Phase 1). Abweichungen und die Begruendung dafuer:
//
// 1. `domain`/`action`: Opportunity kennt "trading" und "hauling" als zwei
//    GLEICHRANGIGE domain-Werte. TradingOpportunity behandelt beides als
//    `action` INNERHALB einer einzigen domain "trading" (so vom Schritt-5-
//    Auftrag explizit vorgegeben). Diese beiden Modelle sind aktuell NICHT
//    deckungsgleich - offene, hier bewusst nicht aufgeloeste Frage fuer eine
//    spaetere Vereinheitlichung (siehe DECISIONS.md D017).
// 2. Wirtschaftliche Kernfelder (capitalRequired/grossRevenue/totalCosts/
//    netProfit/netMarginPct) sind hier flache `number`, NICHT
//    `Provenanced<number>` wie in Opportunity: Im aktuellen Candidate-
//    Pipeline-Stand sind sie an dieser Stelle IMMER bekannt (ScoredCandidate
//    entsteht nur fuer bereits positiv profitable Kandidaten, siehe
//    scoreStation/scoreHaul in trading/scoring.ts) - eine Provenanced<T>-
//    Huelle wuerde hier nie echte Zusatzinformation tragen (immer "derived",
//    nie "unknown"). Provenanced<T> wird deshalb hier NICHT eingefuehrt (kein
//    grosses Provenance-Refactoring, siehe Schritt-5-Auftrag).
// 3. `confidence` ist eine Zahl (0..1, aus economics/liquidity.ts#computeConfidence),
//    keine Kategorie/String - der urspruengliche Skizzenvorschlag fuer diesen
//    Schritt nannte "confidence: string", das entspricht aber nicht dem
//    tatsaechlich vorhandenen Wert.
// 4. `source`/`destination` sind Anzeigenamen (string), KEINE numerischen
//    Location-IDs - die aktuellen Candidate-Typen (StationTradeCandidate.hub,
//    HaulTradeCandidate.buyHub/sellHub) fuehren keine numerische ID, eine
//    solche wuerde hier erfunden werden muessen. Feldnamen/-typen 1:1 von
//    economics/types.ts#Opportunity uebernommen (dort schon dieselbe Wahl).
//
// Reused ohne Aenderung: `ProfitCostBreakdown` (economics/profit.ts),
// `DataFreshness` (economics/types.ts), `RiskLevel` (trading/scoring.ts).

import type { RiskLevel } from "../trading/scoring.js";
import type { ProfitCostBreakdown } from "../economics/profit.js";
import type { DataFreshness } from "../economics/types.js";

export type OpportunityDomain = "trading";
export type TradingAction = "station_trade" | "hauling";

export interface TradingOpportunity {
  /**
   * Deterministischer, aus action+typeId+source/destination abgeleiteter
   * Schluessel (siehe buildOpportunityId() in trading.ts) - KEINE
   * ESI-Entity-ID, nur zur stabilen Identifikation gedacht (z.B. als UI-Key
   * fuer spaetere Ranking-Animationen). Nicht global eindeutig garantiert,
   * falls jemals mehrere Kandidaten fuer dieselbe (typeId, Route)-Kombination
   * gleichzeitig existieren wuerden - analyzer.ts liefert das aktuell nicht.
   */
  id: string;

  domain: OpportunityDomain;
  action: TradingAction;

  /** EVE-Type-ID des Items (Phase 2 Schritt 1) - direkt vom Candidate uebernommen. */
  typeId: number;
  itemName: string;

  /**
   * Anzeigename des Einkaufs-/Ausfuehrungsorts (Hub-Name, z.B. "Jita") - KEIN
   * numerischer Location-Id, siehe Dateikopf Punkt 4.
   */
  source: string;
  /** Nur bei Hauling gesetzt (Zielhub) - siehe source. `null` bei Station Trading (kein zweiter Ort, nicht "unbekannt"). */
  destination: string | null;

  // ---- Economic-Engine-Ergebnisse, 1:1 aus ScoredCandidate (siehe trading.ts) ----
  // Siehe Dateikopf Punkt 2, warum diese Felder flach und nicht Provenanced<T> sind.
  capitalRequired: number;
  grossRevenue: number;
  totalCosts: number;
  /** 1:1 `ScoredCandidate.costs` (economics/profit.ts#ProfitCostBreakdown) - keine neuen Kostenarten. */
  costs: ProfitCostBreakdown;
  netProfit: number;
  netMarginPct: number;
  brokerFeePct: number;
  salesTaxPct: number;

  /** `null` wenn capitalRequired <= 0 (economics/roi.ts) - siehe DECISIONS.md D013. */
  roiPct: number | null;

  /** Phase 2: immer `null` - siehe DECISIONS.md D014/D016. Keine geschaetzte Dauer nur damit ein Wert existiert. */
  expectedDurationHours: number | null;
  /** Phase 2: immer `null`, siehe expectedDurationHours. */
  iskPerHour: number | null;

  /**
   * Historisches Tagesvolumen, NORMALISIERT aus dem Phase-1-Paired-Boolean-
   * Muster (`ScoredCandidate.avgDailyVolume` + `avgDailyVolumeKnown`) in ein
   * echtes `number | null`: unbekannt wird hier zu `null`, NICHT zu 0 (siehe
   * DECISIONS.md D016 "Unknown != zero"). `trading/scoring.ts` selbst bleibt
   * dabei unveraendert (API-/UI-Kompatibilitaet) - die Normalisierung
   * passiert ausschliesslich in trading.ts#toVolumeOrNull().
   */
  volume: number | null;

  /**
   * Sofort ausfuehrbare Menge (Phase 2 Schritt 2) - direkt vom Candidate
   * uebernommen. Bei Station Trading immer `null` (siehe
   * StationTradeCandidate.executableQuantity-Doku in analyzer.ts), bei
   * Hauling die reale Summe oder `null`. WICHTIG: `trading/scoring.ts` liest
   * dieses Feld selbst aktuell NICHT (siehe DECISIONS.md D016) - hier trotzdem
   * 1:1 vom Candidate durchgereicht, unabhaengig davon, dass Risk/Confidence/
   * Score es weiterhin ignorieren.
   */
  executableQuantity: number | null;

  /**
   * Absichtlich IMMER `null` in diesem Schritt. Es gibt aktuell kein
   * eigenstaendiges Liquidity-Signal (siehe DECISIONS.md D016, Abschnitt
   * "Liquidity - aktueller Stand vs. Zielbild") - `avgDailyVolume` und
   * `competingOrders` fliessen bereits in `riskLevel` UND `confidence` ein.
   * Um die von D016 offen gelassene Liquidity/Confidence/Risk-Vermischung
   * nicht in dieser neuen Schicht fortzuschreiben, wird hier bewusst KEINS
   * der beiden als Liquidity-Proxy wiederverwendet. Bleibt `null`, bis ein
   * echtes Liquidity-Signal existiert (voraussichtlich auf Basis von
   * `executableQuantity` - siehe D016).
   */
  liquidity: number | null;

  riskLevel: RiskLevel;
  riskReason: string;

  /** 0..1, siehe economics/liquidity.ts#computeConfidence - Zahl, keine Kategorie (siehe Dateikopf Punkt 3). */
  confidence: number;

  dataFreshness: DataFreshness;

  /**
   * `null` = fuer Trading/Hauling noch nicht modelliert (kein Skill-/Asset-
   * Constraint-Modell existiert bisher, siehe ROADMAP.md Phase 5/6) - NICHT
   * dasselbe wie eine verifizierte leere Liste ("keine Skills/Assets
   * erforderlich"). Absichtlich `string[] | null` statt nur `string[]`, um
   * diesen Unterschied nicht zu verschleiern (D003/D011: unknown != []).
   */
  requiredSkills: string[] | null;
  /** Siehe requiredSkills. */
  requiredAssets: string[] | null;

  assumptions: string[];
  reasoning: string;
}
