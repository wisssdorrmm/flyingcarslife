import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    target: 'es2022',
    // Rapier ships its WASM inlined (~2 MB); it gets its own long-cached chunk below.
    chunkSizeWarningLimit: 2500,
    rolldownOptions: {
      output: {
        codeSplitting: {
          // Only split packages with no shared deps — splitting three/fiber/drei apart
          // creates circular chunk imports that break module init order.
          groups: [{ name: 'rapier-wasm', test: /node_modules[\\/]@dimforge[\\/]/ }],
        },
      },
    },
  },
});