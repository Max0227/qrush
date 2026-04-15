// api/generate.js — Минимальная рабочая версия
import QRCode from 'qrcode';

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { url, size = 400, color = '#000000', bgColor = '#FFFFFF' } = body;

    if (!url) {
      return res.status(400).json({ success: false, error: 'URL required' });
    }

    const qrDataUrl = await QRCode.toDataURL(url, {
      width: parseInt(size) || 400,
      margin: 2,
      color: { dark: color, light: bgColor }
    });

    const qrSvg = await QRCode.toString(url, {
      type: 'svg',
      width: parseInt(size) || 400,
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