const store = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { code, targetUrl } = body;

    if (!code || !targetUrl) return res.status(400).json({ success: false, error: 'Code and targetUrl required' });

    store.set(`url:${code}`, targetUrl);
    if (!store.has(`scans:${code}`)) store.set(`scans:${code}`, []);

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