// index.js — Заглушка для Vercel (перенаправляет на статику)
export default function handler(req, res) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html');
  res.end('QRush');
}