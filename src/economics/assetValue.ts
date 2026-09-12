// Gemeinsame Asset-Bewertung. Behebt die doppelte Implementierung derselben
// Logik in routes/overview.ts (estimateAssetValue) und routes/characters.ts
// (inline im /assets-Handler) - siehe ARCHITECTURE.md "Architectural
// invariant": eine Formel, eine Implementierung.

/**
 * ESI-Konvention: quantity -1 = Blueprint-Original, -2 = Blueprint-Kopie
 * (kein Stack-Count, kein Mengenwert). Fuer die Wertschaetzung als 1 Stueck
 * behandeln, sonst wuerde die Multiplikation einen negativen "Wert" ergeben.
 */
export function effectiveAssetQuantity(quantity: number): number {
  return quantity < 0 ? 1 : quantity;
}

/** Wert eines einzelnen Asset-Eintrags, oder null wenn kein Durchschnittspreis bekannt ist (siehe trading/marketData.ts#getAllTypePrices). */
export function assetUnitValue(unitPrice: number | null, quantity: number): number | null {
  if (unitPrice === null) return null;
  return unitPrice * effectiveAssetQuantity(quantity);
}

/** Summierter grober Wert einer Asset-Liste ueber Bulk-Durchschnittspreise (siehe trading/marketData.ts#getAllTypePrices). Assets ohne bekannten Preis tragen 0 bei (nicht "unbekannt" - siehe estimateAssetValue-Kommentar in den aufrufenden Routen fuer den Kontext: das ist eine grobe Gesamt-Schaetzung, kein einzelner Opportunity-Wert). */
export function totalAssetValue(assets: { type_id: number; quantity: number }[], prices: Map<number, number>): number {
  return assets.reduce((sum, a) => {
    const price = prices.get(a.type_id);
    if (price === undefined) return sum;
    return sum + price * effectiveAssetQuantity(a.quantity);
  }, 0);
}
