import assert from 'node:assert';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const target = path.join(root, 'src', specifier.slice(2));
      const candidates = [target, `${target}.ts`, path.join(target, 'index.ts')];
      const filePath = candidates.find(p => fs.existsSync(p) && fs.statSync(p).isFile());
      if (filePath) return { url: pathToFileURL(filePath).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { groupProducts } = await import('../src/lib/product-order.ts');

const makeProduct = (id, name, brand, size_kg, category, refill_price_kes = 0) => ({
  id,
  name,
  brand,
  size_kg,
  category,
  refill_price_kes,
  complete_price_kes: 0,
  accessory_price_kes: 0,
  is_active: true,
});

const catalog = [
  makeProduct('c1', '3KG LAKE', 'LAKE', 3, 'cylinder', 1000),
  makeProduct('c2', '3KG TOTAL', 'TOTAL', 3, 'cylinder', 1000),
  ...['AFRIGAS', 'K-GAS', 'TOTAL', 'OLA', 'PROGAS', 'TOSHA', 'LAKE', 'HASHI', 'SUPA', 'JATEL', 'SEAGAS', 'RAHA', 'BONOKO'].map(
    (brand, i) => makeProduct(`c6-${i}`, `6KG ${brand}`, brand, 6, 'cylinder', 1350),
  ),
  ...['AFRIGAS', 'K-GAS', 'TOTAL', 'OLA', 'PROGAS', 'TOSHA', 'LAKE', 'HASHI', 'SUPA', 'JATEL', 'SEAGAS', 'RAHA', 'BONOKO'].map(
    (brand, i) => makeProduct(`c13-${i}`, `13KG ${brand}`, brand, 13, 'cylinder', 3100),
  ),
  makeProduct('c22', '22.5KG TOTAL', 'TOTAL', 22.5, 'cylinder', 6300),
  makeProduct('c35-1', '35KG HASHI', 'HASHI', 35, 'cylinder', 9000),
  makeProduct('c35-2', '35KG K-GAS', 'K-GAS', 35, 'cylinder', 9000),
  makeProduct('c45', '45KG AFRIGAS', 'AFRIGAS', 45, 'cylinder', 11500),
  ...['TOTAL', 'HASHI', 'LAKE', 'SUPA', 'PURE', 'HUNKER', 'JATEL', 'PROGAS', 'RAHA', 'HASS', 'BONOKO'].map(
    (brand, i) => makeProduct(`c50-${i}`, `50KG ${brand}`, brand, 50, 'cylinder', 12000),
  ),
  makeProduct('w1', '20L AQUAMIST WATER', 'AQUAMIST', 20, 'water', 650),
  makeProduct('w2', '20L KERINGET WATER', 'KERINGET', 20, 'water', 700),
  makeProduct('w3', '20L JAPELI WATER', 'JAPELI', null, 'water', 0),
  makeProduct('w4', '500ML JAPELI WATER', 'JAPELI', null, 'water', 0),
  makeProduct('w5', '5L JAPELI WATER', 'JAPELI', null, 'water', 0),
  makeProduct('w6', '1L JAPELI WATER', 'JAPELI', null, 'water', 0),
  makeProduct('a5', 'Gas Hose Clips (Each)', 'Generic', null, 'accessory', 0),
  makeProduct('a7', 'Gas Hose Pipe (Extra Per Meter)', 'Generic', null, 'accessory', 0),
  makeProduct('a6', 'Gas Hose Pipe (Standard 1.5m)', 'Generic', null, 'accessory', 0),
  makeProduct('a4', 'Cylinder Grill / Trivet', 'Generic', null, 'accessory', 0),
  makeProduct('a3', '6kg Gas Burner Cooker', 'Kabason', null, 'accessory', 0),
  makeProduct('a2', '6kg Kabason Regulator', 'Kabason', null, 'accessory', 0),
  makeProduct('a1', '13kg Kabason Regulator', 'Kabason', null, 'accessory', 0),
];

const groups = groupProducts([...catalog].reverse(), p => p);

assert.deepStrictEqual(
  groups.map(g => g.label),
  [
    '3kg Gas',
    '6kg Gas',
    '13kg Gas',
    '22.5kg Gas',
    '35kg Gas',
    '45kg Gas',
    '50kg Gas',
    'Water (with containers)',
    'Other Water',
    'Accessories',
  ],
);

const byLabel = Object.fromEntries(groups.map(g => [g.label, g.items.map(p => p.name)]));

assert.deepStrictEqual(byLabel['3kg Gas'], ['3KG TOTAL', '3KG LAKE']);

const expectedBrands = [
  'AFRIGAS',
  'K-GAS',
  'TOTAL',
  'OLA',
  'PROGAS',
  'TOSHA',
  'LAKE',
  'HASHI',
  'SUPA',
  'SEAGAS',
  'JATEL',
  'RAHA',
  'BONOKO',
];

assert.deepStrictEqual(
  byLabel['6kg Gas'],
  expectedBrands.map(b => `6KG ${b}`),
);
assert.deepStrictEqual(
  byLabel['13kg Gas'],
  expectedBrands.map(b => `13KG ${b}`),
);
assert.deepStrictEqual(byLabel['22.5kg Gas'], ['22.5KG TOTAL']);
assert.deepStrictEqual(byLabel['35kg Gas'], ['35KG K-GAS', '35KG HASHI']);
assert.deepStrictEqual(byLabel['45kg Gas'], ['45KG AFRIGAS']);
assert.deepStrictEqual(byLabel['50kg Gas'], [
  '50KG TOTAL',
  '50KG PROGAS',
  '50KG LAKE',
  '50KG HASHI',
  '50KG SUPA',
  '50KG JATEL',
  '50KG RAHA',
  '50KG HASS',
  '50KG HUNKER',
  '50KG PURE',
  '50KG BONOKO',
]);

assert.deepStrictEqual(byLabel['Water (with containers)'], [
  '20L KERINGET WATER',
  '20L AQUAMIST WATER',
]);

assert.deepStrictEqual(byLabel['Other Water'], [
  '500ML JAPELI WATER',
  '1L JAPELI WATER',
  '5L JAPELI WATER',
  '20L JAPELI WATER',
]);

assert.deepStrictEqual(byLabel['Accessories'], [
  '13kg Kabason Regulator',
  '6kg Kabason Regulator',
  '6kg Gas Burner Cooker',
  'Cylinder Grill / Trivet',
  'Gas Hose Pipe (Standard 1.5m)',
  'Gas Hose Pipe (Extra Per Meter)',
  'Gas Hose Clips (Each)',
]);

console.log('product-order ok');
