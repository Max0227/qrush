const store = new Map();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const url = new URL(req.url, `http://${req.headers.host}`);
  const code = url.searchParams.get('code');

  if (!code) return res.status(400).json({ error: 'Code required' });

  const scans = store.get(`scans:${code}`) || [];
  
  const byCountry = {};
  const byHour = Array(24).fill(0).map((_, i) => ({ hour: i, scans: 0 }));
  
  scans.forEach(scan => {
    const country = scan.country || 'unknown';
    byCountry[country] = (byCountry[country] || 0) + 1;
    
    const hour = new Date(scan.timestamp).getHours();
    byHour[hour].scans++;
  });

  return res.status(200).json({
    success: true,
    totalScans: scans.length,
    byCountry,
    byHour,
    recentScans: scans.slice(-10).reverse()
  });
}