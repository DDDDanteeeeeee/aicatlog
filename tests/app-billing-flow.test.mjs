import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

test('desktop task execution leaves point charging to cloud translate route', async () => {
  const appSource = await readFile(join(process.cwd(), 'src', 'App.tsx'), 'utf8');

  assert.doesNotMatch(appSource, /bridge\.consumePoints\(/);
  assert.doesNotMatch(appSource, /bridge\.refundPoints\(/);
  assert.match(appSource, /bridge\.runTask\(/);
  assert.match(appSource, /refreshAccountState/);
});
