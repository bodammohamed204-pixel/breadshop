export function parsePrice(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents / 100 : null;
}

export function parseQuantity(value: string): number | null {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) return null;
  const quantity = Number(normalized);
  return Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 100_000
    ? quantity
    : null;
}

export function calculateTotal(quantity: number, unitPrice: number): number {
  const cents = Math.round(unitPrice * 100);
  const totalCents = quantity * cents;
  return Number.isSafeInteger(totalCents) ? totalCents / 100 : Number.NaN;
}
