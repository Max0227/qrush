// assets/js/qr-generator.js — QRush Generator (Production Ready + Vercel Fix)
// Version: 2.0.0

class QRGenerator {
  constructor() {
    // API эндпоинты (исправлены для Vercel)
    this.apiUrl = '/api/generate';
    this.saveApiUrl = '/api/save-dynamic';
    
    // Текущее состояние
    this.currentQR = null;
    this.currentSVG = null;
    this.currentDynamicId = null;
    this.currentContent = null;
    this.currentSettings = null;
    this.isGenerating = false;
    
    // История генераций
    this.history = this.loadHistory();
    this.maxHistoryItems = 20;
    
    // Избранное
    this.favorites = this.loadFavorites();
    
    // Пресеты (улучшенные)
    this.presets = {
      instagram: { color: '#E1306C', bgColor: '#FFFFFF', eyeStyle: 'rounded', gradient: true, gradientColors: ['#E1306C', '#F77737', '#FCAF45'], icon: '📷', name: 'Instagram' },
      facebook: { color: '#1877F2', bgColor: '#FFFFFF', eyeStyle: 'circle', icon: '👤', name: 'Facebook' },
      linkedin: { color: '#0A66C2', bgColor: '#FFFFFF', eyeStyle: 'square', icon: '💼', name: 'LinkedIn' },
      whatsapp: { color: '#25D366', bgColor: '#FFFFFF', eyeStyle: 'rounded', icon: '💬', name: 'WhatsApp' },
      telegram: { color: '#26A5E4', bgColor: '#FFFFFF', eyeStyle: 'circle', icon: '📨', name: 'Telegram' },
      tiktok: { color: '#000000', bgColor: '#FFFFFF', eyeStyle: 'square', gradient: true, gradientColors: ['#00F2EA', '#FF0050'], icon: '🎵', name: 'TikTok' },
      spotify: { color: '#1DB954', bgColor: '#191414', eyeStyle: 'circle', icon: '🎵', name: 'Spotify' },
      youtube: { color: '#FF0000', bgColor: '#FFFFFF', eyeStyle: 'rounded', icon: '▶️', name: 'YouTube' },
      premium: { color: '#7c3aed', bgColor: '#0A0A0F', eyeStyle: 'diamond', gradient: true, gradientColors: ['#7c3aed', '#a855f7', '#ec4899'], icon: '💎', name: 'Premium' },
      neon: { color: '#00ff88', bgColor: '#0a0a0a', eyeStyle: 'rounded', gradient: true, gradientColors: ['#00ff88', '#00ccff'], icon: '✨', name: 'Neon' },
      minimal: { color: '#000000', bgColor: '#FFFFFF', eyeStyle: 'square', margin: 4, icon: '⚫', name: 'Minimal' },
      retro: { color: '#8B4513', bgColor: '#F5DEB3', eyeStyle: 'square', margin: 6, icon: '📻', name: 'Retro' },
      business: { color: '#1a1a2e', bgColor: '#FFFFFF', eyeStyle: 'square', icon: '🏢', name: 'Business' },
      eco: { color: '#2e7d32', bgColor: '#e8f5e9', eyeStyle: 'rounded', icon: '🌿', name: 'Eco' }
    };
    
    // Настройки по умолчанию
    this.defaultSettings = {
      size: 400,
      color: '#000000',
      bgColor: '#FFFFFF',
      errorCorrection: 'M',
      margin: 2,
      eyeStyle: 'square',
      frame: 'none',
      frameColor: '#7c3aed',
      frameWidth: 4,
      gradient: false,
      gradientColors: null,
      logo: null,
      logoPosition: 'center',
      logoSize: 0.2,
      preset: null
    };
    
    // Статистика использования
    this.stats = this.loadStats();
    
    // Очередь генерации
    this.queue = [];
    this.isProcessing = false;
    
    // Кэш для SEO подсказок
    this.seoKeywords = this.loadSEOKeywords();
  }

  // ============================================
  // 🎯 ОСНОВНАЯ ГЕНЕРАЦИЯ (ИСПРАВЛЕНО)
  // ============================================
  async generate(content, options = {}) {
    const startTime = performance.now();
    
    // Валидация контента
    if (!content || typeof content !== 'string') {
      throw new Error('Введите текст или ссылку для генерации QR-кода');
    }
    
    // Очистка контента
    content = content.trim();
    
    // Сохраняем контент
    this.currentContent = content;
    
    // Объединяем настройки
    const requestOptions = { ...this.defaultSettings, ...options };
    this.currentSettings = requestOptions;
    
    // Применяем пресет если указан
    if (requestOptions.preset && this.presets[requestOptions.preset]) {
      const preset = this.presets[requestOptions.preset];
      Object.keys(preset).forEach(key => {
        if (key !== 'icon' && key !== 'name') {
          requestOptions[key] = preset[key];
        }
      });
    }
    
    // Формируем payload (только нужные поля)
    const payload = {
      url: content,
      size: parseInt(requestOptions.size) || 400,
      color: requestOptions.color || '#000000',
      bgColor: requestOptions.bgColor || '#FFFFFF',
      errorCorrection: requestOptions.errorCorrection || 'M',
      margin: parseInt(requestOptions.margin) || 2
    };

    // Показываем индикатор загрузки
    this.showLoading(true);
    this.isGenerating = true;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      console.log('📤 [QRush] Отправка запроса:', { endpoint: this.apiUrl, content: this.truncateContent(content) });
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        let errorMessage = `Ошибка сервера (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // Ignore
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('✅ [QRush] QR сгенерирован:', { 
        size: payload.size, 
        time: Math.round(performance.now() - startTime) + 'ms' 
      });

      if (data.success) {
        this.currentQR = data.qr;
        this.currentSVG = data.qrSvg;
        this.currentDynamicId = data.dynamicId || this.generateDynamicId();
        
        // Сохраняем в историю
        this.addToHistory({
          content: this.truncateContent(content, 40),
          fullContent: content,
          timestamp: Date.now(),
          settings: { size: payload.size, color: payload.color },
          dynamicId: this.currentDynamicId
        });
        
        // Обновляем SEO ключевые слова
        this.updateSEOKeywords(content);
        
        // Обновляем статистику
        this.updateStats('generated', {
          time: performance.now() - startTime,
          preset: requestOptions.preset
        });
        
        // Показываем уведомление об успехе
        this.showNotification('QR-код успешно создан!', 'success');
        
        return data;
      } else {
        throw new Error(data.error || 'Неизвестная ошибка');
      }
    } catch (error) {
      console.error('❌ [QRush] Ошибка генерации:', error);
      
      let userMessage = 'Не удалось создать QR-код';
      if (error.name === 'AbortError') {
        userMessage = 'Превышено время ожидания. Проверьте подключение к интернету.';
      } else if (error.message.includes('fetch')) {
        userMessage = 'Проблема с сетью. Проверьте подключение к интернету.';
      } else {
        userMessage = error.message;
      }
      
      this.showNotification(userMessage, 'error');
      throw new Error(userMessage);
      
    } finally {
      this.showLoading(false);
      this.isGenerating = false;
    }
  }

  // ============================================
  // 🔗 ДИНАМИЧЕСКИЕ КОДЫ
  // ============================================
  async saveDynamic(code, targetUrl, options = {}) {
    try {
      const response = await fetch(this.saveApiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          code: code || this.generateDynamicId(), 
          targetUrl,
          ...options 
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || 'Ошибка сохранения динамического кода');
      }

      const data = await response.json();
      
      if (data.success) {
        this.updateStats('dynamic_created');
        this.showNotification('Динамический QR-код создан!', 'success');
      }
      
      return data;
    } catch (error) {
      console.error('[QRush] Ошибка сохранения динамического кода:', error);
      this.showNotification(error.message, 'error');
      throw error;
    }
  }

  // ============================================
  // 📥 СКАЧИВАНИЕ
  // ============================================
  downloadPNG(filename = null) {
    if (!this.currentQR) {
      this.showNotification('Сначала создайте QR-код', 'warning');
      return false;
    }
    
    const name = filename || this.generateFilename('png');
    this.downloadFile(this.currentQR, name);
    
    this.updateStats('downloaded_png');
    this.showNotification('PNG скачан!', 'success');
    return true;
  }

  downloadSVG(filename = null) {
    if (!this.currentSVG) {
      this.showNotification('Сначала создайте QR-код', 'warning');
      return false;
    }
    
    const name = filename || this.generateFilename('svg');
    const blob = new Blob([this.currentSVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    this.downloadFile(url, name);
    URL.revokeObjectURL(url);
    
    this.updateStats('downloaded_svg');
    this.showNotification('SVG скачан!', 'success');
    return true;
  }

  downloadFile(url, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  generateFilename(ext) {
    const date = new Date();
    const dateStr = `${date.getFullYear()}-${(date.getMonth()+1).toString().padStart(2,'0')}-${date.getDate().toString().padStart(2,'0')}`;
    const contentPart = this.currentContent 
      ? '-' + this.sanitizeFilename(this.currentContent.slice(0, 20))
      : '';
    return `qrush${contentPart}-${dateStr}.${ext}`;
  }

  // ============================================
  // 📋 КОПИРОВАНИЕ
  // ============================================
  async copyQRToClipboard() {
    if (!this.currentQR) return false;
    
    try {
      const response = await fetch(this.currentQR);
      const blob = await response.blob();
      await navigator.clipboard.write([
        new ClipboardItem({ [blob.type]: blob })
      ]);
      this.showNotification('QR-код скопирован!', 'success');
      return true;
    } catch (error) {
      // Fallback для старых браузеров
      this.showNotification('Используйте кнопку "Скачать PNG"', 'info');
      return false;
    }
  }

  async copyContentToClipboard() {
    if (!this.currentContent) return false;
    
    try {
      await navigator.clipboard.writeText(this.currentContent);
      this.showNotification('Ссылка скопирована!', 'success');
      return true;
    } catch (error) {
      return false;
    }
  }

  // ============================================
  // 🎨 UI УЛУЧШЕНИЯ
  // ============================================
  showLoading(show) {
    const generateBtn = document.getElementById('generateBtn');
    if (generateBtn) {
      if (show) {
        generateBtn.disabled = true;
        generateBtn.innerHTML = '<span class="loading-spinner-small"></span> Генерация...';
      } else {
        generateBtn.disabled = false;
        generateBtn.innerHTML = '🚀 Сгенерировать QR';
      }
    }
  }

  showNotification(message, type = 'info') {
    // Создаём элемент уведомления
    const toast = document.createElement('div');
    toast.className = `qrush-toast qrush-toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${this.getToastIcon(type)}</span>
      <span class="toast-message">${message}</span>
    `;
    
    // Стили для toast
    Object.assign(toast.style, {
      position: 'fixed',
      bottom: '24px',
      right: '24px',
      padding: '14px 24px',
      background: type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : type === 'warning' ? '#f59e0b' : '#3b82f6',
      color: 'white',
      borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      zIndex: '10000',
      transform: 'translateY(100px)',
      opacity: '0',
      transition: 'all 0.3s ease',
      fontWeight: '500',
      maxWidth: '350px'
    });
    
    document.body.appendChild(toast);
    
    // Анимация появления
    setTimeout(() => {
      toast.style.transform = 'translateY(0)';
      toast.style.opacity = '1';
    }, 10);
    
    // Автоматическое скрытие
    setTimeout(() => {
      toast.style.transform = 'translateY(100px)';
      toast.style.opacity = '0';
      setTimeout(() => {
        if (toast.parentNode) {
          document.body.removeChild(toast);
        }
      }, 300);
    }, 3000);
  }

  getToastIcon(type) {
    const icons = {
      success: '✅',
      error: '❌',
      warning: '⚠️',
      info: 'ℹ️'
    };
    return icons[type] || 'ℹ️';
  }

  // ============================================
  // 🔍 SEO ФУНКЦИИ
  // ============================================
  loadSEOKeywords() {
    try {
      return JSON.parse(localStorage.getItem('qrush_seo_keywords')) || [];
    } catch {
      return [];
    }
  }

  updateSEOKeywords(content) {
    // Извлекаем ключевые слова из URL или текста
    let keywords = [];
    
    try {
      const url = new URL(content);
      keywords.push(url.hostname.replace('www.', ''));
      const pathParts = url.pathname.split('/').filter(p => p && p.length > 2);
      keywords.push(...pathParts.slice(0, 3));
    } catch {
      // Не URL — извлекаем слова из текста
      const words = content.split(/[\s,.;:!?]+/).filter(w => w.length > 3);
      keywords.push(...words.slice(0, 5));
    }
    
    // Добавляем в историю SEO
    this.seoKeywords = [...new Set([...keywords, ...this.seoKeywords])].slice(0, 50);
    
    try {
      localStorage.setItem('qrush_seo_keywords', JSON.stringify(this.seoKeywords));
    } catch (e) {
      // Ignore
    }
    
    // Обновляем meta keywords если есть доступ
    this.updateMetaKeywords();
  }

  updateMetaKeywords() {
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords && this.seoKeywords.length > 0) {
      const currentKeywords = metaKeywords.getAttribute('content') || '';
      const newKeywords = [...new Set([...currentKeywords.split(','), ...this.seoKeywords])]
        .filter(k => k.trim())
        .slice(0, 20)
        .join(', ');
      metaKeywords.setAttribute('content', newKeywords);
    }
  }

  getSEOKeywords() {
    return this.seoKeywords;
  }

  // ============================================
  // 📊 СТАТИСТИКА
  // ============================================
  loadStats() {
    try {
      return JSON.parse(localStorage.getItem('qrush_stats')) || {
        generated: 0,
        downloaded_png: 0,
        downloaded_svg: 0,
        dynamic_created: 0,
        totalTime: 0,
        firstUse: Date.now(),
        lastUse: Date.now()
      };
    } catch {
      return { generated: 0, firstUse: Date.now(), lastUse: Date.now() };
    }
  }

  updateStats(action, details = {}) {
    this.stats.lastUse = Date.now();
    
    switch (action) {
      case 'generated':
        this.stats.generated = (this.stats.generated || 0) + 1;
        if (details.time) {
          this.stats.totalTime = (this.stats.totalTime || 0) + details.time;
          this.stats.avgTime = Math.round(this.stats.totalTime / this.stats.generated);
        }
        break;
      case 'downloaded_png':
        this.stats.downloaded_png = (this.stats.downloaded_png || 0) + 1;
        break;
      case 'downloaded_svg':
        this.stats.downloaded_svg = (this.stats.downloaded_svg || 0) + 1;
        break;
      case 'dynamic_created':
        this.stats.dynamic_created = (this.stats.dynamic_created || 0) + 1;
        break;
    }
    
    this.saveStats();
  }

  saveStats() {
    try {
      localStorage.setItem('qrush_stats', JSON.stringify(this.stats));
    } catch (e) {
      // Ignore
    }
  }

  getStats() {
    return { ...this.stats };
  }

  // ============================================
  // 💾 ХРАНЕНИЕ ДАННЫХ
  // ============================================
  loadHistory() {
    try {
      return JSON.parse(localStorage.getItem('qrush_history')) || [];
    } catch {
      return [];
    }
  }

  saveHistory() {
    try {
      localStorage.setItem('qrush_history', JSON.stringify(this.history.slice(0, 50)));
    } catch (e) {
      // Ignore
    }
  }

  addToHistory(item) {
    this.history.unshift(item);
    if (this.history.length > this.maxHistoryItems) {
      this.history = this.history.slice(0, this.maxHistoryItems);
    }
    this.saveHistory();
  }

  loadFavorites() {
    try {
      return JSON.parse(localStorage.getItem('qrush_favorites')) || [];
    } catch {
      return [];
    }
  }

  saveFavorites() {
    try {
      localStorage.setItem('qrush_favorites', JSON.stringify(this.favorites));
    } catch (e) {
      // Ignore
    }
  }

  // ============================================
  // 🔧 ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================
  generateDynamicId(length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < length; i++) {
      id += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return id;
  }

  getDynamicUrl(code) {
    return `${window.location.origin}/q/${code || this.currentDynamicId}`;
  }

  truncateContent(content, maxLength = 50) {
    if (!content) return '';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength - 3) + '...';
  }

  sanitizeFilename(name) {
    return name
      .replace(/[^a-z0-9а-яё]/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .toLowerCase()
      .slice(0, 50);
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // ============================================
  // 🎨 ПОЛУЧЕНИЕ ПРЕСЕТОВ
  // ============================================
  getPresets() {
    return Object.entries(this.presets).map(([id, preset]) => ({
      id,
      name: preset.name || this.capitalize(id),
      icon: preset.icon || '🎨',
      color: preset.color,
      bgColor: preset.bgColor
    }));
  }

  applyPreset(presetId) {
    const preset = this.presets[presetId];
    if (!preset) return null;
    
    const settings = { ...this.defaultSettings };
    Object.keys(preset).forEach(key => {
      if (key !== 'icon' && key !== 'name') {
        settings[key] = preset[key];
      }
    });
    settings.preset = presetId;
    
    return settings;
  }

  // ============================================
  // 🧹 ОЧИСТКА
  // ============================================
  reset() {
    this.currentQR = null;
    this.currentSVG = null;
    this.currentDynamicId = null;
    this.currentContent = null;
    this.currentSettings = null;
  }

  clearAllData() {
    localStorage.removeItem('qrush_history');
    localStorage.removeItem('qrush_favorites');
    localStorage.removeItem('qrush_stats');
    localStorage.removeItem('qrush_seo_keywords');
    
    this.history = [];
    this.favorites = [];
    this.stats = { generated: 0, firstUse: Date.now(), lastUse: Date.now() };
    this.seoKeywords = [];
    
    this.reset();
    this.showNotification('Все данные очищены', 'info');
  }
}

// ============================================
// 🌐 ГЛОБАЛЬНЫЙ ЭКСПОРТ
// ============================================
if (typeof window !== 'undefined') {
  window.QRGenerator = QRGenerator;
  
  // Создаём глобальный экземпляр
  if (!window.qrush) {
    window.qrush = {};
  }
  window.qrush.generator = new QRGenerator();
  
  console.log('🚀 QRush Generator loaded — Ready to create amazing QR codes!');
}

// ============================================
// 🎨 ДОБАВЛЯЕМ СТИЛИ ДЛЯ ТОСТОВ И СПИННЕРА
// ============================================
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    .loading-spinner-small {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255,255,255,0.3);
      border-top-color: white;
      border-radius: 50%;
      animation: qrush-spin 0.8s linear infinite;
      display: inline-block;
      margin-right: 8px;
    }
    
    @keyframes qrush-spin {
      to { transform: rotate(360deg); }
    }
    
    .qrush-toast {
      font-family: 'Inter', sans-serif;
      font-size: 14px;
      backdrop-filter: blur(10px);
      border: 1px solid rgba(255,255,255,0.1);
    }
    
    .qrush-toast-success {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
    
    .qrush-toast-error {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
    }
    
    .qrush-toast-warning {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
    }
    
    .qrush-toast-info {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
    }
  `;
  document.head.appendChild(style);
}