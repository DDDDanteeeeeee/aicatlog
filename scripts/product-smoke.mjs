import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  activateLicense,
  addActivationCode,
  createEmptyStore,
  verifyLicense,
} from '../server/license-core.mjs';

const root = process.cwd();
const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
const version = packageJson.version;
const installerPath = join(root, 'release', `AI-Catalog-Agent-Setup-${version}.exe`);
const unpackedAsarPath = join(root, 'release', 'win-unpacked', 'resources', 'app.asar');
const distHtmlPath = join(root, 'dist', 'index.html');

const checks = [];

await check('package version is set', () => {
  assert.match(version, /^\d+\.\d+\.\d+$/);
});

await check('production HTML is Electron safe', async () => {
  const html = await readFile(distHtmlPath, 'utf8');
  assert.match(html, /<title>AI Catalog Agent<\/title>/);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
  assert.match(html, /(?:src|href)="\.\/assets\//);
});

await check('current Windows installer exists', () => {
  assert.equal(existsSync(installerPath), true, installerPath);
});

await check('packaged app contains public license endpoint', async () => {
  const content = await readFile(unpackedAsarPath);
  assert.equal(content.includes(Buffer.from('43.129.236.16:8787/api/license/activate')), true);
});

await check('packaged app contains font upload bridge', async () => {
  const content = await readFile(unpackedAsarPath);
  assert.equal(content.includes(Buffer.from('select-font-file')), true);
});

await check('license plans and latest-device rule work locally', () => {
  const store = createEmptyStore();
  const monthly = addActivationCode(store, { plan: 'monthly' });
  const yearly = addActivationCode(store, { plan: 'yearly' });
  const lifetime = addActivationCode(store, { plan: 'lifetime' });

  assert.equal(monthly.plan, 'monthly');
  assert.equal(yearly.plan, 'yearly');
  assert.equal(lifetime.expiresAt, null);
  assert.ok(Date.parse(monthly.expiresAt) > Date.now());
  assert.ok(Date.parse(yearly.expiresAt) > Date.now());

  const first = activateLicense(store, {
    activationCode: monthly.displayCode,
    deviceId: 'device-a',
    appVersion: version,
  });
  const second = activateLicense(store, {
    activationCode: monthly.displayCode,
    deviceId: 'device-b',
    appVersion: version,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(verifyLicense(store, { licenseToken: first.licenseToken, deviceId: 'device-a' }).ok, false);
  assert.equal(verifyLicense(store, { licenseToken: second.licenseToken, deviceId: 'device-b' }).ok, true);
});

if (process.env.SMOKE_LICENSE_HEALTH_URL) {
  await check('public license service health endpoint responds', async () => {
    const response = await fetch(process.env.SMOKE_LICENSE_HEALTH_URL, { signal: AbortSignal.timeout(5000) });
    assert.equal(response.ok, true);
  });
}

for (const item of checks) {
  const icon = item.ok ? 'PASS' : 'FAIL';
  console.log(`${icon} ${item.name}`);
  if (!item.ok) console.error(item.error?.stack || item.error);
}

const failures = checks.filter((item) => !item.ok);
if (failures.length) {
  console.error(`\n${failures.length} smoke check(s) failed.`);
  process.exit(1);
}

console.log(`\n${checks.length} smoke checks passed for ${packageJson.name} ${version}.`);

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
  } catch (error) {
    checks.push({ name, ok: false, error });
  }
}
