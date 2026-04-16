// index.js — Надёжный диспетчер для Vercel
import { readFile } from 'fs/promises';
import { join, dirname, extname } from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Хранилище для динамических кодов (в памяти)
const store = new Map();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // ===== API: Генерация QR =====
  if (pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { url: qrUrl, size = 400, color = '#000000', bgColor = '#FFFFFF' } = body;

      if (!qrUrl) {
        return res.status(400).json({ success: false, error: 'URL required' });
      }

      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: parseInt(size) || 400,
        margin: 2,
        color: { dark: color, light: bgColor }
      });

      const qrSvg = await QRCode.toString(qrUrl, {
        type: 'svg',
        width: parseInt(size) || 400,
        color: { dark: color, light: bgColor }
      });

      return res.status(200).json({
        success: true,
        qr: qrDataUrl,
        qrSvg,
        dynamicId: Math.random().toString(36).substring(2, 10)
      });
    } catch (error) {
      console.error('Generate error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ===== API: Сохранение динамического кода =====
  if (pathname === '/api/save-dynamic' && req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { code, targetUrl } = body;

      if (!code || !targetUrl) {
        return res.status(400).json({ success: false, error: 'Code and targetUrl required' });
      }

      store.set(`url:${code}`, targetUrl);
      if (!store.has(`scans:${code}`)) store.set(`scans:${code}`, []);

      return res.status(200).json({
        success: true,
        code,
        targetUrl,
        dynamicUrl: `https://${req.headers.host}/q/${code}`
      });
    } catch (error) {
      console.error('Save dynamic error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // ===== Редирект по короткой ссылке =====
  if (pathname.startsWith('/q/')) {
    const code = pathname.split('/')[2];
    const targetUrl = store.get(`url:${code}`);

    if (!targetUrl) {
      return res.status(404).send('QR code not found');
    }

    // Сохраняем статистику
    if (!store.has(`scans:${code}`)) store.set(`scans:${code}`, []);
    store.get(`scans:${code}`).push({
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      country: req.headers['x-vercel-ip-country']
    });

    res.writeHead(302, { Location: targetUrl });
    return res.end();
  }

  // ===== API: Статистика =====
  if (pathname === '/api/stats' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    if (!code) return res.status(400).json({ error: 'Code required' });

    const scans = store.get(`scans:${code}`) || [];
    const byCountry = {};
    const byHour = Array(24).fill(0).map((_, i) => ({ hour: i, scans: 0 }));

    scans.forEach(scan => {
      const country = scan.country || 'unknown';
      byCountry[country] = (byCountry[country] || 0) + 1;
      const hour = new Date(scan.timestamp).getHours();
      byHour[hour].scans++;
    });

    return res.status(200).json({
      success: true,
      totalScans: scans.length,
      byCountry,
      byHour,
      recentScans: scans.slice(-10).reverse()
    });
  }

  // ===== Статические файлы =====
  try {
    let filePath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const fullPath = join(__dirname, filePath);
    
    const data = await readFile(fullPath);
    const ext = extname(fullPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    return res.status(200).send(data);
  } catch (error) {
    // Fallback: отдаём index.html
    try {
      const indexData = await readFile(join(__dirname, 'index.html'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(indexData);
    } catch {
      return res.status(404).send('404 Not Found');
    }
  }
}