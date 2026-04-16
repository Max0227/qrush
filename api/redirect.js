const store = new Map();

export default async function handler(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.pathname.split('/')[2];

  if (!code) return res.status(400).send('Code required');

  const targetUrl = store.get(`url:${code}`);
  if (!targetUrl) return res.status(404).send('QR code not found');

  // Сохраняем статистику
  if (!store.has(`scans:${code}`)) store.set(`scans:${code}`, []);
  store.get(`scans:${code}`).push({
    timestamp: new Date().toISOString(),
    ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    country: req.headers['x-vercel-ip-country']
  });

  res.writeHead(302, { Location: targetUrl });
  res.end();
}