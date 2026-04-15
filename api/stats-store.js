// api/stats-store.js — Продвинутое хранилище данных QRush
// Поддержка TTL, персистентности, метрик и бэкапов

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// ⚙️ КОНФИГУРАЦИЯ
// ============================================
const CONFIG = {
  // TTL для разных типов данных (в миллисекундах)
  TTL: {
    scans: 7 * 24 * 60 * 60 * 1000,      // 7 дней для сканов
    urls: 365 * 24 * 60 * 60 * 1000,     // 365 дней для URL (динамические коды)
    history: 30 * 24 * 60 * 60 * 1000,   // 30 дней для истории
    realtime: 24 * 60 * 60 * 1000,       // 24 часа для реалтайм статистики
    spam: 60 * 60 * 1000,                // 1 час для антиспам данных
    ip: 24 * 60 * 60 * 1000              // 24 часа для IP трекинга
  },
  
  // Максимальные размеры
  MAX_SCANS_PER_CODE: 50000,
  MAX_HISTORY_PER_CODE: 100,
  MAX_IP_CODES: 100,
  MAX_TOTAL_ENTRIES: 1000000,
  
  // Персистентность
  PERSIST_ENABLED: true,
  PERSIST_INTERVAL: 5 * 60 * 1000,       // Сохранение каждые 5 минут
  PERSIST_PATH: path.join(__dirname, '../../data'),
  
  // Бэкапы
  BACKUP_ENABLED: true,
  BACKUP_INTERVAL: 24 * 60 * 60 * 1000,  // Бэкап раз в сутки
  MAX_BACKUPS: 7,
  
  // Очистка
  CLEANUP_INTERVAL: 60 * 60 * 1000,      // Каждый час
  BATCH_SIZE: 1000                       // Размер батча для очистки
};

// ============================================
// 📦 ОСНОВНОЕ ХРАНИЛИЩЕ
// ============================================
class StatsStore {
  constructor() {
    this.store = new Map();
    this.metadata = new Map(); // Метаданные: TTL, createdAt, accessCount
    this.metrics = {
      totalWrites: 0,
      totalReads: 0,
      totalDeletes: 0,
      currentSize: 0,
      peakSize: 0,
      lastCleanup: Date.now(),
      lastBackup: null,
      lastPersist: null
    };
    
    this.initialized = false;
    this.intervals = [];
    
    this.init();
  }
  
  // ============================================
  // 🚀 ИНИЦИАЛИЗАЦИЯ
  // ============================================
  async init() {
    if (this.initialized) return;
    
    // Создаём папку для данных если нужно
    if (CONFIG.PERSIST_ENABLED) {
      await this.ensureDataDir();
      await this.loadFromDisk();
    }
    
    // Запускаем фоновые задачи
    this.startBackgroundTasks();
    
    this.initialized = true;
    console.log('[QRush] StatsStore initialized');
  }
  
  async ensureDataDir() {
    try {
      if (!fs.existsSync(CONFIG.PERSIST_PATH)) {
        fs.mkdirSync(CONFIG.PERSIST_PATH, { recursive: true });
      }
    } catch (error) {
      console.error('[QRush] Failed to create data dir:', error);
    }
  }
  
  // ============================================
  // 🔄 ФОНОВЫЕ ЗАДАЧИ
  // ============================================
  startBackgroundTasks() {
    // Очистка старых данных
    const cleanupInterval = setInterval(() => {
      this.cleanup();
    }, CONFIG.CLEANUP_INTERVAL);
    this.intervals.push(cleanupInterval);
    
    // Персистентность
    if (CONFIG.PERSIST_ENABLED) {
      const persistInterval = setInterval(() => {
        this.persist();
      }, CONFIG.PERSIST_INTERVAL);
      this.intervals.push(persistInterval);
    }
    
    // Бэкапы
    if (CONFIG.BACKUP_ENABLED) {
      const backupInterval = setInterval(() => {
        this.backup();
      }, CONFIG.BACKUP_INTERVAL);
      this.intervals.push(backupInterval);
    }
    
    // Обновление метрик
    const metricsInterval = setInterval(() => {
      this.updateMetrics();
    }, 60000);
    this.intervals.push(metricsInterval);
  }
  
  // ============================================
  // 💾 ОСНОВНЫЕ МЕТОДЫ
  // ============================================
  set(key, value, options = {}) {
    const ttl = options.ttl || this.getDefaultTTL(key);
    const metadata = {
      createdAt: Date.now(),
      expiresAt: ttl ? Date.now() + ttl : null,
      accessCount: 0,
      lastAccessed: null,
      size: this.estimateSize(value),
      ...options.metadata
    };
    
    this.store.set(key, value);
    this.metadata.set(key, metadata);
    
    this.metrics.totalWrites++;
    this.updateMetrics();
    
    // Проверяем лимиты
    if (this.store.size > CONFIG.MAX_TOTAL_ENTRIES) {
      this.evictLRU();
    }
    
    return this;
  }
  
  get(key) {
    const value = this.store.get(key);
    const meta = this.metadata.get(key);
    
    if (!value || !meta) return undefined;
    
    // Проверяем TTL
    if (meta.expiresAt && Date.now() > meta.expiresAt) {
      this.delete(key);
      return undefined;
    }
    
    // Обновляем метаданные
    meta.accessCount++;
    meta.lastAccessed = Date.now();
    this.metadata.set(key, meta);
    
    this.metrics.totalReads++;
    
    return value;
  }
  
  has(key) {
    const meta = this.metadata.get(key);
    if (!meta) return false;
    
    if (meta.expiresAt && Date.now() > meta.expiresAt) {
      this.delete(key);
      return false;
    }
    
    return this.store.has(key);
  }
  
  delete(key) {
    const existed = this.store.has(key);
    this.store.delete(key);
    this.metadata.delete(key);
    
    if (existed) {
      this.metrics.totalDeletes++;
      this.updateMetrics();
    }
    
    return existed;
  }
  
  clear() {
    const size = this.store.size;
    this.store.clear();
    this.metadata.clear();
    this.metrics.totalDeletes += size;
    this.updateMetrics();
  }
  
  // ============================================
  // 🔍 РАСШИРЕННЫЕ МЕТОДЫ
  // ============================================
  getOrSet(key, factory, options = {}) {
    if (this.has(key)) {
      return this.get(key);
    }
    
    const value = typeof factory === 'function' ? factory() : factory;
    this.set(key, value, options);
    return value;
  }
  
  async getOrSetAsync(key, asyncFactory, options = {}) {
    if (this.has(key)) {
      return this.get(key);
    }
    
    const value = await asyncFactory();
    this.set(key, value, options);
    return value;
  }
  
  increment(key, delta = 1, options = {}) {
    const current = this.get(key) || 0;
    const newValue = current + delta;
    this.set(key, newValue, options);
    return newValue;
  }
  
  push(key, item, options = {}) {
    const array = this.get(key) || [];
    const maxSize = options.maxSize || CONFIG.MAX_SCANS_PER_CODE;
    
    array.push({
      ...item,
      _index: array.length,
      _timestamp: Date.now()
    });
    
    if (array.length > maxSize) {
      array.splice(0, array.length - maxSize);
    }
    
    this.set(key, array, options);
    return array.length;
  }
  
  unshift(key, item, options = {}) {
    const array = this.get(key) || [];
    const maxSize = options.maxSize || CONFIG.MAX_SCANS_PER_CODE;
    
    array.unshift({
      ...item,
      _index: 0,
      _timestamp: Date.now()
    });
    
    if (array.length > maxSize) {
      array.pop();
    }
    
    this.set(key, array, options);
    return array.length;
  }
  
  query(key, filterFn, limit = 10) {
    const array = this.get(key);
    if (!Array.isArray(array)) return [];
    
    return array.filter(filterFn).slice(-limit);
  }
  
  // ============================================
  // 🧹 ОЧИСТКА И ОБСЛУЖИВАНИЕ
  // ============================================
  cleanup() {
    const now = Date.now();
    let cleaned = 0;
    let processed = 0;
    
    for (const [key, meta] of this.metadata.entries()) {
      processed++;
      
      // Удаляем просроченные
      if (meta.expiresAt && now > meta.expiresAt) {
        this.store.delete(key);
        this.metadata.delete(key);
        cleaned++;
        continue;
      }
      
      // Проверяем лимиты для массивов
      const value = this.store.get(key);
      if (Array.isArray(value)) {
        const maxSize = this.getMaxSizeForKey(key);
        if (value.length > maxSize) {
          this.store.set(key, value.slice(-maxSize));
          cleaned++;
        }
      }
      
      // Батчевая обработка
      if (processed % CONFIG.BATCH_SIZE === 0) {
        this.allowEventLoop();
      }
    }
    
    this.metrics.lastCleanup = now;
    this.updateMetrics();
    
    console.log(`[QRush] Cleanup completed: ${cleaned} entries removed`);
    return cleaned;
  }
  
  evictLRU(count = 1000) {
    const entries = [];
    
    for (const [key, meta] of this.metadata.entries()) {
      if (!meta.lastAccessed) continue;
      entries.push({ key, lastAccessed: meta.lastAccessed });
    }
    
    entries.sort((a, b) => a.lastAccessed - b.lastAccessed);
    
    const toDelete = entries.slice(0, count);
    toDelete.forEach(({ key }) => this.delete(key));
    
    console.log(`[QRush] LRU eviction: ${toDelete.length} entries removed`);
    return toDelete.length;
  }
  
  // ============================================
  // 💾 ПЕРСИСТЕНТНОСТЬ
  // ============================================
  async persist() {
    if (!CONFIG.PERSIST_ENABLED) return;
    
    try {
      const data = {
        version: 1,
        timestamp: Date.now(),
        metrics: this.metrics,
        entries: []
      };
      
      for (const [key, value] of this.store.entries()) {
        const meta = this.metadata.get(key);
        
        // Сохраняем только важные данные
        if (key.startsWith('url:') || key.startsWith('created:') || key.startsWith('expires:')) {
          data.entries.push({ key, value, meta });
        }
      }
      
      const filePath = path.join(CONFIG.PERSIST_PATH, 'store.json');
      fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
      
      this.metrics.lastPersist = Date.now();
      console.log('[QRush] Store persisted to disk');
    } catch (error) {
      console.error('[QRush] Persist failed:', error);
    }
  }
  
  async loadFromDisk() {
    try {
      const filePath = path.join(CONFIG.PERSIST_PATH, 'store.json');
      if (!fs.existsSync(filePath)) return;
      
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      if (data.entries) {
        for (const { key, value, meta } of data.entries) {
          // Корректируем TTL при загрузке
          if (meta && meta.expiresAt) {
            const age = Date.now() - meta.createdAt;
            meta.createdAt = Date.now() - age;
            meta.expiresAt = meta.createdAt + (meta.expiresAt - meta.createdAt);
          }
          
          this.store.set(key, value);
          this.metadata.set(key, meta);
        }
      }
      
      if (data.metrics) {
        this.metrics = { ...this.metrics, ...data.metrics };
      }
      
      console.log(`[QRush] Loaded ${data.entries?.length || 0} entries from disk`);
    } catch (error) {
      console.error('[QRush] Load from disk failed:', error);
    }
  }
  
  // ============================================
  // 💿 БЭКАПЫ
  // ============================================
  async backup() {
    if (!CONFIG.BACKUP_ENABLED) return;
    
    try {
      const backupDir = path.join(CONFIG.PERSIST_PATH, 'backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }
      
      const timestamp = new Date().toISOString().replace(/:/g, '-');
      const backupPath = path.join(backupDir, `backup-${timestamp}.json`);
      
      const data = {
        version: 1,
        timestamp: Date.now(),
        metrics: this.metrics,
        entries: Array.from(this.store.entries()).map(([key, value]) => ({
          key,
          value,
          meta: this.metadata.get(key)
        }))
      };
      
      fs.writeFileSync(backupPath, JSON.stringify(data));
      
      this.metrics.lastBackup = Date.now();
      
      // Удаляем старые бэкапы
      this.cleanupOldBackups(backupDir);
      
      console.log(`[QRush] Backup created: ${backupPath}`);
    } catch (error) {
      console.error('[QRush] Backup failed:', error);
    }
  }
  
  cleanupOldBackups(backupDir) {
    try {
      const files = fs.readdirSync(backupDir)
        .filter(f => f.startsWith('backup-') && f.endsWith('.json'))
        .sort()
        .reverse();
      
      if (files.length > CONFIG.MAX_BACKUPS) {
        files.slice(CONFIG.MAX_BACKUPS).forEach(file => {
          fs.unlinkSync(path.join(backupDir, file));
        });
      }
    } catch (error) {
      console.error('[QRush] Backup cleanup failed:', error);
    }
  }
  
  // ============================================
  // 📊 МЕТРИКИ И СТАТИСТИКА
  // ============================================
  updateMetrics() {
    this.metrics.currentSize = this.store.size;
    if (this.metrics.currentSize > this.metrics.peakSize) {
      this.metrics.peakSize = this.metrics.currentSize;
    }
  }
  
  getStats() {
    const keys = Array.from(this.store.keys());
    const keyTypes = {};
    
    keys.forEach(key => {
      const type = key.split(':')[0] || 'other';
      keyTypes[type] = (keyTypes[type] || 0) + 1;
    });
    
    return {
      ...this.metrics,
      keyTypes,
      memoryUsage: this.estimateMemoryUsage(),
      uptime: this.metrics.lastCleanup ? Date.now() - this.metrics.lastCleanup : 0
    };
  }
  
  estimateMemoryUsage() {
    let total = 0;
    
    for (const [key, value] of this.store.entries()) {
      total += this.estimateSize(key);
      total += this.estimateSize(value);
    }
    
    return total;
  }
  
  // ============================================
  // 🔧 ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ
  // ============================================
  getDefaultTTL(key) {
    if (key.startsWith('scans:')) return CONFIG.TTL.scans;
    if (key.startsWith('url:')) return CONFIG.TTL.urls;
    if (key.startsWith('history:')) return CONFIG.TTL.history;
    if (key.startsWith('realtime:')) return CONFIG.TTL.realtime;
    if (key.startsWith('spam:')) return CONFIG.TTL.spam;
    if (key.startsWith('ip:')) return CONFIG.TTL.ip;
    return null;
  }
  
  getMaxSizeForKey(key) {
    if (key.startsWith('scans:')) return CONFIG.MAX_SCANS_PER_CODE;
    if (key.startsWith('history:')) return CONFIG.MAX_HISTORY_PER_CODE;
    if (key.startsWith('ip:codes:')) return CONFIG.MAX_IP_CODES;
    return Infinity;
  }
  
  estimateSize(obj) {
    try {
      return JSON.stringify(obj).length;
    } catch {
      return 0;
    }
  }
  
  allowEventLoop() {
    return new Promise(resolve => setImmediate(resolve));
  }
  
  // ============================================
  // 🛑 ЗАВЕРШЕНИЕ РАБОТЫ
  // ============================================
  async shutdown() {
    console.log('[QRush] Shutting down StatsStore...');
    
    // Очищаем интервалы
    this.intervals.forEach(clearInterval);
    this.intervals = [];
    
    // Сохраняем данные
    if (CONFIG.PERSIST_ENABLED) {
      await this.persist();
    }
    
    console.log('[QRush] StatsStore shutdown complete');
  }
  
  destroy() {
    this.shutdown();
    this.clear();
  }
}

// ============================================
// 🌐 СИНГЛТОН
// ============================================
const statsStore = new StatsStore();

// Автоматическое сохранение при завершении процесса
if (typeof process !== 'undefined') {
  process.on('SIGINT', async () => {
    await statsStore.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    await statsStore.shutdown();
    process.exit(0);
  });
}

// Экспорт
export { statsStore, StatsStore, CONFIG };
export default statsStore;