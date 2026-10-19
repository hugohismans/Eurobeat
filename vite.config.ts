import { defineConfig } from 'vite';

// base relative pour fonctionner sous https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  server: { host: true },
});
