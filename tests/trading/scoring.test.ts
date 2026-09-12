import { test } from "node:test";
import assert from "node:assert/strict";
import { rankCandidatesLocally } from "../../src/trading/scoring.js";
import type { HaulTradeCandidate, StationTradeCandidate } from "../../src/trading/analyzer.js";
import { computeStationTradeProfit, computeHaulProfit } from "../../src/economics/profit.js";
import { NO_SKILLS } from "../../src/economics/fees.js";

// Schritt 3 von Phase 2 (siehe Projekt-Doku "phase2-trading-intelligence-plan.md"):
// grossRevenue/totalCosts/costs wurden bisher in scoring.ts ueber
// computeStationTradeProfit()/computeHaulProfit() berechnet, aber beim Bauen
// von ScoredCandidate verworfen (nur netProfit/netMarginPct/brokerFeePct/
// salesTaxPct wurden uebernommen). Diese Tests stellen sicher, dass die drei
// Felder jetzt 1:1 im ScoredCandidate ankommen UND dass sich dabei nichts an
// den bestehenden Werten (netMarginPct, roiPct, score, riskLevel) aendert.

function stationCandidate(overrides: Partial<StationTradeCandidate> = {}): StationTradeCandidate {
  return {
    kind: "station",
    typeId: 34,
    itemName: "Tritanium",
    hub: "Jita",
    bestSell: 120,
    bestBuy: 100,
    spread: 20,
    spreadPct: 20,
    sellOrderCount: 10,
    buyOrderCount: 10,
    avgDailyVolume: 50,
    avgDailyVolumeKnown: true,
    dataAgeSeconds: 0,
    executableQuantity: null,
    ...overrides,
  };
}

function haulCandidate(overrides: Partial<HaulTradeCandidate> = {}): HaulTradeCandidate {
  return {
    kind: "haul",
    typeId: 34,
    itemName: "Tritanium",
    buyHub: "Rens",
    sellHub: "Jita",
    buyPrice: 100,
    sellPrice: 130,
    profitPerUnit: 30,
    profitPct: 30,
    avgDailyVolume: 50,
    avgDailyVolumeKnown: true,
    dataAgeSeconds: 0,
    executableQuantity: 1000,
    ...overrides,
  };
}

test("scoreStation (ueber rankCandidatesLocally): grossRevenue/totalCosts/costs kommen unveraendert aus computeStationTradeProfit an", () => {
  const candidate = stationCandidate();
  const expected = computeStationTradeProfit(candidate.bestSell, candidate.bestBuy, NO_SKILLS);

  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored, "Kandidat sollte nach positivem netProfit im Ranking landen");

  assert.equal(scored.grossRevenue, expected.grossRevenue);
  assert.equal(scored.totalCosts, expected.totalCosts);
  assert.deepEqual(scored.costs, expected.costs);
  // Bereits vorhandene Felder duerfen sich durch die Erweiterung nicht aendern.
  assert.equal(scored.netProfitPerUnit, expected.netProfit);
  assert.equal(scored.netMarginPct, expected.netMarginPct);
  assert.equal(scored.brokerFeePct, expected.brokerFeePct);
  assert.equal(scored.salesTaxPct, expected.salesTaxPct);
});

test("scoreHaul (ueber rankCandidatesLocally): grossRevenue/totalCosts/costs kommen unveraendert aus computeHaulProfit an", () => {
  const candidate = haulCandidate();
  const expected = computeHaulProfit(candidate.buyPrice, candidate.sellPrice, NO_SKILLS);

  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored, "Kandidat sollte nach positivem netProfit im Ranking landen");

  assert.equal(scored.grossRevenue, expected.grossRevenue);
  assert.equal(scored.totalCosts, expected.totalCosts);
  assert.deepEqual(scored.costs, expected.costs);
  assert.equal(scored.netProfitPerUnit, expected.netProfit);
  assert.equal(scored.netMarginPct, expected.netMarginPct);
});

test("costs-Aufschluesselung enthaelt die bestehenden ProfitCostBreakdown-Felder, keine neuen Kostenarten", () => {
  const [scored] = rankCandidatesLocally([stationCandidate()], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored);
  assert.deepEqual(Object.keys(scored.costs).sort(), ["buyBrokerFee", "purchaseCost", "sellBrokerFee", "salesTax"].sort());
});

test("Regression: Ranking-Score-Formel bleibt unveraendert (netMarginPct * log10(avgDailyVolume + 2) / riskPenalty)", () => {
  const candidate = stationCandidate();
  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored);
  assert.equal(scored.riskLevel, "low", "Testkandidat ist so gewaehlt, dass riskPenalty(low) = 1 gilt");
  const expectedScore = scored.netMarginPct * Math.log10(candidate.avgDailyVolume + 2);
  assert.ok(Math.abs(scored.score - expectedScore) < 1e-9);
  // roiPct bleibt weiterhin getrennt von der Score-Formel (kein ROI im Score, siehe Guardrail).
  assert.notEqual(scored.roiPct, null);
});

test("Regression: bereits vorhandene Kandidaten mit negativem Netto-Profit werden weiterhin herausgefiltert (unveraendertes Verhalten)", () => {
  // bestBuy sehr nah an bestSell -> Gebuehren fressen den gesamten Spread auf.
  const candidate = stationCandidate({ bestSell: 100.5, bestBuy: 100 });
  const scored = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.equal(scored.length, 0);
});
