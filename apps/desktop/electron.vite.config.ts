import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

/**
 * `style-src 'unsafe-inline'` is a dev-server concession: Vite's HMR client
 * injects CSS by creating <style> elements from script, which style-src
 * governs. The built renderer loads styles.css as a plain stylesheet, so the
 * shipped app gets the strict policy.
 */
function stripDevOnlyCSP() {
  return {
    name: 'latch-strip-dev-only-csp',
    apply: 'build' as const,
    transformIndexHtml(html: string): string {
      return html.replace("style-src 'self' 'unsafe-inline'", "style-src 'self'")
    },
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ['@latch/shared'] })],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/index.ts'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: ['@latch/shared'] })],
    build: {
      outDir: 'dist/preload',
      rollupOptions: {
        input: resolve(__dirname, 'src/main/preload.ts'),
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [stripDevOnlyCSP()],
    build: {
      outDir: resolve(__dirname, 'dist/renderer'),
    },
  },
})
