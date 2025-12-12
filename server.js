const express = require('express');
const fetch = require('node-fetch');
const { URL } = require('url');

const app = express();
const PORT = process.env.PORT || 10000;

// CORS liberado pra tudo
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Proxy principal
app.get('/', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Faltando ?url=');

  try {
    const response = await fetch(target, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://www.youtube.com/'
      },
      redirect: 'follow'
    });

    if (!response.ok) throw new Error(`Status ${response.status}`);

    const contentType = response.headers.get('content-type') || '';
    let text = await response.text();

    // Se for .m3u8 → reescreve todas as linhas pra passar pelo proxy
    if (contentType.includes('m3u8') || contentType.includes('mpegurl') || target.includes('.m3u8')) {
      const base = new URL(target);
      const baseUrl = `${base.protocol}//${base.host}`;

      text = text.replace(/^(?!#)(.+)/gm, (line) => {
        let uri = line.trim();
        if (uri.startsWith('http')) return `${req.protocol}://${req.get('host')}/?url=${encodeURIComponent(uri)}`;
        else return `${req.protocol}://${req.get('host')}/?url=${encodeURIComponent(baseUrl + '/' + uri)}`;
      });

      res.set('Content-Type', 'application/vnd.apple.mpegurl');
    } else {
      res.set('Content-Type', contentType || 'application/octet-stream');
    }

    res.send(text);
  } catch (err) {
    console.error(err);
    res.status(502).send('Erro no proxy: ' + err.message);
  }
});

app.listen(PORT, () => console.log(`Proxy rodando → https://hls-proxy-mo3x.onrender.com`));
