// import secrets from './secrets.json';

const { createProxyMiddleware } = require('http-proxy-middleware');
const secrets = require('./secrets.json');

module.exports = function(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: secrets.proxyUrl,
      changeOrigin: true,
    })
  );
};