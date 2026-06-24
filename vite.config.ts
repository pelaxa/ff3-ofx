import { defineConfig, loadEnv, ConfigEnv } from 'vite';
/// <reference types="vitest" />
import react from '@vitejs/plugin-react-swc';
import viteCompression from 'vite-plugin-compression';
import path from 'path';
// import httpProxy from 'http-proxy';

// const proxy = httpProxy.createProxyServer();

export default defineConfig(({command, mode} : ConfigEnv) => {
  console.log(`configuring vite with command: ${command}, mode: ${mode}`);
  // suppress eslint warning that process isn't defined (it is)
  // eslint-disable-next-line
  const cwd = process.cwd();
  console.log(`loading envs from ${cwd} ...`);
  const env = {...loadEnv(mode, cwd, 'VITE_')};
  console.log(`loaded env: ${JSON.stringify(env)}`);
  console.log(`loaded env: ${env.VITE_PROXY}`);
  
  return {
    define: {
      '__APP_VERSION__': JSON.stringify(process.env.npm_package_version),
      '__APP_NAME__': JSON.stringify(process.env.npm_package_name),
    },
    base: './',
    plugins: [
      react(),
      viteCompression({
        verbose: true,
        disable: false,
        threshold: 10240,
        algorithm: 'gzip',
        ext: '.gz',
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      },
    },
    build: {
      outDir: 'dist',
      // Let Vite use the default index.html entry and its own chunking. Manual
      // chunk splitting produced a circular chunk import (React/Emotion/MUI are
      // mutually dependent) that threw at runtime.
      chunkSizeWarningLimit: 1500,
    },
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: ['./test/unit/setupTests.ts'],
      coverage: {
        provider: 'v8',
        reporter: ['text', 'html', 'clover', 'json-summary'],
        // Measure every source file (even ones no test imports yet) so an
        // untested file fails the gate instead of silently being ignored.
        all: true,
        include: ['src/**/*.{ts,tsx}'],
        exclude: [
          'src/main.tsx',          // app entrypoint, not unit-testable
          'src/theme.ts',          // static theme tokens
          'src/lib/interfaces.ts', // type declarations only
          'src/**/*.d.ts',
          'src/vite-env.d.ts',
        ],
        // Every individual file must clear 75% — a well-covered file can no
        // longer mask a poorly-covered one in the global average.
        thresholds: {
          perFile: true,
          statements: 75,
          branches: 75,
          functions: 75,
          lines: 75,
        },
      },
    },
    // https://dev.to/manojspace/migrating-from-create-react-app-to-vite-a-step-by-step-guide-2cab
    server: {
      port: 3000,
      proxy: {
        '/api': {
          target: env.VITE_PROXY,
          changeOrigin: true,
          // configure: (proxy, options) => {
          //   proxy.on('error', (err, req, res) => {
          //     console.log('proxy error', err)
          //   })
          //   proxy.on('proxyReq', (proxyReq, req, res) => {
          //     console.log('Sending Request to the Target:', req.method, req.url)
          //   })
          //   proxy.on('proxyRes', (proxyRes, req, res) => {
          //     console.log('Received Response from the Target:', proxyRes.statusCode, req.url)
          //   })
          // },
        },
      },
    },
  }
});
