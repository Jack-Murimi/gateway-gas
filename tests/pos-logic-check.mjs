import assert from 'node:assert';
import { resizeReturns, groupReturns } from '../src/components/pos/pos-logic.ts';

assert.deepStrictEqual(resizeReturns(['TOTAL'], 3, 'K-GAS'), ['TOTAL', 'K-GAS', 'K-GAS']);
assert.deepStrictEqual(resizeReturns(['A', 'B', 'C'], 2, 'X'), ['A', 'B']);
assert.deepStrictEqual(groupReturns(['TOTAL', 'OLA', 'TOTAL']), [{ brand: 'TOTAL', quantity: 2 }, { brand: 'OLA', quantity: 1 }]);
console.log('pos-logic ok');
