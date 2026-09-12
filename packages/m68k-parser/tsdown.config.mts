import { defineConfig } from 'tsdown';
export default defineConfig({
  entry: ['src/index.ts'], format: ['esm', 'cjs'], platform: 'neutral', target: 'es2022',
  outDir: 'dist', dts: true, sourcemap: true,
  outExtensions: ({ format }) => ({ js: format === 'es' ? '.mjs' : '.cjs', dts: format === 'es' ? '.d.mts' : '.d.cts' }),
});
