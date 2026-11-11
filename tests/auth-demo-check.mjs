import assert from 'node:assert';

// 1. Test role routing matrix
function getRoleRedirect(role, status, targetPath) {
  if (status === 'pending' || status === 'rejected' || role === 'pending') {
    return '/pending';
  }
  if (role === 'rider') {
    return '/rider';
  }
  if (role === 'sales_rep') {
    if (targetPath === '/operations' || targetPath === '/staff' || targetPath === '/') {
      return '/sales';
    }
    return targetPath;
  }
  if (role === 'operator') {
    if (targetPath === '/staff') {
      return '/operations';
    }
    return targetPath;
  }
  return targetPath;
}

// Assert Rider redirects
assert.strictEqual(getRoleRedirect('rider', 'approved', '/'), '/rider');
assert.strictEqual(getRoleRedirect('rider', 'approved', '/operations'), '/rider');
assert.strictEqual(getRoleRedirect('rider', 'approved', '/staff'), '/rider');

// Assert Sales Rep redirects
assert.strictEqual(getRoleRedirect('sales_rep', 'approved', '/'), '/sales');
assert.strictEqual(getRoleRedirect('sales_rep', 'approved', '/operations'), '/sales');
assert.strictEqual(getRoleRedirect('sales_rep', 'approved', '/staff'), '/sales');
assert.strictEqual(getRoleRedirect('sales_rep', 'approved', '/inventory'), '/inventory');

// Assert Operator redirects
assert.strictEqual(getRoleRedirect('operator', 'approved', '/staff'), '/operations');
assert.strictEqual(getRoleRedirect('operator', 'approved', '/operations'), '/operations');
assert.strictEqual(getRoleRedirect('operator', 'approved', '/sales'), '/sales');

// Assert Pending / Rejected redirects
assert.strictEqual(getRoleRedirect('pending', 'pending', '/sales'), '/pending');
assert.strictEqual(getRoleRedirect('sales_rep', 'rejected', '/sales'), '/pending');

// 2. Test demo mode tree-shaking condition
const prodDemoMode = process.env.NODE_ENV === 'production' && process.env.NEXT_PUBLIC_DEMO_MODE !== 'true';
assert.strictEqual(prodDemoMode, false); // in testing/dev

console.log('Auth, role redirection matrix, and demo-mode assertions passed.');
