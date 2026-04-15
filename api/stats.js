// api/stats.js — Продвинутая аналитика QR-кодов
import { statsStore } from './stats-store.js';

// ============================================
// ⚙️ КОНФИГУРАЦИЯ
// ============================================
const CONFIG = {
  DEFAULT_PERIOD: '7d',              // Период по умолчанию
  MAX_SCANS_FOR_EXPORT: 10000,       // Максимум сканов для экспорта
  CACHE_ENABLED: true,
  CACHE_TTL_SECONDS: 60,             // Кэш на 1 минуту
  TIMEZONE: 'Europe/Moscow',         // Часовой пояс
  COUNTRY_NAMES: {
    'RU': '🇷🇺 Россия', 'US': '🇺🇸 США', 'DE': '🇩🇪 Германия',
    'FR': '🇫🇷 Франция', 'GB': '🇬🇧 Великобритания', 'CN': '🇨🇳 Китай',
    'JP': '🇯🇵 Япония', 'KR': '🇰🇷 Корея', 'IN': '🇮🇳 Индия',
    'BR': '🇧🇷 Бразилия', 'CA': '🇨🇦 Канада', 'AU': '🇦🇺 Австралия',
    'IT': '🇮🇹 Италия', 'ES': '🇪🇸 Испания', 'UA': '🇺🇦 Украина',
    'BY': '🇧🇾 Беларусь', 'KZ': '🇰🇿 Казахстан', 'TR': '🇹🇷 Турция',
    'NL': '🇳🇱 Нидерланды', 'SE': '🇸🇪 Швеция', 'NO': '🇳🇴 Норвегия',
    'PL': '🇵🇱 Польша', 'CZ': '🇨🇿 Чехия', 'AT': '🇦🇹 Австрия',
    'CH': '🇨🇭 Швейцария', 'BE': '🇧🇪 Бельгия', 'PT': '🇵🇹 Португалия',
    'GR': '🇬🇷 Греция', 'AE': '🇦🇪 ОАЭ', 'SA': '🇸🇦 Саудовская Аравия',
    'IL': '🇮🇱 Израиль', 'EG': '🇪🇬 Египет', 'ZA': '🇿🇦 ЮАР',
    'MX': '🇲🇽 Мексика', 'AR': '🇦🇷 Аргентина', 'CL': '🇨🇱 Чили',
    'SG': '🇸🇬 Сингапур', 'MY': '🇲🇾 Малайзия', 'ID': '🇮🇩 Индонезия',
    'TH': '🇹🇭 Таиланд', 'VN': '🇻🇳 Вьетнам', 'PH': '🇵🇭 Филиппины',
    'unknown': '🌍 Другие'
  },
  DEVICE_EMOJIS: {
    smartphone: '📱', tablet: '📟', desktop: '💻',
    smarttv: '📺', smartwatch: '⌚', other: '🌐', unknown: '❓'
  },
  BROWSER_EMOJIS: {
    chrome: '🌐', safari: '🧭', firefox: '🦊', edge: '📘',
    opera: '🔴', samsung: '📱', uc: '🐿️', yandex: '🔍'
  },
  OS_EMOJIS: {
    windows: '🪟', macos: '🍎', linux: '🐧', android: '🤖',
    ios: '📱', ipados: '📟', unknown: '💻'
  }
};

// Кэш для статистики
const statsCache = new Map();

// ============================================
// 📅 ПАРСИНГ ПЕРИОДА
// ============================================
function parsePeriod(period) {
  const now = new Date();
  const periods = {
    '1h': 60 * 60 * 1000,
    '6h': 6 * 60 * 60 * 1000,
    '12h': 12 * 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    'today': now - new Date(now).setHours(0, 0, 0, 0),
    'yesterday': (() => {
      const start = new Date(now);
      start.setDate(start.getDate() - 1);
      start.setHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setHours(23, 59, 59, 999);
      return { start, end, isRange: true };
    })(),
    '7d': 7 * 24 * 60 * 60 * 1000,
    '14d': 14 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
    'all': null
  };
  
  const periodValue = periods[period] || periods['7d'];
  
  if (periodValue && typeof periodValue === 'object' && periodValue.isRange) {
    return { start: periodValue.start, end: periodValue.end };
  }
  
  return periodValue ? { start: new Date(now.getTime() - periodValue), end: now } : null;
}

// ============================================
// 🔍 ОПРЕДЕЛЕНИЕ БРАУЗЕРА
// ============================================
function detectBrowser(userAgent) {
  if (!userAgent) return { name: 'unknown', emoji: '❓', version: null };
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('edg/') || ua.includes('edge/')) 
    return { name: 'edge', emoji: '📘', version: ua.match(/edg\/(\d+)/)?.[1] || ua.match(/edge\/(\d+)/)?.[1] };
  if (ua.includes('chrome') && !ua.includes('edg'))
    return { name: 'chrome', emoji: '🌐', version: ua.match(/chrome\/(\d+)/)?.[1] };
  if (ua.includes('safari') && !ua.includes('chrome'))
    return { name: 'safari', emoji: '🧭', version: ua.match(/version\/(\d+)/)?.[1] };
  if (ua.includes('firefox'))
    return { name: 'firefox', emoji: '🦊', version: ua.match(/firefox\/(\d+)/)?.[1] };
  if (ua.includes('opera') || ua.includes('opr'))
    return { name: 'opera', emoji: '🔴', version: ua.match(/opr\/(\d+)/)?.[1] };
  if (ua.includes('samsungbrowser'))
    return { name: 'samsung', emoji: '📱', version: ua.match(/samsungbrowser\/(\d+)/)?.[1] };
  if (ua.includes('ucbrowser'))
    return { name: 'uc', emoji: '🐿️', version: ua.match(/ucbrowser\/(\d+)/)?.[1] };
  if (ua.includes('yabrowser'))
    return { name: 'yandex', emoji: '🔍', version: ua.match(/yabrowser\/(\d+)/)?.[1] };
  
  return { name: 'other', emoji: '🌐', version: null };
}

// ============================================
// 💻 ОПРЕДЕЛЕНИЕ ОС
// ============================================
function detectOS(userAgent) {
  if (!userAgent) return { name: 'unknown', emoji: '❓', version: null };
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('windows nt 10')) return { name: 'windows', emoji: '🪟', version: '10/11' };
  if (ua.includes('windows nt 6.3')) return { name: 'windows', emoji: '🪟', version: '8.1' };
  if (ua.includes('windows nt 6.1')) return { name: 'windows', emoji: '🪟', version: '7' };
  if (ua.includes('windows')) return { name: 'windows', emoji: '🪟', version: null };
  if (ua.includes('mac os x')) return { name: 'macos', emoji: '🍎', version: ua.match(/mac os x (\d+[._]\d+)/)?.[1]?.replace('_', '.') };
  if (ua.includes('linux') && !ua.includes('android')) return { name: 'linux', emoji: '🐧', version: null };
  if (ua.includes('android')) return { name: 'android', emoji: '🤖', version: ua.match(/android (\d+(\.\d+)?)/)?.[1] };
  if (ua.includes('ipad')) return { name: 'ipados', emoji: '📟', version: ua.match(/os (\d+[._]\d+)/)?.[1]?.replace('_', '.') };
  if (ua.includes('iphone')) return { name: 'ios', emoji: '📱', version: ua.match(/os (\d+[._]\d+)/)?.[1]?.replace('_', '.') };
  
  return { name: 'other', emoji: '💻', version: null };
}

// ============================================
// 📱 ОПРЕДЕЛЕНИЕ ТИПА УСТРОЙСТВА (расширенное)
// ============================================
function detectDeviceType(userAgent) {
  if (!userAgent) return 'unknown';
  
  const ua = userAgent.toLowerCase();
  
  if (ua.includes('smart-tv') || ua.includes('smarttv') || ua.includes('tv;')) return 'smarttv';
  if (ua.includes('watch') || (ua.includes('apple') && ua.includes('watch'))) return 'smartwatch';
  if (ua.includes('tablet') || ua.includes('ipad')) return 'tablet';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) return 'smartphone';
  if (ua.includes('windows') || ua.includes('mac') || ua.includes('linux')) return 'desktop';
  
  return 'other';
}

// ============================================
// 🏷️ ПАРСИНГ UTM И РЕФЕРЕРОВ
// ============================================
function parseRefererStats(scans) {
  const referers = {
    direct: { count: 0, emoji: '🔗', label: 'Прямой переход' },
    google: { count: 0, emoji: '🔍', label: 'Google' },
    yandex: { count: 0, emoji: '🔎', label: 'Яндекс' },
    bing: { count: 0, emoji: '🔎', label: 'Bing' },
    telegram: { count: 0, emoji: '📨', label: 'Telegram' },
    whatsapp: { count: 0, emoji: '💬', label: 'WhatsApp' },
    instagram: { count: 0, emoji: '📷', label: 'Instagram' },
    facebook: { count: 0, emoji: '👤', label: 'Facebook' },
    vk: { count: 0, emoji: '🟦', label: 'ВКонтакте' },
    youtube: { count: 0, emoji: '▶️', label: 'YouTube' },
    tiktok: { count: 0, emoji: '🎵', label: 'TikTok' },
    other: { count: 0, emoji: '🌐', label: 'Другие' }
  };
  
  scans.forEach(scan => {
    const referer = scan.referer || '';
    
    if (referer === 'direct' || !referer) {
      referers.direct.count++;
    } else if (referer.includes('google.')) {
      referers.google.count++;
    } else if (referer.includes('yandex.')) {
      referers.yandex.count++;
    } else if (referer.includes('bing.')) {
      referers.bing.count++;
    } else if (referer.includes('t.me') || referer.includes('telegram')) {
      referers.telegram.count++;
    } else if (referer.includes('whatsapp')) {
      referers.whatsapp.count++;
    } else if (referer.includes('instagram')) {
      referers.instagram.count++;
    } else if (referer.includes('facebook')) {
      referers.facebook.count++;
    } else if (referer.includes('vk.com')) {
      referers.vk.count++;
    } else if (referer.includes('youtube')) {
      referers.youtube.count++;
    } else if (referer.includes('tiktok')) {
      referers.tiktok.count++;
    } else {
      referers.other.count++;
    }
  });
  
  return referers;
}

// ============================================
// 📊 РАСШИРЕННАЯ СТАТИСТИКА
// ============================================
function calculateAdvancedStats(scans, periodFilter = null) {
  let filteredScans = scans;
  
  // Фильтрация по периоду
  if (periodFilter) {
    const { start, end } = periodFilter;
    filteredScans = scans.filter(scan => {
      const scanTime = new Date(scan.timestamp);
      return scanTime >= start && scanTime <= end;
    });
  }
  
  if (filteredScans.length === 0) {
    return null;
  }
  
  // Базовая статистика
  const total = filteredScans.length;
  const firstScan = new Date(filteredScans[0].timestamp);
  const lastScan = new Date(filteredScans[filteredScans.length - 1].timestamp);
  const daysActive = Math.max(1, Math.ceil((lastScan - firstScan) / (24 * 60 * 60 * 1000)));
  const avgPerDay = total / daysActive;
  
  // По странам (с эмодзи)
  const byCountry = {};
  filteredScans.forEach(scan => {
    const country = scan.country || 'unknown';
    if (!byCountry[country]) {
      byCountry[country] = {
        count: 0,
        name: CONFIG.COUNTRY_NAMES[country] || country,
        flag: CONFIG.COUNTRY_NAMES[country]?.split(' ')[0] || '🌍'
      };
    }
    byCountry[country].count++;
  });
  
  // По городам
  const byCity = {};
  filteredScans.forEach(scan => {
    if (scan.city && scan.city !== 'unknown') {
      const key = `${scan.city}, ${scan.country}`;
      byCity[key] = (byCity[key] || 0) + 1;
    }
  });
  
  // По устройствам (с эмодзи)
  const byDevice = {};
  filteredScans.forEach(scan => {
    const device = scan.deviceType || detectDeviceType(scan.userAgent);
    if (!byDevice[device]) {
      byDevice[device] = { count: 0, emoji: CONFIG.DEVICE_EMOJIS[device] || '🌐' };
    }
    byDevice[device].count++;
  });
  
  // По браузерам
  const byBrowser = {};
  filteredScans.forEach(scan => {
    const browser = detectBrowser(scan.userAgent);
    const key = browser.name;
    if (!byBrowser[key]) {
      byBrowser[key] = { count: 0, emoji: browser.emoji, name: browser.name };
    }
    byBrowser[key].count++;
  });
  
  // По ОС
  const byOS = {};
  filteredScans.forEach(scan => {
    const os = detectOS(scan.userAgent);
    const key = os.name;
    if (!byOS[key]) {
      byOS[key] = { count: 0, emoji: os.emoji, name: os.name };
    }
    byOS[key].count++;
  });
  
  // По часам и дням недели
  const byHour = Array(24).fill(0).map((_, i) => ({ hour: i, scans: 0 }));
  const byDayOfWeek = Array(7).fill(0).map((_, i) => ({ 
    day: i, 
    name: ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][i],
    scans: 0 
  }));
  
  filteredScans.forEach(scan => {
    const date = new Date(scan.timestamp);
    byHour[date.getHours()].scans++;
    byDayOfWeek[date.getDay()].scans++;
  });
  
  // Тренд (рост/падение)
  const half = Math.floor(filteredScans.length / 2);
  const firstHalf = filteredScans.slice(0, half);
  const secondHalf = filteredScans.slice(half);
  
  const firstHalfAvg = firstHalf.length / (daysActive / 2);
  const secondHalfAvg = secondHalf.length / (daysActive / 2);
  const trend = secondHalfAvg > firstHalfAvg ? 'up' : secondHalfAvg < firstHalfAvg ? 'down' : 'stable';
  const trendPercent = firstHalfAvg > 0 ? ((secondHalfAvg - firstHalfAvg) / firstHalfAvg * 100).toFixed(1) : 0;
  
  // Рефереры
  const referers = parseRefererStats(filteredScans);
  
  // Пиковый час и день
  const peakHour = byHour.reduce((max, curr) => curr.scans > max.scans ? curr : max, { hour: 0, scans: 0 });
  const peakDay = byDayOfWeek.reduce((max, curr) => curr.scans > max.scans ? curr : max, { day: 0, name: '', scans: 0 });
  
  // Проценты
  const percentages = {
    mobile: ((byDevice.smartphone?.count || 0) / total * 100).toFixed(1),
    desktop: ((byDevice.desktop?.count || 0) / total * 100).toFixed(1),
    tablet: ((byDevice.tablet?.count || 0) / total * 100).toFixed(1)
  };
  
  return {
    total,
    daysActive,
    avgPerDay: avgPerDay.toFixed(1),
    firstScan: firstScan.toISOString(),
    lastScan: lastScan.toISOString(),
    peakHour,
    peakDay,
    trend: { direction: trend, percent: trendPercent },
    percentages,
    byCountry: Object.entries(byCountry)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([code, data]) => ({ code, ...data })),
    byCity: Object.entries(byCity)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([city, count]) => ({ city, count })),
    byDevice,
    byBrowser,
    byOS,
    byHour,
    byDayOfWeek,
    referers: Object.entries(referers)
      .filter(([_, data]) => data.count > 0)
      .sort((a, b) => b[1].count - a[1].count)
  };
}

// ============================================
// 🎯 ОСНОВНОЙ ОБРАБОТЧИК
// ============================================
export default async function handler(req, res) {
  const startTime = Date.now();
  
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('X-QRush-Version', '2.0.0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { 
    code, 
    period = '7d', 
    format = 'json',
    limit = 10,
    includeRaw = 'false',
    skipCache = 'false'
  } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Code parameter is required' });
  }

  // Проверка кэша
  const cacheKey = `stats:${code}:${period}:${limit}`;
  if (CONFIG.CACHE_ENABLED && skipCache !== 'true' && statsCache.has(cacheKey)) {
    const cached = statsCache.get(cacheKey);
    if (Date.now() - cached.timestamp < CONFIG.CACHE_TTL_SECONDS * 1000) {
      res.setHeader('X-Cache', 'HIT');
      return res.status(200).json(cached.data);
    }
  }

  // Получаем сканы
  const scans = statsStore.get(`scans:${code}`) || [];
  const targetUrl = statsStore.get(`url:${code}`) || null;
  const createdAt = statsStore.get(`created:${code}`) || null;
  const expiresAt = statsStore.get(`expires:${code}`) || null;

  // Фильтр периода
  const periodFilter = parsePeriod(period);
  
  // Расширенная статистика
  const advancedStats = calculateAdvancedStats(scans, periodFilter);
  
  if (!advancedStats) {
    return res.status(200).json({
      success: true,
      code,
      targetUrl,
      createdAt,
      expiresAt,
      totalScans: 0,
      message: 'No scans found for this period',
      period
    });
  }

  // Последние сканы
  const recentLimit = Math.min(parseInt(limit) || 10, 100);
  const recentScans = scans.slice(-recentLimit).reverse().map(scan => ({
    id: scan.id || `${scan.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: scan.timestamp,
    timeFormatted: scan.timeFormatted || {
      date: new Date(scan.timestamp).toLocaleDateString('ru-RU'),
      time: new Date(scan.timestamp).toLocaleTimeString('ru-RU')
    },
    country: scan.country || 'unknown',
    countryFull: scan.countryFull || CONFIG.COUNTRY_NAMES[scan.country] || scan.country,
    city: scan.city || null,
    device: scan.deviceType || detectDeviceType(scan.userAgent),
    deviceEmoji: CONFIG.DEVICE_EMOJIS[scan.deviceType] || '🌐',
    browser: detectBrowser(scan.userAgent),
    os: detectOS(scan.userAgent),
    isBot: scan.isBot || false,
    referer: scan.referer || 'direct',
    utm: {
      source: scan.utm_source,
      medium: scan.utm_medium,
      campaign: scan.utm_campaign
    }
  }));

  // UTM статистика
  const utmStats = { sources: {}, mediums: {}, campaigns: {} };
  scans.forEach(scan => {
    if (scan.utm_source) utmStats.sources[scan.utm_source] = (utmStats.sources[scan.utm_source] || 0) + 1;
    if (scan.utm_medium) utmStats.mediums[scan.utm_medium] = (utmStats.mediums[scan.utm_medium] || 0) + 1;
    if (scan.utm_campaign) utmStats.campaigns[scan.utm_campaign] = (utmStats.campaigns[scan.utm_campaign] || 0) + 1;
  });

  // Топы
  const tops = {
    countries: advancedStats.byCountry.slice(0, 5),
    cities: advancedStats.byCity.slice(0, 5),
    browsers: Object.entries(advancedStats.byBrowser)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)
      .map(([name, data]) => ({ name, ...data })),
    referers: advancedStats.referers.slice(0, 5)
  };

  const responseData = {
    success: true,
    code,
    targetUrl,
    createdAt,
    expiresAt,
    period: {
      requested: period,
      from: periodFilter?.start?.toISOString() || 'all',
      to: periodFilter?.end?.toISOString() || 'all'
    },
    summary: {
      totalScans: advancedStats.total,
      daysActive: advancedStats.daysActive,
      avgPerDay: advancedStats.avgPerDay,
      firstScan: advancedStats.firstScan,
      lastScan: advancedStats.lastScan,
      trend: advancedStats.trend,
      percentages: advancedStats.percentages
    },
    peaks: {
      hour: advancedStats.peakHour,
      day: advancedStats.peakDay
    },
    byCountry: advancedStats.byCountry,
    byCity: advancedStats.byCity,
    byDevice: advancedStats.byDevice,
    byBrowser: advancedStats.byBrowser,
    byOS: advancedStats.byOS,
    byHour: advancedStats.byHour,
    byDayOfWeek: advancedStats.byDayOfWeek,
    referers: advancedStats.referers,
    utm: utmStats,
    tops,
    recentScans,
    ...(includeRaw === 'true' ? { rawScans: scans.slice(-100) } : {}),
    generatedAt: new Date().toISOString(),
    generationTimeMs: Date.now() - startTime
  };

  // Сохраняем в кэш
  if (CONFIG.CACHE_ENABLED && skipCache !== 'true') {
    statsCache.set(cacheKey, {
      data: responseData,
      timestamp: Date.now()
    });
    res.setHeader('X-Cache', 'MISS');
  }

  // CSV экспорт
  if (format === 'csv') {
    const csvHeaders = ['Timestamp', 'Country', 'City', 'Device', 'Browser', 'OS', 'Referer', 'UTM Source', 'UTM Medium', 'UTM Campaign'];
    const csvRows = scans.slice(0, CONFIG.MAX_SCANS_FOR_EXPORT).map(scan => [
      scan.timestamp,
      scan.country || '',
      scan.city || '',
      scan.deviceType || detectDeviceType(scan.userAgent),
      detectBrowser(scan.userAgent).name,
      detectOS(scan.userAgent).name,
      scan.referer || 'direct',
      scan.utm_source || '',
      scan.utm_medium || '',
      scan.utm_campaign || ''
    ]);
    
    const csv = [csvHeaders, ...csvRows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="qrush-stats-${code}-${new Date().toISOString().split('T')[0]}.csv"`);
    return res.status(200).send(csv);
  }

  res.setHeader('X-Generation-Time', `${Date.now() - startTime}ms`);
  return res.status(200).json(responseData);
}

// ============================================
// 📊 GET /api/stats/dashboard — общий дашборд
// ============================================
export async function getDashboardStats() {
  const allCodes = [];
  for (const [key] of statsStore.entries()) {
    if (key.startsWith('url:')) {
      allCodes.push(key.replace('url:', ''));
    }
  }
  
  const dashboard = {
    totalCodes: allCodes.length,
    totalScans: 0,
    activeToday: 0,
    topCodes: [],
    globalTopCountries: {},
    globalTopDevices: {}
  };
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  for (const code of allCodes) {
    const scans = statsStore.get(`scans:${code}`) || [];
    dashboard.totalScans += scans.length;
    
    // Активные сегодня
    const hasTodayScans = scans.some(scan => new Date(scan.timestamp) >= today);
    if (hasTodayScans) dashboard.activeToday++;
    
    // Топ кодов
    dashboard.topCodes.push({ code, scans: scans.length, url: statsStore.get(`url:${code}`) });
    
    // Глобальные страны
    scans.forEach(scan => {
      const country = scan.country || 'unknown';
      dashboard.globalTopCountries[country] = (dashboard.globalTopCountries[country] || 0) + 1;
      
      const device = scan.deviceType || 'other';
      dashboard.globalTopDevices[device] = (dashboard.globalTopDevices[device] || 0) + 1;
    });
  }
  
  dashboard.topCodes = dashboard.topCodes
    .sort((a, b) => b.scans - a.scans)
    .slice(0, 10);
  
  dashboard.globalTopCountries = Object.entries(dashboard.globalTopCountries)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([code, count]) => ({ code, name: CONFIG.COUNTRY_NAMES[code] || code, count }));
  
  return dashboard;
}

// Экспорт
export { statsCache, CONFIG };