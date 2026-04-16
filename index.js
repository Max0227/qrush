// index.js — Диспетчер запросов для Vercel
import { readFile } from 'fs/promises';
import { join, dirname, extname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// MIME-типы для статики
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

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS для всех запросов (можно уточнить)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Если запрос к API — передаём в соответствующий обработчик
  if (pathname.startsWith('/api/')) {
    const apiPath = pathname.replace('/api/', '');
    const handlerName = apiPath.split('?')[0].split('/')[0]; // например "generate"
    
    try {
      // Динамически импортируем нужный файл из папки api/
      const modulePath = pathToFileURL(join(__dirname, 'api', `${handlerName}.js`)).href;
      const apiModule = await import(modulePath);
      
      if (apiModule.default) {
        return await apiModule.default(req, res);
      } else {
        return res.status(404).json({ error: 'API handler not found' });
      }
    } catch (error) {
      console.error(`API error (${handlerName}):`, error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Иначе отдаём статический файл
  try {
    let filePath = pathname === '/' ? '/index.html' : pathname;
    // Убираем начальный слеш и защищаем от выхода за пределы
    filePath = filePath.replace(/^\/+/, '');
    const fullPath = join(__dirname, filePath);
    
    const data = await readFile(fullPath);
    const ext = extname(fullPath).toLowerCase();
    const contentType = mimeTypes[ext] || 'application/octet-stream';
    
    res.setHeader('Content-Type', contentType);
    return res.status(200).send(data);
  } catch (error) {
    // Файл не найден – отдаём index.html (для SPA-роутинга)
    try {
      const indexData = await readFile(join(__dirname, 'index.html'));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(indexData);
    } catch {
      return res.status(404).send('404 Not Found');
    }
  }
}