import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  // Relative assets support username.github.io, repository paths, and custom domains.
  base: './',
  css: { postcss: { plugins: [tailwindcss()] } },
  define: {
    'process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID': JSON.stringify(
      process.env.VITE_SPOTIFY_CLIENT_ID ?? '',
    ),
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  build: {
    outDir: 'github-pages-dist',
    emptyOutDir: true,
  },
});
