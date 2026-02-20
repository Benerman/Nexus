// Used only during `npm start` (Create React App dev server).
// In Docker, nginx handles this proxying instead.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function(app) {
  app.use(
    '/socket.io',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
      ws: true,
    })
  );
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    })
  );
};
