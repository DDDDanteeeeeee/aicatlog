import { createServer } from 'node:http';
import { join } from 'node:path';
import {
  activateLicense,
  addActivationCode,
  disableCode,
  listCodes,
  loadStore,
  resetDeviceBinding,
  saveStore,
  verifyLicense,
} from './license-core.mjs';

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
