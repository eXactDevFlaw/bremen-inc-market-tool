import { test } from "node:test";
import assert from "node:assert/strict";
import { computeHaulProfit, computeStationTradeProfit } from "../../src/economics/profit.js";
import { NO_SKILLS, type TradeFeeSkills } from "../../src/economics/fees.js";

const SKILLS_5: TradeFeeSkills = { brokerRelationsLevel: 5, accountingLevel: 5 };

test("computeStationTradeProfit: netMarginPct ist ./. grossRevenue (bestSell), nicht ./. bestBuy", () => {
  const result = computeStationTradeProfit(110, 100, NO_SKILLS);
  // grossRevenue = bestSell = 110, netProfit = revenue - totalCosts
  assert.equal(result.grossRevenue, 110);
  const expectedMargin = (result.netProfit / 110) * 100;
  assert.ok(Math.abs(result.netMarginPct - expectedMargin) < 1e-9);
});

test("computeHaulProfit: netMarginPct ist ./. grossRevenue (sellPrice), NICHT mehr ./. buyPrice (Regressionstest fuer DECISIONS.md D013)", () => {
  const buyPrice = 100;
  const sellPrice = 150;
  const result = computeHaulProfit(buyPrice, sellPrice, NO_SKILLS);

  assert.equal(result.grossRevenue, sellPrice);
  const marginOverRevenue = (result.netProfit / sellPrice) * 100;
  const marginOverCapital = (result.netProfit / buyPrice) * 100; // das waere die ALTE (falsche) Definition

  assert.ok(Math.abs(result.netMarginPct - marginOverRevenue) < 1e-9, "netMarginPct muss ./. grossRevenue sein");
  // Bei sellPrice > buyPrice (jeder profitable Haul) ist Marge-ueber-Umsatz
  // immer kleiner als Marge-ueber-Kapital - so stellen wir sicher, dass die
  // alte, falsche Definition NICHT mehr zurueckkommt.
  assert.ok(result.netMarginPct < marginOverCapital);
});

test("computeStationTradeProfit: Broker Fee faellt auf BEIDE Ordervolumen an, Sales Tax nur auf den Verkauf", () => {
  const bestSell = 200;
  const bestBuy = 150;
  const result = computeStationTradeProfit(bestSell, bestBuy, NO_SKILLS);
  const brokerFeePct = 3; // Level 0
  const salesTaxPct = 7.5; // Level 0
  const expectedBuyFee = bestBuy * (brokerFeePct / 100);
  const expectedSellFee = bestSell * (brokerFeePct / 100);
  const expectedTax = bestSell * (salesTaxPct / 100);
  assert.ok(Math.abs(result.costs.buyBrokerFee - expectedBuyFee) < 1e-9);
  assert.ok(Math.abs(result.costs.sellBrokerFee - expectedSellFee) < 1e-9);
  assert.ok(Math.abs(result.costs.salesTax - expectedTax) < 1e-9);
  assert.ok(Math.abs(result.totalCosts - (bestBuy + expectedBuyFee + expectedSellFee + expectedTax)) < 1e-9);
});

test("computeHaulProfit: kein Broker Fee/Steuer auf den Einkauf (Instant-Buy)", () => {
  const result = computeHaulProfit(100, 150, NO_SKILLS);
  assert.equal(result.costs.buyBrokerFee, 0);
  assert.ok(result.costs.sellBrokerFee > 0);
  assert.ok(result.costs.salesTax > 0);
});

test("bessere Skills senken totalCosts (weniger Gebuehren) bei sonst gleichen Preisen", () => {
  const untrained = computeHaulProfit(100, 150, NO_SKILLS);
  const trained = computeHaulProfit(100, 150, SKILLS_5);
  assert.ok(trained.totalCosts < untrained.totalCosts);
  assert.ok(trained.netProfit > untrained.netProfit);
});

test("netMarginPct ist 0 (nicht NaN/Infinity) wenn grossRevenue 0 ist", () => {
  const result = computeHaulProfit(0, 0, NO_SKILLS);
  assert.equal(result.netMarginPct, 0);
  assert.ok(Number.isFinite(result.netMarginPct));
});
