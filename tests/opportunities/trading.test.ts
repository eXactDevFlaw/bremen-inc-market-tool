import { test } from "node:test";
import assert from "node:assert/strict";
import { stationCandidateToOpportunity, haulCandidateToOpportunity } from "../../src/opportunities/trading.js";
import { rankCandidatesLocally } from "../../src/trading/scoring.js";
import type { HaulTradeCandidate, StationTradeCandidate } from "../../src/trading/analyzer.js";
import { computeStationTradeProfit, computeHaulProfit } from "../../src/economics/profit.js";
import { computeRoiPct } from "../../src/economics/roi.js";
import { NO_SKILLS } from "../../src/economics/fees.js";

// Phase 2, Schritt 5: Tests fuer die neue Konvertierungs-Grenze
// (opportunities/trading.ts). Ziel ist NICHT, die Economic Engine erneut zu
// testen (das leisten bereits tests/economics/* und tests/trading/scoring.test.ts),
// sondern zu verifizieren, dass die Konvertierungsfunktionen bereits
// berechnete Werte unveraendert durchreichen und unbekannte Werte als `null`
// erhalten bleiben - ohne selbst irgendetwas zu berechnen.

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
    typeId: 35,
    itemName: "Pyerite",
    buyHub: "Rens",
    sellHub: "Jita",
    buyPrice: 100,
    sellPrice: 130,
    profitPerUnit: 30,
    profitPct: 30,
    avgDailyVolume: 50,
    avgDailyVolumeKnown: true,
    dataAgeSeconds: 0,
    executableQuantity: 777,
    ...overrides,
  };
}

/** Rankt genau einen Kandidaten und gibt das dazugehoerige ScoredCandidate zurueck - Hilfsfunktion, keine neue Berechnung (nutzt die bestehende rankCandidatesLocally() direkt). */
function scoreOne(candidate: StationTradeCandidate | HaulTradeCandidate) {
  const [scored] = rankCandidatesLocally([candidate], { skills: NO_SKILLS, lang: "de" });
  assert.ok(scored, "Testkandidat sollte einen positiven Netto-Profit haben und damit gerankt werden");
  return scored;
}

test("1) Station-Trade-Kandidat wird korrekt konvertiert (domain/action/id/source/destination)", () => {
  const candidate = stationCandidate();
  const scored = scoreOne(candidate);
  const opp = stationCandidateToOpportunity(candidate, scored);

  assert.equal(opp.domain, "trading");
  assert.equal(opp.action, "station_trade");
  assert.equal(opp.source, "Jita");
  assert.equal(opp.destination, null);
  assert.equal(opp.id, "trading:station_trade:34:Jita");
});

test("2) Hauling-Kandidat wird korrekt konvertiert (zwei Orte, eigene id)", () => {
  const candidate = haulCandidate();
  const scored = scoreOne(candidate);
  const opp = haulCandidateToOpportunity(candidate, scored);

  assert.equal(opp.domain, "trading");
  assert.equal(opp.action, "hauling");
  assert.equal(opp.source, "Rens");
  assert.equal(opp.destination, "Jita");
  assert.equal(opp.id, "trading:hauling:35:Rens->Jita");
});

test("3) typeId wird erhalten (Station und Hauling)", () => {
  const stationCand = stationCandidate({ typeId: 999 });
  const stationOpp = stationCandidateToOpportunity(stationCand, scoreOne(stationCand));
  assert.equal(stationOpp.typeId, 999);

  const haulCand = haulCandidate({ typeId: 888 });
  const haulOpp = haulCandidateToOpportunity(haulCand, scoreOne(haulCand));
  assert.equal(haulOpp.typeId, 888);
});

test("4) executableQuantity wird erhalten - Station immer null, Hauling der reale Wert", () => {
  const stationCand = stationCandidate(); // executableQuantity: null
  const stationOpp = stationCandidateToOpportunity(stationCand, scoreOne(stationCand));
  assert.equal(stationOpp.executableQuantity, null);

  const haulCand = haulCandidate({ executableQuantity: 4321 });
  const haulOpp = haulCandidateToOpportunity(haulCand, scoreOne(haulCand));
  assert.equal(haulOpp.executableQuantity, 4321);
});

test("5-8) grossRevenue/totalCosts/netProfit/netMarginPct kommen unveraendert aus der Economic Engine an (Station)", () => {
  const candidate = stationCandidate();
  const expected = computeStationTradeProfit(candidate.bestSell, candidate.bestBuy, NO_SKILLS);
  const opp = stationCandidateToOpportunity(candidate, scoreOne(candidate));

  assert.equal(opp.grossRevenue, expected.grossRevenue);
  assert.equal(opp.totalCosts, expected.totalCosts);
  assert.equal(opp.netProfit, expected.netProfit);
  assert.equal(opp.netMarginPct, expected.netMarginPct);
  assert.deepEqual(opp.costs, expected.costs);
});

test("5-8) grossRevenue/totalCosts/netProfit/netMarginPct kommen unveraendert aus der Economic Engine an (Hauling)", () => {
  const candidate = haulCandidate();
  const expected = computeHaulProfit(candidate.buyPrice, candidate.sellPrice, NO_SKILLS);
  const opp = haulCandidateToOpportunity(candidate, scoreOne(candidate));

  assert.equal(opp.grossRevenue, expected.grossRevenue);
  assert.equal(opp.totalCosts, expected.totalCosts);
  assert.equal(opp.netProfit, expected.netProfit);
  assert.equal(opp.netMarginPct, expected.netMarginPct);
  assert.deepEqual(opp.costs, expected.costs);
});

test("9) roiPct wird erhalten, wenn vorhanden", () => {
  const candidate = haulCandidate();
  const net = computeHaulProfit(candidate.buyPrice, candidate.sellPrice, NO_SKILLS);
  const expectedRoi = computeRoiPct(net.netProfit, candidate.buyPrice);
  const opp = haulCandidateToOpportunity(candidate, scoreOne(candidate));

  assert.notEqual(expectedRoi, null);
  assert.equal(opp.roiPct, expectedRoi);
});

test("10) unbekannte Werte bleiben null, werden NICHT zu 0 (Volumen unbekannt)", () => {
  const candidate = haulCandidate({ avgDailyVolume: 0, avgDailyVolumeKnown: false, executableQuantity: null });
  const scored = scoreOne(candidate);
  // Kontrolle: scoring.ts selbst haelt weiterhin das Phase-1-Paired-Boolean-Muster (0 + false).
  assert.equal(scored.avgDailyVolume, 0);
  assert.equal(scored.avgDailyVolumeKnown, false);

  const opp = haulCandidateToOpportunity(candidate, scored);
  // Die normalisierte Opportunity-Form macht daraus ein echtes null, nicht 0.
  assert.equal(opp.volume, null);
  assert.equal(opp.executableQuantity, null);
});

test("11) requiredSkills/requiredAssets werden nicht erfunden - bleiben null (nicht [])", () => {
  const stationOpp = stationCandidateToOpportunity(stationCandidate(), scoreOne(stationCandidate()));
  assert.equal(stationOpp.requiredSkills, null);
  assert.equal(stationOpp.requiredAssets, null);

  const haulOpp = haulCandidateToOpportunity(haulCandidate(), scoreOne(haulCandidate()));
  assert.equal(haulOpp.requiredSkills, null);
  assert.equal(haulOpp.requiredAssets, null);
});

test("12) der Mapper berechnet nichts selbst - jedes wirtschaftliche Feld ist eine reine Identitaets-Uebernahme aus ScoredCandidate", () => {
  const candidate = haulCandidate();
  const scored = scoreOne(candidate);
  const opp = haulCandidateToOpportunity(candidate, scored);

  // Direkter 1:1-Abgleich gegen das bereits von rankCandidatesLocally()
  // berechnete ScoredCandidate - kein einziger Wert wird hier neu addiert,
  // multipliziert oder anderweitig hergeleitet.
  assert.equal(opp.capitalRequired, scored.capitalRequired);
  assert.equal(opp.grossRevenue, scored.grossRevenue);
  assert.equal(opp.totalCosts, scored.totalCosts);
  assert.deepEqual(opp.costs, scored.costs);
  assert.equal(opp.netProfit, scored.netProfitPerUnit);
  assert.equal(opp.netMarginPct, scored.netMarginPct);
  assert.equal(opp.brokerFeePct, scored.brokerFeePct);
  assert.equal(opp.salesTaxPct, scored.salesTaxPct);
  assert.equal(opp.roiPct, scored.roiPct);
  assert.equal(opp.riskLevel, scored.riskLevel);
  assert.equal(opp.riskReason, scored.riskReason);
  assert.equal(opp.confidence, scored.confidence);
  assert.deepEqual(opp.dataFreshness, scored.dataFreshness);
  assert.deepEqual(opp.assumptions, scored.assumptions);
  assert.equal(opp.reasoning, scored.reasoning);
  // liquidity ist absichtlich immer null (kein echtes Signal vorhanden, siehe DECISIONS.md D016/D017) - kein Proxy-Ersatzwert.
  assert.equal(opp.liquidity, null);
});
