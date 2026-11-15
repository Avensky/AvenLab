import assert from 'node:assert/strict';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { resolveConfig } from 'vite';

test('the wardrobe GLB viewer is a standalone frontend build entry', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const { build } = await resolveConfig({ root, logLevel: 'error' }, 'build');
  const input = build.rollupOptions.input;
  const entries = typeof input === 'string' ? [input] : Object.values(input ?? {});

  assert(entries.includes(fileURLToPath(new URL('../index.html', import.meta.url))), 'include the game');
  assert(entries.includes(fileURLToPath(new URL('../previews/wardrobe-asset.html', import.meta.url))), 'include the GLB viewer');
});
