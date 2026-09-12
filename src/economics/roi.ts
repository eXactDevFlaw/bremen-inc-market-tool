// ROI = netProfit / capitalRequired * 100 (docs/economic-model.md "ROI").
// Bewusst getrennt von netMarginPct (siehe profit.ts) - "Do not mix this
// with ROI". Neu in Phase 1 - vorher gab es im Code keine ROI-Berechnung,
// nur die (fuer Hauling faelschlich "netMarginPct" genannte) aequivalente
// Zahl, siehe DECISIONS.md D013.

/**
 * @param capitalRequired Vorlaeufig PRO EINHEIT (siehe DECISIONS.md D014) -
 *   kein echtes Order-/Positionsgroessen-Kapital, dafuer fehlt aktuell ein
 *   Mengenmodell.
 * @returns null wenn capitalRequired <= 0 (kein sinnvolles ROI ohne
 *   eingesetztes Kapital - bewusst null statt 0/Infinity, siehe
 *   docs/economic-model.md "Missing values").
 */
export function computeRoiPct(netProfit: number, capitalRequired: number): number | null {
  if (capitalRequired <= 0) return null;
  return (netProfit / capitalRequired) * 100;
}
