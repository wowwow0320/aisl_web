const { createProxyMiddleware } = require('http-proxy-middleware');
module.exports = function(app) {
    app.use(
        '/api',
        createProxyMiddleware({
            target: '220.66.64.130:3000', // 백앤드 서버
            changeOrigin: true,
        })
    );
};