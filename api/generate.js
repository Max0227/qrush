// api/generate.js — Рабочий генератор QR-кодов для Vercel
import QRCode from 'qrcode';

export default async function handler(req, res) {
  // CORS заголовки
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Только POST
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    const {
      url,
      size = 400,
      color = '#000000',
      bgColor = '#FFFFFF',
      errorCorrection = 'M',
      margin = 2
    } = body;

    // Валидация
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    // Проверка опасных схем
    const dangerousSchemes = ['javascript:', 'data:', 'file:', 'vbscript:'];
    const lowerUrl = url.toLowerCase().trim();
    if (dangerousSchemes.some(scheme => lowerUrl.startsWith(scheme))) {
      return res.status(400).json({ success: false, error: 'Invalid URL scheme' });
    }

    // Безопасные значения
    const safeSize = Math.min(Math.max(parseInt(size) || 400, 100), 2000);
    const safeMargin = Math.min(Math.max(parseInt(margin) || 2, 0), 20);
    
    const hexRegex = /^#[0-9A-F]{6}$/i;
    const safeColor = hexRegex.test(color) ? color : '#000000';
    const safeBgColor = hexRegex.test(bgColor) ? bgColor : '#FFFFFF';
    
    const ecLevels = ['L', 'M', 'Q', 'H'];
    const safeEcLevel = ecLevels.includes(errorCorrection) ? errorCorrection : 'M';

    console.log(`[QRush] Generating QR: ${url.substring(0, 50)}... (${safeSize}px)`);

    // Генерация PNG (Data URL)
    const qrDataUrl = await QRCode.toDataURL(url, {
      width: safeSize,
      margin: safeMargin,
      color: {
        dark: safeColor,
        light: safeBgColor
      },
      errorCorrectionLevel: safeEcLevel
    });

    // Генерация SVG
    const qrSvg = await QRCode.toString(url, {
      type: 'svg',
      width: safeSize,
      margin: safeMargin,
      color: {
        dark: safeColor,
        light: safeBgColor
      },
      errorCorrectionLevel: safeEcLevel
    });

    // Генерация ID для динамического кода
    const dynamicId = Math.random().toString(36).substring(2, 10) + 
                      Date.now().toString(36).substring(2, 6);

    console.log(`[QRush] QR generated successfully: ${dynamicId}`);

    return res.status(200).json({
      success: true,
      qr: qrDataUrl,
      qrSvg: qrSvg,
      dynamicId: dynamicId,
      settings: {
        size: safeSize,
        color: safeColor,
        bgColor: safeBgColor,
        errorCorrection: safeEcLevel,
        margin: safeMargin
      },
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[QRush] Generate error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to generate QR code',
      message: error.message
    });
  }
}