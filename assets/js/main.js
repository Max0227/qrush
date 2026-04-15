document.addEventListener('DOMContentLoaded', () => {
  console.log('🚀 QRush загружен');

  // Инициализация
  const generator = new QRGenerator();
  const analytics = new Analytics('analytics-container');

  // DOM элементы
  const contentType = document.getElementById('contentType');
  const dynamicInputs = document.getElementById('dynamicInputs');
  const generateBtn = document.getElementById('generateBtn');
  const previewDiv = document.getElementById('preview');
  const downloadPNGBtn = document.getElementById('downloadPNG');
  const downloadSVGBtn = document.getElementById('downloadSVG');
  const colorPicker = document.getElementById('colorPicker');
  const bgColorPicker = document.getElementById('bgColorPicker');
  const sizeSlider = document.getElementById('sizeSlider');
  const sizeValue = document.getElementById('sizeValue');
  const dynamicToggle = document.getElementById('dynamicToggle');
  const statsBtn = document.getElementById('statsBtn');

  // Текущие данные
  let currentSvg = null;
  let currentCode = null;
  let currentContent = '';

  // === Шаблоны полей для разных типов ===
  const templates = {
    url: () => `
      <div class="input-group">
        <label>🔗 URL адрес</label>
        <input type="text" id="urlInput" class="input-field" placeholder="https://example.com" value="https://qrush.vercel.app">
      </div>
    `,
    text: () => `
      <div class="input-group">
        <label>📝 Текст</label>
        <textarea id="textInput" class="input-field" placeholder="Введите любой текст..." rows="4">Привет, мир!</textarea>
      </div>
    `,
    email: () => `
      <div class="input-group">
        <label>📧 Email адрес</label>
        <input type="email" id="emailInput" class="input-field" placeholder="example@mail.com" value="hello@qrush.app">
      </div>
      <div class="input-group">
        <label>Тема письма (опционально)</label>
        <input type="text" id="emailSubject" class="input-field" placeholder="Тема письма">
      </div>
      <div class="input-group">
        <label>Текст письма (опционально)</label>
        <textarea id="emailBody" class="input-field" placeholder="Текст письма..." rows="3"></textarea>
      </div>
    `,
    phone: () => `
      <div class="input-group">
        <label>📞 Номер телефона</label>
        <input type="tel" id="phoneInput" class="input-field" placeholder="+79123456789" value="+79123456789">
      </div>
    `,
    sms: () => `
      <div class="input-group">
        <label>💬 Номер для SMS</label>
        <input type="tel" id="smsPhone" class="input-field" placeholder="+79123456789" value="+79123456789">
      </div>
      <div class="input-group">
        <label>Текст сообщения</label>
        <textarea id="smsBody" class="input-field" placeholder="Текст SMS..." rows="3">Привет! Это QRush.</textarea>
      </div>
    `,
    wifi: () => `
      <div class="input-group">
        <label>📶 Имя сети (SSID)</label>
        <input type="text" id="wifiSsid" class="input-field" placeholder="Название Wi-Fi" value="MyWiFi">
      </div>
      <div class="input-group">
        <label>🔐 Пароль</label>
        <input type="text" id="wifiPassword" class="input-field" placeholder="Пароль" value="mypassword123">
      </div>
      <div class="input-group">
        <label>Тип шифрования</label>
        <select id="wifiEncryption" class="input-field">
          <option value="WPA">WPA/WPA2</option>
          <option value="WEP">WEP</option>
          <option value="nopass">Без пароля</option>
        </select>
      </div>
      <div class="input-group">
        <label>
          <input type="checkbox" id="wifiHidden"> Скрытая сеть
        </label>
      </div>
    `,
    vcard: () => `
      <div class="input-group">
        <label>👤 Имя</label>
        <input type="text" id="vcardName" class="input-field" placeholder="Иван Иванов" value="Иван Петров">
      </div>
      <div class="input-group">
        <label>🏢 Организация</label>
        <input type="text" id="vcardOrg" class="input-field" placeholder="Компания" value="QRush Inc.">
      </div>
      <div class="input-group">
        <label>📞 Телефон</label>
        <input type="tel" id="vcardPhone" class="input-field" placeholder="+79123456789" value="+79123456789">
      </div>
      <div class="input-group">
        <label>📧 Email</label>
        <input type="email" id="vcardEmail" class="input-field" placeholder="email@example.com" value="hello@qrush.app">
      </div>
      <div class="input-group">
        <label>🌐 Сайт</label>
        <input type="text" id="vcardUrl" class="input-field" placeholder="https://..." value="https://qrush.vercel.app">
      </div>
    `,
    geo: () => `
      <div class="input-group">
        <label>📍 Широта</label>
        <input type="text" id="geoLat" class="input-field" placeholder="55.7558" value="55.7558">
      </div>
      <div class="input-group">
        <label>📍 Долгота</label>
        <input type="text" id="geoLon" class="input-field" placeholder="37.6173" value="37.6173">
      </div>
    `,
    event: () => `
      <div class="input-group">
        <label>📅 Название события</label>
        <input type="text" id="eventTitle" class="input-field" placeholder="Встреча" value="Встреча с командой">
      </div>
      <div class="input-group">
        <label>📝 Описание</label>
        <textarea id="eventDesc" class="input-field" placeholder="Описание..." rows="2"></textarea>
      </div>
      <div class="input-group">
        <label>📍 Место</label>
        <input type="text" id="eventLocation" class="input-field" placeholder="Москва, офис">
      </div>
      <div class="input-group">
        <label>⏰ Начало</label>
        <input type="datetime-local" id="eventStart" class="input-field">
      </div>
      <div class="input-group">
        <label>⏰ Конец</label>
        <input type="datetime-local" id="eventEnd" class="input-field">
      </div>
    `,
    image: () => `
      <div class="input-group">
        <label>🖼️ Загрузите изображение</label>
        <input type="file" id="imageInput" class="input-field" accept="image/*">
      </div>
      <div class="input-group">
        <label>Или вставьте Base64</label>
        <textarea id="imageBase64" class="input-field" placeholder="data:image/png;base64,..." rows="3"></textarea>
      </div>
    `
  };

  // === Функция смены типа контента ===
  function renderInputs(type) {
    if (templates[type]) {
      dynamicInputs.innerHTML = templates[type]();
    }
    updateQuickTemplates(type);
  }

  // === Обновление быстрых шаблонов ===
  function updateQuickTemplates(type) {
    const quickLinks = document.querySelectorAll('.quick-link');
    quickLinks.forEach(link => {
      if (type === 'wifi') {
        link.style.display = link.dataset.type === 'wifi' ? 'inline-flex' : 'none';
      } else if (type === 'vcard') {
        link.style.display = link.dataset.type === 'vcard' ? 'inline-flex' : 'none';
      } else {
        link.style.display = link.dataset.type === 'url' ? 'inline-flex' : 'none';
      }
    });
  }

  // === Получение данных из полей в зависимости от типа ===
  function getContentData() {
    const type = contentType.value;

    const getters = {
      url: () => document.getElementById('urlInput')?.value || '',
      text: () => document.getElementById('textInput')?.value || '',
      email: () => {
        const email = document.getElementById('emailInput')?.value || '';
        const subject = document.getElementById('emailSubject')?.value;
        const body = document.getElementById('emailBody')?.value;
        let mailto = `mailto:${email}`;
        const params = [];
        if (subject) params.push(`subject=${encodeURIComponent(subject)}`);
        if (body) params.push(`body=${encodeURIComponent(body)}`);
        return params.length ? mailto + '?' + params.join('&') : mailto;
      },
      phone: () => `tel:${document.getElementById('phoneInput')?.value || ''}`,
      sms: () => {
        const phone = document.getElementById('smsPhone')?.value || '';
        const body = document.getElementById('smsBody')?.value || '';
        return `sms:${phone}${body ? '?body=' + encodeURIComponent(body) : ''}`;
      },
      wifi: () => {
        const ssid = document.getElementById('wifiSsid')?.value || '';
        const password = document.getElementById('wifiPassword')?.value || '';
        const encryption = document.getElementById('wifiEncryption')?.value || 'WPA';
        const hidden = document.getElementById('wifiHidden')?.checked;
        return `WIFI:S:${ssid};T:${encryption};P:${password};${hidden ? 'H:true;' : ''};`;
      },
      vcard: () => {
        const name = document.getElementById('vcardName')?.value || '';
        const org = document.getElementById('vcardOrg')?.value || '';
        const phone = document.getElementById('vcardPhone')?.value || '';
        const email = document.getElementById('vcardEmail')?.value || '';
        const url = document.getElementById('vcardUrl')?.value || '';
        return `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nORG:${org}\nTEL:${phone}\nEMAIL:${email}\nURL:${url}\nEND:VCARD`;
      },
      geo: () => {
        const lat = document.getElementById('geoLat')?.value || '0';
        const lon = document.getElementById('geoLon')?.value || '0';
        return `geo:${lat},${lon}`;
      },
      event: () => {
        const title = document.getElementById('eventTitle')?.value || '';
        const desc = document.getElementById('eventDesc')?.value || '';
        const location = document.getElementById('eventLocation')?.value || '';
        const start = document.getElementById('eventStart')?.value?.replace(/[:-]/g, '') || '';
        const end = document.getElementById('eventEnd')?.value?.replace(/[:-]/g, '') || '';
        return `BEGIN:VEVENT\nSUMMARY:${title}\nDESCRIPTION:${desc}\nLOCATION:${location}\nDTSTART:${start}\nDTEND:${end}\nEND:VEVENT`;
      },
      image: () => {
        const base64 = document.getElementById('imageBase64')?.value;
        if (base64) return base64;
        const file = document.getElementById('imageInput')?.files[0];
        return file ? URL.createObjectURL(file) : '';
      }
    };

    return getters[type] ? getters[type]() : '';
  }

  // === Функция показа содержимого QR ===
  function showQRContent(content) {
    const qrContentInfo = document.getElementById('qrContentInfo');
    const qrContentText = document.getElementById('qrContentText');
    const openLinkBtn = document.getElementById('openLinkBtn');
    
    if (!qrContentInfo || !qrContentText) return;
    
    const displayText = content.length > 200 ? content.substring(0, 200) + '...' : content;
    qrContentText.textContent = displayText;
    qrContentInfo.style.display = 'block';
    
    const isUrl = /^https?:\/\//i.test(content) || content.startsWith('mailto:') || content.startsWith('tel:');
    if (openLinkBtn) {
      openLinkBtn.style.display = isUrl ? 'inline-flex' : 'none';
    }
  }

  // === Генерация QR ===
  generateBtn?.addEventListener('click', async () => {
    const content = getContentData();
    if (!content) {
      alert('Введите данные для генерации QR-кода');
      return;
    }

    currentContent = content;

    try {
      generateBtn.disabled = true;
      generateBtn.textContent = '⏳ Генерирую...';

      const options = {
        size: parseInt(sizeSlider?.value) || 400,
        color: colorPicker?.value || '#000000',
        bgColor: bgColorPicker?.value || '#FFFFFF'
      };

      const result = await generator.generate(content, options);

      if (result.success) {
        if (previewDiv) {
          previewDiv.innerHTML = `<img src="${result.qr}" alt="QR Code" class="qr-preview-image" />`;
        }

        showQRContent(content);

        currentSvg = result.qrSvg;
        currentCode = result.dynamicId;

        if (dynamicToggle?.checked) {
          await generator.saveDynamic(currentCode, content);
        }

        if (downloadPNGBtn) downloadPNGBtn.style.display = 'inline-flex';
        if (downloadSVGBtn) downloadSVGBtn.style.display = 'inline-flex';
        if (statsBtn) statsBtn.style.display = 'inline-flex';
      }
    } catch (error) {
      alert('Ошибка генерации: ' + error.message);
    } finally {
      generateBtn.disabled = false;
      generateBtn.textContent = '🚀 Сгенерировать QR';
    }
  });

  // === Обработчики событий ===
  contentType?.addEventListener('change', (e) => {
    renderInputs(e.target.value);
  });

  // Обработка загрузки изображения
  document.addEventListener('change', (e) => {
    if (e.target.id === 'imageInput') {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64area = document.getElementById('imageBase64');
          if (base64area) base64area.value = ev.target.result;
        };
        reader.readAsDataURL(file);
      }
    }
  });

  // Быстрые шаблоны
  document.querySelectorAll('.quick-link').forEach(btn => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.type;
      const value = btn.dataset.value;
      if (type && contentType) {
        contentType.value = type;
        renderInputs(type);
      }
    });
  });

  // Скачивание PNG
  downloadPNGBtn?.addEventListener('click', () => {
    generator.downloadPNG();
  });

  // Скачивание SVG
  downloadSVGBtn?.addEventListener('click', () => {
    if (currentSvg) {
      const blob = new Blob([currentSvg], { type: 'image/svg+xml' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `qrush-${Date.now()}.svg`;
      link.href = url;
      link.click();
      URL.revokeObjectURL(url);
    }
  });

  // Статистика
  statsBtn?.addEventListener('click', async () => {
    if (currentCode) {
      await analytics.loadStats(currentCode);
    } else {
      alert('Сначала сгенерируйте QR-код');
    }
  });

  // Слайдер размера
  sizeSlider?.addEventListener('input', (e) => {
    if (sizeValue) sizeValue.textContent = `${e.target.value}px`;
  });

  // Копирование содержимого
  document.getElementById('copyContentBtn')?.addEventListener('click', () => {
    const text = document.getElementById('qrContentText')?.textContent;
    if (text) {
      navigator.clipboard?.writeText(currentContent).then(() => {
        const btn = document.getElementById('copyContentBtn');
        btn.textContent = '✅ Скопировано!';
        setTimeout(() => btn.textContent = '📋 Копировать', 2000);
      });
    }
  });

  // Открытие ссылки
  document.getElementById('openLinkBtn')?.addEventListener('click', () => {
    if (currentContent && /^(https?:\/\/|mailto:|tel:)/i.test(currentContent)) {
      window.open(currentContent, '_blank');
    }
  });

  // Инициализация
  renderInputs('url');

  // Экспорт
  window.qrush = { generator, analytics };
});