import { defineConfig, loadEnv, ConfigEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import viteCompression from 'vite-plugin-compression';
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
        '@': '/src'
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
