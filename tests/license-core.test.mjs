import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateLicense,
  addActivationCode,
  consumePoints,
  createEmptyStore,
  disableCode,
  redeemPointsCode,
  resetDeviceBinding,
  refundPoints,
  verifyLicense,
} from '../server/license-core.mjs';

test('activation code binds to first device and verifies later', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, { plan: 'standard' });

  const activated = activateLicense(store, {
    email: 'User@Example.com',
    activationCode: code.displayCode,
    deviceId: 'device-a',
    appVersion: '1.0.0',
  });

  assert.equal(activated.ok, true);
  assert.equal(activated.accountEmail, 'user@example.com');
  assert.equal(store.activationCodes[0].boundDeviceId, 'device-a');

  const verified = verifyLicense(store, {
    email: 'user@example.com',
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  assert.equal(verified.ok, true);
});

test('latest activation wins and previous device token stops verifying', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, {});

  const first = activateLicense(store, {
    email: 'a@example.com',
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  const result = activateLicense(store, {
    email: 'a@example.com',
    activationCode: code.displayCode,
    deviceId: 'device-b',
  });

  assert.equal(result.ok, true);
  assert.equal(store.activationCodes[0].boundDeviceId, 'device-b');

  const oldDevice = verifyLicense(store, {
    licenseToken: first.licenseToken,
    deviceId: 'device-a',
  });
  assert.equal(oldDevice.ok, false);
  assert.equal(oldDevice.reason, 'CODE_NOT_FOUND');

  const newDevice = verifyLicense(store, {
    licenseToken: result.licenseToken,
    deviceId: 'device-b',
  });
  assert.equal(newDevice.ok, true);
});

test('admin can reset device binding', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, {});

  activateLicense(store, {
    email: 'a@example.com',
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  assert.equal(resetDeviceBinding(store, code.displayCode).ok, true);

  const result = activateLicense(store, {
    email: 'a@example.com',
    activationCode: code.displayCode,
    deviceId: 'device-b',
  });

  assert.equal(result.ok, true);
});

test('disabled activation code cannot be used', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, {});
  disableCode(store, code.displayCode);

  const result = activateLicense(store, {
    email: 'a@example.com',
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CODE_DISABLED');
});

test('monthly and yearly codes expire from code creation time', () => {
  const monthlyStore = createEmptyStore();
  const beforeMonthly = Date.now();
  const monthly = addActivationCode(monthlyStore, { plan: 'monthly' });
  const afterMonthly = Date.now();
  assert.equal(monthly.plan, 'monthly');
  assert.ok(Date.parse(monthly.expiresAt) >= beforeMonthly + 30 * 24 * 60 * 60 * 1000);
  assert.ok(Date.parse(monthly.expiresAt) <= afterMonthly + 30 * 24 * 60 * 60 * 1000 + 1000);

  const yearlyStore = createEmptyStore();
  const beforeYearly = Date.now();
  const yearly = addActivationCode(yearlyStore, { plan: 'yearly' });
  const afterYearly = Date.now();
  assert.equal(yearly.plan, 'yearly');
  assert.ok(Date.parse(yearly.expiresAt) >= beforeYearly + 365 * 24 * 60 * 60 * 1000);
  assert.ok(Date.parse(yearly.expiresAt) <= afterYearly + 365 * 24 * 60 * 60 * 1000 + 1000);
});

test('lifetime and legacy standard codes do not expire by default', () => {
  const store = createEmptyStore();
  const lifetime = addActivationCode(store, { plan: 'lifetime' });
  const legacy = addActivationCode(store, { plan: 'standard' });

  assert.equal(lifetime.expiresAt, null);
  assert.equal(legacy.expiresAt, null);
  assert.equal(legacy.plan, 'standard');
});

test('expired code is rejected even on the bound device', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, { plan: 'monthly', expiresAt: '2020-01-01T00:00:00.000Z' });

  const result = activateLicense(store, {
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'CODE_EXPIRED');
});

test('saved license token verifies without asking user to reactivate', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, { plan: 'monthly' });
  const activated = activateLicense(store, {
    activationCode: code.displayCode,
    deviceId: 'device-a',
    appVersion: '1.0.2',
  });

  const verified = verifyLicense(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
  });

  assert.equal(verified.ok, true);
  assert.equal(verified.plan, 'monthly');
  assert.equal(verified.expiresAt, code.expiresAt);
});

test('activation code can include initial points', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, { plan: 'standard', points: 100 });

  const activated = activateLicense(store, {
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  assert.equal(activated.ok, true);
  assert.equal(activated.pointsBalance, 100);

  const verified = verifyLicense(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
  });
  assert.equal(verified.pointsBalance, 100);
});

test('points code can be redeemed once and consumed', () => {
  const store = createEmptyStore();
  const licenseCode = addActivationCode(store, { plan: 'standard' });
  const pointsCode = addActivationCode(store, { plan: 'standard', points: 30 });
  const activated = activateLicense(store, {
    activationCode: licenseCode.displayCode,
    deviceId: 'device-a',
  });

  const redeemed = redeemPointsCode(store, {
    licenseToken: activated.licenseToken,
    redeemCode: pointsCode.displayCode,
    deviceId: 'device-a',
  });
  assert.equal(redeemed.ok, true);
  assert.equal(redeemed.redeemedPoints, 30);
  assert.equal(redeemed.pointsBalance, 30);

  const duplicate = redeemPointsCode(store, {
    licenseToken: activated.licenseToken,
    redeemCode: pointsCode.displayCode,
    deviceId: 'device-a',
  });
  assert.equal(duplicate.ok, false);
  assert.equal(duplicate.reason, 'CODE_REDEEMED');

  const consumed = consumePoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 12,
    taskId: 'task-1',
  });
  assert.equal(consumed.ok, true);
  assert.equal(consumed.pointsBalance, 18);
});

test('consume points rejects insufficient balance', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, { plan: 'standard', points: 5 });
  const activated = activateLicense(store, {
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  const result = consumePoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 6,
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'INSUFFICIENT_POINTS');
  assert.equal(result.pointsBalance, 5);
});

test('refund points restores failed task charge once', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, { plan: 'standard', points: 20 });
  const activated = activateLicense(store, {
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  const consumed = consumePoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 7,
    taskId: 'task-failed',
  });
  assert.equal(consumed.ok, true);
  assert.equal(consumed.pointsBalance, 13);

  const refunded = refundPoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 7,
    taskId: 'task-failed',
  });
  assert.equal(refunded.ok, true);
  assert.equal(refunded.refundedPoints, 7);
  assert.equal(refunded.pointsBalance, 20);

  const duplicate = refundPoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 7,
    taskId: 'task-failed',
  });
  assert.equal(duplicate.ok, true);
  assert.equal(duplicate.alreadyRefunded, true);
  assert.equal(duplicate.pointsBalance, 20);
});

test('consume points is idempotent for the same charged task', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, { plan: 'standard', points: 20 });
  const activated = activateLicense(store, {
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  const first = consumePoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 7,
    taskId: 'task-repeat',
  });
  assert.equal(first.ok, true);
  assert.equal(first.pointsBalance, 13);

  const second = consumePoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 7,
    taskId: 'task-repeat',
  });
  assert.equal(second.ok, true);
  assert.equal(second.alreadyConsumed, true);
  assert.equal(second.pointsBalance, 13);
});

test('refund points rejects missing or excessive task charges', () => {
  const store = createEmptyStore();
  const code = addActivationCode(store, { plan: 'standard', points: 20 });
  const activated = activateLicense(store, {
    activationCode: code.displayCode,
    deviceId: 'device-a',
  });

  const forged = refundPoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 7,
    taskId: 'task-never-charged',
  });
  assert.equal(forged.ok, false);
  assert.equal(forged.reason, 'TASK_CHARGE_NOT_FOUND');
  assert.equal(forged.pointsBalance, 20);

  const consumed = consumePoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 7,
    taskId: 'task-over-refund',
  });
  assert.equal(consumed.ok, true);
  assert.equal(consumed.pointsBalance, 13);

  const excessive = refundPoints(store, {
    licenseToken: activated.licenseToken,
    deviceId: 'device-a',
    points: 8,
    taskId: 'task-over-refund',
  });
  assert.equal(excessive.ok, false);
  assert.equal(excessive.reason, 'REFUND_EXCEEDS_CHARGE');
  assert.equal(excessive.pointsBalance, 13);
});
