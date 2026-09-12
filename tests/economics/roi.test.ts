import { test } from "node:test";
import assert from "node:assert/strict";
import { computeRoiPct } from "../../src/economics/roi.js";
import { computeHaulProfit } from "../../src/economics/profit.js";
import { NO_SKILLS } from "../../src/economics/fees.js";

test("computeRoiPct: netProfit / capitalRequired * 100", () => {
  assert.equal(computeRoiPct(50, 100), 50);
});

test("computeRoiPct: null statt Infinity/0 bei capitalRequired <= 0", () => {
  assert.equal(computeRoiPct(50, 0), null);
  assert.equal(computeRoiPct(50, -10), null);
});

test("ROI und Margin unterscheiden sich fuer denselben Haul-Kandidaten (Regressionstest D013)", () => {
  const buyPrice = 100;
  const sellPrice = 150;
  const profit = computeHaulProfit(buyPrice, sellPrice, NO_SKILLS);
  const roi = computeRoiPct(profit.netProfit, buyPrice);
  assert.notEqual(roi, profit.netMarginPct);
  // ROI (./. buyPrice) muss dem entsprechen, was VOR der Korrektur als
  // "netMarginPct" fuer Hauling berechnet wurde.
  const oldNetMarginPctDefinition = (profit.netProfit / buyPrice) * 100;
  assert.ok(roi !== null && Math.abs(roi - oldNetMarginPctDefinition) < 1e-9);
});
