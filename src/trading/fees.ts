// Kompatibilitaets-Shim: die Gebuehren-%-Formeln leben jetzt in
// src/economics/fees.ts (Teil der zentralen Economic Engine, siehe
// ARCHITECTURE.md/ROADMAP.md Phase 1). Re-Export hier, damit bestehende
// Importe (z.B. trading/skillAdvisor.ts) unveraendert funktionieren.
//
// Die frueheren netStationTradeProfit()/netHaulProfit()-Funktionen wurden
// nach src/economics/profit.ts verschoben UND dabei fachlich korrigiert
// (siehe DECISIONS.md D013: netMarginPct war fuer Hauling bisher
// inkonsistent zur Station-Trading-Formel definiert). Aufrufer
// (trading/scoring.ts, routes/trading.ts) nutzen jetzt
// economics/profit.ts#computeStationTradeProfit/computeHaulProfit direkt.
export { getBrokerFeePct, getSalesTaxPct, NO_SKILLS, upwellStructureFeeAssumption, type TradeFeeSkills } from "../economics/fees.js";
