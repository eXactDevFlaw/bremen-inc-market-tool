import { test } from "node:test";
import assert from "node:assert/strict";
import { computeConfidence, deriveVolumeSignal } from "../../src/economics/liquidity.js";

test("deriveVolumeSignal: null wird zu provenance 'unknown', nicht zu einem 0-Wert", () => {
  const signal = deriveVolumeSignal(null);
  assert.equal(signal.provenance, "unknown");
  assert.equal(signal.value, null);
});

test("deriveVolumeSignal: eine echte Zahl (auch 0) wird 'observed'", () => {
  const signal = deriveVolumeSignal(0);
  assert.equal(signal.provenance, "observed");
  assert.equal(signal.value, 0);

  const signal2 = deriveVolumeSignal(42);
  assert.equal(signal2.provenance, "observed");
  assert.equal(signal2.value, 42);
});

test("computeConfidence: unbekanntes Volumen ergibt niedrige, aber definierte Confidence (kein Crash, kein NaN)", () => {
  const c = computeConfidence({ volume: deriveVolumeSignal(null), competingOrders: 0, ageSeconds: 0 });
  assert.ok(Number.isFinite(c));
  assert.ok(c >= 0 && c <= 1);
});

test("computeConfidence: hohes Volumen + viele Orders + frische Daten > niedriges Volumen + wenig Orders + alte Daten", () => {
  const good = computeConfidence({ volume: deriveVolumeSignal(1000), competingOrders: 20, ageSeconds: 0 });
  const bad = computeConfidence({ volume: deriveVolumeSignal(0.1), competingOrders: 1, ageSeconds: 60 * 60 * 5 });
  assert.ok(good > bad);
});

test("computeConfidence: Ergebnis immer in [0, 1]", () => {
  const c = computeConfidence({ volume: deriveVolumeSignal(1_000_000), competingOrders: 500, ageSeconds: 0 });
  assert.ok(c <= 1);
});
