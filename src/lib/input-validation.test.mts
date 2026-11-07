import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTotal, parsePrice, parseQuantity } from './input-validation.ts';

test('accepts supported decimal prices', () => {
  assert.equal(parsePrice('0.2'), 0.2);
  assert.equal(parsePrice('1.5'), 1.5);
  assert.equal(parsePrice('2.25'), 2.25);
  assert.equal(parsePrice('0'), 0);
});

test('accepts positive whole-number quantities', () => {
  for (const value of ['1', '10', '50', '100']) {
    assert.equal(parseQuantity(value), Number(value));
  }
});

test('rejects invalid prices and quantities', () => {
  for (const value of ['-1', '', '1.234', 'abc']) assert.equal(parsePrice(value), null);
  for (const value of ['0', '-1', '1.5', '', '100001']) assert.equal(parseQuantity(value), null);
});

test('calculates totals using integer minor units', () => {
  assert.equal(calculateTotal(3, 0.1), 0.3);
  assert.equal(calculateTotal(50, 2.25), 112.5);
  assert.equal(calculateTotal(100, 1.5), 150);
});
