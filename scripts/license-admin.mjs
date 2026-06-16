import { join } from 'node:path';
import {
  addActivationCode,
  disableCode,
  listCodes,
  loadStore,
  resetDeviceBinding,
  saveStore,
} from '../server/license-core.mjs';

const storePath = process.env.LICENSE_STORE_PATH || join(process.cwd(), 'data', 'licenses.json');
const command = process.argv[2];
const arg = process.argv[3];

const store = await loadStore(storePath);

if (command === 'create') {
  const code = addActivationCode(store, {
    plan: resolvePlanArg(),
    expiresAt: getOptionalArg('--expires-at'),
    note: getArg('--note') || '',
    points: Number(getArg('--points') || 0),
  });
  await saveStore(storePath, store);
  console.log(code.displayCode);
} else if (command === 'list') {
  console.table(listCodes(store));
} else if (command === 'disable') {
  const result = disableCode(store, arg);
  await saveStore(storePath, store);
  console.log(JSON.stringify(result, null, 2));
} else if (command === 'reset-device') {
  const result = resetDeviceBinding(store, arg);
  await saveStore(storePath, store);
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log('Usage: node scripts/license-admin.mjs create [plan] [--points N] [--note text]|list|disable <code>|reset-device <code>');
  process.exit(command ? 1 : 0);
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
