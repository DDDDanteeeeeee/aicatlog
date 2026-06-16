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
    pointLedger: [],
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

export function createActivationCode({ plan = 'lifetime', expiresAt = undefined, note = '', points = 0 } = {}) {
  const code = formatActivationCode(randomBytes(12).toString('hex').toUpperCase());
  const normalizedPlan = normalizePlan(plan);
  const createdAt = new Date();
  return {
    id: `code_${randomUUID()}`,
    codeHash: hashActivationCode(code),
    displayCode: code,
    plan: normalizedPlan,
    note,
    points: normalizePoints(points),
    status: 'active',
    maxDevices: 1,
    boundDeviceId: null,
    accountEmail: null,
    createdAt: createdAt.toISOString(),
    activatedAt: null,
    redeemedAt: null,
    redeemedByCodeId: null,
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
  if (normalizePoints(code.points) > 0 && !code.redeemedAt) {
    redeemCodeToLicense(store, {
      licenseCode: code,
      redeemCode: code,
      deviceId,
      accountEmail,
      note: 'activation-code-points',
    });
  }

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
    pointsBalance: getPointsBalance(store, code.id),
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
    pointsBalance: getPointsBalance(store, code.id),
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

export function redeemPointsCode(store, { licenseToken, activationCode, redeemCode, deviceId, email }) {
  const license = findLicenseForPoints(store, { licenseToken, activationCode, deviceId, email });
  if (!license) return { ok: false, reason: 'LICENSE_NOT_FOUND', message: '授权不存在或当前设备未激活。' };

  const code = findCode(store, redeemCode);
  const invalid = validateCodeForUse(code);
  if (invalid) return invalid;
  if (code.redeemedAt) return { ok: false, reason: 'CODE_REDEEMED', message: '兑换码已被使用。' };
  const points = normalizePoints(code.points);
  if (points <= 0) return { ok: false, reason: 'NO_POINTS', message: '兑换码不包含点数。' };

  redeemCodeToLicense(store, {
    licenseCode: license,
    redeemCode: code,
    deviceId,
    accountEmail: license.accountEmail || normalizeEmail(email),
    note: 'points-redeem',
  });

  return {
    ok: true,
    message: '点数兑换成功。',
    licenseId: license.id,
    redeemedPoints: points,
    pointsBalance: getPointsBalance(store, license.id),
  };
}

export function consumePoints(store, { licenseToken, activationCode, deviceId, email, points, taskId = '', note = '' }) {
  const license = findLicenseForPoints(store, { licenseToken, activationCode, deviceId, email });
  if (!license) return { ok: false, reason: 'LICENSE_NOT_FOUND', message: '授权不存在或当前设备未激活。' };
  const amount = normalizePoints(points);
  if (amount <= 0) return { ok: false, reason: 'INVALID_POINTS', message: '扣点数量无效。' };
  if (taskId) {
    const taskBalance = getTaskPointBalance(store, license.id, taskId);
    if (taskBalance.netConsumed > 0) {
      if (taskBalance.netConsumed !== amount) {
        return {
          ok: false,
          reason: 'TASK_ALREADY_CHARGED',
          message: '该任务已扣点，且扣点数量与当前请求不一致。',
          pointsBalance: getPointsBalance(store, license.id),
          consumedPoints: taskBalance.netConsumed,
        };
      }
      return {
        ok: true,
        message: '该任务已扣点。',
        licenseId: license.id,
        consumedPoints: taskBalance.netConsumed,
        pointsBalance: getPointsBalance(store, license.id),
        alreadyConsumed: true,
      };
    }
  }
  const balance = getPointsBalance(store, license.id);
  if (balance < amount) {
    return { ok: false, reason: 'INSUFFICIENT_POINTS', message: '点数余额不足。', pointsBalance: balance, requiredPoints: amount };
  }
  ensurePointLedger(store).push({
    id: `pt_${randomUUID()}`,
    licenseId: license.id,
    type: 'consume',
    points: -amount,
    taskId,
    note,
    createdAt: new Date().toISOString(),
  });
  return {
    ok: true,
    message: '点数扣除成功。',
    licenseId: license.id,
    consumedPoints: amount,
    pointsBalance: getPointsBalance(store, license.id),
  };
}

export function refundPoints(store, { licenseToken, activationCode, deviceId, email, points, taskId = '', note = '' }) {
  const license = findLicenseForPoints(store, { licenseToken, activationCode, deviceId, email });
  if (!license) return { ok: false, reason: 'LICENSE_NOT_FOUND', message: '授权不存在或当前设备未激活。' };
  const amount = normalizePoints(points);
  if (amount <= 0) return { ok: false, reason: 'INVALID_POINTS', message: '返还点数无效。' };
  if (!taskId) return { ok: false, reason: 'MISSING_TASK_ID', message: '缺少任务编号，无法返还点数。' };
  const taskBalance = getTaskPointBalance(store, license.id, taskId);
  if (taskBalance.consumed <= 0) {
    return {
      ok: false,
      reason: 'TASK_CHARGE_NOT_FOUND',
      message: '未找到该任务的扣点记录。',
      pointsBalance: getPointsBalance(store, license.id),
    };
  }
  if (taskBalance.netConsumed <= 0) {
    return {
      ok: true,
      message: '点数已返还。',
      licenseId: license.id,
      refundedPoints: 0,
      pointsBalance: getPointsBalance(store, license.id),
      alreadyRefunded: true,
    };
  }
  if (amount > taskBalance.netConsumed) {
    return {
      ok: false,
      reason: 'REFUND_EXCEEDS_CHARGE',
      message: '返还点数不能超过该任务未返还的扣点数量。',
      pointsBalance: getPointsBalance(store, license.id),
      refundablePoints: taskBalance.netConsumed,
    };
  }
  ensurePointLedger(store).push({
    id: `pt_${randomUUID()}`,
    licenseId: license.id,
    type: 'refund',
    points: amount,
    taskId,
    note,
    createdAt: new Date().toISOString(),
  });
  return {
    ok: true,
    message: '点数返还成功。',
    licenseId: license.id,
    refundedPoints: amount,
    pointsBalance: getPointsBalance(store, license.id),
  };
}

export function getPointsBalance(store, licenseId) {
  return ensurePointLedger(store)
    .filter((entry) => entry.licenseId === licenseId)
    .reduce((total, entry) => total + Number(entry.points || 0), 0);
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
    points: normalizePoints(code.points),
    redeemed: Boolean(code.redeemedAt),
    redeemedAt: code.redeemedAt,
    redeemedByCodeId: code.redeemedByCodeId,
    pointsBalance: getPointsBalance(store, code.id),
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

function findLicenseForPoints(store, { licenseToken, activationCode, deviceId, email }) {
  const accountEmail = normalizeEmail(email);
  if (activationCode) {
    const code = findCode(store, activationCode);
    const invalid = validateCodeForUse(code, { deviceId, enforceDevice: true });
    if (invalid) return null;
    return code;
  }
  return store.activationCodes.find((item) => {
    if (!item.boundDeviceId) return false;
    if (deviceId && item.boundDeviceId !== deviceId) return false;
    const tokenEmail = item.accountEmail || accountEmail;
    return createLicenseToken({ codeHash: item.codeHash, accountEmail: tokenEmail, deviceId: item.boundDeviceId }) === licenseToken;
  });
}

function redeemCodeToLicense(store, { licenseCode, redeemCode, deviceId, accountEmail, note }) {
  const points = normalizePoints(redeemCode.points);
  if (points <= 0 || redeemCode.redeemedAt) return null;
  const now = new Date().toISOString();
  redeemCode.redeemedAt = now;
  redeemCode.redeemedByCodeId = licenseCode.id;
  ensurePointLedger(store).push({
    id: `pt_${randomUUID()}`,
    licenseId: licenseCode.id,
    codeId: redeemCode.id,
    type: 'redeem',
    points,
    accountEmail: accountEmail || '',
    deviceId: deviceId || '',
    note,
    createdAt: now,
  });
  return redeemCode;
}

function ensurePointLedger(store) {
  if (!Array.isArray(store.pointLedger)) store.pointLedger = [];
  return store.pointLedger;
}

function getTaskPointBalance(store, licenseId, taskId) {
  const entries = ensurePointLedger(store).filter((entry) => entry.licenseId === licenseId && entry.taskId === taskId);
  const consumed = entries
    .filter((entry) => entry.type === 'consume')
    .reduce((total, entry) => total + Math.abs(Number(entry.points || 0)), 0);
  const refunded = entries
    .filter((entry) => entry.type === 'refund')
    .reduce((total, entry) => total + Math.max(0, Number(entry.points || 0)), 0);
  return {
    consumed,
    refunded,
    netConsumed: Math.max(0, consumed - refunded),
  };
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

function normalizePoints(points) {
  const value = Number(points || 0);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.trunc(value);
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
