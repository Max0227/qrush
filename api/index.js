// api/index.js — Главный обработчик для Vercel
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..');

// MIME типы
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Простое хранилище
const store = new Map();

// Главный обработчик Vercel
export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  console.log(`[QRush] ${req.method} ${pathname}`);
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // API: Генерация QR
  if (pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { url: qrUrl, size = 400, color = '#000000', bgColor = '#FFFFFF' } = body;
      
      if (!qrUrl) {
        return res.status(400).json({ error: 'URL is required' });
      }
      
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
      
      return res.status(200).json({
        success: true,
        qr: qrDataUrl,
        qrSvg: qrSvg,
        dynamicId: dynamicId
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
  
  // API: Сохранение динамического кода
  if (pathname === '/api/save-dynamic' && req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { code, targetUrl } = body;
      
      if (!code || !targetUrl) {
        return res.status(400).json({ error: 'Code and targetUrl required' });
      }
      
      store.set(`url:${code}`, targetUrl);
      if (!store.has(`scans:${code}`)) {
        store.set(`scans:${code}`, []);
      }
      
      return res.status(200).json({
        success: true,
        code,
        targetUrl,
        dynamicUrl: `https://${req.headers.host}/q/${code}`
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
  
  // API: Редирект
  if (pathname.startsWith('/q/')) {
    const code = pathname.split('/')[2];
    const targetUrl = store.get(`url:${code}`) || '/';
    
    if (!store.has(`scans:${code}`)) {
      store.set(`scans:${code}`, []);
    }
    store.get(`scans:${code}`).push({
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown'
    });
    
    res.writeHead(302, { Location: targetUrl });
    return res.end();
  }
  
  // API: Статистика
  if (pathname === '/api/stats') {
    const code = url.searchParams.get('code');
    const scans = store.get(`scans:${code}`) || [];
    
    return res.status(200).json({
      success: true,
      totalScans: scans.length,
      recentScans: scans.slice(-10).reverse()
    });
  }
  
  // Статические файлы
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = join(rootDir, filePath);
  
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    return res.status(200).send(data);
  } catch (error) {
    // Если файл не найден, отдаём index.html (SPA fallback)
    try {
      const indexPath = join(rootDir, 'index.html');
      const indexData = await readFile(indexPath);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(indexData);
    } catch {
      return res.status(404).json({ error: 'Not Found' });
    }
  }
}