import assert from 'node:assert';

// Mock customer list
const customers = [
  {
    id: 'cust-1',
    name: 'Faith Auma',
    phones: [
      { id: 'cp-1', phone_number: '+254712345678', is_primary: true },
      { id: 'cp-2', phone_number: '+254722998877', is_primary: false },
    ],
    locations: [
      { id: 'cl-1', estate: 'Westlands', specific_address: 'Rhapta Road, Apt 4B', is_default: true },
      { id: 'cl-2', estate: 'Parklands', specific_address: '3rd Avenue, Hse 12', is_default: false },
    ],
  },
];

// 1. Search logic test
function searchCustomer(query) {
  const q = query.toLowerCase();
  return customers.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.phones.some((p) => p.phone_number.includes(q)) ||
      c.locations.some(
        (l) => l.estate.toLowerCase().includes(q) || (l.specific_address && l.specific_address.toLowerCase().includes(q))
      )
  );
}

// Test search by name
assert.strictEqual(searchCustomer('Faith').length, 1);
// Test search by secondary phone
assert.strictEqual(searchCustomer('722998877').length, 1);
// Test search by secondary location
assert.strictEqual(searchCustomer('Parklands').length, 1);
// Test negative search
assert.strictEqual(searchCustomer('Mombasa').length, 0);

// 2. Walkin delivery business rule
function validateOrder({ isPosWalkin, selectedCustomer, receiptNumber }) {
  if (!receiptNumber || receiptNumber.trim() === '') {
    throw new Error('Physical receipt number required');
  }
  if (!isPosWalkin && !selectedCustomer) {
    throw new Error('Deliveries require customer details');
  }
  return true;
}

assert.strictEqual(validateOrder({ isPosWalkin: true, selectedCustomer: null, receiptNumber: 'WST-1001' }), true);
assert.throws(() => validateOrder({ isPosWalkin: false, selectedCustomer: null, receiptNumber: 'WST-1001' }));
assert.strictEqual(validateOrder({ isPosWalkin: false, selectedCustomer: customers[0], receiptNumber: 'WST-1001' }), true);

console.log('Customer POS verification check passed');
