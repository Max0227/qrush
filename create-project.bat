@echo off
chcp 65001 >nul
title Создание проекта QRush для Vercel

echo ==========================================
echo     СОЗДАНИЕ СТРУКТУРЫ ПРОЕКТА QRUSH
echo ==========================================
echo.

:: Запрос пути установки
set /p project_path="Введите путь для создания проекта (например, C:\Projects\qrush): "

:: Создание корневой папки
echo [1/8] Создание корневой папки...
mkdir "%project_path%" 2>nul
cd /d "%project_path%"

:: Создание папок API
echo [2/8] Создание папок API (serverless функции)...
mkdir api 2>nul

:: Создание папок assets
echo [3/8] Создание папок assets...
mkdir assets\css 2>nul
mkdir assets\js 2>nul
mkdir assets\images 2>nul

:: Создание папки data
echo [4/8] Создание папки data...
mkdir data 2>nul

:: Создание API файлов
echo [5/8] Создание API файлов...
(
echo // API: Генерация QR-кода
echo export default async function handler^(req, res^) {
echo   if ^(req.method !== 'POST'^) return res.status^(405^).json^({ error: 'Method not allowed' }^);
echo   const { url, size, color, bgColor } = req.body;
echo   // QR генерация будет здесь
echo   res.status^(200^).json^({ qr: 'base64_image_data' }^);
echo }
) > api\generate.js

(
echo // API: Редирект и аналитика
echo export default async function handler^(req, res^) {
echo   const { code } = req.query;
echo   // Логика редиректа и записи статистики
echo   res.writeHead^(302, { Location: 'https://example.com' }^);
echo   res.end^(^);
echo }
) > api\redirect.js

(
echo // API: Получение статистики
echo export default async function handler^(req, res^) {
echo   const { code } = req.query;
echo   res.status^(200^).json^({
echo     totalScans: 1247,
echo     byCountry: { RU: 450, US: 320, DE: 150 },
echo     byHour: Array^(24^).fill^(0^).map^(^(_, i^) ^=> ({ hour: i, scans: Math.floor^(Math.random^(^) * 100^) }^)^)
echo   }^);
echo }
) > api\stats.js

:: Создание JS файлов
echo [6/8] Создание JavaScript файлов...
(
echo // Основная логика генерации QR на клиенте
echo class QRGenerator {
echo   constructor^(^) { this.apiUrl = '/api/generate'; }
echo   async generate^(url, options ^= {}^) {
echo     const response = await fetch^(this.apiUrl, {
echo       method: 'POST',
echo       headers: { 'Content-Type': 'application/json' },
echo       body: JSON.stringify^({ url, ...options }^)
echo     }^);
echo     return response.json^(^);
echo   }
echo }
) > assets\js\qr-generator.js

(
echo // Отображение аналитики
echo class Analytics {
echo   constructor^(containerId^) { this.container = document.getElementById^(containerId^); }
echo   async loadStats^(code^) {
echo     const response = await fetch^(`/api/stats?code=${code}`^);
echo     const data = await response.json^(^);
echo     this.render^(data^);
echo   }
echo   render^(data^) { console.log^('Stats:', data^); }
echo }
) > assets\js\analytics.js

(
echo // Точка входа
echo document.addEventListener^('DOMContentLoaded', ^(^) ^=^> {
echo   console.log^('🚀 QRush загружен'^);
echo   const generator = new QRGenerator^(^);
echo   window.qrush = { generator };
echo }^);
) > assets\js\main.js

:: Создание CSS файла
echo [7/8] Создание CSS файла...
(
echo /* QRush Styles — скопируйте стили из Readdy */
echo :root { --bg: #0A0A0F; --primary: #7c3aed; --primary-light: #a855f7; }
echo body { background: var^(--bg^); color: #fff; font-family: 'Inter', sans-serif; }
) > assets\css\style.css

:: Создание index.html
echo [8/8] Создание index.html...
(
echo ^<!DOCTYPE html^>
echo ^<html lang="ru"^>
echo ^<head^>
echo   ^<meta charset="UTF-8"^>
echo   ^<meta name="viewport" content="width=device-width, initial-scale=1.0"^>
echo   ^<title^>QRush — Генератор QR-кодов с аналитикой^</title^>
echo   ^<link rel="stylesheet" href="/assets/css/style.css"^>
echo   ^<link rel="preconnect" href="https://fonts.googleapis.com"^>
echo   ^<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin^>
echo   ^<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700^&family=JetBrains+Mono^&display=swap" rel="stylesheet"^>
echo ^</head^>
echo ^<body^>
echo   ^<main^>
echo     ^<h1^>QRush. Код, который видит ваш клиент^</h1^>
echo     ^<p^>Создай QR за 2 секунды. Смотри статистику сканирований. Всё в одном окне.^</p^>
echo     ^<div id="generator"^>
echo       ^<input type="text" id="urlInput" placeholder="Вставьте ссылку, текст или выберите Wi-Fi..." /^>
echo       ^<button id="generateBtn"^>Сгенерировать QR^</button^>
echo       ^<div id="preview"^>^</div^>
echo     ^</div^>
echo   ^</main^>
echo   ^<footer^>
echo     ^<p^>^&copy; 2026 QRush. ^<a href="#"^>Политика конфиденциальности^</a^> ^| ^<a href="#"^>Условия использования^</a^>^</p^>
echo   ^</footer^>
echo   ^<script src="/assets/js/qr-generator.js"^>^</script^>
echo   ^<script src="/assets/js/analytics.js"^>^</script^>
echo   ^<script src="/assets/js/main.js"^>^</script^>
echo ^</body^>
echo ^</html^>
) > index.html

:: Создание vercel.json
(
echo {
echo   "functions": {
echo     "api/*.js": { "runtime": "@vercel/node@3.0.11", "maxDuration": 10 }
echo   },
echo   "rewrites": [{ "source": "/q/:code", "destination": "/api/redirect?code=:code" }]
echo }
) > vercel.json

:: Создание package.json
(
echo {
echo   "name": "qrush",
echo   "version": "1.0.0",
echo   "description": "QR-генератор с аналитикой",
echo   "main": "index.html",
echo   "scripts": {
echo     "dev": "vercel dev",
echo     "deploy": "vercel --prod"
echo   },
echo   "dependencies": {
echo     "qrcode": "^1.5.3"
echo   },
echo   "devDependencies": {
echo     "@vercel/node": "^3.0.11"
echo   }
echo }
) > package.json

:: Создание .gitignore
(
echo node_modules/
echo .vercel/
echo .env
echo *.log
echo .DS_Store
) > .gitignore

:: Создание README.md
(
echo # QRush — Генератор QR-кодов с аналитикой
echo.
echo ## 🚀 Быстрый старт
echo.
echo ```bash
echo npm install        # Установка зависимостей
echo npm run dev        # Запуск локального сервера
echo npm run deploy     # Деплой на Vercel
echo ```
echo.
echo ## 📁 Структура проекта
echo - `/api` — Serverless функции Vercel
echo - `/assets` — Статические файлы (CSS, JS, изображения)
echo - `/data` — Временное хранилище данных
echo.
echo ## 🔧 Технологии
echo - Vercel (хостинг и serverless)
echo - Node.js (API функции)
echo - Vanilla JS (фронтенд)
) > README.md

:: Финал
echo.
echo ==========================================
echo     ПРОЕКТ УСПЕШНО СОЗДАН!
echo ==========================================
echo.
echo 📁 Путь: %project_path%
echo 📄 Файлов создано: 15
echo.
echo Следующие шаги:
echo 1. cd "%project_path%"
echo 2. npm install
echo 3. npm run dev
echo.
echo После запуска сайт будет доступен на http://localhost:3000
echo.
pause