// server.js — локальный сервер QRush
const http = require('http');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const statsStore = new Map();
const PORT = 3000;

const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API: Генерация QR
  if (url.pathname === '/api/generate' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const { url: qrUrl, size = 400, color = '#000000', bgColor = '#FFFFFF' } = JSON.parse(body);
        const qrDataUrl = await QRCode.toDataURL(qrUrl, {
          width: parseInt(size),
          margin: 2,
          color: { dark: color, light: bgColor }
        });
        const qrSvg = await QRCode.toString(qrUrl, {
          type: 'svg',
          width: parseInt(size),
          color: { dark: color, light: bgColor }
        });
        const dynamicId = Math.random().toString(36).substring(2, 10);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          qr: qrDataUrl,
          qrSvg: qrSvg,
          dynamicId: dynamicId,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // API: Сохранение динамического кода
  if (url.pathname === '/api/save-dynamic' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { code, targetUrl } = JSON.parse(body);
        statsStore.set(`url:${code}`, targetUrl);
        if (!statsStore.has(`scans:${code}`)) {
          statsStore.set(`scans:${code}`, []);
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
          success: true, 
          code, 
          targetUrl,
          dynamicUrl: `http://localhost:${PORT}/q/${code}`
        }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: error.message }));
      }
    });
    return;
  }

  // API: Редирект
  if (url.pathname.startsWith('/q/')) {
    const code = url.pathname.split('/')[2];
    const targetUrl = statsStore.get(`url:${code}`) || '/';
    
    if (!statsStore.has(`scans:${code}`)) {
      statsStore.set(`scans:${code}`, []);
    }
    statsStore.get(`scans:${code}`).push({
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    });
    
    res.writeHead(302, { Location: targetUrl });
    res.end();
    return;
  }

  // API: Статистика
  if (url.pathname === '/api/stats') {
    const code = url.searchParams.get('code');
    const scans = statsStore.get(`scans:${code}`) || [];
    
    const byHour = Array(24).fill(0).map((_, i) => ({ hour: i, scans: 0 }));
    scans.forEach(scan => {
      const hour = new Date(scan.timestamp).getHours();
      byHour[hour].scans++;
    });
    
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      success: true,
      totalScans: scans.length,
      byHour,
      recentScans: scans.slice(-5).reverse()
    }));
    return;
  }

  // Статические файлы
  let filePath = url.pathname === '/' ? '/index.html' : url.pathname;
  filePath = path.join(__dirname, filePath);

  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        res.writeHead(500);
        res.end('500 Server Error');
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀 QRush запущен на http://localhost:${PORT}`);
  console.log('📱 Откройте браузер и начинайте создавать QR-коды!\n');
});