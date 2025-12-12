const express = require('express');
const M3U8Parser = require('m3u8-parser');  // Pacote correto
const https = require('https');
const http = require('http');
const urlModule = require('url');

const app = express();
const port = process.env.PORT || 10000;

// Endpoint principal: /?url=TARGET_URL (proxy pra M3U8 ou streams)
app.get('/', (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing ?url= parameter. Use: /?url=https://example.com/playlist.m3u8');
  }

  const isHttps = targetUrl.startsWith('https');
  const client = isHttps ? https : http;
  const parsedTarget = urlModule.parse(targetUrl);

  const options = {
    hostname: parsedTarget.hostname,
    port: parsedTarget.port || (isHttps ? 443 : 80),
    path: parsedTarget.path,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; HLS-Proxy/1.0)'
    }
  };

  const proxyReq = client.request(options, (proxyRes) => {
    let data = '';
    proxyRes.on('data', (chunk) => { data += chunk; });
    proxyRes.on('end', () => {
      const contentType = proxyRes.headers['content-type'] || '';
      if (contentType.includes('m3u8') || contentType.includes('mpegurl')) {
        // Parse e reescreve o manifesto M3U8 pra usar o proxy em sub-URLs
        const parser = new M3U8Parser.Parser();
        parser.push(data);
        parser.end();
        const manifest = parser.manifest;

        // Reescreve URIs relativas/absolutas pra apontar pro proxy
        if (manifest.segments) {
          manifest.segments.forEach(segment => {
            if (segment.uri) {
              segment.uri = `${req.protocol}://${req.get('host')}/?url=${encodeURIComponent(targetUrl)}&segment=${encodeURIComponent(segment.uri)}`;
            }
          });
        }
        if (manifest.playlists) {
          manifest.playlists.forEach(playlist => {
            if (playlist.uri) {
              playlist.uri = `${req.protocol}://${req.get('host')}/?url=${encodeURIComponent(targetUrl)}&playlist=${encodeURIComponent(playlist.uri)}`;
            }
          });
        }

        res.set('Content-Type', 'application/vnd.apple.mpegurl');
        res.send(JSON.stringify(manifest, null, 2));  // Ou use uma lib pra stringify M3U8 se precisar
      } else {
        // Stream direto pra .ts ou outros arquivos binários
        res.set('Content-Type', contentType || 'application/octet-stream');
        res.send(data);
      }
    });
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error: ' + err.message);
  });
  proxyReq.end();
});

app.listen(port, () => {
  console.log(`HLS Proxy rodando na porta ${port}`);
});
