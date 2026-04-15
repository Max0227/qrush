// assets/js/analytics.js — Продвинутая аналитика QR-кодов (Production Ready)
class Analytics {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.apiUrl = '/api/stats';
    this.currentData = null;
    this.currentCode = null;
    this.currentPeriod = '7d';
    this.charts = {};
    this.map = null;
    this.isExpanded = false;
    
    // Настройки
    this.config = {
      refreshInterval: null,
      autoRefresh: false,
      theme: 'dark',
      animations: true
    };
    
    // Кэш для стран
    this.countryNames = {
      'RU': '🇷🇺 Россия', 'US': '🇺🇸 США', 'DE': '🇩🇪 Германия',
      'FR': '🇫🇷 Франция', 'GB': '🇬🇧 Великобритания', 'CN': '🇨🇳 Китай',
      'JP': '🇯🇵 Япония', 'KR': '🇰🇷 Корея', 'IN': '🇮🇳 Индия',
      'BR': '🇧🇷 Бразилия', 'CA': '🇨🇦 Канада', 'AU': '🇦🇺 Австралия',
      'IT': '🇮🇹 Италия', 'ES': '🇪🇸 Испания', 'UA': '🇺🇦 Украина',
      'BY': '🇧🇾 Беларусь', 'KZ': '🇰🇿 Казахстан', 'TR': '🇹🇷 Турция',
      'NL': '🇳🇱 Нидерланды', 'SE': '🇸🇪 Швеция', 'NO': '🇳🇴 Норвегия',
      'PL': '🇵🇱 Польша', 'CZ': '🇨🇿 Чехия', 'CH': '🇨🇭 Швейцария',
      'AE': '🇦🇪 ОАЭ', 'IL': '🇮🇱 Израиль', 'ZA': '🇿🇦 ЮАР',
      'MX': '🇲🇽 Мексика', 'AR': '🇦🇷 Аргентина', 'SG': '🇸🇬 Сингапур',
      'unknown': '🌍 Другие'
    };
    
    this.deviceEmojis = {
      smartphone: '📱', tablet: '📟', desktop: '💻',
      smarttv: '📺', smartwatch: '⌚', other: '🌐'
    };
    
    this.browserEmojis = {
      chrome: '🌐', safari: '🧭', firefox: '🦊', edge: '📘',
      opera: '🔴', samsung: '📱', yandex: '🔍', other: '🌐'
    };
  }

  // ============================================
  // 📊 ЗАГРУЗКА СТАТИСТИКИ
  // ============================================
  async loadStats(code, period = '7d') {
    if (!code) return null;

    this.currentCode = code;
    this.currentPeriod = period;
    
    this.showLoading();

    try {
      const url = `${this.apiUrl}?code=${code}&period=${period}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      this.currentData = data;
      
      this.render(data);
      this.renderCharts(data);
      
      return data;
    } catch (error) {
      console.error('[QRush] Analytics error:', error);
      this.showError('Не удалось загрузить статистику. Попробуйте позже.');
      return null;
    }
  }

  // ============================================
  // 🔄 АВТООБНОВЛЕНИЕ
  // ============================================
  enableAutoRefresh(intervalSeconds = 30) {
    this.disableAutoRefresh();
    
    this.config.autoRefresh = true;
    this.config.refreshInterval = setInterval(() => {
      if (this.currentCode) {
        this.loadStats(this.currentCode, this.currentPeriod);
      }
    }, intervalSeconds * 1000);
    
    console.log(`[QRush] Auto-refresh enabled (${intervalSeconds}s)`);
  }

  disableAutoRefresh() {
    if (this.config.refreshInterval) {
      clearInterval(this.config.refreshInterval);
      this.config.refreshInterval = null;
      this.config.autoRefresh = false;
    }
  }

  // ============================================
  // 📤 ЭКСПОРТ ДАННЫХ
  // ============================================
  async exportData(format = 'csv') {
    if (!this.currentCode) {
      this.showToast('Нет данных для экспорта', 'error');
      return;
    }
    
    try {
      const response = await fetch(`${this.apiUrl}?code=${this.currentCode}&format=${format}`);
      
      if (!response.ok) throw new Error('Export failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `qrush-stats-${this.currentCode}-${new Date().toISOString().split('T')[0]}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      this.showToast(`Данные экспортированы в ${format.toUpperCase()}`, 'success');
    } catch (error) {
      console.error('[QRush] Export error:', error);
      this.showToast('Ошибка экспорта', 'error');
    }
  }

  // ============================================
  // 🎨 ОСНОВНОЙ РЕНДЕР
  // ============================================
  render(data) {
    if (!this.container) return;

    const summary = data.summary || {};
    const tops = data.tops || {};
    const peaks = data.peaks || {};
    
    // Определяем тренд
    const trend = summary.trend || { direction: 'stable', percent: 0 };
    const trendIcon = trend.direction === 'up' ? '📈' : trend.direction === 'down' ? '📉' : '📊';
    const trendColor = trend.direction === 'up' ? 'var(--success)' : trend.direction === 'down' ? 'var(--error)' : 'var(--text-muted)';
    
    const html = `
      <div class="analytics-panel ${this.config.animations ? 'animate-in' : ''}">
        <!-- Заголовок с действиями -->
        <div class="analytics-header">
          <div class="analytics-title-section">
            <h3>📊 Статистика сканирований</h3>
            <span class="analytics-code">Код: <code>${data.code}</code></span>
          </div>
          <div class="analytics-actions">
            <div class="period-selector">
              <button class="period-btn ${this.currentPeriod === '24h' ? 'active' : ''}" data-period="24h">24ч</button>
              <button class="period-btn ${this.currentPeriod === '7d' ? 'active' : ''}" data-period="7d">7д</button>
              <button class="period-btn ${this.currentPeriod === '30d' ? 'active' : ''}" data-period="30d">30д</button>
              <button class="period-btn ${this.currentPeriod === 'all' ? 'active' : ''}" data-period="all">Всё</button>
            </div>
            <button class="analytics-action-btn" id="refreshStatsBtn" title="Обновить">🔄</button>
            <button class="analytics-action-btn" id="exportStatsBtn" title="Экспорт CSV">📥</button>
            <button class="analytics-action-btn" id="toggleAutoRefreshBtn" title="Автообновление">⏸️</button>
            <button class="analytics-action-btn" id="closeAnalyticsBtn" title="Закрыть">✕</button>
          </div>
        </div>

        <!-- Сводка -->
        <div class="analytics-summary">
          <div class="summary-card highlight">
            <span class="summary-icon">🔢</span>
            <div class="summary-content">
              <span class="summary-value">${this.formatNumber(summary.totalScans || data.totalScans || 0)}</span>
              <span class="summary-label">Всего сканов</span>
            </div>
          </div>
          <div class="summary-card">
            <span class="summary-icon">📅</span>
            <div class="summary-content">
              <span class="summary-value">${summary.daysActive || 1}</span>
              <span class="summary-label">Дней активности</span>
            </div>
          </div>
          <div class="summary-card">
            <span class="summary-icon">📊</span>
            <div class="summary-content">
              <span class="summary-value">${summary.avgPerDay || '0'}</span>
              <span class="summary-label">В среднем в день</span>
            </div>
          </div>
          <div class="summary-card trend-card" style="border-left-color: ${trendColor}">
            <span class="summary-icon">${trendIcon}</span>
            <div class="summary-content">
              <span class="summary-value" style="color: ${trendColor}">${trend.percent > 0 ? '+' : ''}${trend.percent}%</span>
              <span class="summary-label">${trend.direction === 'up' ? 'Рост' : trend.direction === 'down' ? 'Падение' : 'Стабильно'}</span>
            </div>
          </div>
        </div>

        <!-- Пики -->
        <div class="peaks-row">
          <div class="peak-badge">
            <span>🔥 Пик: ${peaks.hour?.hour || 0}:00 (${peaks.hour?.scans || 0} сканов)</span>
          </div>
          <div class="peak-badge">
            <span>📅 Пик: ${peaks.day?.name || '—'} (${peaks.day?.scans || 0} сканов)</span>
          </div>
        </div>

        <!-- Графики -->
        <div class="charts-container">
          <div class="chart-wrapper">
            <h4>📈 По часам</h4>
            <canvas id="hourlyChart" width="400" height="150"></canvas>
          </div>
          <div class="chart-wrapper">
            <h4>📊 По дням недели</h4>
            <canvas id="dailyChart" width="400" height="150"></canvas>
          </div>
        </div>

        <!-- Детальная статистика -->
        <div class="analytics-grid">
          <!-- Страны -->
          <div class="analytics-card">
            <h4>🌍 По странам</h4>
            <ul class="stats-list">
              ${(tops.countries || data.byCountry || []).slice(0, 5).map(item => `
                <li>
                  <span class="item-name">${this.getCountryFlag(item.code || item.country)} ${item.name || this.getCountryName(item.code || item.country)}</span>
                  <span class="item-value">${item.count}</span>
                  <span class="item-bar" style="width: ${this.getPercentage(item.count, summary.totalScans)}%"></span>
                </li>
              `).join('')}
            </ul>
          </div>

          <!-- Города -->
          <div class="analytics-card">
            <h4>🏙️ По городам</h4>
            <ul class="stats-list">
              ${(tops.cities || data.byCity || []).slice(0, 5).map(item => `
                <li>
                  <span class="item-name">📍 ${item.city}</span>
                  <span class="item-value">${item.count}</span>
                  <span class="item-bar" style="width: ${this.getPercentage(item.count, summary.totalScans)}%"></span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>

        <div class="analytics-grid">
          <!-- Устройства -->
          <div class="analytics-card">
            <h4>📱 По устройствам</h4>
            <ul class="stats-list">
              ${Object.entries(data.byDevice || {}).sort((a, b) => b[1].count - a[1].count).slice(0, 5).map(([device, info]) => `
                <li>
                  <span class="item-name">${this.deviceEmojis[device] || '🌐'} ${this.getDeviceName(device)}</span>
                  <span class="item-value">${info.count}</span>
                  <span class="item-bar" style="width: ${this.getPercentage(info.count, summary.totalScans)}%"></span>
                </li>
              `).join('')}
            </ul>
          </div>

          <!-- Браузеры -->
          <div class="analytics-card">
            <h4>🌐 По браузерам</h4>
            <ul class="stats-list">
              ${(tops.browsers || Object.entries(data.byBrowser || {}).map(([name, info]) => ({ name, ...info }))).slice(0, 5).map(item => `
                <li>
                  <span class="item-name">${item.emoji || this.browserEmojis[item.name] || '🌐'} ${this.capitalize(item.name)}</span>
                  <span class="item-value">${item.count}</span>
                  <span class="item-bar" style="width: ${this.getPercentage(item.count, summary.totalScans)}%"></span>
                </li>
              `).join('')}
            </ul>
          </div>
        </div>

        <!-- Рефереры -->
        <div class="analytics-card full-width">
          <h4>🔗 Источники переходов</h4>
          <div class="referers-grid">
            ${(data.referers || []).slice(0, 8).map(ref => `
              <div class="referer-item">
                <span class="referer-emoji">${ref.emoji || '🔗'}</span>
                <span class="referer-label">${ref.label}</span>
                <span class="referer-count">${ref.count}</span>
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Последние сканы -->
        <div class="recent-scans-section">
          <h4>🕐 Последние сканы</h4>
          <div class="recent-scans-list">
            ${data.recentScans?.slice(0, 8).map(scan => `
              <div class="recent-scan-item ${scan.isBot ? 'bot' : ''}">
                <span class="scan-time">${this.formatTime(scan.timestamp)}</span>
                <span class="scan-device">${scan.deviceEmoji || this.deviceEmojis[scan.device] || '🌐'}</span>
                <span class="scan-location">${this.getCountryFlag(scan.country)} ${scan.city || scan.country || '—'}</span>
                <span class="scan-browser">${scan.browser?.emoji || '🌐'} ${scan.browser?.name || ''}</span>
                ${scan.isBot ? '<span class="bot-badge">🤖 БОТ</span>' : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <!-- Футер -->
        <div class="analytics-footer">
          <span>🔄 Обновлено: ${this.formatDateTime(data.generatedAt || new Date().toISOString())}</span>
          <span>⚡ Сгенерировано за ${data.generationTimeMs || 0}ms</span>
        </div>
      </div>
    `;

    this.container.innerHTML = html;
    this.attachEventListeners();
  }

  // ============================================
  // 📈 РЕНДЕР ГРАФИКОВ (Canvas)
  // ============================================
  renderCharts(data) {
    this.renderHourlyChart(data.byHour || []);
    this.renderDailyChart(data.byDayOfWeek || []);
  }

  renderHourlyChart(hourlyData) {
    const canvas = document.getElementById('hourlyChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth || 400;
    const height = canvas.height = 150;
    
    // Очистка
    ctx.clearRect(0, 0, width, height);
    
    if (!hourlyData.length) {
      ctx.fillStyle = 'var(--text-muted)';
      ctx.font = '12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Нет данных', width / 2, height / 2);
      return;
    }
    
    const maxScans = Math.max(...hourlyData.map(h => h.scans)) || 1;
    const barWidth = (width - 40) / 24;
    
    // Сетка
    ctx.strokeStyle = 'var(--border-color)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= 4; i++) {
      const y = 10 + (height - 30) * (i / 4);
      ctx.beginPath();
      ctx.moveTo(30, y);
      ctx.lineTo(width - 10, y);
      ctx.stroke();
    }
    
    // Столбцы
    hourlyData.forEach((h, i) => {
      const x = 30 + i * barWidth;
      const barHeight = ((height - 40) * h.scans) / maxScans;
      const y = height - 15 - barHeight;
      
      // Градиент
      const gradient = ctx.createLinearGradient(x, y, x, height - 15);
      gradient.addColorStop(0, '#a855f7');
      gradient.addColorStop(1, '#7c3aed');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth - 2, barHeight);
      
      // Подписи (каждые 3 часа)
      if (i % 3 === 0) {
        ctx.fillStyle = 'var(--text-muted)';
        ctx.font = '10px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.fillText(`${h.hour}:00`, x + barWidth / 2, height - 2);
      }
    });
  }

  renderDailyChart(dailyData) {
    const canvas = document.getElementById('dailyChart');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width = canvas.offsetWidth || 400;
    const height = canvas.height = 150;
    
    ctx.clearRect(0, 0, width, height);
    
    if (!dailyData.length) {
      ctx.fillStyle = 'var(--text-muted)';
      ctx.font = '12px Inter';
      ctx.textAlign = 'center';
      ctx.fillText('Нет данных', width / 2, height / 2);
      return;
    }
    
    const maxScans = Math.max(...dailyData.map(d => d.scans)) || 1;
    const barWidth = (width - 40) / 7;
    
    dailyData.forEach((d, i) => {
      const x = 30 + i * barWidth;
      const barHeight = ((height - 40) * d.scans) / maxScans;
      const y = height - 15 - barHeight;
      
      const gradient = ctx.createLinearGradient(x, y, x, height - 15);
      gradient.addColorStop(0, '#ec4899');
      gradient.addColorStop(1, '#a855f7');
      
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, barWidth - 4, barHeight);
      
      ctx.fillStyle = 'var(--text-muted)';
      ctx.font = '11px Inter';
      ctx.textAlign = 'center';
      ctx.fillText(d.name, x + barWidth / 2, height - 2);
    });
  }

  // ============================================
  // 🔗 ОБРАБОТЧИКИ СОБЫТИЙ
  // ============================================
  attachEventListeners() {
    // Периоды
    this.container.querySelectorAll('.period-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const period = btn.dataset.period;
        this.container.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.loadStats(this.currentCode, period);
      });
    });
    
    // Обновление
    this.container.querySelector('#refreshStatsBtn')?.addEventListener('click', () => {
      this.loadStats(this.currentCode, this.currentPeriod);
    });
    
    // Экспорт
    this.container.querySelector('#exportStatsBtn')?.addEventListener('click', () => {
      this.exportData('csv');
    });
    
    // Автообновление
    const autoRefreshBtn = this.container.querySelector('#toggleAutoRefreshBtn');
    if (autoRefreshBtn) {
      autoRefreshBtn.addEventListener('click', () => {
        if (this.config.autoRefresh) {
          this.disableAutoRefresh();
          autoRefreshBtn.textContent = '▶️';
          this.showToast('Автообновление отключено', 'info');
        } else {
          this.enableAutoRefresh(30);
          autoRefreshBtn.textContent = '⏸️';
          this.showToast('Автообновление каждые 30с', 'success');
        }
      });
    }
    
    // Закрытие
    this.container.querySelector('#closeAnalyticsBtn')?.addEventListener('click', () => {
      this.hide();
    });
  }

  // ============================================
  // 🎯 ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================
  getCountryName(code) {
    return this.countryNames[code] || code;
  }

  getCountryFlag(code) {
    const name = this.countryNames[code];
    return name ? name.split(' ')[0] : '🌍';
  }

  getDeviceName(device) {
    const names = {
      smartphone: 'Смартфон', tablet: 'Планшет', desktop: 'Компьютер',
      smarttv: 'Телевизор', smartwatch: 'Часы', other: 'Другое'
    };
    return names[device] || device;
  }

  getPercentage(value, total) {
    if (!total) return 0;
    return Math.min((value / total) * 100, 100);
  }

  formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  }

  formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', { 
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' 
    });
  }

  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  showLoading() {
    if (this.container) {
      this.container.innerHTML = `
        <div class="analytics-loading">
          <div class="loading-spinner"></div>
          <p>Загрузка статистики...</p>
        </div>
      `;
    }
  }

  showError(message) {
    if (this.container) {
      this.container.innerHTML = `
        <div class="analytics-error">
          <span>❌</span>
          <p>${message}</p>
          <button onclick="window.qrush.analytics.loadStats('${this.currentCode}')">Попробовать снова</button>
        </div>
      `;
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `analytics-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  show() {
    if (this.container) {
      this.container.style.display = 'block';
    }
  }

  hide() {
    if (this.container) {
      this.container.style.display = 'none';
      this.disableAutoRefresh();
    }
  }

  toggle() {
    if (this.container.style.display === 'none') {
      this.show();
    } else {
      this.hide();
    }
  }

  // Очистка при уничтожении
  destroy() {
    this.disableAutoRefresh();
    if (this.container) {
      this.container.innerHTML = '';
    }
  }
}

// ============================================
// 🎨 ДОПОЛНИТЕЛЬНЫЕ СТИЛИ (добавить в style.css)
// ============================================
const additionalStyles = `
.analytics-panel.animate-in {
  animation: slideUp 0.3s ease-out;
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
}

.analytics-title-section {
  display: flex;
  align-items: center;
  gap: 16px;
}

.analytics-code {
  font-size: 0.9rem;
  color: var(--text-muted);
}

.analytics-code code {
  background: var(--bg-primary);
  padding: 4px 8px;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.analytics-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.period-selector {
  display: flex;
  gap: 4px;
  background: var(--bg-primary);
  padding: 4px;
  border-radius: 8px;
}

.period-btn {
  padding: 6px 12px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 0.85rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}

.period-btn:hover {
  background: var(--bg-card);
}

.period-btn.active {
  background: var(--accent-primary);
  color: white;
}

.analytics-action-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.2s;
}

.analytics-action-btn:hover {
  background: var(--bg-card);
  border-color: var(--accent-primary);
  color: var(--accent-light);
}

.analytics-summary {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin: 24px 0;
}

.summary-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: var(--bg-primary);
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.summary-card.highlight {
  border-left: 4px solid var(--accent-primary);
}

.summary-icon {
  font-size: 1.8rem;
}

.summary-content {
  display: flex;
  flex-direction: column;
}

.summary-value {
  font-size: 1.8rem;
  font-weight: 700;
  color: var(--text-primary);
}

.summary-label {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.peaks-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.peak-badge {
  padding: 8px 16px;
  background: var(--bg-primary);
  border-radius: 20px;
  font-size: 0.9rem;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
}

.charts-container {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin: 24px 0;
}

.chart-wrapper {
  background: var(--bg-primary);
  padding: 16px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
}

.chart-wrapper h4 {
  margin-bottom: 12px;
  font-size: 1rem;
  color: var(--text-secondary);
}

.stats-list {
  list-style: none;
}

.stats-list li {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
  position: relative;
}

.item-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 2px;
  background: var(--accent-gradient);
  opacity: 0.3;
  border-radius: 1px;
}

.referers-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 12px;
}

.referer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-primary);
  border-radius: 8px;
}

.referer-emoji {
  font-size: 1.2rem;
}

.referer-label {
  flex: 1;
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.referer-count {
  font-weight: 600;
  color: var(--accent-light);
}

.recent-scans-list {
  max-height: 300px;
  overflow-y: auto;
}

.recent-scan-item {
  display: grid;
  grid-template-columns: 70px 40px 1fr 100px auto;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border-color);
  font-size: 0.85rem;
}

.recent-scan-item.bot {
  opacity: 0.6;
}

.bot-badge {
  padding: 2px 8px;
  background: var(--warning);
  color: black;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: 600;
}

.analytics-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-color);
  font-size: 0.8rem;
  color: var(--text-muted);
}

.analytics-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px;
}

.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid var(--border-color);
  border-top-color: var(--accent-primary);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.analytics-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  padding: 12px 24px;
  background: var(--bg-card);
  border-radius: 8px;
  border-left: 4px solid var(--accent-primary);
  box-shadow: var(--shadow-lg);
  opacity: 0;
  transform: translateY(20px);
  transition: all 0.3s;
  z-index: 10000;
}

.analytics-toast.show {
  opacity: 1;
  transform: translateY(0);
}

.analytics-toast.success { border-left-color: var(--success); }
.analytics-toast.error { border-left-color: var(--error); }
.analytics-toast.info { border-left-color: var(--accent-primary); }

@media (max-width: 768px) {
  .analytics-summary {
    grid-template-columns: repeat(2, 1fr);
  }
  .charts-container {
    grid-template-columns: 1fr;
  }
  .recent-scan-item {
    grid-template-columns: 60px 30px 1fr;
  }
  .scan-browser {
    display: none;
  }
}
`;

// Добавляем стили в документ
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = additionalStyles;
  document.head.appendChild(style);
}

// Экспорт
if (typeof window !== 'undefined') {
  window.Analytics = Analytics;
}
