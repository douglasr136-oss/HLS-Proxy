const express = require('express');
const fetch = require('node-fetch');  // Adicionei isso pro fetch moderno
const urlModule = require('url');

const app = express();
const port = process.env.PORT || 10000;

// Middleware pra CORS (essencial pro player web)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') res.sendStatus(200);
  else next();
});

// Endpoint principal: /?url=TARGET_URL
app.get('/', async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) {
    return res.status(400).send('Missing ?url= parameter. Use: /?url=https://example.com/playlist.m3u8');
  }

  try {
    // Fetch o target com headers pra burlar bloqueios
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.youtube.com/'
      },
      redirect: 'follow'  // Segue redirects
    });

    if (!response.ok) {
      return res.status(response.status).send(`Target error: ${response.statusText}`);
    }

    let data = await response.text();
    const contentType = response.headers.get('content-type') || '';

    // Se for M3U8, reescreve URIs relativas pra proxy (simples regex pra evitar falhas)
    if (contentType.includes('m3u8') || contentType.includes('mpegurl') || targetUrl.endsWith('.m3u8')) {
      const baseUrl = new URL(targetUrl).origin;
      // Reescreve URIs absolutas/relativas pra apontar pro proxy
      data = data.replace(/(https?:\/\/[^\/\s]+\/[^\/\s]*)/g, (match) => {
        return `${req.protocol}://${req.get('host')}/?url=${encodeURIComponent(match)}`;
      });
      // Para relativas (ex: segment.ts)
      data = data.replace(/([^\s]+\.ts)/g, (match) => {
        return `${req.protocol}://${req.get('host')}/?url=${encodeURIComponent(baseUrl + '/' + match)}`;
      });
      res.set('Content-Type', 'application/vnd.apple.mpegurl');
    } else {
      // Pra .ts ou binários, stream direto (mas como é GET, envia o buffer)
      res.set('Content-Type', contentType || 'application/octet-stream');
    }

    res.send(data);
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).send('Proxy error: ' + err.message);
  }
});

app.listen(port, () => {
  console.log(`HLS Proxy rodando na porta ${port}`);
});
