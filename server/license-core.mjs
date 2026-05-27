import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, randomUUID } from 'node:crypto';

const planRules = {
  monthly: { label: '月会员', days: 30 },
  yearly: { label: '年会员', days: 365 },
  lifetime: { label: '永久买断', days: null },
  standard: { label: '永久买断', days: null },
};

export function createEmptyStore() {
  return {
    version: 1,
    activationCodes: [],
    activations: [],
  };
}

export async function loadStore(storePath) {
  if (!existsSync(storePath)) {
    return createEmptyStore();
  }
  return JSON.parse(await readFile(storePath, 'utf8'));
}

export async function saveStore(storePath, store) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
}

export function createActivationCode({ plan = 'lifetime', expiresAt = undefined, note = '' } = {}) {
  const code = formatActivationCode(randomBytes(12).toString('hex').toUpperCase());
  const normalizedPlan = normalizePlan(plan);
  const createdAt = new Date();
  return {
    id: `code_${randomUUID()}`,
    codeHash: hashActivationCode(code),
    displayCode: code,
    plan: normalizedPlan,
    note,
    status: 'active',
    maxDevices: 1,
    boundDeviceId: null,
    accountEmail: null,
    createdAt: createdAt.toISOString(),
    activatedAt: null,
    expiresAt: resolveExpiresAt({ plan: normalizedPlan, expiresAt, createdAt }),
  };
}

export function formatActivationCode(raw) {
  const compact = String(raw).replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 24);
  return compact.match(/.{1,4}/g)?.join('-') ?? compact;
}

export function hashActivationCode(code) {
  return createHash('sha256').update(normalizeActivationCode(code)).digest('hex');
}

export function normalizeActivationCode(code) {
  return String(code || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

export function createLicenseToken({ codeHash, accountEmail, deviceId }) {
  return createHash('sha256').update(`${codeHash}:${accountEmail}:${deviceId}`).digest('hex');
}

export function activateLicense(store, { email, activationCode, deviceId, appVersion }) {
  const accountEmail = normalizeEmail(email);
  const codeHash = hashActivationCode(activationCode);
  const code = store.activationCodes.find((item) => item.codeHash === codeHash);

  const invalid = validateCodeForUse(code);
  if (invalid) return invalid;

  code.boundDeviceId = deviceId;
  code.accountEmail = accountEmail;
  code.activatedAt = new Date().toISOString();

  const activation = {
    id: `act_${randomUUID()}`,
    codeId: code.id,
    accountEmail,
    deviceId,
    appVersion: appVersion || '',
    action: 'activate',
    createdAt: new Date().toISOString(),
  };
  store.activations.push(activation);

  return {
    ok: true,
    message: '激活成功，当前设备已绑定。',
    licenseId: code.id,
    accountEmail,
    plan: code.plan,
    planLabel: getPlanLabel(code.plan),
    expiresAt: code.expiresAt,
    deviceBinding: 'active',
    licenseToken: createLicenseToken({ codeHash, accountEmail, deviceId }),
  };
}

export function verifyLicense(store, { email, activationCode, licenseToken, deviceId }) {
  const accountEmail = normalizeEmail(email);
  const codeHash = activationCode ? hashActivationCode(activationCode) : null;
  const code = codeHash
    ? store.activationCodes.find((item) => item.codeHash === codeHash)
    : store.activationCodes.find((item) => {
        if (!item.boundDeviceId) return false;
        return createLicenseToken({ codeHash: item.codeHash, accountEmail: item.accountEmail, deviceId: item.boundDeviceId }) === licenseToken;
      });

  const invalid = validateCodeForUse(code, { deviceId, enforceDevice: true });
  if (invalid) return invalid;

  if (code.accountEmail && accountEmail && code.accountEmail !== accountEmail) {
    return { ok: false, reason: 'ACCOUNT_MISMATCH', message: '该激活码不属于当前账号。' };
  }

  return {
    ok: true,
    message: '授权有效。',
    licenseId: code.id,
    accountEmail: code.accountEmail || accountEmail,
    plan: code.plan,
    planLabel: getPlanLabel(code.plan),
    expiresAt: code.expiresAt,
    deviceBinding: 'active',
    licenseToken: createLicenseToken({ codeHash: code.codeHash, accountEmail: code.accountEmail || accountEmail, deviceId }),
  };
}

export function disableCode(store, codeValue) {
  const code = findCode(store, codeValue);
  if (!code) return { ok: false, message: '激活码不存在。' };
  code.status = 'disabled';
  return { ok: true, codeId: code.id };
}

export function resetDeviceBinding(store, codeValue) {
  const code = findCode(store, codeValue);
  if (!code) return { ok: false, message: '激活码不存在。' };
  code.boundDeviceId = null;
  code.accountEmail = null;
  code.activatedAt = null;
  return { ok: true, codeId: code.id };
}

export function listCodes(store) {
  return store.activationCodes.map((code) => ({
    id: code.id,
    displayCode: code.displayCode,
    plan: code.plan,
    planLabel: getPlanLabel(code.plan),
    status: code.status,
    bound: Boolean(code.boundDeviceId),
    accountEmail: code.accountEmail,
    createdAt: code.createdAt,
    activatedAt: code.activatedAt,
    expiresAt: code.expiresAt,
    note: code.note,
  }));
}

export function addActivationCode(store, options) {
  const code = createActivationCode(options);
  store.activationCodes.push(code);
  return code;
}

function findCode(store, codeValue) {
  const codeHash = hashActivationCode(codeValue);
  return store.activationCodes.find((item) => item.codeHash === codeHash);
}

function validateCodeForUse(code, { deviceId, enforceDevice = false } = {}) {
  if (!code) return { ok: false, reason: 'CODE_NOT_FOUND', message: '激活码不存在。' };
  if (code.status !== 'active') return { ok: false, reason: 'CODE_DISABLED', message: '激活码已停用。' };
  if (code.expiresAt && Date.parse(code.expiresAt) < Date.now()) {
    return { ok: false, reason: 'CODE_EXPIRED', message: '激活码已过期。' };
  }
  if (enforceDevice && code.boundDeviceId && code.boundDeviceId !== deviceId) {
    return { ok: false, reason: 'DEVICE_MISMATCH', message: '该激活码已在其他设备上重新激活。' };
  }
  return null;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function normalizePlan(plan) {
  const value = String(plan || 'lifetime').trim().toLowerCase();
  return planRules[value] ? value : 'lifetime';
}

function resolveExpiresAt({ plan, expiresAt, createdAt }) {
  if (expiresAt !== undefined) return expiresAt || null;
  const rule = planRules[plan] || planRules.lifetime;
  if (!rule.days) return null;
  const date = new Date(createdAt.getTime() + rule.days * 24 * 60 * 60 * 1000);
  return date.toISOString();
}

function getPlanLabel(plan) {
  return (planRules[plan] || planRules.lifetime).label;
}
