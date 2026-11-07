import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTotal, parsePrice, parseQuantity } from './input-validation.ts';
import { getReceiptPreview } from './receipt-preview.ts';
import { receiptHtml } from './printer.ts';
import type { Sale } from './models';

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

test('previews the exact confirmed amount for both bread types', () => {
  const base: Sale = { id: 1, product_id: 'baladi', product_name: 'عيش بلدي', quantity: 50, unit_price: 0.2, total: calculateTotal(50, 0.2), created_at: '2026-11-07T10:15:00.000Z', print_status: 'not_printed' };
  const baladi = getReceiptPreview(base);
  assert.equal(baladi.product, 'نوع العيش: عيش بلدي');
  assert.equal(baladi.quantity, 'الكمية: 50');
  assert.equal(baladi.unitPrice, 'سعر الوحدة: 0.20 ج.م');
  assert.equal(baladi.total, 'الإجمالي: 10.00 ج.م');
  assert.equal(baladi.thanks, 'شكراً لزيارتكم');

  const free = getReceiptPreview({ ...base, product_id: 'free', product_name: 'عيش حر', unit_price: 1.5, total: calculateTotal(50, 1.5) });
  assert.equal(free.product, 'نوع العيش: عيش حر');
  assert.equal(free.total, 'الإجمالي: 75.00 ج.م');
  const html = receiptHtml(base, 58);
  assert.match(html, /نوع العيش: عيش بلدي/);
  assert.match(html, /الكمية: 50/);
  assert.match(html, /سعر الوحدة: 0\.20 ج\.م/);
  assert.match(html, /الإجمالي: 10\.00 ج\.م/);
});
