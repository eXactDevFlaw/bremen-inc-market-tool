// Zentrale Typen der Economic Engine (Phase 1, siehe ROADMAP.md).
//
// Diese Datei enthaelt bewusst nur Typen/Provenance-Hilfsfunktionen, keine
// wirtschaftliche Berechnung selbst (die lebt in fees.ts/profit.ts/roi.ts/
// liquidity.ts/assetValue.ts).

/**
 * Herkunft eines wirtschaftlichen Werts - macht explizit, wie vertrauenswuerdig
 * ein Wert ist, statt das implizit im Zahlentyp verschwinden zu lassen.
 * Siehe docs/economic-model.md ("Value provenance").
 */
export type Provenance = "observed" | "derived" | "estimated" | "configured" | "unknown";

/**
 * Ein Wert zusammen mit seiner Herkunft. `value` ist `null` genau dann, wenn
 * `provenance === "unknown"` - ein unbekannter Wert wird NIEMALS
 * stillschweigend zu 0/Infinity, siehe docs/economic-model.md ("Missing
 * values"). Wird aktuell innerhalb der Economic Engine selbst genutzt; die
 * bestehenden API-Antworten (ScoredCandidate etc.) bleiben in Phase 1 aus
 * Kompatibilitaetsgruenden bei flachen Feldern + je einem zusaetzlichen
 * "...Known"-/assumptions-Hinweis (siehe trading/scoring.ts).
 */
export interface Provenanced<T> {
  value: T | null;
  provenance: Provenance;
  note?: string;
}

export function observed<T>(value: T, note?: string): Provenanced<T> {
  return { value, provenance: "observed", note };
}
export function derived<T>(value: T, note?: string): Provenanced<T> {
  return { value, provenance: "derived", note };
}
export function estimated<T>(value: T, note?: string): Provenanced<T> {
  return { value, provenance: "estimated", note };
}
export function configured<T>(value: T, note?: string): Provenanced<T> {
  return { value, provenance: "configured", note };
}
export function unknownValue<T = never>(note?: string): Provenanced<T> {
  return { value: null, provenance: "unknown", note };
}

export interface DataFreshness {
  /** ISO-Zeitstempel, wann die zugrunde liegenden Marktdaten abgerufen wurden. */
  fetchedAt: string;
  ageSeconds: number;
}

export function freshNow(): DataFreshness {
  return { fetchedAt: new Date().toISOString(), ageSeconds: 0 };
}

/**
 * Gemeinsame Opportunity-Form, wie in docs/economic-model.md ("Common
 * opportunity shape") und DECISIONS.md D012 beschrieben. Dies ist der
 * langfristige Ziel-Vertrag fuer Trading/Hauling/Industry/Exploration -
 * Phase 1 fuellt diesen Typ noch nicht ueberall (die bestehenden API-Typen
 * wie ScoredCandidate werden stattdessen additiv um die fehlenden Felder
 * erweitert, um bestehende UI/AI-Konsumenten nicht zu brechen). Spaetere
 * Phasen (Opportunity Engine, siehe ARCHITECTURE.md) sollen darauf
 * konvergieren.
 */
export interface Opportunity {
  domain: "trading" | "hauling" | "industry" | "exploration";
  action: string;
  item: string;
  source: string;
  destination: string | null;

  capitalRequired: Provenanced<number>;
  grossRevenue: Provenanced<number>;
  totalCosts: Provenanced<number>;
  netProfit: Provenanced<number>;
  netMarginPct: Provenanced<number>;
  roiPct: Provenanced<number>;

  expectedDurationHours: Provenanced<number>;
  iskPerHour: Provenanced<number>;

  volume: Provenanced<number>;
  liquidity: Provenanced<number>;

  riskLevel: "low" | "medium" | "high";
  riskReason: string;

  confidence: number;
  dataFreshness: DataFreshness;

  requiredSkills: string[];
  requiredAssets: string[];
  assumptions: string[];
}
