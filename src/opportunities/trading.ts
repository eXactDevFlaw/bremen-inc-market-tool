// Phase 2, Schritt 5: erste Konvertierungs-Grenze zwischen den bestehenden
// Trading-/Hauling-Kandidaten (trading/analyzer.ts + trading/scoring.ts) und
// der neuen normalisierten TradingOpportunity-Form (opportunities/types.ts).
//
// Bewusst NUR Mapping - keine Berechnung. Alle wirtschaftlichen Werte kommen
// 1:1 aus dem bereits von rankCandidatesLocally() gelieferten ScoredCandidate
// (das selbst wiederum 1:1 aus der Economic Engine stammt, siehe
// DECISIONS.md D013/D016) - keine Gebuehren-/Margin-/ROI-Formel wird hier
// dupliziert oder neu berechnet.
//
// Kein ESI-, DB-, HTTP- oder AI-Zugriff in dieser Datei - reine Funktionen
// auf bereits vorliegenden Daten.
//
// routes/trading.ts nutzt diese Funktionen in Schritt 5 noch NICHT (siehe
// Projekt-Doku "phase2-trading-intelligence-plan.md") - die bestehende
// API/UI bleibt unveraendert, bis eine spaetere Migration explizit
// freigegeben wird (siehe DECISIONS.md D017).

import type { HaulTradeCandidate, StationTradeCandidate } from "../trading/analyzer.js";
import type { ScoredCandidate } from "../trading/scoring.js";
import type { TradingAction, TradingOpportunity } from "./types.js";

/**
 * Siehe TradingOpportunity.volume - normalisiert das Phase-1-Paired-Boolean-
 * Muster zu einem echten `number | null`, ohne trading/scoring.ts selbst zu
 * veraendern (D016: "unknown != zero").
 */
function toVolumeOrNull(avgDailyVolume: number, avgDailyVolumeKnown: boolean): number | null {
  return avgDailyVolumeKnown ? avgDailyVolume : null;
}

/**
 * Deterministischer Identifikations-Schluessel - siehe TradingOpportunity.id.
 * Reine Stringkomposition, keine Berechnung, kein Zufall/Zeitstempel.
 */
function buildOpportunityId(action: TradingAction, typeId: number, source: string, destination: string | null): string {
  return `trading:${action}:${typeId}:${source}${destination !== null ? `->${destination}` : ""}`;
}

/**
 * Baut eine TradingOpportunity aus einem StationTradeCandidate (Rohdaten:
 * typeId, hub, executableQuantity - siehe trading/analyzer.ts) und dem dazu
 * gehoerenden, bereits von rankCandidatesLocally() berechneten
 * ScoredCandidate (Economic-Engine-Ergebnisse, Risk, Confidence). Beide
 * Parameter muessen zum selben Kandidaten gehoeren - das Zusammenfuehren
 * (Matching) ist Aufgabe des Aufrufers, nicht dieser Funktion; sie
 * berechnet und prueft selbst nichts, sie mapped nur.
 */
export function stationCandidateToOpportunity(candidate: StationTradeCandidate, scored: ScoredCandidate): TradingOpportunity {
  return {
    id: buildOpportunityId("station_trade", candidate.typeId, candidate.hub, null),
    domain: "trading",
    action: "station_trade",
    typeId: candidate.typeId,
    itemName: candidate.itemName,
    source: candidate.hub,
    destination: null,
    capitalRequired: scored.capitalRequired,
    grossRevenue: scored.grossRevenue,
    totalCosts: scored.totalCosts,
    costs: scored.costs,
    netProfit: scored.netProfitPerUnit,
    netMarginPct: scored.netMarginPct,
    brokerFeePct: scored.brokerFeePct,
    salesTaxPct: scored.salesTaxPct,
    roiPct: scored.roiPct,
    expectedDurationHours: scored.expectedDurationHours,
    iskPerHour: scored.iskPerHour,
    volume: toVolumeOrNull(scored.avgDailyVolume, scored.avgDailyVolumeKnown),
    executableQuantity: candidate.executableQuantity,
    liquidity: null,
    riskLevel: scored.riskLevel,
    riskReason: scored.riskReason,
    confidence: scored.confidence,
    dataFreshness: scored.dataFreshness,
    requiredSkills: null,
    requiredAssets: null,
    assumptions: scored.assumptions,
    reasoning: scored.reasoning,
  };
}

/** Siehe stationCandidateToOpportunity() - analoger Aufbau fuer Hauling-Kandidaten (zwei Orte statt einem). */
export function haulCandidateToOpportunity(candidate: HaulTradeCandidate, scored: ScoredCandidate): TradingOpportunity {
  return {
    id: buildOpportunityId("hauling", candidate.typeId, candidate.buyHub, candidate.sellHub),
    domain: "trading",
    action: "hauling",
    typeId: candidate.typeId,
    itemName: candidate.itemName,
    source: candidate.buyHub,
    destination: candidate.sellHub,
    capitalRequired: scored.capitalRequired,
    grossRevenue: scored.grossRevenue,
    totalCosts: scored.totalCosts,
    costs: scored.costs,
    netProfit: scored.netProfitPerUnit,
    netMarginPct: scored.netMarginPct,
    brokerFeePct: scored.brokerFeePct,
    salesTaxPct: scored.salesTaxPct,
    roiPct: scored.roiPct,
    expectedDurationHours: scored.expectedDurationHours,
    iskPerHour: scored.iskPerHour,
    volume: toVolumeOrNull(scored.avgDailyVolume, scored.avgDailyVolumeKnown),
    executableQuantity: candidate.executableQuantity,
    liquidity: null,
    riskLevel: scored.riskLevel,
    riskReason: scored.riskReason,
    confidence: scored.confidence,
    dataFreshness: scored.dataFreshness,
    requiredSkills: null,
    requiredAssets: null,
    assumptions: scored.assumptions,
    reasoning: scored.reasoning,
  };
}
