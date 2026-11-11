import assert from 'node:assert/strict';

// Self-check core phone normalization & KES currency logic
function normalizeKenyanPhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) return `+254${digits.slice(1)}`;
  if (digits.startsWith('254') && digits.length === 12) return `+${digits}`;
  if (digits.length === 9) return `+254${digits}`;
  return phone.startsWith('+') ? phone : `+${digits}`;
}

function formatKES(amount) {
  if (isNaN(amount) || amount === null || amount === undefined) return 'KES 0';
  return `KES ${Math.round(amount).toLocaleString('en-KE')}`;
}

// 1. Phone normalization tests
assert.equal(normalizeKenyanPhone('0712345678'), '+254712345678');
assert.equal(normalizeKenyanPhone('254712345678'), '+254712345678');
assert.equal(normalizeKenyanPhone('712345678'), '+254712345678');
assert.equal(normalizeKenyanPhone('+254712345678'), '+254712345678');
assert.equal(normalizeKenyanPhone('0722 000 111'), '+254722000111');

// 2. Currency formatting tests
assert.equal(formatKES(0), 'KES 0');
assert.equal(formatKES(1250), 'KES 1,250');
assert.equal(formatKES(2999.8), 'KES 3,000');

// 3. Shift Close Z-Report cash variance & numbering logic
function calculateCashVariance(declared, expected) {
  return declared - expected;
}
assert.equal(calculateCashVariance(12500, 12500), 0);
assert.equal(calculateCashVariance(13000, 12500), 500); // Surplus
assert.equal(calculateCashVariance(12000, 12500), -500); // Shortage

// 4. Returnable vs disposable empty state logic
function hasEmptyState(product) {
  if (product.category === 'cylinder') return true;
  if (product.category === 'water') {
    return (product.refill_price_kes || 0) > 0 && product.brand?.toLowerCase() !== 'japeli';
  }
  return false;
}

assert.equal(hasEmptyState({ category: 'cylinder', brand: 'Afrigas', refill_price_kes: 1450 }), true);
assert.equal(hasEmptyState({ category: 'water', brand: 'Keringet', refill_price_kes: 650 }), true);
assert.equal(hasEmptyState({ category: 'water', brand: 'Aquamist', refill_price_kes: 600 }), true);
assert.equal(hasEmptyState({ category: 'water', brand: 'Japeli', refill_price_kes: 0 }), false);
assert.equal(hasEmptyState({ category: 'water', brand: 'Japeli', refill_price_kes: 550 }), false);
assert.equal(hasEmptyState({ category: 'accessory', brand: 'Kabason', refill_price_kes: 0 }), false);

console.log('All core logic checks passed.');
