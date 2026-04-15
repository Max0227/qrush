// api/save-dynamic.js — Продвинутое сохранение динамических QR-кодов
import { statsStore } from './stats-store.js';

// ============================================
// ⚙️ КОНФИГУРАЦИЯ
// ============================================
const CONFIG = {
  MAX_CODES_PER_IP: 50,              // Максимум кодов с одного IP
  MAX_URL_LENGTH: 2048,              // Максимальная длина URL
  CODE_MIN_LENGTH: 4,                // Минимальная длина кода
  CODE_MAX_LENGTH: 32,               // Максимальная длина кода
  ALLOWED_PROTOCOLS: ['http:', 'https:', 'mailto:', 'tel:', 'sms:', 'geo:', 'wifi:'],
  BLOCKED_DOMAINS: [],               // Заблокированные домены (можно добавить)
  ENABLE_HISTORY: true,              // Вести историю изменений
  ENABLE_WEBHOOK: false,             // Отправлять вебхук при создании
  WEBHOOK_URL: process.env.WEBHOOK_URL || '',
  DEFAULT_EXPIRY_DAYS: 365,          // Срок действия кода (дней)
};

// ============================================
// 🛡️ ВАЛИДАЦИЯ URL
// ============================================
function validateUrl(url) {
  // Проверка длины
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required and must be a string' };
  }
  
  if (url.length > CONFIG.MAX_URL_LENGTH) {
    return { valid: false, error: `URL exceeds maximum length of ${CONFIG.MAX_URL_LENGTH} characters` };
  }
  
  // Проверка опасных схем
  const dangerousSchemes = ['javascript:', 'data:', 'file:', 'vbscript:', 'about:', 'chrome:', 'edge:'];
  const lowerUrl = url.toLowerCase().trim();
  
  if (dangerousSchemes.some(scheme => lowerUrl.startsWith(scheme))) {
    return { valid: false, error: 'Invalid or dangerous URL scheme' };
  }
  
  // Проверка разрешённых протоколов
  try {
    const parsed = new URL(url);
    if (!CONFIG.ALLOWED_PROTOCOLS.includes(parsed.protocol)) {
      return { valid: false, error: `Protocol ${parsed.protocol} is not allowed` };
    }
    
    // Проверка заблокированных доменов
    if (CONFIG.BLOCKED_DOMAINS.some(domain => parsed.hostname.includes(domain))) {
      return { valid: false, error: 'This domain is blocked' };
    }
    
  } catch (e) {
    // Для специальных схем типа mailto:, tel: и т.д.
    const specialSchemes = ['mailto:', 'tel:', 'sms:', 'geo:', 'wifi:'];
    const hasSpecialScheme = specialSchemes.some(scheme => lowerUrl.startsWith(scheme));
    
    if (!hasSpecialScheme) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }
  
  return { valid: true };
}

// ============================================
// 🔤 ВАЛИДАЦИЯ КОДА
// ============================================
function validateCode(code) {
  if (!code || typeof code !== 'string') {
    return { valid: false, error: 'Code is required and must be a string' };
  }
  
  // Проверка длины
  if (code.length < CONFIG.CODE_MIN_LENGTH) {
    return { valid: false, error: `Code must be at least ${CONFIG.CODE_MIN_LENGTH} characters` };
  }
  
  if (code.length > CONFIG.CODE_MAX_LENGTH) {
    return { valid: false, error: `Code must be at most ${CONFIG.CODE_MAX_LENGTH} characters` };
  }
  
  // Проверка на допустимые символы (буквы, цифры, дефис, подчёркивание)
  const validPattern = /^[a-zA-Z0-9\-_]+$/;
  if (!validPattern.test(code)) {
    return { valid: false, error: 'Code can only contain letters, numbers, hyphens and underscores' };
  }
  
  return { valid: true };
}

// ============================================
// 📊 ПРОВЕРКА ЛИМИТОВ ПО IP
// ============================================
function checkIpLimit(ip) {
  const key = `ip:codes:${ip}`;
  const existing = statsStore.get(key) || [];
  
  // Очищаем старые записи (старше 24 часов)
  const now = Date.now();
  const recent = existing.filter(ts => now - ts < 24 * 60 * 60 * 1000);
  statsStore.set(key, recent);
  
  if (recent.length >= CONFIG.MAX_CODES_PER_IP) {
    return { allowed: false, current: recent.length, limit: CONFIG.MAX_CODES_PER_IP };
  }
  
  return { allowed: true, current: recent.length, limit: CONFIG.MAX_CODES_PER_IP };
}

// ============================================
// 📝 ЗАПИСЬ В ИСТОРИЮ
// ============================================
function recordHistory(code, oldUrl, newUrl, ip) {
  if (!CONFIG.ENABLE_HISTORY) return;
  
  const historyKey = `history:${code}`;
  if (!statsStore.has(historyKey)) {
    statsStore.set(historyKey, []);
  }
  
  const history = statsStore.get(historyKey);
  history.push({
    timestamp: new Date().toISOString(),
    action: oldUrl ? 'update' : 'create',
    oldUrl: oldUrl || null,
    newUrl: newUrl,
    ip: ip,
    userAgent: 'API'
  });
  
  // Ограничиваем историю 100 записями
  if (history.length > 100) {
    statsStore.set(historyKey, history.slice(-100));
  }
}

// ============================================
// 📱 ОТПРАВКА ВЕБХУКА
// ============================================
async function sendWebhook(code, targetUrl, ip, isUpdate = false) {
  if (!CONFIG.ENABLE_WEBHOOK || !CONFIG.WEBHOOK_URL) return;
  
  const payload = {
    event: isUpdate ? 'qr_code_updated' : 'qr_code_created',
    code,
    targetUrl,
    ip,
    timestamp: new Date().toISOString(),
    dynamicUrl: `https://qrush.vercel.app/q/${code}`
  };
  
  try {
    await fetch(CONFIG.WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error('[QRush] Webhook failed:', error.message);
  }
}

// ============================================
// 🎲 ГЕНЕРАЦИЯ УНИКАЛЬНОГО КОДА
// ============================================
function generateUniqueCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let code = '';
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Проверяем, не занят ли код
  if (statsStore.has(`url:${code}`)) {
    return generateUniqueCode(length);
  }
  
  return code;
}

// ============================================
// 🔍 ПОЛУЧЕНИЕ МЕТАДАННЫХ URL
// ============================================
function getUrlMetadata(url) {
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol,
      hostname: parsed.hostname,
      pathname: parsed.pathname,
      port: parsed.port || null,
      search: parsed.search || null,
      hash: parsed.hash || null
    };
  } catch {
    return {
      protocol: url.split(':')[0] + ':',
      hostname: null,
      pathname: null
    };
  }
}

// ============================================
// 🎯 ОСНОВНОЙ ОБРАБОТЧИК
// ============================================
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET — получение информации о коде
  if (req.method === 'GET') {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Code parameter is required' });
    }
    
    const targetUrl = statsStore.get(`url:${code}`);
    const scans = statsStore.get(`scans:${code}`) || [];
    const history = statsStore.get(`history:${code}`) || [];
    const createdAt = statsStore.get(`created:${code}`);
    const expiresAt = statsStore.get(`expires:${code}`);
    
    if (!targetUrl) {
      return res.status(404).json({ 
        success: false, 
        error: 'Code not found',
        code 
      });
    }
    
    return res.status(200).json({
      success: true,
      code,
      targetUrl,
      dynamicUrl: `https://qrush.vercel.app/q/${code}`,
      metadata: getUrlMetadata(targetUrl),
      stats: {
        totalScans: scans.length,
        lastScan: scans.length > 0 ? scans[scans.length - 1].timestamp : null
      },
      createdAt: createdAt || null,
      expiresAt: expiresAt || null,
      history: history.slice(-5).reverse() // Последние 5 изменений
    });
  }

  // POST — создание нового кода
  if (req.method === 'POST') {
    try {
      const body = req.body;
      let { code, targetUrl, expiryDays, autoGenerate } = body;
      
      // Получаем IP
      const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
                 req.headers['x-real-ip'] || 
                 req.socket.remoteAddress || 
                 'unknown';
      
      // Проверка лимитов по IP
      const ipLimit = checkIpLimit(ip);
      if (!ipLimit.allowed) {
        return res.status(429).json({
          success: false,
          error: 'Rate limit exceeded',
          message: `Maximum ${ipLimit.limit} codes per 24 hours`,
          current: ipLimit.current,
          limit: ipLimit.limit,
          retryAfter: 24 * 60 * 60
        });
      }
      
      // Автогенерация кода если нужно
      if (autoGenerate || !code) {
        code = generateUniqueCode(body.codeLength || 8);
      }
      
      // Валидация кода
      const codeValidation = validateCode(code);
      if (!codeValidation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid code',
          message: codeValidation.error
        });
      }
      
      // Валидация URL
      const urlValidation = validateUrl(targetUrl);
      if (!urlValidation.valid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid URL',
          message: urlValidation.error
        });
      }
      
      // Проверяем, существует ли уже такой код
      const existingUrl = statsStore.get(`url:${code}`);
      const isUpdate = !!existingUrl;
      
      // Сохраняем URL
      statsStore.set(`url:${code}`, targetUrl);
      
      // Сохраняем метаданные
      statsStore.set(`created:${code}`, statsStore.get(`created:${code}`) || new Date().toISOString());
      
      // Срок действия
      const days = parseInt(expiryDays) || CONFIG.DEFAULT_EXPIRY_DAYS;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + days);
      statsStore.set(`expires:${code}`, expiryDate.toISOString());
      
      // Инициализируем сканы если нужно
      if (!statsStore.has(`scans:${code}`)) {
        statsStore.set(`scans:${code}`, []);
      }
      
      // Записываем в историю
      recordHistory(code, existingUrl, targetUrl, ip);
      
      // Увеличиваем счётчик для IP
      const ipKey = `ip:codes:${ip}`;
      const ipCodes = statsStore.get(ipKey) || [];
      ipCodes.push(Date.now());
      statsStore.set(ipKey, ipCodes);
      
      // Отправляем вебхук
      await sendWebhook(code, targetUrl, ip, isUpdate);
      
      // Логирование
      console.log(`[QRush] ${isUpdate ? 'Updated' : 'Created'} code: ${code} → ${targetUrl} (IP: ${ip})`);
      
      return res.status(200).json({
        success: true,
        code,
        targetUrl,
        dynamicUrl: `https://qrush.vercel.app/q/${code}`,
        isUpdate,
        metadata: getUrlMetadata(targetUrl),
        expiresAt: expiryDate.toISOString(),
        message: isUpdate ? 'Dynamic QR code updated successfully' : 'Dynamic QR code created successfully'
      });
      
    } catch (error) {
      console.error('[QRush] Save dynamic error:', error);
      return res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  // DELETE — удаление кода
  if (req.method === 'DELETE') {
    const { code } = req.query;
    
    if (!code) {
      return res.status(400).json({ error: 'Code parameter is required' });
    }
    
    const existed = statsStore.has(`url:${code}`);
    
    if (existed) {
      statsStore.delete(`url:${code}`);
      // Опционально: оставляем историю сканов для аналитики
      // statsStore.delete(`scans:${code}`);
      // statsStore.delete(`created:${code}`);
      // statsStore.delete(`expires:${code}`);
      
      console.log(`[QRush] Deleted code: ${code}`);
    }
    
    return res.status(200).json({
      success: true,
      code,
      existed,
      message: existed ? 'Code deleted successfully' : 'Code not found'
    });
  }

  // PUT — обновление существующего кода (алиас для POST)
  if (req.method === 'PUT') {
    const { code, targetUrl } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Code parameter is required' });
    }
    
    const exists = statsStore.has(`url:${code}`);
    if (!exists) {
      return res.status(404).json({
        success: false,
        error: 'Code not found',
        message: 'Use POST to create a new code'
      });
    }
    
    // Перенаправляем на логику POST
    req.method = 'POST';
    return handler(req, res);
  }

  // Неподдерживаемый метод
  return res.status(405).json({ 
    error: 'Method not allowed',
    allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  });
}

// Экспорт для других модулей
export { CONFIG };