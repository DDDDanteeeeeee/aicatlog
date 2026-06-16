import { createServer } from 'node:http';
import { join } from 'node:path';
import {
  activateLicense,
  addActivationCode,
  consumePoints,
  disableCode,
  listCodes,
  loadStore,
  redeemPointsCode,
  resetDeviceBinding,
  refundPoints,
  saveStore,
  verifyLicense,
} from './license-core.mjs';
import {
  estimateTranslatePoints,
  resolveManagedModelConfig,
  translateBatchWithManagedModel,
} from './model-proxy.mjs';

const port = Number(process.env.PORT || 8787);
const storePath = process.env.LICENSE_STORE_PATH || join(process.cwd(), 'data', 'licenses.json');
const adminToken = process.env.ADMIN_TOKEN || '';

const server = createServer(async (req, res) => {
  try {
    await route(req, res);
  } catch (error) {
    sendJson(res, 500, { ok: false, message: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, '0.0.0.0', () => {
  console.log(`License server listening on http://0.0.0.0:${port}`);
});

async function route(req, res) {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === 'GET' && req.url === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/license/activate') {
    const body = await readJson(req);
    const store = await loadStore(storePath);
    const result = activateLicense(store, body);
    if (result.ok) await saveStore(storePath, store);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/license/verify') {
    const body = await readJson(req);
    const store = await loadStore(storePath);
    const result = verifyLicense(store, body);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/points/redeem') {
    const body = await readJson(req);
    const store = await loadStore(storePath);
    const result = redeemPointsCode(store, body);
    if (result.ok) await saveStore(storePath, store);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/points/consume') {
    const body = await readJson(req);
    const store = await loadStore(storePath);
    const result = consumePoints(store, body);
    if (result.ok) await saveStore(storePath, store);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/points/refund') {
    const body = await readJson(req);
    const store = await loadStore(storePath);
    const result = refundPoints(store, body);
    if (result.ok) await saveStore(storePath, store);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === 'POST' && req.url === '/api/translate/batch') {
    await routeTranslateBatch(req, res);
    return;
  }

  if (req.url?.startsWith('/admin/')) {
    if (!adminToken || req.headers.authorization !== `Bearer ${adminToken}`) {
      sendJson(res, 401, { ok: false, message: 'Unauthorized' });
      return;
    }
    await routeAdmin(req, res);
    return;
  }

  sendJson(res, 404, { ok: false, message: 'Not found' });
}

async function routeAdmin(req, res) {
  const store = await loadStore(storePath);

  if (req.method === 'POST' && req.url === '/admin/codes') {
    const body = await readJson(req);
    const code = addActivationCode(store, body);
    await saveStore(storePath, store);
    sendJson(res, 200, { ok: true, activationCode: code.displayCode, code });
    return;
  }

  if (req.method === 'GET' && req.url === '/admin/codes') {
    sendJson(res, 200, { ok: true, codes: listCodes(store) });
    return;
  }

  if (req.method === 'POST' && req.url === '/admin/codes/disable') {
    const body = await readJson(req);
    const result = disableCode(store, body.activationCode);
    if (result.ok) await saveStore(storePath, store);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  if (req.method === 'POST' && req.url === '/admin/codes/reset-device') {
    const body = await readJson(req);
    const result = resetDeviceBinding(store, body.activationCode);
    if (result.ok) await saveStore(storePath, store);
    sendJson(res, result.ok ? 200 : 400, result);
    return;
  }

  sendJson(res, 404, { ok: false, message: 'Admin route not found' });
}

async function routeTranslateBatch(req, res) {
  const modelConfig = resolveManagedModelConfig();
  if (!modelConfig) {
    sendJson(res, 503, { ok: false, reason: 'MODEL_SERVICE_NOT_CONFIGURED', message: 'Managed model service is not configured.' });
    return;
  }

  const body = await readJson(req);
  if (!body.taskId) {
    sendJson(res, 400, { ok: false, reason: 'MISSING_TASK_ID', message: 'Missing task id.' });
    return;
  }

  const requiredPoints = Math.max(1, Number(body.points || 0), estimateTranslatePoints(body));
  const store = await loadStore(storePath);
  const charge = consumePoints(store, {
    ...body,
    points: requiredPoints,
    taskId: body.taskId,
    note: 'cloud-translation',
  });
  if (!charge.ok) {
    sendJson(res, charge.reason === 'INSUFFICIENT_POINTS' ? 402 : 400, { ...charge, requiredPoints });
    return;
  }
  await saveStore(storePath, store);

  try {
    const translations = await translateBatchWithManagedModel({ payload: body, modelConfig });
    sendJson(res, 200, {
      ok: true,
      translations,
      requiredPoints,
      consumedPoints: charge.consumedPoints,
      pointsBalance: charge.pointsBalance,
      alreadyConsumed: Boolean(charge.alreadyConsumed),
    });
  } catch (error) {
    const refund = refundPoints(store, {
      ...body,
      points: requiredPoints,
      taskId: body.taskId,
      note: 'cloud-translation-failed',
    });
    if (refund.ok) await saveStore(storePath, store);
    sendJson(res, 502, {
      ok: false,
      reason: 'MODEL_REQUEST_FAILED',
      message: sanitizeErrorMessage(error),
      pointsBalance: refund?.pointsBalance ?? charge.pointsBalance,
      refundedPoints: refund?.refundedPoints,
      alreadyRefunded: Boolean(refund?.alreadyRefunded),
    });
  }
}

function sanitizeErrorMessage(error) {
  const text = error instanceof Error ? error.message : String(error || '');
  return text.replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer <redacted>').slice(0, 500);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type, authorization',
    'access-control-allow-methods': 'GET, POST, OPTIONS',
  });
  res.end(statusCode === 204 ? '' : JSON.stringify(payload));
}
