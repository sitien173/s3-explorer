import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig(({ command }) => ({
  main: { plugins: [externalizeDepsPlugin()] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rolldownOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } }
  },
  renderer: {
    server: { port: 5173, strictPort: true },
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    plugins: [
      tailwindcss(),
      ...(command === 'serve' ? [] : [react()]),
      ...(command === 'serve' ? [{
        name: 'dev-csp-meta',
        transformIndexHtml(html: string) {
          const devCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src 'self' http://localhost:5173 ws://localhost:5173; object-src 'none'; base-uri 'self'; frame-ancestors 'none'";
          return html.replace(/(<meta http-equiv="Content-Security-Policy" content=")[^"]+(")/, `$1${devCsp}$2`);
        }
      }] : [])
    ]
  }
}));
