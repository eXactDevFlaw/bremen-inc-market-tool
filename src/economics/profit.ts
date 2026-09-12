// Die EINE autorisierte Umsetzung von grossRevenue/totalCosts/netProfit/
// netMarginPct fuer Handelsaktivitaeten (siehe docs/economic-model.md, "Core
// accounting identity" + "Margin"). Ersetzt die bisherigen
// netStationTradeProfit()/netHaulProfit() aus trading/fees.ts (dort jetzt
// entfernt, trading/fees.ts re-exportiert nur noch die reinen %-Formeln aus
// economics/fees.ts).
//
// WICHTIGE FACHLICHE AENDERUNG - siehe DECISIONS.md D013:
// Die bisherige netHaulProfit() berechnete netMarginPct als
// netProfit / buyPrice (= eingesetztes Kapital). Nach docs/economic-model.md
// ist das die Definition von ROI, nicht von Margin
// ("netMarginPct = netProfit / grossRevenue", "Do not mix this with ROI").
// Die bisherige netStationTradeProfit() hatte die Margin dagegen bereits
// korrekt ueber bestSell (= grossRevenue) definiert - die beiden Strategien
// waren also inkonsistent zueinander und nicht direkt vergleichbar.
//
// Ab hier gilt fuer BEIDE Strategien einheitlich:
//   netMarginPct = netProfit / grossRevenue * 100
//   roiPct (siehe roi.ts)  = netProfit / capitalRequired * 100
//
// Der Zahlenwert, der bisher fuer Hauling als "netMarginPct" angezeigt wurde,
// geht dadurch NICHT verloren - er entspricht rechnerisch exakt dem, was ab
// jetzt korrekt benannt als roiPct exponiert wird (siehe trading/scoring.ts).

import { getBrokerFeePct, getSalesTaxPct, type TradeFeeSkills } from "./fees.js";

export interface ProfitCostBreakdown {
  purchaseCost: number;
  buyBrokerFee: number;
  sellBrokerFee: number;
  salesTax: number;
}

export interface ProfitBreakdown {
  brokerFeePct: number;
  salesTaxPct: number;
  grossRevenue: number;
  totalCosts: number;
  netProfit: number;
  /** netProfit / grossRevenue * 100 - IMMER auf den Umsatz bezogen, siehe Kommentar oben. 0 wenn grossRevenue 0 ist (kein Umsatz -> keine sinnvolle Marge, bewusst nicht null/Infinity). */
  netMarginPct: number;
  /** Kosten-Aufschluesselung fuer Transparenz/AI-Erklaerung, siehe docs/economic-model.md "totalCosts =". */
  costs: ProfitCostBreakdown;
}

/**
 * Station-Trading (Market-Making): eigene Buy- UND Sell-Order, Broker Fee auf
 * beide Ordervolumen, Sales Tax beim Verkauf. Fachlich unveraendert gegenueber
 * der bisherigen netStationTradeProfit() - deren Margin-Definition war
 * bereits korrekt.
 */
export function computeStationTradeProfit(bestSell: number, bestBuy: number, skills: TradeFeeSkills): ProfitBreakdown {
  const brokerFeePct = getBrokerFeePct(skills.brokerRelationsLevel);
  const salesTaxPct = getSalesTaxPct(skills.accountingLevel);

  const buyBrokerFee = bestBuy * (brokerFeePct / 100);
  const sellBrokerFee = bestSell * (brokerFeePct / 100);
  const salesTax = bestSell * (salesTaxPct / 100);

  const grossRevenue = bestSell;
  const purchaseCost = bestBuy;
  const totalCosts = purchaseCost + buyBrokerFee + sellBrokerFee + salesTax;
  const netProfit = grossRevenue - totalCosts;
  const netMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  return {
    brokerFeePct,
    salesTaxPct,
    grossRevenue,
    totalCosts,
    netProfit,
    netMarginPct,
    costs: { purchaseCost, buyBrokerFee, sellBrokerFee, salesTax },
  };
}

/**
 * Hauling: Einkauf per Instant-Buy in bestehende Sell-Order (kein Broker Fee,
 * keine Steuer beim Kauf), Verkauf am Zielhub per eigener Sell-Order (Broker
 * Fee + Sales Tax). netMarginPct ist jetzt (siehe Kommentar oben am
 * Dateianfang) einheitlich ./. grossRevenue (= sellPrice) definiert, NICHT
 * mehr ./. buyPrice wie zuvor.
 */
export function computeHaulProfit(buyPrice: number, sellPrice: number, skills: TradeFeeSkills): ProfitBreakdown {
  const brokerFeePct = getBrokerFeePct(skills.brokerRelationsLevel);
  const salesTaxPct = getSalesTaxPct(skills.accountingLevel);

  const sellBrokerFee = sellPrice * (brokerFeePct / 100);
  const salesTax = sellPrice * (salesTaxPct / 100);

  const grossRevenue = sellPrice;
  const purchaseCost = buyPrice;
  const totalCosts = purchaseCost + sellBrokerFee + salesTax;
  const netProfit = grossRevenue - totalCosts;
  const netMarginPct = grossRevenue > 0 ? (netProfit / grossRevenue) * 100 : 0;

  return {
    brokerFeePct,
    salesTaxPct,
    grossRevenue,
    totalCosts,
    netProfit,
    netMarginPct,
    costs: { purchaseCost, buyBrokerFee: 0, sellBrokerFee, salesTax },
  };
}
