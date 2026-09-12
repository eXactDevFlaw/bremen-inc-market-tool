// Rein algorithmisches Ranking der Handelskandidaten - keine KI, keine laufenden
// Kosten. Bewertet Netto-Marge (nach Gebuehren), Liquiditaet und ein einfaches
// Risiko-Heuristik-Modell (Anzahl konkurrierender Orders, Handelsvolumen).
//
// Migriert auf die zentrale Economic Engine (ROADMAP.md Phase 1, siehe
// src/economics/). Die frueheren netStationTradeProfit()/netHaulProfit() aus
// trading/fees.ts sind entfernt - stattdessen economics/profit.ts direkt.
// Siehe DECISIONS.md D013 (Margin/ROI-Fix), D014 (capitalRequired/Dauer).
import type { HaulTradeCandidate, StationTradeCandidate, TradeCandidate } from "./analyzer.js";
import { NO_SKILLS, upwellStructureFeeAssumption, type TradeFeeSkills } from "../economics/fees.js";
import { computeStationTradeProfit, computeHaulProfit, type ProfitCostBreakdown } from "../economics/profit.js";
import { computeRoiPct } from "../economics/roi.js";
import { computeConfidence, deriveVolumeSignal } from "../economics/liquidity.js";
import type { DataFreshness } from "../economics/types.js";
import { pick, type Lang } from "../i18n.js";

export type RiskLevel = "low" | "medium" | "high";

interface ScoredBase {
  itemName: string;
  strategy: "station_trading" | "hauling";
  route: string;
  brokerFeePct: number;
  salesTaxPct: number;
  /**
   * Schritt 3 von Phase 2 (siehe Projekt-Doku): 1:1 aus dem bereits von
   * economics/profit.ts#computeStationTradeProfit/computeHaulProfit
   * berechneten ProfitBreakdown uebernommen (`net.grossRevenue`) - vorher
   * wurde dieser Wert berechnet und beim Bauen von ScoredCandidate
   * verworfen. Keine neue Berechnung, keine Aenderung an grossRevenue selbst.
   */
  grossRevenue: number;
  /** Siehe grossRevenue - 1:1 `net.totalCosts` aus demselben ProfitBreakdown. */
  totalCosts: number;
  netProfitPerUnit: number;
  netMarginPct: number;
  /**
   * Kosten-Aufschluesselung fuer Transparenz/spaetere Opportunity-/AI-Schicht
   * (Purchase/Buy Cost, Broker Fees getrennt nach Kauf-/Verkaufsorder, Sales
   * Tax) - 1:1 `net.costs` aus demselben ProfitBreakdown, siehe
   * economics/profit.ts#ProfitCostBreakdown. Keine neuen Kostenarten, nur
   * Durchreichung der bereits vorhandenen Aufschluesselung.
   */
  costs: ProfitCostBreakdown;
  /** ROI = netProfit / capitalRequired * 100 (economics/roi.ts). null wenn capitalRequired <= 0. NICHT dasselbe wie netMarginPct, siehe DECISIONS.md D013. */
  roiPct: number | null;
  /** Vorlaeufig PRO EINHEIT (DECISIONS.md D014) - kein echtes Order-/Positionsgroessen-Kapital, dafuer fehlt aktuell ein Mengenmodell. */
  capitalRequired: number;
  /** Phase 1: immer null - keine belastbare Zeitinformation vorhanden (DECISIONS.md D014). Keine geschaetzten Zeiten nur damit ein Ranking-Wert entsteht. */
  expectedDurationHours: number | null;
  /** Phase 1: immer null, siehe expectedDurationHours. */
  iskPerHour: number | null;
  avgDailyVolume: number;
  /** false = avgDailyVolume ist mangels Handelshistorie auf 0 ausgewichen, nicht tatsaechlich beobachtet (DECISIONS.md D013). */
  avgDailyVolumeKnown: boolean;
  competingOrders: number;
  riskLevel: RiskLevel;
  riskReason: string;
  confidence: number;
  dataFreshness: DataFreshness;
  reasoning: string;
  assumptions: string[];
  score: number;
}

export type ScoredCandidate = ScoredBase;

function assessRisk(
  avgDailyVolume: number,
  avgDailyVolumeKnown: boolean,
  competingOrders: number,
  netMarginPct: number,
  lang: Lang,
): { level: RiskLevel; reason: string } {
  if (competingOrders < 2) {
    return {
      level: "high",
      reason: pick(
        lang,
        `Very few competing orders (${competingOrders}) - hard to plan for, high risk that orders sit unfilled for a long time.`,
        `Sehr wenige konkurrierende Orders (${competingOrders}) - schwer planbar, hohes Risiko dass Orders lange stehen bleiben.`,
      ),
    };
  }
  if (!avgDailyVolumeKnown) {
    // Fehlende Handelshistorie ist NICHT dasselbe wie ein beobachtetes
    // Volumen von 0 (docs/economic-model.md, "Missing values") - deshalb ein
    // eigener, mittlerer Risiko-Fall statt Gleichsetzung mit "sehr geringe Liquiditaet".
    return {
      level: "medium",
      reason: pick(
        lang,
        `No trade-volume history available for this item/location - liquidity is unknown, not confirmed low. Start with smaller quantities.`,
        `Fuer dieses Item/diesen Ort liegt keine Handelsvolumen-Historie vor - Liquiditaet ist unbekannt, nicht bestaetigt niedrig. Vorsichtshalber mit kleineren Stueckzahlen beginnen.`,
      ),
    };
  }
  if (avgDailyVolume < 1) {
    return {
      level: "high",
      reason: pick(
        lang,
        `Very low liquidity (avg. ${avgDailyVolume.toFixed(1)} units/day, ${competingOrders} orders) - hard to plan for, high risk that orders sit unfilled for a long time.`,
        `Sehr geringe Liquiditaet (Ø ${avgDailyVolume.toFixed(1)} Einh./Tag, ${competingOrders} Orders) - schwer planbar, hohes Risiko dass Orders lange stehen bleiben.`,
      ),
    };
  }
  if (netMarginPct < 3) {
    return {
      level: "high",
      reason: pick(
        lang,
        `Very thin net margin (${netMarginPct.toFixed(1)}%) - even small price moves can eat the profit.`,
        `Sehr knappe Netto-Marge (${netMarginPct.toFixed(1)}%) - schon kleine Preisbewegungen koennen den Gewinn auffressen.`,
      ),
    };
  }
  if (avgDailyVolume < 15 || competingOrders < 5) {
    return {
      level: "medium",
      reason: pick(
        lang,
        `Moderate liquidity (avg. ${avgDailyVolume.toFixed(1)} units/day, ${competingOrders} orders) - smaller quantities recommended.`,
        `Maessige Liquiditaet (Ø ${avgDailyVolume.toFixed(1)} Einh./Tag, ${competingOrders} Orders) - kleinere Stueckzahlen empfohlen.`,
      ),
    };
  }
  return {
    level: "low",
    reason: pick(
      lang,
      `Solid liquidity (avg. ${avgDailyVolume.toFixed(1)} units/day, ${competingOrders} orders) and a comfortable margin.`,
      `Solide Liquiditaet (Ø ${avgDailyVolume.toFixed(1)} Einh./Tag, ${competingOrders} Orders) und komfortable Marge.`,
    ),
  };
}

function riskPenalty(level: RiskLevel): number {
  return level === "high" ? 2.2 : level === "medium" ? 1.35 : 1;
}

/** Gemeinsame, dokumentierte Annahmen, die fuer JEDEN Kandidaten gelten (D011/D014), plus optional die volume-unknown-Notiz. */
function buildAssumptions(avgDailyVolumeKnown: boolean, lang: Lang): string[] {
  const assumptions = [
    upwellStructureFeeAssumption(lang),
    pick(
      lang,
      "capitalRequired is currently the purchase price per unit (provisional) - real order sizes and total committed capital are not yet modeled.",
      "capitalRequired ist aktuell der Einkaufspreis pro Einheit (vorlaeufig) - echte Ordergroessen und tatsaechlich gebundenes Kapital werden noch nicht modelliert.",
    ),
    pick(
      lang,
      "expectedDurationHours/iskPerHour are intentionally unknown (null) - no reliable timing data is available yet, so none is estimated just to produce a ranking number.",
      "expectedDurationHours/iskPerHour sind bewusst unbekannt (null) - es liegen noch keine belastbaren Zeitdaten vor, deshalb wird keine Zeit geschaetzt nur damit ein Ranking-Wert entsteht.",
    ),
  ];
  if (!avgDailyVolumeKnown) {
    assumptions.push(
      pick(
        lang,
        "No ESI trade-volume history was available for this item/location - avgDailyVolume shown as 0 is a placeholder, not an observed value.",
        "Fuer dieses Item/diesen Ort lag keine ESI-Handelsvolumen-Historie vor - das angezeigte avgDailyVolume von 0 ist ein Platzhalter, kein beobachteter Wert.",
      ),
    );
  }
  return assumptions;
}

function scoreStation(c: StationTradeCandidate, skills: TradeFeeSkills, lang: Lang): ScoredCandidate | null {
  const net = computeStationTradeProfit(c.bestSell, c.bestBuy, skills);
  if (net.netProfit <= 0) return null;

  const capitalRequired = c.bestBuy;
  const roiPct = computeRoiPct(net.netProfit, capitalRequired);
  const competingOrders = Math.min(c.sellOrderCount, c.buyOrderCount);
  const risk = assessRisk(c.avgDailyVolume, c.avgDailyVolumeKnown, competingOrders, net.netMarginPct, lang);
  const rawScore = net.netMarginPct * Math.log10(c.avgDailyVolume + 2);
  const ageSeconds = c.dataAgeSeconds ?? 0;
  const confidence = computeConfidence({
    volume: deriveVolumeSignal(c.avgDailyVolumeKnown ? c.avgDailyVolume : null),
    competingOrders,
    ageSeconds,
  });

  return {
    itemName: c.itemName,
    strategy: "station_trading",
    route: c.hub,
    brokerFeePct: net.brokerFeePct,
    salesTaxPct: net.salesTaxPct,
    grossRevenue: net.grossRevenue,
    totalCosts: net.totalCosts,
    netProfitPerUnit: net.netProfit,
    netMarginPct: net.netMarginPct,
    costs: net.costs,
    roiPct,
    capitalRequired,
    expectedDurationHours: null,
    iskPerHour: null,
    avgDailyVolume: c.avgDailyVolume,
    avgDailyVolumeKnown: c.avgDailyVolumeKnown,
    competingOrders,
    riskLevel: risk.level,
    riskReason: risk.reason,
    confidence,
    dataFreshness: { fetchedAt: new Date().toISOString(), ageSeconds },
    reasoning: pick(
      lang,
      `Spread of ${c.spread.toFixed(2)} ISK (${c.spreadPct.toFixed(1)}%) between the best buy and sell order in ${c.hub}. ` +
        `After broker fee (${net.brokerFeePct.toFixed(2)}% x2, buy+sell order) and sales tax (${net.salesTaxPct.toFixed(2)}%), ` +
        `${net.netProfit.toFixed(2)} ISK/unit (${net.netMarginPct.toFixed(1)}% margin, ${roiPct !== null ? roiPct.toFixed(1) + "% ROI" : "ROI n/a"}) remain net.`,
      `Spread ${c.spread.toFixed(2)} ISK (${c.spreadPct.toFixed(1)}%) zwischen bester Buy- und Sell-Order in ${c.hub}. ` +
        `Nach Broker Fee (${net.brokerFeePct.toFixed(2)}% x2, Kauf+Verkaufsorder) und Sales Tax (${net.salesTaxPct.toFixed(2)}%) ` +
        `bleiben netto ${net.netProfit.toFixed(2)} ISK/Einheit (${net.netMarginPct.toFixed(1)}% Marge, ${roiPct !== null ? roiPct.toFixed(1) + "% ROI" : "ROI n/a"}).`,
    ),
    assumptions: buildAssumptions(c.avgDailyVolumeKnown, lang),
    score: rawScore / riskPenalty(risk.level),
  };
}

function scoreHaul(c: HaulTradeCandidate, skills: TradeFeeSkills, lang: Lang): ScoredCandidate | null {
  const net = computeHaulProfit(c.buyPrice, c.sellPrice, skills);
  if (net.netProfit <= 0) return null;

  const capitalRequired = c.buyPrice;
  const roiPct = computeRoiPct(net.netProfit, capitalRequired);
  const competingOrders = c.avgDailyVolumeKnown && c.avgDailyVolume >= 1 ? 5 : 0;
  const risk = assessRisk(c.avgDailyVolume, c.avgDailyVolumeKnown, competingOrders, net.netMarginPct, lang);
  const rawScore = net.netMarginPct * Math.log10(c.avgDailyVolume + 2);
  const ageSeconds = c.dataAgeSeconds ?? 0;
  const confidence = computeConfidence({
    volume: deriveVolumeSignal(c.avgDailyVolumeKnown ? c.avgDailyVolume : null),
    competingOrders,
    ageSeconds,
  });

  return {
    itemName: c.itemName,
    strategy: "hauling",
    route: `${c.buyHub} → ${c.sellHub}`,
    brokerFeePct: net.brokerFeePct,
    salesTaxPct: net.salesTaxPct,
    grossRevenue: net.grossRevenue,
    totalCosts: net.totalCosts,
    netProfitPerUnit: net.netProfit,
    netMarginPct: net.netMarginPct,
    costs: net.costs,
    roiPct,
    capitalRequired,
    expectedDurationHours: null,
    iskPerHour: null,
    avgDailyVolume: c.avgDailyVolume,
    avgDailyVolumeKnown: c.avgDailyVolumeKnown,
    competingOrders,
    riskLevel: risk.level,
    riskReason: risk.reason,
    confidence,
    dataFreshness: { fetchedAt: new Date().toISOString(), ageSeconds },
    reasoning: pick(
      lang,
      `Buy via instant-buy in ${c.buyHub} at ${c.buyPrice.toFixed(2)} ISK, sell via your own sell order in ${c.sellHub}. ` +
        `After broker fee (${net.brokerFeePct.toFixed(2)}%) and sales tax (${net.salesTaxPct.toFixed(2)}%) on the sell side, ` +
        `${net.netProfit.toFixed(2)} ISK/unit (${net.netMarginPct.toFixed(1)}% margin, ${roiPct !== null ? roiPct.toFixed(1) + "% ROI" : "ROI n/a"}) remain net. ` +
        `Cargo capacity of the ship is not yet factored in.`,
      `Kauf per Instant-Buy in ${c.buyHub} zu ${c.buyPrice.toFixed(2)} ISK, Verkauf per eigener Sell-Order in ${c.sellHub}. ` +
        `Nach Broker Fee (${net.brokerFeePct.toFixed(2)}%) und Sales Tax (${net.salesTaxPct.toFixed(2)}%) auf der Verkaufsseite ` +
        `bleiben netto ${net.netProfit.toFixed(2)} ISK/Einheit (${net.netMarginPct.toFixed(1)}% Marge, ${roiPct !== null ? roiPct.toFixed(1) + "% ROI" : "ROI n/a"}). ` +
        `Frachtvolumen/Cargo-Kapazitaet des Schiffs ist hier noch nicht eingerechnet.`,
    ),
    assumptions: buildAssumptions(c.avgDailyVolumeKnown, lang),
    score: rawScore / riskPenalty(risk.level),
  };
}

export interface RankOptions {
  skills?: TradeFeeSkills;
  limit?: number;
  lang?: Lang;
}

/**
 * Rankt alle Handelskandidaten rein nach Zahlen - kein API-Aufruf, keine
 * Kosten. Filtert Kandidaten ohne positive Netto-Marge automatisch raus.
 */
export function rankCandidatesLocally(candidates: TradeCandidate[], options: RankOptions = {}): ScoredCandidate[] {
  const skills = options.skills ?? NO_SKILLS;
  const limit = options.limit ?? 20;
  const lang = options.lang ?? "en";

  const scored = candidates
    .map((c) => (c.kind === "station" ? scoreStation(c, skills, lang) : scoreHaul(c, skills, lang)))
    .filter((c): c is ScoredCandidate => c !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
