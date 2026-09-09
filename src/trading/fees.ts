// Gebuehren-Formeln fuer NPC-Handelsknotenpunkte (Stand 2025, siehe Quellen unten).
// Spieler-Strukturen (Upwell-Citadels) haben abweichende, vom Struktur-Besitzer
// festgelegte Gebuehren (0.5% Basis + Owner-Anteil) und werden von Broker Relations
// NICHT beeinflusst - das bilden wir hier bewusst nicht nach, sondern behandeln
// jede Order konservativ mit der NPC-Station-Formel (realistische Obergrenze).
//
// Quellen:
// - https://support.eveonline.com/hc/en-us/articles/203218962-Broker-Fee-and-Sales-Tax
// - https://wiki.eveuniversity.org/Trading

const BASE_SALES_TAX_PCT = 7.5;
const ACCOUNTING_REDUCTION_PER_LEVEL = 0.11; // 11% des Steuersatzes pro Level

const BASE_BROKER_FEE_PCT = 3;
const BROKER_RELATIONS_REDUCTION_PER_LEVEL = 0.3; // Prozentpunkte pro Level
const MIN_BROKER_FEE_PCT = 1;

function clampSkillLevel(level: number): number {
  return Math.min(5, Math.max(0, Math.round(level)));
}

/**
 * Sales Tax in Prozent, abhaengig vom Accounting-Skill.
 * Formel: 7.5% * (1 - 11% * Accounting-Level) - faellt beim Verkauf an
 * (egal ob per eigener Sell-Order oder durch sofortiges Verkaufen in eine
 * bestehende Buy-Order), unabhaengig von Standings.
 */
export function getSalesTaxPct(accountingLevel: number): number {
  const level = clampSkillLevel(accountingLevel);
  return BASE_SALES_TAX_PCT * (1 - ACCOUNTING_REDUCTION_PER_LEVEL * level);
}

/**
 * Broker Fee in Prozent, abhaengig vom Broker-Relations-Skill. Faellt nur an,
 * wenn eine eigene Order (Kauf- oder Verkaufsorder mit Laufzeit) platziert
 * wird - nicht beim direkten Kauf/Verkauf in eine bestehende Order hinein.
 * Standings koennen den Satz real weiter senken (hier nicht beruecksichtigt,
 * da keine Standings-Daten abgefragt werden - konservative Schaetzung).
 */
export function getBrokerFeePct(brokerRelationsLevel: number): number {
  const level = clampSkillLevel(brokerRelationsLevel);
  return Math.max(MIN_BROKER_FEE_PCT, BASE_BROKER_FEE_PCT - BROKER_RELATIONS_REDUCTION_PER_LEVEL * level);
}

export interface TradeFeeSkills {
  brokerRelationsLevel: number;
  accountingLevel: number;
}

export const NO_SKILLS: TradeFeeSkills = { brokerRelationsLevel: 0, accountingLevel: 0 };

export interface NetProfitResult {
  brokerFeePct: number;
  salesTaxPct: number;
  netProfitPerUnit: number;
  netMarginPct: number;
}

/**
 * Station-Trading (Market-Making): du platzierst sowohl eine Buy- als auch
 * eine Sell-Order und verdienst den Spread. Broker Fee faellt auf BEIDE
 * Ordervolumen an, Sales Tax nur beim Verkauf.
 */
export function netStationTradeProfit(
  bestSell: number,
  bestBuy: number,
  skills: TradeFeeSkills,
): NetProfitResult {
  const brokerFeePct = getBrokerFeePct(skills.brokerRelationsLevel);
  const salesTaxPct = getSalesTaxPct(skills.accountingLevel);

  const buyOrderFee = bestBuy * (brokerFeePct / 100);
  const sellOrderFee = bestSell * (brokerFeePct / 100);
  const salesTax = bestSell * (salesTaxPct / 100);

  const netProfitPerUnit = bestSell - bestBuy - buyOrderFee - sellOrderFee - salesTax;
  const netMarginPct = bestSell > 0 ? (netProfitPerUnit / bestSell) * 100 : 0;

  return { brokerFeePct, salesTaxPct, netProfitPerUnit, netMarginPct };
}

/**
 * Hauling: Einkauf per Instant-Buy in bestehende Sell-Order (kein Broker-Fee,
 * keine Steuer beim Kauf), Verkauf am Zielhub per eigener Sell-Order (Broker
 * Fee + Sales Tax). Das ist die uebliche, planbare Hauling-Strategie.
 */
export function netHaulProfit(
  buyPrice: number,
  sellPrice: number,
  skills: TradeFeeSkills,
): NetProfitResult {
  const brokerFeePct = getBrokerFeePct(skills.brokerRelationsLevel);
  const salesTaxPct = getSalesTaxPct(skills.accountingLevel);

  const sellOrderFee = sellPrice * (brokerFeePct / 100);
  const salesTax = sellPrice * (salesTaxPct / 100);

  const netProfitPerUnit = sellPrice - buyPrice - sellOrderFee - salesTax;
  const netMarginPct = buyPrice > 0 ? (netProfitPerUnit / buyPrice) * 100 : 0;

  return { brokerFeePct, salesTaxPct, netProfitPerUnit, netMarginPct };
}
