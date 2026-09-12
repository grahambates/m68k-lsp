import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { globals: true, environment: 'node', include: ['test/**/*.test.ts', 'src/test/**/*.test.ts'], coverage: { provider: 'v8', include: ['src/**/*.ts'], exclude: ['src/test/**'], thresholds: { statements: 84, branches: 79, functions: 89, lines: 89 } } } });
