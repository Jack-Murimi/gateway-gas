import assert from 'node:assert/strict';

console.log('Running Gateway Gas operations self-checks...');

// 1. RBAC permissions test
const roles = ['admin', 'director', 'operator', 'sales_rep', 'rider', 'pending'];
const canManageStaff = (role) => ['admin', 'director'].includes(role);
const canAdjustStock = (role) => ['admin', 'director', 'operator'].includes(role);
const canCreatePosOrder = (role) => ['admin', 'director', 'sales_rep'].includes(role);
const canViewMoneyAmounts = (role) => role !== 'rider';

assert.strictEqual(canManageStaff('admin'), true);
assert.strictEqual(canManageStaff('director'), true);
assert.strictEqual(canManageStaff('sales_rep'), false);
assert.strictEqual(canManageStaff('rider'), false);

assert.strictEqual(canAdjustStock('operator'), true);
assert.strictEqual(canAdjustStock('sales_rep'), false);

assert.strictEqual(canCreatePosOrder('sales_rep'), true);
assert.strictEqual(canCreatePosOrder('rider'), false);

assert.strictEqual(canViewMoneyAmounts('rider'), false, 'Riders MUST NOT view financial amounts');
assert.strictEqual(canViewMoneyAmounts('sales_rep'), true);

// 2. Cylinder Brand-Swap Refill Logic Test
// Customer brings 13kg Afrigas empty, takes 13kg Ola Energy full
const inventory = {
  westlands: {
    'ola-13kg': { full: 20, empty: 4 },
    'afrigas-13kg': { full: 10, empty: 14 },
  },
};

function processRefillSwap(branch, outgoingProduct, incomingBrandProduct, qty) {
  // Deduct full outgoing
  branch[outgoingProduct].full -= qty;
  // Increment empty incoming
  branch[incomingBrandProduct].empty += qty;
}

processRefillSwap(inventory.westlands, 'ola-13kg', 'afrigas-13kg', 2);

assert.strictEqual(inventory.westlands['ola-13kg'].full, 18, 'Ola full count should decrease by 2');
assert.strictEqual(inventory.westlands['afrigas-13kg'].empty, 16, 'Afrigas empty count should increase by 2');

// 3. Pending Staff Approval Workflow Test
const staff = {
  id: 'u-99',
  email: 'test@gatewaygas.co.ke',
  role: 'pending',
  approval_status: 'pending',
};

function approveStaff(staffMember, assignedRole) {
  assert.ok(roles.includes(assignedRole));
  staffMember.role = assignedRole;
  staffMember.approval_status = 'approved';
}

approveStaff(staff, 'sales_rep');
assert.strictEqual(staff.role, 'sales_rep');
assert.strictEqual(staff.approval_status, 'approved');

console.log('✓ All 3 Gateway Gas self-checks passed!');
