import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

test('production HTML uses Electron-safe relative asset paths', async () => {
  const html = await readFile(join(process.cwd(), 'dist', 'index.html'), 'utf8');

  assert.match(html, /<title>AI Catalog Agent<\/title>/);
  assert.doesNotMatch(html, /(?:src|href)="\/assets\//);
  assert.match(html, /(?:src|href)="\.\/assets\//);
});
