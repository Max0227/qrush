// api/index.js — Главный обработчик Vercel
import { readFile } from 'fs/promises';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..');

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const store = new Map();

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // API: Генерация QR
  if (pathname === '/api/generate' && req.method === 'POST') {
    try {
      const body = req.body;
      const { url: qrUrl, size = 400, color = '#000000', bgColor = '#FFFFFF' } = body;
      
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
      
      return res.status(200).json({
        success: true,
        qr: qrDataUrl,
        qrSvg: qrSvg,
        dynamicId: Math.random().toString(36).substring(2, 10)
      });
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message });
    }
  }
  
  // Статические файлы
  let filePath = pathname === '/' ? '/index.html' : pathname;
  filePath = join(rootDir, filePath);
  
  try {
    const data = await readFile(filePath);
    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || 'text/plain';
    
    res.setHeader('Content-Type', contentType);
    return res.status(200).send(data);
  } catch (error) {
    // Fallback на index.html
    try {
      const indexData = await readFile(join(rootDir, 'index.html'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(indexData);
    } catch {
      return res.status(404).send('404 Not Found');
    }
  }
}