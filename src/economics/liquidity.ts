// Liquiditaets-/Confidence-Hilfsfunktionen. Neu in Phase 1 - behebt zwei
// bisher fehlende Dinge aus docs/economic-model.md:
//
// 1. "Never silently interpret missing volume as zero" (Abschnitt "Missing
//    values"): trading/marketData.ts#recentAverageVolume gab bei fehlender
//    ESI-Historie bisher still 0 zurueck, das ging dann ununterscheidbar von
//    einem echten Handelsvolumen von 0 in die Risikobewertung ein.
//    deriveVolumeSignal() macht diesen Unterschied jetzt explizit.
// 2. "Confidence is not profit" (Abschnitt "Confidence"): es gab bisher gar
//    keinen Confidence-Wert, nur die dreistufige riskLevel-Einordnung.
//
// WICHTIG: computeConfidence() ist eine deterministische, aber bewusst
// GROBE Erstversion (0..1) - kein verifizierter EVE-Mechanismus, sondern
// eine "configured" Heuristik (docs/economic-model.md "Value provenance" /
// Confidence-Abschnitt nennt Faktoren, aber keine Formel). Die Konstanten
// unten sind deshalb explizit als Annahmen markiert und sollten bei Bedarf
// in DECISIONS.md nachvollziehbar angepasst werden, statt sie stillschweigend
// zu aendern.

import type { Provenanced } from "./types.js";
import { observed, unknownValue } from "./types.js";

/**
 * Wandelt ein rohes Handelsvolumen-Sample (z.B. aus ESI-Markthistorie) in
 * einen provenance-behafteten Wert um, statt fehlende Daten stillschweigend
 * als 0 zu behandeln.
 */
export function deriveVolumeSignal(recentAverageVolume: number | null): Provenanced<number> {
  if (recentAverageVolume === null) {
    return unknownValue<number>("Keine Handelshistorie fuer diesen Zeitraum/Ort verfuegbar.");
  }
  return observed(recentAverageVolume);
}

// "configured" Schwellenwerte fuer computeConfidence() - siehe Dateikopf.
const CONFIDENCE_UNKNOWN_VOLUME_SCORE = 0.2;
const CONFIDENCE_VOLUME_CEILING = 50; // Tagesvolumen, ab dem der Liquiditaets-Anteil der Confidence als "voll" gilt.
const CONFIDENCE_ORDER_CEILING = 10; // konkurrierende Orders, ab denen der Order-Anteil als "voll" gilt.
const CONFIDENCE_MAX_FRESHNESS_AGE_SECONDS = 60 * 60; // Daten, die aelter als das sind, tragen 0 zum Frische-Anteil bei.

const CONFIDENCE_WEIGHTS = { volume: 0.5, orders: 0.3, freshness: 0.2 } as const;

export interface ConfidenceInput {
  volume: Provenanced<number>;
  competingOrders: number;
  ageSeconds: number;
}

/**
 * Grobe, deterministische Confidence-Zahl (0..1) aus Liquiditaet,
 * Wettbewerb (Order-Anzahl) und Datenalter. Ersetzt NICHT assessRisk() in
 * trading/scoring.ts - Risiko bleibt eine eigene, separate Groesse
 * (docs/economic-model.md: "Confidence is not profit", "Risk should be
 * modeled separately from profit"). Liefert nur den bisher fehlenden
 * confidence-Wert zusaetzlich zum riskLevel.
 */
export function computeConfidence(input: ConfidenceInput): number {
  const volumeScore =
    input.volume.provenance === "unknown"
      ? CONFIDENCE_UNKNOWN_VOLUME_SCORE
      : Math.min(1, Math.log10((input.volume.value ?? 0) + 2) / Math.log10(CONFIDENCE_VOLUME_CEILING + 2));

  const orderScore = Math.min(1, input.competingOrders / CONFIDENCE_ORDER_CEILING);
  const freshnessScore = Math.max(0, 1 - input.ageSeconds / CONFIDENCE_MAX_FRESHNESS_AGE_SECONDS);

  const combined = volumeScore * CONFIDENCE_WEIGHTS.volume + orderScore * CONFIDENCE_WEIGHTS.orders + freshnessScore * CONFIDENCE_WEIGHTS.freshness;
  return Math.round(combined * 100) / 100;
}
