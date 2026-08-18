import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'

// This is the same WASM wiring the real app needs — see port/README.md.
export default defineConfig({
  plugins: [
    react(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/occt-import-js/dist/occt-import-js.wasm',
          dest: 'occt',
        },
      ],
    }),
  ],
  server: {
    port: 4600,
    host: true,
    fs: {
      // The demo imports the port modules from its parent directory. Inside the
      // real app they live under the app root and this is not needed.
      allow: ['..'],
    },
  },
})
