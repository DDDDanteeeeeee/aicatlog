const serverUrl = trimTrailingSlash(process.env.LICENSE_SERVER_URL || 'http://127.0.0.1:8787');
const adminToken = process.env.ADMIN_TOKEN || '';
const command = process.argv[2];
const arg = process.argv[3];

if (!adminToken) {
  console.error('Missing ADMIN_TOKEN.');
  process.exit(1);
}

if (command === 'create') {
  const payload = {
    plan: resolvePlanArg(),
    expiresAt: getOptionalArg('--expires-at'),
    note: getArg('--note') || '',
    points: Number(getArg('--points') || 0),
  };
  const result = await request('/admin/codes', { method: 'POST', body: payload });
  console.log(result.activationCode || JSON.stringify(result, null, 2));
} else if (command === 'list') {
  const result = await request('/admin/codes');
  console.table(result.codes || []);
} else if (command === 'disable') {
  const result = await request('/admin/codes/disable', { method: 'POST', body: { activationCode: arg } });
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'reset-device') {
  const result = await request('/admin/codes/reset-device', { method: 'POST', body: { activationCode: arg } });
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('Usage: node scripts/license-admin-remote.mjs create [monthly|yearly|lifetime] [--points N] [--note text]|list|disable <code>|reset-device <code>');
  process.exit(command ? 1 : 0);
}

async function request(path, options = {}) {
  const response = await fetch(`${serverUrl}${path}`, {
    method: options.method || 'GET',
    headers: {
      authorization: `Bearer ${adminToken}`,
      'content-type': 'application/json',
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.message || `Request failed with ${response.status}`);
  }
  return payload;
}

function getArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? '' : process.argv[index + 1] || '';
}

function getOptionalArg(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1] || null;
}

function resolvePlanArg() {
  const shorthand = process.argv[3];
  if (['monthly', 'yearly', 'lifetime', 'standard'].includes(shorthand)) return shorthand;
  return getArg('--plan') || 'lifetime';
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}
