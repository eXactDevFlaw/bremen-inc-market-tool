// Rein algorithmisches Ranking der Handelskandidaten - keine KI, keine laufenden
// Kosten. Bewertet Netto-Marge (nach Gebuehren), Liquiditaet und ein einfaches
// Risiko-Heuristik-Modell (Anzahl konkurrierender Orders, Handelsvolumen).
import type { HaulTradeCandidate, StationTradeCandidate, TradeCandidate } from "./analyzer.js";
import { netHaulProfit, netStationTradeProfit, type TradeFeeSkills } from "./fees.js";
import { pick, type Lang } from "../i18n.js";

export type RiskLevel = "low" | "medium" | "high";

interface ScoredBase {
  itemName: string;
  strategy: "station_trading" | "hauling";
  route: string;
  brokerFeePct: number;
  salesTaxPct: number;
  netProfitPerUnit: number;
  netMarginPct: number;
  avgDailyVolume: number;
  competingOrders: number;
  riskLevel: RiskLevel;
  riskReason: string;
  reasoning: string;
  score: number;
}

export type ScoredCandidate = ScoredBase;

function assessRisk(avgDailyVolume: number, competingOrders: number, netMarginPct: number, lang: Lang): { level: RiskLevel; reason: string } {
  if (avgDailyVolume < 1 || competingOrders < 2) {
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

function scoreStation(c: StationTradeCandidate, skills: TradeFeeSkills, lang: Lang): ScoredCandidate | null {
  const net = netStationTradeProfit(c.bestSell, c.bestBuy, skills);
  if (net.netProfitPerUnit <= 0) return null;

  const competingOrders = Math.min(c.sellOrderCount, c.buyOrderCount);
  const risk = assessRisk(c.avgDailyVolume, competingOrders, net.netMarginPct, lang);
  const rawScore = net.netMarginPct * Math.log10(c.avgDailyVolume + 2);

  return {
    itemName: c.itemName,
    strategy: "station_trading",
    route: c.hub,
    brokerFeePct: net.brokerFeePct,
    salesTaxPct: net.salesTaxPct,
    netProfitPerUnit: net.netProfitPerUnit,
    netMarginPct: net.netMarginPct,
    avgDailyVolume: c.avgDailyVolume,
    competingOrders,
    riskLevel: risk.level,
    riskReason: risk.reason,
    reasoning: pick(
      lang,
      `Spread of ${c.spread.toFixed(2)} ISK (${c.spreadPct.toFixed(1)}%) between the best buy and sell order in ${c.hub}. ` +
        `After broker fee (${net.brokerFeePct.toFixed(2)}% x2, buy+sell order) and sales tax (${net.salesTaxPct.toFixed(2)}%), ` +
        `${net.netProfitPerUnit.toFixed(2)} ISK/unit (${net.netMarginPct.toFixed(1)}%) remain net.`,
      `Spread ${c.spread.toFixed(2)} ISK (${c.spreadPct.toFixed(1)}%) zwischen bester Buy- und Sell-Order in ${c.hub}. ` +
        `Nach Broker Fee (${net.brokerFeePct.toFixed(2)}% x2, Kauf+Verkaufsorder) und Sales Tax (${net.salesTaxPct.toFixed(2)}%) ` +
        `bleiben netto ${net.netProfitPerUnit.toFixed(2)} ISK/Einheit (${net.netMarginPct.toFixed(1)}%).`,
    ),
    score: rawScore / riskPenalty(risk.level),
  };
}

function scoreHaul(c: HaulTradeCandidate, skills: TradeFeeSkills, lang: Lang): ScoredCandidate | null {
  const net = netHaulProfit(c.buyPrice, c.sellPrice, skills);
  if (net.netProfitPerUnit <= 0) return null;

  const risk = assessRisk(c.avgDailyVolume, c.avgDailyVolume >= 1 ? 5 : 0, net.netMarginPct, lang);
  const rawScore = net.netMarginPct * Math.log10(c.avgDailyVolume + 2);

  return {
    itemName: c.itemName,
    strategy: "hauling",
    route: `${c.buyHub} → ${c.sellHub}`,
    brokerFeePct: net.brokerFeePct,
    salesTaxPct: net.salesTaxPct,
    netProfitPerUnit: net.netProfitPerUnit,
    netMarginPct: net.netMarginPct,
    avgDailyVolume: c.avgDailyVolume,
    competingOrders: 0,
    riskLevel: risk.level,
    riskReason: risk.reason,
    reasoning: pick(
      lang,
      `Buy via instant-buy in ${c.buyHub} at ${c.buyPrice.toFixed(2)} ISK, sell via your own sell order in ${c.sellHub}. ` +
        `After broker fee (${net.brokerFeePct.toFixed(2)}%) and sales tax (${net.salesTaxPct.toFixed(2)}%) on the sell side, ` +
        `${net.netProfitPerUnit.toFixed(2)} ISK/unit (${net.netMarginPct.toFixed(1)}%) remain net. ` +
        `Cargo capacity of the ship is not yet factored in.`,
      `Kauf per Instant-Buy in ${c.buyHub} zu ${c.buyPrice.toFixed(2)} ISK, Verkauf per eigener Sell-Order in ${c.sellHub}. ` +
        `Nach Broker Fee (${net.brokerFeePct.toFixed(2)}%) und Sales Tax (${net.salesTaxPct.toFixed(2)}%) auf der Verkaufsseite ` +
        `bleiben netto ${net.netProfitPerUnit.toFixed(2)} ISK/Einheit (${net.netMarginPct.toFixed(1)}%). ` +
        `Frachtvolumen/Cargo-Kapazitaet des Schiffs ist hier noch nicht eingerechnet.`,
    ),
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
  const skills = options.skills ?? { brokerRelationsLevel: 0, accountingLevel: 0 };
  const limit = options.limit ?? 20;
  const lang = options.lang ?? "en";

  const scored = candidates
    .map((c) => (c.kind === "station" ? scoreStation(c, skills, lang) : scoreHaul(c, skills, lang)))
    .filter((c): c is ScoredCandidate => c !== null);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
