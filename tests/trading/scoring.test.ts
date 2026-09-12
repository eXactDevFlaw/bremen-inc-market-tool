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
    // Schritt 6 von Phase 2, korrigierte Fassung (DECISIONS.md D019): reale
    // Sell-Order-Zahl am Verkaufsort statt des vorherigen synthetischen
    // Platzhalters. Default bewusst identisch zu stationCandidate()s
    // sellOrderCount/buyOrderCount (10), damit bestehende Tests, die nicht
    // explizit auf Order-Tiefe abzielen, unter vergleichbaren Annahmen wie
    // vorher laufen.
    sellHubSellOrderCount: 10,
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

// Schritt 6 von Phase 2, KORRIGIERTE Fassung (siehe DECISIONS.md D019):
// scoreHaul()s competingOrders ist jetzt die reale Sell-Order-Zahl AM
// VERKAUFSORT (sellHubSellOrderCount) - eine direkte 1:1-Uebernahme, keine
// Aggregation. Ein erster Versuch (D018, Math.min(buyHubSellOrderCount,
// sellHubBuyOrderCount)) kombinierte Sell-Orders an einem Hub mit Buy-Orders
// an einem anderen Hub und wurde als semantisch falsch verworfen - diese
// Tests decken u.a. explizit ab, dass keine solche Kombination mehr
// stattfindet.

test("scoreHaul: competingOrders ist die reale Sell-Order-Zahl am Verkaufsort - reine 1:1-Uebernahme, keine Aggregation", () => {
  const candidate = haulCandidate({ sellHubSellOrderCount: 7 });
  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored);
  assert.equal(scored.competingOrders, 7);
});

test("scoreHaul: unabhaengig von Preisen/Volumen/Route bleibt competingOrders exakt sellHubSellOrderCount (kein Min/Max/Durchschnitt mit irgendetwas anderem)", () => {
  // Zwei Kandidaten mit identischem sellHubSellOrderCount, aber ansonsten
  // komplett unterschiedlichen (und unabhaengigen) Werten muessen denselben
  // competingOrders liefern - sonst wuerde irgendetwas anderes mit hineinfliessen.
  const a = haulCandidate({ sellHubSellOrderCount: 9, buyPrice: 50, sellPrice: 80, avgDailyVolume: 5 });
  const b = haulCandidate({ sellHubSellOrderCount: 9, buyPrice: 400, sellPrice: 900, avgDailyVolume: 500 });
  const [scoredA] = rankCandidatesLocally([a], { skills: NO_SKILLS, lang: "de" });
  const [scoredB] = rankCandidatesLocally([b], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scoredA);
  assert.ok(scoredB);
  assert.equal(scoredA.competingOrders, 9);
  assert.equal(scoredB.competingOrders, 9);
});

test("scoreHaul: alter Platzhalter-Wert (5) wird NICHT mehr produziert, wenn die reale Sell-Order-Zahl etwas anderes sagt", () => {
  // Mit dem alten Platzhalter (avgDailyVolumeKnown=true, avgDailyVolume>=1) waere
  // competingOrders immer exakt 5 gewesen, unabhaengig vom echten Orderbuch.
  const candidate = haulCandidate({ avgDailyVolume: 50, avgDailyVolumeKnown: true, sellHubSellOrderCount: 1 });
  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored);
  assert.equal(scored.competingOrders, 1);
  assert.notEqual(scored.competingOrders, 5);
});

test("scoreHaul: sehr wenige echte konkurrierende Sell-Orders am Verkaufsort (< 2) fuehren jetzt auch bei gutem Tagesvolumen zu riskLevel=high", () => {
  // Vorher (Platzhalter 5) waere dieser Kandidat bei gutem Volumen/guter Marge
  // durchgehend "low" gewesen - der Platzhalter konnte nie < 2 werden.
  const candidate = haulCandidate({ sellHubSellOrderCount: 1, avgDailyVolume: 100, avgDailyVolumeKnown: true });
  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored);
  assert.equal(scored.competingOrders, 1);
  assert.equal(scored.riskLevel, "high");
  assert.match(scored.riskReason, /konkurrierende Orders/i);
});

test("scoreHaul: viele reale Sell-Orders am Verkaufsort fuehren zu riskLevel=low (bei guter Marge/Volumen)", () => {
  const candidate = haulCandidate({ sellHubSellOrderCount: 15, avgDailyVolume: 50, avgDailyVolumeKnown: true });
  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored);
  assert.equal(scored.competingOrders, 15);
  assert.equal(scored.riskLevel, "low");
});

test("scoreHaul: sellHubSellOrderCount = null (Ausfuehrungsmodell ohne eigene Sell-Order, z.B. explizite Zwei-Orte-Route) ergibt competingOrders = null, NICHT 0 oder eine geratene Zahl", () => {
  const candidate = haulCandidate({ sellHubSellOrderCount: null, avgDailyVolume: 100, avgDailyVolumeKnown: true });
  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored);
  assert.equal(scored.competingOrders, null);
  assert.notEqual(scored.competingOrders, 0);
});

test("scoreHaul: sellHubSellOrderCount = null fuehrt zu riskLevel=medium (unbekannt/nicht anwendbar), NICHT high (wie eine faelschlich als 0 gelesene Order-Zahl es taete) und NICHT low", () => {
  // Waere null still zu 0 geworden, griffe Bedingung 1 (competingOrders < 2)
  // und ergaebe faelschlich "high" - eine bestaetigt duenne Order-Lage, die
  // wir hier gar nicht beobachtet haben.
  const candidate = haulCandidate({ sellHubSellOrderCount: null, avgDailyVolume: 100, avgDailyVolumeKnown: true, buyPrice: 100, sellPrice: 130 });
  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored);
  assert.equal(scored.riskLevel, "medium");
  assert.match(scored.riskReason, /nicht ermittelbar|unverifiziert|not.*known|unverified/i);
});

test("scoreHaul: sellHubSellOrderCount = null fliesst nicht als NaN/0 in confidence ein (bleibt eine endliche Zahl zwischen 0 und 1)", () => {
  const candidate = haulCandidate({ sellHubSellOrderCount: null, avgDailyVolume: 100, avgDailyVolumeKnown: true });
  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored);
  assert.ok(Number.isFinite(scored.confidence));
  assert.ok(scored.confidence >= 0 && scored.confidence <= 1);
});
