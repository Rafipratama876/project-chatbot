import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.spec.ts', 'src/**/*.spec.ts'],
    globals: true,
  },
  plugins: [
    tsconfigPaths(),
    // NestJS decorators need emitDecoratorMetadata, which esbuild does not do.
    swc.vite({ module: { type: 'es6' } }),
  ],
});
