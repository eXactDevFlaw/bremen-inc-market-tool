import { test } from "node:test";
import assert from "node:assert/strict";
import { assetUnitValue, effectiveAssetQuantity, totalAssetValue } from "../../src/economics/assetValue.js";

test("effectiveAssetQuantity: negative Mengen (Blueprint-Original/-Kopie) werden zu 1", () => {
  assert.equal(effectiveAssetQuantity(-1), 1);
  assert.equal(effectiveAssetQuantity(-2), 1);
  assert.equal(effectiveAssetQuantity(5), 5);
  assert.equal(effectiveAssetQuantity(0), 0);
});

test("assetUnitValue: null wenn kein Preis bekannt", () => {
  assert.equal(assetUnitValue(null, 10), null);
});

test("assetUnitValue: Preis * effektive Menge", () => {
  assert.equal(assetUnitValue(100, 5), 500);
  assert.equal(assetUnitValue(100, -1), 100); // Blueprint-Original als 1 Stueck gewertet
});

test("totalAssetValue: summiert nur Assets mit bekanntem Preis, unbekannte tragen 0 bei", () => {
  const prices = new Map([[1, 10], [2, 5]]);
  const assets = [
    { type_id: 1, quantity: 3 }, // 30
    { type_id: 2, quantity: -1 }, // 5 (Blueprint -> 1 Stueck)
    { type_id: 999, quantity: 100 }, // kein Preis bekannt -> 0
  ];
  assert.equal(totalAssetValue(assets, prices), 35);
});
