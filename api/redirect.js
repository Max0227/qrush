// api/redirect.js — Продвинутый редирект с аналитикой и фишками
import { statsStore } from './stats-store.js'; // Общее хранилище

// Конфигурация
const CONFIG = {
  MAX_SCANS_PER_CODE: 50000,        // Максимум сканов на один код
  BOT_TIMEOUT_MS: 3000,             // Таймаут для определения бота
  TELEGRAM_BOT_TOKEN: process.env.TELEGRAM_BOT_TOKEN || '',
  TELEGRAM_CHAT_ID: process.env.TELEGRAM_CHAT_ID || '',
  ENABLE_NOTIFICATIONS: false,      // Включить уведомления в Telegram
  SPAM_PROTECTION: true,            // Защита от накрутки
  SPAM_WINDOW_MS: 60000,            // Окно для антиспама (1 минута)
  SPAM_MAX_SCANS: 10                // Максимум сканов с одного IP в минуту
};

// ============================================
// 🛡️ Детектор ботов и краулеров
// ============================================
const BOT_PATTERNS = [
  'bot', 'crawler', 'spider', 'scraper', 'curl', 'wget',
  'python', 'java', 'node', 'go-http', 'axios', 'fetch',
  'headless', 'phantom', 'selenium', 'puppeteer', 'playwright',
  'googlebot', 'bingbot', 'yandexbot', 'duckduckbot', 'slurp',
  'facebookexternalhit', 'twitterbot', 'linkedinbot', 'whatsapp',
  'telegrambot', 'viber', 'skype', 'discord', 'slack'
];

function isBot(userAgent) {
  if (!userAgent) return true; // Нет User-Agent = вероятно бот
  const ua = userAgent.toLowerCase();
  return BOT_PATTERNS.some(pattern => ua.includes(pattern));
}

// ============================================
// 📱 Определение типа устройства
// ============================================
function getDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('iphone') || ua.includes('android') && ua.includes('mobile')) return 'smartphone';
  if (ua.includes('ipad') || ua.includes('tablet')) return 'tablet';
  if (ua.includes('windows') || ua.includes('mac') || ua.includes('linux')) return 'desktop';
  if (ua.includes('tv') || ua.includes('smarttv')) return 'smarttv';
  if (ua.includes('watch')) return 'smartwatch';
  
  return 'other';
}

// ============================================
// 🌐 Парсинг UTM-меток из referer
// ============================================
function parseUTM(referer) {
  if (!referer || referer === 'direct') return {};
  
  try {
    const url = new URL(referer);
    return {
      utm_source: url.searchParams.get('utm_source') || null,
      utm_medium: url.searchParams.get('utm_medium') || null,
      utm_campaign: url.searchParams.get('utm_campaign') || null,
      utm_term: url.searchParams.get('utm_term') || null,
      utm_content: url.searchParams.get('utm_content') || null
    };
  } catch {
    return {};
  }
}

// ============================================
// 🔗 Извлечение домена из URL
// ============================================
function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

// ============================================
// 🌍 Обогащение гео-данных
// ============================================
const COUNTRY_NAMES = {
  'RU': '🇷🇺 Россия',
  'US': '🇺🇸 США',
  'DE': '🇩🇪 Германия',
  'FR': '🇫🇷 Франция',
  'GB': '🇬🇧 Великобритания',
  'CN': '🇨🇳 Китай',
  'JP': '🇯🇵 Япония',
  'KR': '🇰🇷 Корея',
  'IN': '🇮🇳 Индия',
  'BR': '🇧🇷 Бразилия',
  'CA': '🇨🇦 Канада',
  'AU': '🇦🇺 Австралия',
  'IT': '🇮🇹 Италия',
  'ES': '🇪🇸 Испания',
  'UA': '🇺🇦 Украина',
  'BY': '🇧🇾 Беларусь',
  'KZ': '🇰🇿 Казахстан',
  'unknown': '🌍 Неизвестно'
};

function enrichGeo(countryCode) {
  return {
    code: countryCode || 'unknown',
    name: COUNTRY_NAMES[countryCode] || countryCode || 'Неизвестно',
    flag: COUNTRY_NAMES[countryCode]?.split(' ')[0] || '🌍'
  };
}

// ============================================
// ⏱️ Форматирование времени
// ============================================
function formatTime(isoString) {
  const date = new Date(isoString);
  return {
    iso: isoString,
    date: date.toLocaleDateString('ru-RU'),
    time: date.toLocaleTimeString('ru-RU'),
    hour: date.getHours(),
    dayOfWeek: date.toLocaleDateString('ru-RU', { weekday: 'short' }),
    timestamp: date.getTime()
  };
}

// ============================================
// 🛡️ Анти-спам защита
// ============================================
function isSpam(ip, code) {
  if (!CONFIG.SPAM_PROTECTION) return false;
  
  const key = `spam:${code}:${ip}`;
  const now = Date.now();
  const windowStart = now - CONFIG.SPAM_WINDOW_MS;
  
  if (!statsStore.has(key)) {
    statsStore.set(key, []);
  }
  
  const scans = statsStore.get(key);
  // Очищаем старые записи
  const recentScans = scans.filter(ts => ts > windowStart);
  statsStore.set(key, recentScans);
  
  return recentScans.length >= CONFIG.SPAM_MAX_SCANS;
}

function recordScan(ip, code) {
  if (!CONFIG.SPAM_PROTECTION) return;
  
  const key = `spam:${code}:${ip}`;
  if (!statsStore.has(key)) {
    statsStore.set(key, []);
  }
  statsStore.get(key).push(Date.now());
}

// ============================================
// 📊 Подсчёт статистики в реальном времени
// ============================================
function updateRealtimeStats(code, scanData) {
  const statsKey = `realtime:${code}`;
  if (!statsStore.has(statsKey)) {
    statsStore.set(statsKey, {
      total: 0,
      today: 0,
      lastHour: 0,
      byCountry: {},
      byDevice: {},
      peakHour: { hour: 0, count: 0 },
      hourlyStats: Array(24).fill(0)
    });
  }
  
  const stats = statsStore.get(statsKey);
  const hour = new Date().getHours();
  
  stats.total++;
  stats.today++;
  stats.lastHour++;
  stats.hourlyStats[hour]++;
  
  // Обновляем пиковый час
  if (stats.hourlyStats[hour] > stats.peakHour.count) {
    stats.peakHour = { hour, count: stats.hourlyStats[hour] };
  }
  
  // По странам
  const country = scanData.country || 'unknown';
  stats.byCountry[country] = (stats.byCountry[country] || 0) + 1;
  
  // По устройствам
  const device = scanData.deviceType || 'other';
  stats.byDevice[device] = (stats.byDevice[device] || 0) + 1;
  
  statsStore.set(statsKey, stats);
}

// ============================================
// 📱 Уведомления в Telegram (опционально)
// ============================================
async function sendTelegramNotification(code, scanData, targetUrl) {
  if (!CONFIG.ENABLE_NOTIFICATIONS || !CONFIG.TELEGRAM_BOT_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) {
    return;
  }
  
  const geo = enrichGeo(scanData.country);
  const device = scanData.deviceType === 'smartphone' ? '📱' : 
                 scanData.deviceType === 'tablet' ? '📟' : 
                 scanData.deviceType === 'desktop' ? '💻' : '🌐';
  
  const message = `
🔔 *Новое сканирование QR-кода!*

📋 *Код:* \`${code}\`
${device} *Устройство:* ${scanData.deviceType}
${geo.flag} *Страна:* ${geo.name}
🏙️ *Город:* ${scanData.city || 'Неизвестно'}
🔗 *Цель:* ${extractDomain(targetUrl)}
⏰ *Время:* ${new Date().toLocaleString('ru-RU')}

📊 *Всего сканов этого кода:* ${statsStore.get(`scans:${code}`)?.length || 0}
  `;
  
  try {
    await fetch(`https://api.telegram.org/bot${CONFIG.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: 'Markdown'
      })
    });
  } catch (error) {
    console.error('[QRush] Telegram notification failed:', error.message);
  }
}

// ============================================
// 🎯 ОСНОВНОЙ ОБРАБОТЧИК
// ============================================
export default async function handler(req, res) {
  const startTime = Date.now();
  const { code } = req.query;
  const requestId = `${code}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Валидация
  if (!code) {
    return res.status(400).json({ 
      error: 'Code parameter is required',
      requestId 
    });
  }

  // Получаем целевой URL
  const targetUrl = statsStore.get(`url:${code}`);
  
  // Если URL не найден, редиректим на главную с параметром
  if (!targetUrl) {
    console.warn(`[QRush] Code not found: ${code}`);
    res.writeHead(302, {
      Location: `/?notfound=${code}`,
      'Cache-Control': 'no-cache'
    });
    res.end();
    return;
  }

  // Определяем IP (с учётом прокси)
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             req.socket.remoteAddress || 
             'unknown';

  // Анти-спам проверка
  if (isSpam(ip, code)) {
    console.warn(`[QRush] Spam detected: ${ip} -> ${code}`);
    res.writeHead(429, {
      'Content-Type': 'application/json',
      'Retry-After': '60'
    });
    res.end(JSON.stringify({ 
      error: 'Too many requests', 
      retryAfter: 60 
    }));
    return;
  }

  // Детект бота
  const userAgent = req.headers['user-agent'] || 'unknown';
  const botDetected = isBot(userAgent);
  const deviceType = getDeviceType(userAgent);
  const utm = parseUTM(req.headers['referer']);

  // Собираем полную аналитику
  const scanData = {
    // Идентификаторы
    id: requestId,
    code,
    
    // Временные метки
    timestamp: new Date().toISOString(),
    timeFormatted: formatTime(new Date().toISOString()),
    responseTimeMs: null, // Заполним позже
    
    // Данные запроса
    ip: ip,
    userAgent: userAgent,
    referer: req.headers['referer'] || 'direct',
    language: req.headers['accept-language']?.split(',')[0] || 'unknown',
    
    // UTM метки
    ...utm,
    
    // Гео-данные (от Vercel)
    country: req.headers['x-vercel-ip-country'] || 'unknown',
    countryFull: enrichGeo(req.headers['x-vercel-ip-country']),
    city: req.headers['x-vercel-ip-city'] || 'unknown',
    region: req.headers['x-vercel-ip-country-region'] || 'unknown',
    timezone: req.headers['x-vercel-ip-timezone'] || 'unknown',
    latitude: req.headers['x-vercel-ip-latitude'] || null,
    longitude: req.headers['x-vercel-ip-longitude'] || null,
    
    // Данные устройства
    deviceType,
    isBot: botDetected,
    isMobile: deviceType === 'smartphone',
    isTablet: deviceType === 'tablet',
    isDesktop: deviceType === 'desktop',
    
    // Данные цели
    targetUrl,
    targetDomain: extractDomain(targetUrl),
    
    // Заголовки
    headers: {
      accept: req.headers['accept'] || 'unknown',
      acceptEncoding: req.headers['accept-encoding'] || 'unknown',
      connection: req.headers['connection'] || 'unknown',
      via: req.headers['via'] || null
    }
  };

  // Записываем сканирование (если не бот)
  if (!botDetected) {
    recordScan(ip, code);
    
    if (!statsStore.has(`scans:${code}`)) {
      statsStore.set(`scans:${code}`, []);
    }
    
    const scans = statsStore.get(`scans:${code}`);
    scans.push(scanData);
    
    // Ограничиваем размер хранилища
    if (scans.length > CONFIG.MAX_SCANS_PER_CODE) {
      statsStore.set(`scans:${code}`, scans.slice(-CONFIG.MAX_SCANS_PER_CODE));
    }
    
    // Обновляем статистику реального времени
    updateRealtimeStats(code, scanData);
  }

  // Время ответа
  scanData.responseTimeMs = Date.now() - startTime;

  // Логирование
  const geoEmoji = enrichGeo(scanData.country).flag;
  const deviceEmoji = deviceType === 'smartphone' ? '📱' : 
                      deviceType === 'tablet' ? '📟' : 
                      deviceType === 'desktop' ? '💻' : '🌐';
  
  console.log(`[QRush] ${geoEmoji} ${deviceEmoji} ${code} → ${extractDomain(targetUrl)} (${scanData.responseTimeMs}ms) ${botDetected ? '🤖 BOT' : ''}`);

  // Отправляем уведомление в Telegram (если включено и не бот)
  if (!botDetected && CONFIG.ENABLE_NOTIFICATIONS) {
    sendTelegramNotification(code, scanData, targetUrl).catch(console.error);
  }

  // Формируем заголовки ответа
  const headers = {
    'Location': targetUrl,
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0',
    'X-QRush-Scan-ID': requestId,
    'X-QRush-Code': code,
    'X-QRush-Bot': botDetected ? 'true' : 'false',
    'X-QRush-Response-Time': `${scanData.responseTimeMs}ms`,
    'X-QRush-Country': scanData.country || 'unknown'
  };

  // Если это бот — не редиректим, а показываем превью
  if (botDetected) {
    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta property="og:title" content="QRush — Динамический QR-код">
  <meta property="og:description" content="Отсканируйте этот QR-код, чтобы перейти на ${extractDomain(targetUrl)}">
  <meta property="og:image" content="https://qrush.vercel.app/og-image.png">
  <meta property="og:url" content="${targetUrl}">
  <meta name="twitter:card" content="summary_large_image">
  <title>QRush — ${code}</title>
</head>
<body style="background:#0A0A0F;color:#fff;font-family:system-ui;display:flex;justify-content:center;align-items:center;height:100vh;margin:0">
  <div style="text-align:center">
    <h1 style="color:#a855f7">🔗 QRush</h1>
    <p>Динамический QR-код: <code style="background:#1A1A24;padding:4px 8px;border-radius:4px">${code}</code></p>
    <p>Отсканируйте камерой телефона</p>
  </div>
</body>
</html>`;
    
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      ...Object.fromEntries(Object.entries(headers).filter(([k]) => !k.startsWith('Location')))
    });
    res.end(html);
    return;
  }

  // Обычный редирект
  res.writeHead(302, headers);
  res.end();
}

// Экспорт для других модулей
export { statsStore, CONFIG };