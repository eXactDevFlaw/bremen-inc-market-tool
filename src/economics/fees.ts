// Gebuehren-Formeln fuer NPC-Handelsknotenpunkte (Stand 2025). Verschoben aus
// trading/fees.ts im Rahmen der Economic-Engine-Konsolidierung (ROADMAP.md
// Phase 1) - Formeln selbst UNVERAENDERT, siehe DECISIONS.md D013 fuer den
// Teil, der sich fachlich geaendert hat (netMarginPct in profit.ts).
//
// Spieler-Strukturen (Upwell-Citadels) haben abweichende, vom Struktur-Besitzer
// festgelegte Gebuehren (0.5% Basis + Owner-Anteil) und werden von Broker Relations
// NICHT beeinflusst - das bilden wir hier bewusst nicht nach, sondern behandeln
// jede Order konservativ mit der NPC-Station-Formel (realistische Obergrenze).
// Siehe DECISIONS.md D011 - diese Annahme ist deshalb ab jetzt auch als
// "assumption" Teil jeder ScoredCandidate-Antwort (siehe trading/scoring.ts).
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

/**
 * Feste, dokumentierte Annahme hinter den obigen Formeln - siehe Kommentar
 * oben (D011). Zum Aufnehmen in ScoredCandidate.assumptions gedacht. Als
 * Funktion (statt Konstante) fuer beide UI-Sprachen (siehe i18n.ts).
 */
export function upwellStructureFeeAssumption(lang: "en" | "de"): string {
  return lang === "de"
    ? "Gebuehren werden immer nach der NPC-Stations-Formel berechnet, auch fuer Orders in Spieler-Strukturen (Upwell-Citadels) - " +
        "deren tatsaechliche, vom Struktur-Besitzer festgelegte Gebuehren werden nicht abgefragt. Das ist eine konservative Naeherung (realistische Obergrenze)."
    : "Fees are always calculated using the NPC-station formula, even for orders in player-owned structures (Upwell citadels) - " +
        "their actual, structure-owner-defined fees are not queried. This is a conservative approximation (a realistic upper bound).";
}
