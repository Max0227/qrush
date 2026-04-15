// assets/js/qr-generator.js — Продвинутый генератор QR (Production Ready)

class QRGenerator {
  constructor() {
    this.apiUrl = '/api/generate';
    this.saveApiUrl = '/api/save-dynamic';
    
    // Текущее состояние
    this.currentQR = null;
    this.currentSVG = null;
    this.currentDynamicId = null;
    this.currentContent = null;
    this.currentSettings = null;
    
    // История генераций
    this.history = this.loadHistory();
    this.maxHistoryItems = 20;
    
    // Избранное
    this.favorites = this.loadFavorites();
    
    // Пресеты
    this.presets = {
      instagram: { color: '#E1306C', bgColor: '#FFFFFF', eyeStyle: 'rounded', gradient: true, gradientColors: ['#E1306C', '#F77737', '#FCAF45'] },
      facebook: { color: '#1877F2', bgColor: '#FFFFFF', eyeStyle: 'circle' },
      linkedin: { color: '#0A66C2', bgColor: '#FFFFFF', eyeStyle: 'square' },
      whatsapp: { color: '#25D366', bgColor: '#FFFFFF', eyeStyle: 'rounded' },
      telegram: { color: '#26A5E4', bgColor: '#FFFFFF', eyeStyle: 'circle' },
      tiktok: { color: '#000000', bgColor: '#FFFFFF', eyeStyle: 'square', gradient: true, gradientColors: ['#00F2EA', '#FF0050'] },
      spotify: { color: '#1DB954', bgColor: '#191414', eyeStyle: 'circle' },
      youtube: { color: '#FF0000', bgColor: '#FFFFFF', eyeStyle: 'rounded' },
      premium: { color: '#7c3aed', bgColor: '#0A0A0F', eyeStyle: 'diamond', gradient: true, gradientColors: ['#7c3aed', '#a855f7', '#ec4899'] },
      neon: { color: '#00ff88', bgColor: '#0a0a0a', eyeStyle: 'rounded', gradient: true, gradientColors: ['#00ff88', '#00ccff'] },
      minimal: { color: '#000000', bgColor: '#FFFFFF', eyeStyle: 'square', margin: 4 },
      retro: { color: '#8B4513', bgColor: '#F5DEB3', eyeStyle: 'square', margin: 6 }
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
  }

  // ============================================
  // 🎯 ОСНОВНАЯ ГЕНЕРАЦИЯ
  // ============================================
  async generate(content, options = {}) {
    const startTime = performance.now();
    const requestOptions = { ...this.defaultSettings, ...options };
    
    // Валидация контента
    if (!content || typeof content !== 'string') {
      throw new Error('Content is required and must be a string');
    }
    
    // Сохраняем контент
    this.currentContent = content;
    this.currentSettings = requestOptions;
    
    // Применяем пресет если указан
    if (requestOptions.preset && this.presets[requestOptions.preset]) {
      Object.assign(requestOptions, this.presets[requestOptions.preset]);
    }
    
    // Обработка логотипа
    let logoData = requestOptions.logo;
    if (logoData instanceof File) {
      logoData = await this.fileToBase64(logoData);
    }
    
    const payload = {
      url: content,
      ...requestOptions,
      logo: logoData
    };

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 сек таймаут
      
      const response = await fetch(this.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        this.currentQR = data.qr;
        this.currentSVG = data.qrSvg;
        this.currentDynamicId = data.dynamicId;
        
        // Сохраняем в историю
        this.addToHistory({
          content: this.truncateContent(content),
          fullContent: content,
          timestamp: Date.now(),
          settings: { ...requestOptions },
          dynamicId: data.dynamicId,
          size: data.settings?.size || requestOptions.size
        });
        
        // Обновляем статистику
        this.updateStats('generated', {
          size: data.settings?.size,
          time: performance.now() - startTime,
          preset: requestOptions.preset,
          hasLogo: !!requestOptions.logo
        });
        
        return data;
      } else {
        throw new Error(data.error || 'Unknown error');
      }
    } catch (error) {
      console.error('[QRush] Generation failed:', error);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout — please try again');
      }
      
      throw error;
    }
  }

  // ============================================
  // 🔄 ПАКЕТНАЯ ГЕНЕРАЦИЯ
  // ============================================
  async generateBatch(items, options = {}, onProgress = null) {
    const results = [];
    const total = items.length;
    
    for (let i = 0; i < total; i++) {
      try {
        const result = await this.generate(items[i], options);
        results.push({ success: true, content: items[i], ...result });
      } catch (error) {
        results.push({ success: false, content: items[i], error: error.message });
      }
      
      if (onProgress) {
        onProgress(i + 1, total, results[i]);
      }
      
      // Небольшая задержка между запросами
      if (i < total - 1) {
        await this.sleep(100);
      }
    }
    
    return results;
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
          code, 
          targetUrl,
          autoGenerate: !code,
          ...options 
        })
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.message || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        this.updateStats('dynamic_created');
      }
      
      return data;
    } catch (error) {
      console.error('[QRush] Save dynamic failed:', error);
      throw error;
    }
  }

  async getDynamicInfo(code) {
    try {
      const response = await fetch(`${this.saveApiUrl}?code=${code}`);
      if (!response.ok) throw new Error('Failed to fetch dynamic info');
      return await response.json();
    } catch (error) {
      console.error('[QRush] Get dynamic info failed:', error);
      throw error;
    }
  }

  async deleteDynamic(code) {
    try {
      const response = await fetch(`${this.saveApiUrl}?code=${code}`, {
        method: 'DELETE'
      });
      return await response.json();
    } catch (error) {
      console.error('[QRush] Delete dynamic failed:', error);
      throw error;
    }
  }

  // ============================================
  // 📥 СКАЧИВАНИЕ
  // ============================================
  downloadPNG(filename = null) {
    if (!this.currentQR) return false;
    
    const name = filename || `qrush-${this.sanitizeFilename(this.currentContent || 'qr')}-${Date.now()}.png`;
    this.downloadFile(this.currentQR, name);
    
    this.updateStats('downloaded_png');
    return true;
  }

  downloadSVG(filename = null) {
    if (!this.currentSVG) return false;
    
    const name = filename || `qrush-${this.sanitizeFilename(this.currentContent || 'qr')}-${Date.now()}.svg`;
    const blob = new Blob([this.currentSVG], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    this.downloadFile(url, name);
    URL.revokeObjectURL(url);
    
    this.updateStats('downloaded_svg');
    return true;
  }

  downloadFile(url, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = url;
    link.click();
  }

  // ============================================
  // 📋 КОПИРОВАНИЕ
  // ============================================
  async copyToClipboard(type = 'png') {
    if (type === 'png' && this.currentQR) {
      try {
        const blob = await (await fetch(this.currentQR)).blob();
        await navigator.clipboard.write([
          new ClipboardItem({ [blob.type]: blob })
        ]);
        this.updateStats('copied');
        return true;
      } catch (error) {
        console.error('[QRush] Copy failed:', error);
        
        // Fallback
        const img = document.createElement('img');
        img.src = this.currentQR;
        document.body.appendChild(img);
        
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNode(img);
        selection.removeAllRanges();
        selection.addRange(range);
        document.execCommand('copy');
        selection.removeAllRanges();
        document.body.removeChild(img);
        
        return true;
      }
    }
    
    if (type === 'url' && this.currentDynamicId) {
      const url = this.getDynamicUrl(this.currentDynamicId);
      await navigator.clipboard.writeText(url);
      return true;
    }
    
    if (type === 'content' && this.currentContent) {
      await navigator.clipboard.writeText(this.currentContent);
      return true;
    }
    
    return false;
  }

  // ============================================
  // 🖼️ РАБОТА С ЛОГОТИПОМ
  // ============================================
  async fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async urlToBase64(url) {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      return await this.fileToBase64(blob);
    } catch (error) {
      console.error('[QRush] URL to base64 failed:', error);
      throw error;
    }
  }

  // ============================================
  // ⭐ ИЗБРАННОЕ
  // ============================================
  addToFavorites(name = null) {
    if (!this.currentQR || !this.currentContent) return false;
    
    const favorite = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      name: name || this.truncateContent(this.currentContent, 30),
      content: this.currentContent,
      qr: this.currentQR,
      svg: this.currentSVG,
      dynamicId: this.currentDynamicId,
      settings: { ...this.currentSettings },
      createdAt: Date.now()
    };
    
    this.favorites.unshift(favorite);
    
    // Ограничиваем количество
    if (this.favorites.length > 50) {
      this.favorites = this.favorites.slice(0, 50);
    }
    
    this.saveFavorites();
    return favorite;
  }

  removeFromFavorites(id) {
    const index = this.favorites.findIndex(f => f.id === id);
    if (index !== -1) {
      this.favorites.splice(index, 1);
      this.saveFavorites();
      return true;
    }
    return false;
  }

  loadFromFavorite(id) {
    const favorite = this.favorites.find(f => f.id === id);
    if (favorite) {
      this.currentQR = favorite.qr;
      this.currentSVG = favorite.svg;
      this.currentContent = favorite.content;
      this.currentDynamicId = favorite.dynamicId;
      this.currentSettings = favorite.settings;
      return favorite;
    }
    return null;
  }

  // ============================================
  // 📜 ИСТОРИЯ
  // ============================================
  addToHistory(item) {
    this.history.unshift(item);
    
    if (this.history.length > this.maxHistoryItems) {
      this.history = this.history.slice(0, this.maxHistoryItems);
    }
    
    this.saveHistory();
  }

  loadFromHistory(index) {
    const item = this.history[index];
    if (item) {
      this.currentContent = item.fullContent;
      this.currentSettings = item.settings;
      return item;
    }
    return null;
  }

  clearHistory() {
    this.history = [];
    this.saveHistory();
  }

  // ============================================
  // 🔧 ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================
  getDynamicUrl(code) {
    return `${window.location.origin}/q/${code || this.currentDynamicId}`;
  }

  getQRDataURL() {
    return this.currentQR;
  }

  getSVGString() {
    return this.currentSVG;
  }

  getCurrentSettings() {
    return { ...this.currentSettings };
  }

  truncateContent(content, maxLength = 50) {
    if (!content) return '';
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength - 3) + '...';
  }

  sanitizeFilename(name) {
    return name.replace(/[^a-z0-9а-яё]/gi, '-').replace(/-+/g, '-').toLowerCase().slice(0, 50);
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
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
        copied: 0,
        totalTime: 0,
        avgTime: 0,
        presetsUsed: {},
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
        this.stats.generated++;
        this.stats.totalTime = (this.stats.totalTime || 0) + (details.time || 0);
        this.stats.avgTime = this.stats.totalTime / this.stats.generated;
        if (details.preset) {
          this.stats.presetsUsed[details.preset] = (this.stats.presetsUsed[details.preset] || 0) + 1;
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
      case 'copied':
        this.stats.copied = (this.stats.copied || 0) + 1;
        break;
    }
    
    this.saveStats();
  }

  saveStats() {
    try {
      localStorage.setItem('qrush_stats', JSON.stringify(this.stats));
    } catch (e) {
      console.warn('[QRush] Failed to save stats:', e);
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
      localStorage.setItem('qrush_history', JSON.stringify(this.history));
    } catch (e) {
      console.warn('[QRush] Failed to save history:', e);
    }
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
      console.warn('[QRush] Failed to save favorites:', e);
    }
  }

  // ============================================
  // 🎨 ПРЕСЕТЫ
  // ============================================
  getPresets() {
    return Object.keys(this.presets).map(key => ({
      id: key,
      name: this.capitalize(key),
      ...this.presets[key]
    }));
  }

  applyPreset(presetId) {
    if (this.presets[presetId]) {
      return { ...this.defaultSettings, ...this.presets[presetId], preset: presetId };
    }
    return null;
  }

  // ============================================
  // 📤 ЭКСПОРТ/ИМПОРТ НАСТРОЕК
  // ============================================
  exportSettings() {
    return {
      defaultSettings: this.defaultSettings,
      presets: this.presets,
      version: '1.0'
    };
  }

  importSettings(settings) {
    if (settings.defaultSettings) {
      this.defaultSettings = { ...this.defaultSettings, ...settings.defaultSettings };
    }
    if (settings.presets) {
      this.presets = { ...this.presets, ...settings.presets };
    }
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
    this.clearHistory();
    this.favorites = [];
    this.saveFavorites();
    this.reset();
  }

  // ============================================
  // 🔤 УТИЛИТЫ
  // ============================================
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // ============================================
  // 🔄 ОЧЕРЕДЬ ГЕНЕРАЦИИ
  // ============================================
  async addToQueue(content, options = {}, priority = 0) {
    return new Promise((resolve, reject) => {
      this.queue.push({ content, options, priority, resolve, reject });
      this.queue.sort((a, b) => b.priority - a.priority);
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;
    
    this.isProcessing = true;
    
    while (this.queue.length > 0) {
      const item = this.queue.shift();
      
      try {
        const result = await this.generate(item.content, item.options);
        item.resolve(result);
      } catch (error) {
        item.reject(error);
      }
      
      await this.sleep(50);
    }
    
    this.isProcessing = false;
  }

  clearQueue() {
    this.queue.forEach(item => {
      item.reject(new Error('Queue cleared'));
    });
    this.queue = [];
  }

  getQueueLength() {
    return this.queue.length;
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
}

