// api/index.js — Главный обработчик Vercel (Полностью рабочий)
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..');

// MIME типы для статических файлов
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain'
};

// Простое хранилище в памяти
const store = new Map();

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  console.log(`[QRush] ${req.method} ${pathname}`);
  
  // CORS заголовки для всех запросов
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  
  // Обработка preflight запросов
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // ============================================
  // API: Генерация QR-кода
  // ============================================
  if (pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { url: qrUrl, size = 400, color = '#000000', bgColor = '#FFFFFF' } = body;
      
      if (!qrUrl) {
        return res.status(400).json({ 
          success: false, 
          error: 'URL is required' 
        });
      }
      
      console.log(`[QRush] Generating QR for: ${qrUrl.substring(0, 50)}...`);
      
      // Генерация PNG (Data URL)
      const qrDataUrl = await QRCode.toDataURL(qrUrl, {
        width: parseInt(size) || 400,
        margin: 2,
        color: { 
          dark: color || '#000000', 
          light: bgColor || '#FFFFFF' 
        }
      });
      
      // Генерация SVG
      const qrSvg = await QRCode.toString(qrUrl, {
        type: 'svg',
        width: parseInt(size) || 400,
        margin: 2,
        color: { 
          dark: color || '#000000', 
          light: bgColor || '#FFFFFF' 
        }
      });
      
      const dynamicId = Math.random().toString(36).substring(2, 10);
      
      console.log(`[QRush] QR generated successfully, dynamicId: ${dynamicId}`);
      
      return res.status(200).json({
        success: true,
        qr: qrDataUrl,
        qrSvg: qrSvg,
        dynamicId: dynamicId,
        settings: {
          size: parseInt(size) || 400,
          color: color || '#000000',
          bgColor: bgColor || '#FFFFFF'
        }
      });
      
    } catch (error) {
      console.error('[QRush] Generate error:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message || 'Failed to generate QR code'
      });
    }
  }
  
  // ============================================
  // API: Сохранение динамического кода
  // ============================================
  if (pathname === '/api/save-dynamic' && req.method === 'POST') {
    try {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { code, targetUrl } = body;
      
      if (!code || !targetUrl) {
        return res.status(400).json({ 
          success: false, 
          error: 'Code and targetUrl are required' 
        });
      }
      
      store.set(`url:${code}`, targetUrl);
      
      if (!store.has(`scans:${code}`)) {
        store.set(`scans:${code}`, []);
      }
      
      console.log(`[QRush] Dynamic code saved: ${code} -> ${targetUrl}`);
      
      return res.status(200).json({
        success: true,
        code: code,
        targetUrl: targetUrl,
        dynamicUrl: `https://${req.headers.host}/q/${code}`
      });
      
    } catch (error) {
      console.error('[QRush] Save dynamic error:', error);
      return res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  }
  
  // ============================================
  // API: Редирект по динамическому коду
  // ============================================
  if (pathname.startsWith('/q/')) {
    const code = pathname.split('/')[2];
    const targetUrl = store.get(`url:${code}`);
    
    if (!targetUrl) {
      return res.status(404).send('QR code not found');
    }
    
    // Сохраняем статистику сканирования
    if (!store.has(`scans:${code}`)) {
      store.set(`scans:${code}`, []);
    }
    
    store.get(`scans:${code}`).push({
      timestamp: new Date().toISOString(),
      userAgent: req.headers['user-agent'] || 'unknown',
      ip: req.headers['x-forwarded-for'] || 'unknown',
      country: req.headers['x-vercel-ip-country'] || 'unknown',
      city: req.headers['x-vercel-ip-city'] || 'unknown'
    });
    
    console.log(`[QRush] Redirect: ${code} -> ${targetUrl}`);
    
    res.writeHead(302, { Location: targetUrl });
    return res.end();
  }
  
  // ============================================
  // API: Получение статистики
  // ============================================
  if (pathname === '/api/stats' && req.method === 'GET') {
    const code = url.searchParams.get('code');
    
    if (!code) {
      return res.status(400).json({ 
        success: false, 
        error: 'Code parameter is required' 
      });
    }
    
    const scans = store.get(`scans:${code}`) || [];
    
    // Агрегация по часам
    const byHour = Array(24).fill(0).map((_, i) => ({ hour: i, scans: 0 }));
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    scans.forEach(scan => {
      const scanTime = new Date(scan.timestamp);
      if (scanTime >= last24h) {
        const hour = scanTime.getHours();
        byHour[hour].scans++;
      }
    });
    
    // Агрегация по странам
    const byCountry = {};
    scans.forEach(scan => {
      const country = scan.country || 'unknown';
      byCountry[country] = (byCountry[country] || 0) + 1;
    });
    
    return res.status(200).json({
      success: true,
      code: code,
      totalScans: scans.length,
      byHour: byHour,
      byCountry: byCountry,
      recentScans: scans.slice(-10).reverse()
    });
  }
  
  // ============================================
  // Статические файлы
  // ============================================
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = join(rootDir, filePath);
  
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    return res.status(200).send(data);
    
  } catch (error) {
    // Если файл не найден — пробуем отдать index.html (SPA fallback)
    try {
      const indexData = await readFile(join(rootDir, 'index.html'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(indexData);
    } catch {
      return res.status(404).send('404 Not Found');
    }
  }
}