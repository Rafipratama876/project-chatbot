import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // The one homography, shared with the engine. The preview has to place
      // the box on the wall by exactly the arithmetic the renderer uses, or
      // what the customer drags is not what they get — and a second copy of
      // eight lines of linear algebra is precisely the kind of thing that
      // drifts silently. The module imports nothing, so it drops straight in.
      '#homography': fileURLToPath(new URL('../src/kb/geometry/homography.ts', import.meta.url)),
    },
  },
  // Built into the API's static directory so one process serves both.
  build: { outDir: '../public', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
