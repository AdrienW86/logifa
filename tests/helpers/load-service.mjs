import { build } from 'esbuild';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
export async function loadService(entry, state, mocks) {
  const key = randomUUID();
  globalThis.__logifaTests ??= new Map();
  globalThis.__logifaTests.set(key, state);
  const result = await build({ entryPoints: [entry], bundle: true, platform: 'node', format: 'esm', packages: 'external', write: false,
    plugins: [{ name: 'isolated-service-mocks', setup(build) {
      build.onResolve({ filter: /.*/ }, args => {
        if (args.path === 'server-only') return { path: 'empty', namespace: 'mock' };
        const resolved = path.resolve(args.resolveDir, args.path).replace(/\.ts$/, '');
        const match = Object.keys(mocks).find(key => resolved.endsWith(key));
        return match ? { path: match, namespace: 'mock' } : undefined;
      });
      build.onLoad({ filter: /.*/, namespace: 'mock' }, args => ({ contents: args.path === 'empty' ? '' : `const state = globalThis.__logifaTests.get(${JSON.stringify(key)});\n${mocks[args.path]}`, loader: 'js' }));
    } }],
  });
  // Load next to node_modules so external package imports resolve normally.
  const { mkdtemp, writeFile, rm } = await import('node:fs/promises');
  const directory = await mkdtemp(path.resolve('tests/.service-'));
  try {
    const filename = path.join(directory, 'module.mjs'); await writeFile(filename, result.outputFiles[0].text);
    return { module: await import(filename), cleanup: async () => { globalThis.__logifaTests.delete(key); await rm(directory, { recursive: true, force: true }); } };
  } catch (e) { globalThis.__logifaTests.delete(key); await rm(directory, { recursive: true, force: true }); throw e; }
}
