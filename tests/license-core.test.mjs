import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activateLicense,
  addActivationCode,
  createEmptyStore,
  disableCode,
  resetDeviceBinding,
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
