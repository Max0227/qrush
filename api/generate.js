// api/generate.js — Продвинутый генератор QR-кодов со всеми фишками
import QRCode from 'qrcode';
import { createCanvas, loadImage } from 'canvas'; // Для наложения логотипа
import crypto from 'crypto';

// ============================================
// ⚙️ КОНФИГУРАЦИЯ
// ============================================
const CONFIG = {
  // Размеры
  MIN_SIZE: 100,
  MAX_SIZE: 4000,
  DEFAULT_SIZE: 400,
  
  // Логотип
  MAX_LOGO_SIZE_RATIO: 0.25,        // Максимум 25% от размера QR
  LOGO_POSITIONS: ['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right'],
  
  // Стили углов (eye patterns)
  EYE_STYLES: ['square', 'circle', 'rounded', 'diamond'],
  
  // Пресеты
  PRESETS: {
    instagram: { color: '#E1306C', bgColor: '#FFFFFF', eyeStyle: 'rounded' },
    facebook: { color: '#1877F2', bgColor: '#FFFFFF', eyeStyle: 'circle' },
    linkedin: { color: '#0A66C2', bgColor: '#FFFFFF', eyeStyle: 'square' },
    whatsapp: { color: '#25D366', bgColor: '#FFFFFF', eyeStyle: 'rounded' },
    telegram: { color: '#26A5E4', bgColor: '#FFFFFF', eyeStyle: 'circle' },
    premium: { color: '#7c3aed', bgColor: '#0A0A0F', eyeStyle: 'diamond', gradient: true }
  },
  
  // Кэширование
  CACHE_ENABLED: true,
  CACHE_TTL_SECONDS: 3600,          // 1 час
  
  // Метрики
  COLLECT_METRICS: true,
  
  // Rate limiting
  RATE_LIMIT_ENABLED: true,
  MAX_REQUESTS_PER_IP: 100,          // В минуту
  RATE_WINDOW_MS: 60000
};

// ============================================
// 📊 Хранилище метрик и кэша
// ============================================
const metricsStore = new Map();
const cacheStore = new Map();
const rateLimitStore = new Map();

// ============================================
// 🎨 ГЕНЕРАЦИЯ ГРАДИЕНТА ДЛЯ QR
// ============================================
function generateGradientCanvas(size, gradientColors) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  
  const gradient = ctx.createLinearGradient(0, 0, size, size);
  
  if (Array.isArray(gradientColors)) {
    gradientColors.forEach((color, index) => {
      gradient.addColorStop(index / (gradientColors.length - 1), color);
    });
  } else {
    gradient.addColorStop(0, gradientColors.start || '#7c3aed');
    gradient.addColorStop(1, gradientColors.end || '#a855f7');
  }
  
  return { canvas, ctx, gradient };
}

// ============================================
// 🖼️ НАЛОЖЕНИЕ ЛОГОТИПА НА QR
// ============================================
async function addLogoToQR(qrCanvas, logoInput, position = 'center', logoSize = 0.2) {
  try {
    let logoImage;
    
    if (typeof logoInput === 'string' && logoInput.startsWith('data:')) {
      logoImage = await loadImage(logoInput);
    } else if (typeof logoInput === 'string' && logoInput.startsWith('http')) {
      // Загрузка по URL (с таймаутом)
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const response = await fetch(logoInput, { signal: controller.signal });
      clearTimeout(timeout);
      const buffer = await response.arrayBuffer();
      logoImage = await loadImage(Buffer.from(buffer));
    } else {
      return qrCanvas; // Нет логотипа
    }
    
    const qrSize = qrCanvas.width;
    const ctx = qrCanvas.getContext('2d');
    
    // Размер логотипа (максимум 25% от QR)
    const maxLogoSize = qrSize * CONFIG.MAX_LOGO_SIZE_RATIO;
    let logoWidth = Math.min(qrSize * logoSize, maxLogoSize);
    let logoHeight = (logoImage.height / logoImage.width) * logoWidth;
    
    // Позиционирование
    let x, y;
    const padding = qrSize * 0.02;
    
    switch (position) {
      case 'top-left':
        x = padding;
        y = padding;
        break;
      case 'top-right':
        x = qrSize - logoWidth - padding;
        y = padding;
        break;
      case 'bottom-left':
        x = padding;
        y = qrSize - logoHeight - padding;
        break;
      case 'bottom-right':
        x = qrSize - logoWidth - padding;
        y = qrSize - logoHeight - padding;
        break;
      case 'center':
      default:
        x = (qrSize - logoWidth) / 2;
        y = (qrSize - logoHeight) / 2;
        
        // Очищаем фон под логотипом (белый квадрат с отступами)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(x - 4, y - 4, logoWidth + 8, logoHeight + 8);
        break;
    }
    
    // Рисуем логотип
    ctx.drawImage(logoImage, x, y, logoWidth, logoHeight);
    
    return qrCanvas;
  } catch (error) {
    console.error('[QRush] Logo overlay failed:', error.message);
    return qrCanvas; // Возвращаем без логотипа при ошибке
  }
}

// ============================================
// 👁️ КАСТОМНЫЕ СТИЛИ УГЛОВ (EYE PATTERNS)
// ============================================
function applyEyeStyle(canvas, style) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const moduleSize = size / 25; // Стандартный QR имеет ~25 модулей
  
  // Позиции глаз (верхний левый, верхний правый, нижний левый)
  const eyePositions = [
    { x: moduleSize * 3.5, y: moduleSize * 3.5 }, // TL
    { x: size - moduleSize * 10.5, y: moduleSize * 3.5 }, // TR
    { x: moduleSize * 3.5, y: size - moduleSize * 10.5 } // BL
  ];
  
  const eyeSize = moduleSize * 7;
  
  eyePositions.forEach(pos => {
    ctx.save();
    ctx.beginPath();
    
    switch (style) {
      case 'circle':
        ctx.arc(pos.x + eyeSize/2, pos.y + eyeSize/2, eyeSize/2, 0, Math.PI * 2);
        break;
      case 'rounded':
        ctx.roundRect(pos.x, pos.y, eyeSize, eyeSize, moduleSize);
        break;
      case 'diamond':
        ctx.translate(pos.x + eyeSize/2, pos.y + eyeSize/2);
        ctx.rotate(Math.PI / 4);
        ctx.rect(-eyeSize/2, -eyeSize/2, eyeSize, eyeSize);
        break;
      case 'square':
      default:
        ctx.rect(pos.x, pos.y, eyeSize, eyeSize);
        break;
    }
    
    ctx.clip();
    
    // Перерисовываем глаз (чёрный фон, белая середина)
    ctx.fillStyle = '#000000';
    ctx.fillRect(pos.x, pos.y, eyeSize, eyeSize);
    
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(pos.x + moduleSize, pos.y + moduleSize, eyeSize - moduleSize*2, eyeSize - moduleSize*2);
    
    ctx.fillStyle = '#000000';
    ctx.fillRect(pos.x + moduleSize*2, pos.y + moduleSize*2, eyeSize - moduleSize*4, eyeSize - moduleSize*4);
    
    ctx.restore();
  });
  
  return canvas;
}

// ============================================
// 🏷️ ГЕНЕРАЦИЯ КАСТОМНОГО ФРЕЙМА
// ============================================
function addFrame(canvas, frameOptions) {
  const { style = 'none', color = '#7c3aed', width = 4, padding = 16 } = frameOptions;
  
  if (style === 'none') return canvas;
  
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  
  if (style === 'solid') {
    ctx.strokeRect(padding/2, padding/2, size - padding, size - padding);
  } else if (style === 'dashed') {
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(padding/2, padding/2, size - padding, size - padding);
  } else if (style === 'double') {
    ctx.strokeRect(padding/2, padding/2, size - padding, size - padding);
    ctx.strokeRect(padding/2 + width*2, padding/2 + width*2, size - padding - width*4, size - padding - width*4);
  }
  
  ctx.restore();
  return canvas;
}

// ============================================
// 🔢 ГЕНЕРАЦИЯ УНИКАЛЬНОГО ID
// ============================================
function generateDynamicId(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let id = '';
  for (let i = 0; i < length; i++) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

// ============================================
// 🔑 ГЕНЕРАЦИЯ КЭШ-КЛЮЧА
// ============================================
function generateCacheKey(params) {
  const relevantParams = {
    url: params.url,
    size: params.size,
    color: params.color,
    bgColor: params.bgColor,
    errorCorrection: params.errorCorrection,
    margin: params.margin,
    eyeStyle: params.eyeStyle,
    logoHash: params.logo ? crypto.createHash('md5').update(params.logo.slice(0, 100)).digest('hex') : null
  };
  return crypto.createHash('md5').update(JSON.stringify(relevantParams)).digest('hex');
}

// ============================================
// 📊 СБОР МЕТРИК
// ============================================
function collectMetrics(endpoint, duration, success, error = null) {
  if (!CONFIG.COLLECT_METRICS) return;
  
  const key = `metrics:${endpoint}`;
  if (!metricsStore.has(key)) {
    metricsStore.set(key, {
      total: 0,
      success: 0,
      errors: 0,
      durations: [],
      lastError: null
    });
  }
  
  const metrics = metricsStore.get(key);
  metrics.total++;
  if (success) {
    metrics.success++;
  } else {
    metrics.errors++;
    metrics.lastError = error;
  }
  metrics.durations.push(duration);
  
  // Держим последние 1000 замеров
  if (metrics.durations.length > 1000) {
    metrics.durations.shift();
  }
  
  metricsStore.set(key, metrics);
}

// ============================================
// 🛡️ RATE LIMITING
// ============================================
function checkRateLimit(ip) {
  if (!CONFIG.RATE_LIMIT_ENABLED) return { allowed: true };
  
  const now = Date.now();
  const windowStart = now - CONFIG.RATE_WINDOW_MS;
  
  if (!rateLimitStore.has(ip)) {
    rateLimitStore.set(ip, []);
  }
  
  const requests = rateLimitStore.get(ip).filter(ts => ts > windowStart);
  requests.push(now);
  rateLimitStore.set(ip, requests);
  
  if (requests.length > CONFIG.MAX_REQUESTS_PER_IP) {
    return {
      allowed: false,
      current: requests.length,
      limit: CONFIG.MAX_REQUESTS_PER_IP,
      retryAfter: Math.ceil(CONFIG.RATE_WINDOW_MS / 1000)
    };
  }
  
  return { allowed: true, remaining: CONFIG.MAX_REQUESTS_PER_IP - requests.length };
}

// ============================================
// 🎯 ОСНОВНОЙ ОБРАБОТЧИК
// ============================================
export default async function handler(req, res) {
  const startTime = Date.now();
  
  // CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-API-Key');
  res.setHeader('X-QRush-Version', '2.0.0');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Поддержка GET для простых запросов
  let params;
  if (req.method === 'GET') {
    params = req.query;
    params.size = parseInt(params.size) || CONFIG.DEFAULT_SIZE;
  } else if (req.method === 'POST') {
    params = req.body;
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Rate limiting
  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
             req.headers['x-real-ip'] || 
             req.socket.remoteAddress || 
             'unknown';
  
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    res.setHeader('Retry-After', rateCheck.retryAfter);
    return res.status(429).json({
      success: false,
      error: 'Rate limit exceeded',
      limit: rateCheck.limit,
      retryAfter: rateCheck.retryAfter
    });
  }

  try {
    const {
      url,
      size = CONFIG.DEFAULT_SIZE,
      color = '#000000',
      bgColor = '#FFFFFF',
      errorCorrection = 'M',
      margin = 2,
      logo = null,
      logoPosition = 'center',
      logoSize = 0.2,
      eyeStyle = 'square',
      frame = 'none',
      frameColor = '#7c3aed',
      frameWidth = 4,
      gradient = false,
      gradientColors = null,
      preset = null,
      returnFormat = 'all', // 'png', 'svg', 'all'
      skipCache = false
    } = params;

    // Применяем пресет если указан
    let finalColor = color;
    let finalBgColor = bgColor;
    let finalEyeStyle = eyeStyle;
    let finalGradient = gradient;
    
    if (preset && CONFIG.PRESETS[preset]) {
      const p = CONFIG.PRESETS[preset];
      finalColor = p.color;
      finalBgColor = p.bgColor || bgColor;
      finalEyeStyle = p.eyeStyle || eyeStyle;
      finalGradient = p.gradient || gradient;
    }

    // Валидация URL
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL is required' });
    }

    // Очистка URL от опасных схем
    const dangerousSchemes = ['javascript:', 'data:', 'file:', 'vbscript:'];
    const lowerUrl = url.toLowerCase().trim();
    if (dangerousSchemes.some(scheme => lowerUrl.startsWith(scheme))) {
      return res.status(400).json({ error: 'Invalid URL scheme' });
    }

    // Проверка кэша
    const cacheKey = CONFIG.CACHE_ENABLED && !skipCache ? generateCacheKey({...params, color: finalColor, bgColor: finalBgColor, eyeStyle: finalEyeStyle}) : null;
    if (cacheKey && cacheStore.has(cacheKey)) {
      const cached = cacheStore.get(cacheKey);
      if (Date.now() - cached.timestamp < CONFIG.CACHE_TTL_SECONDS * 1000) {
        collectMetrics('generate', Date.now() - startTime, true);
        res.setHeader('X-Cache', 'HIT');
        return res.status(200).json(cached.data);
      }
    }

    // Ограничения
    const safeSize = Math.min(Math.max(parseInt(size) || CONFIG.DEFAULT_SIZE, CONFIG.MIN_SIZE), CONFIG.MAX_SIZE);
    const safeMargin = Math.min(Math.max(parseInt(margin) || 2, 0), 20);

    // Валидация цветов
    const hexRegex = /^#[0-9A-F]{6}$/i;
    const safeColor = hexRegex.test(finalColor) ? finalColor : '#000000';
    const safeBgColor = hexRegex.test(finalBgColor) ? finalBgColor : '#FFFFFF';

    // Уровень коррекции ошибок
    const ecLevels = ['L', 'M', 'Q', 'H'];
    const safeEcLevel = ecLevels.includes(errorCorrection) ? errorCorrection : 'M';

    // Базовая генерация QR
    let qrDataUrl, qrSvg;
    
    if (finalGradient && returnFormat !== 'svg') {
      // Генерация с градиентом (только для PNG)
      const { canvas, ctx, gradient } = generateGradientCanvas(safeSize, gradientColors || { start: safeColor, end: safeColor });
      
      // Временно генерируем QR во временный canvas
      const tempCanvas = createCanvas(safeSize, safeSize);
      const tempCtx = tempCanvas.getContext('2d');
      
      await new Promise((resolve, reject) => {
        QRCode.toCanvas(tempCanvas, url, {
          width: safeSize,
          margin: safeMargin,
          color: { dark: '#000000', light: '#FFFFFF' },
          errorCorrectionLevel: safeEcLevel
        }, (err) => err ? reject(err) : resolve());
      });
      
      // Применяем градиент к тёмным пикселям
      const imageData = tempCtx.getImageData(0, 0, safeSize, safeSize);
      const data = imageData.data;
      
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] === 0) { // Чёрный пиксель
          const x = (i / 4) % safeSize;
          const y = Math.floor((i / 4) / safeSize);
          const colorStop = (x + y) / (safeSize * 2);
          
          // Вычисляем цвет из градиента
          const r = 124 + Math.floor(131 * colorStop);
          const g = 58 + Math.floor(197 * colorStop);
          const b = 237 - Math.floor(10 * colorStop);
          
          data[i] = r;
          data[i+1] = g;
          data[i+2] = b;
        }
      }
      
      ctx.putImageData(imageData, 0, 0);
      
      // Применяем стиль углов
      if (finalEyeStyle !== 'square' && CONFIG.EYE_STYLES.includes(finalEyeStyle)) {
        applyEyeStyle(canvas, finalEyeStyle);
      }
      
      // Добавляем логотип
      if (logo) {
        await addLogoToQR(canvas, logo, logoPosition, logoSize);
      }
      
      // Добавляем рамку
      if (frame !== 'none') {
        addFrame(canvas, { style: frame, color: frameColor, width: frameWidth });
      }
      
      qrDataUrl = canvas.toDataURL('image/png');
    } else {
      // Стандартная генерация
      qrDataUrl = await QRCode.toDataURL(url, {
        width: safeSize,
        margin: safeMargin,
        color: { dark: safeColor, light: safeBgColor },
        errorCorrectionLevel: safeEcLevel
      });
    }

    // Генерация SVG
    if (returnFormat === 'all' || returnFormat === 'svg') {
      qrSvg = await QRCode.toString(url, {
        type: 'svg',
        width: safeSize,
        margin: safeMargin,
        color: { dark: safeColor, light: safeBgColor },
        errorCorrectionLevel: safeEcLevel
      });
    }

    // Генерация ID для динамического кода
    const dynamicId = generateDynamicId();

    const responseData = {
      success: true,
      qr: qrDataUrl,
      qrSvg: qrSvg || null,
      dynamicId: dynamicId,
      settings: {
        size: safeSize,
        color: safeColor,
        bgColor: safeBgColor,
        errorCorrection: safeEcLevel,
        margin: safeMargin,
        eyeStyle: finalEyeStyle,
        gradient: finalGradient,
        preset: preset
      },
      urls: {
        png: qrDataUrl,
        dynamic: `https://qrush.vercel.app/q/${dynamicId}`
      },
      timestamp: new Date().toISOString(),
      generationTimeMs: Date.now() - startTime
    };

    // Сохраняем в кэш
    if (cacheKey && CONFIG.CACHE_ENABLED) {
      cacheStore.set(cacheKey, {
        data: responseData,
        timestamp: Date.now()
      });
      res.setHeader('X-Cache', 'MISS');
    }

    // Метрики
    collectMetrics('generate', Date.now() - startTime, true);
    
    // Заголовки ответа
    res.setHeader('X-Generation-Time', `${Date.now() - startTime}ms`);
    res.setHeader('X-RateLimit-Remaining', rateCheck.remaining || 0);

    return res.status(200).json(responseData);

  } catch (error) {
    console.error('[QRush] QR Generation error:', error);
    collectMetrics('generate', Date.now() - startTime, false, error.message);
    
    return res.status(500).json({
      success: false,
      error: 'Failed to generate QR code',
      message: error.message,
      requestId: `qr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    });
  }
}

// ============================================
// 📊 GET /api/generate/metrics — получение метрик
// ============================================
export async function getMetrics() {
  const result = {};
  for (const [key, value] of metricsStore.entries()) {
    const durations = value.durations;
    const avg = durations.length > 0 
      ? durations.reduce((a, b) => a + b, 0) / durations.length 
      : 0;
    
    result[key] = {
      total: value.total,
      success: value.success,
      errors: value.errors,
      successRate: value.total > 0 ? (value.success / value.total * 100).toFixed(2) + '%' : '0%',
      avgResponseTimeMs: Math.round(avg),
      lastError: value.lastError
    };
  }
  return result;
}

// ============================================
// 🧹 Очистка кэша (вызывать периодически)
// ============================================
export function cleanCache() {
  const now = Date.now();
  for (const [key, value] of cacheStore.entries()) {
    if (now - value.timestamp > CONFIG.CACHE_TTL_SECONDS * 1000) {
      cacheStore.delete(key);
    }
  }
}

// Экспорт для других модулей
export { metricsStore, cacheStore, CONFIG };