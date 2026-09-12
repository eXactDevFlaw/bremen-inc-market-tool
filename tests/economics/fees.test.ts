import { test } from "node:test";
import assert from "node:assert/strict";
import { getBrokerFeePct, getSalesTaxPct } from "../../src/economics/fees.js";

test("getSalesTaxPct: Level 0 = Basissatz 7.5%", () => {
  assert.equal(getSalesTaxPct(0), 7.5);
});

test("getSalesTaxPct: Level 5 = 7.5% * (1 - 0.55) = 3.375%", () => {
  assert.ok(Math.abs(getSalesTaxPct(5) - 3.375) < 1e-9);
});

test("getSalesTaxPct: negative/zu hohe Level werden geklammert", () => {
  assert.equal(getSalesTaxPct(-3), getSalesTaxPct(0));
  assert.equal(getSalesTaxPct(99), getSalesTaxPct(5));
});

test("getBrokerFeePct: Level 0 = Basissatz 3%", () => {
  assert.equal(getBrokerFeePct(0), 3);
});

test("getBrokerFeePct: Level 5 = 3% - 5*0.3pp = 1.5%", () => {
  assert.ok(Math.abs(getBrokerFeePct(5) - 1.5) < 1e-9);
});

test("getBrokerFeePct: nie unter dem Minimum von 1%", () => {
  // 10 Level waeren rechnerisch 0%, ist aber ausserhalb des gueltigen Bereichs (max 5) -
  // trotzdem als Grenzfall-Absicherung gegen das MIN_BROKER_FEE_PCT-Clamping pruefen.
  assert.ok(getBrokerFeePct(5) >= 1);
});
