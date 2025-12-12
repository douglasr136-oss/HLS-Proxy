const express = require('express');
const m3u8 = require('m3u8');
const httpProxy = require('http-proxy-middleware');
const url = require('url');

const app = express();
const port = process.env.PORT || 10000;

// Middleware pra proxy de arquivos estáticos e streams
app.use('/proxy', httpProxy.createProxyMiddleware({
  target: 'http://example.com',  // Placeholder — o target vem via query
  changeOrigin: true,
  pathRewrite: {
    '^/proxy': '',  // Remove /proxy do path
  },
  onProxyReq: (proxyReq, req, res) => {
    const targetUrl = req.query.url;
    if (targetUrl) {
      proxyReq.path = url.parse(targetUrl).path;
    }
  }
}));

// Endpoint principal pra proxy M3U8/HLS
app.get('/?url=*', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing ?url= parameter');
  }

  // Fetch e reescreve M3U8 se for manifesto
  const https = require('https');
  const http = require('http');
  const client = targetUrl.startsWith('https') ? https : http;

  client.get(targetUrl, (resp) => {
    let data = '';
    resp.on('data', (chunk) => data += chunk);
    resp.on('end', () => {
      if (resp.headers['content-type'] && resp.headers['content-type'].includes('m3u8')) {
        // Parse e reescreve URLs relativas pra proxy
        const parser = m3u8.create();
        parser.push(data);
        parser.end();
        const rewritten = parser.manifest.toString().replace(/(https?:\/\/[^\/\s]+)/g, (match) => {
          return `${req.protocol}://${req.get('host')}/proxy?url=${encodeURIComponent(match + '$&')}`;
        });
        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(rewritten);
      } else {
        // Stream direto (pra .ts segments)
        res.set('Content-Type', resp.headers['content-type'] || 'application/octet-stream');
        res.send(data);
      }
    });
  }).on('error', (err) => {
    res.status(500).send('Proxy error: ' + err.message);
  });
});

app.listen(port, () => {
  console.log(`HLS Proxy rodando na porta ${port}`);
});
