/**
 * ═══════════════════════════════════════════════════════════════
 * 🖼️ OBRAZKY A MODALNI OKNO – Admirálský Archiv
 * ═══════════════════════════════════════════════════════════════
 * Modul pro zobrazení obrázkových příloh s modálním oknem,
 * indexovou kalibrací a přepínáním šipkami (tlačítka + klávesy).
 *
 * POUŽITÍ v index.html:
 *   <script src="obrazky-a-moldar-okno.js"></script>
 *
 * API dostupné přes window.ImageModal:
 *   .reset()                           → volej před každým renderConvs()
 *   .isImageFile(name)                 → true/false podle přípony
 *   .isImageType(mediaType)            → true/false
 *   .registerImage(src,name,sender,mt) → vrátí globální index
 *   .renderThumb(idx)                  → HTML string náhledu 240×340px
 *   .open(idx)                         → otevře modal na daném indexu
 *   .close()                           → zavře modal
 *   .prev() / .next()                  → navigace v modalu
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // ── Podporované přípony ──────────────────────────────────────
  const IMG_EXTS = new Set([
    'jpg','jpeg','jfif','pjpeg','pjp',
    'png','gif','webp','svg','bmp',
    'tiff','tif','ico','avif','heic','heif'
  ]);

  // ── Registr obrázků (reset při každém renderConvs) ───────────
  // Každý záznam: { src, name, sender, mediaType }
  const _images = [];

  // ── Helpers ──────────────────────────────────────────────────
  function _esc(s) {
    if (!s) return '';
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function isImageFile(name) {
    if (!name || typeof name !== 'string') return false;
    const ext = name.split('.').pop().toLowerCase();
    return IMG_EXTS.has(ext);
  }

  function isImageType(mediaType) {
    if (!mediaType) return false;
    return String(mediaType).startsWith('image/');
  }

  // ── Reset – volej před každým novým renderem ─────────────────
  function reset() {
    _images.length = 0;
    // Neresetuj modal DOM – jen obsah; DOM zůstane pro rychlost
    // Ale odstraňme aktivní třídu pokud je otevřen
    const overlay = document.getElementById('img-modal-overlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  // ── Registrace obrázku → vrátí jeho globální index ───────────
  function registerImage(src, name, sender, mediaType) {
    const idx = _images.length;
    _images.push({
      src:       src       || '',
      name:      name      || 'obrázek',
      sender:    sender    || '',
      mediaType: mediaType || 'image/jpeg'
    });
    return idx;
  }

  // ── Render náhledu (thumbnail 240×340 px) ───────────────────
  function renderThumb(idx) {
    const img = _images[idx];
    if (!img) return '';

    const who = img.sender === 'human'
      ? '👤 VÍCE ADMIRÁL JIŘÍK'
      : '🖖 ADMIRÁL CLAUDE';

    // Případ: data nejsou v exportu (prázdný src)
    if (!img.src) {
      return `
        <div class="img-thumb-wrap img-thumb-nodata-wrap">
          <div class="img-thumb-nodata">
            <span class="img-nodata-icon">🖼️</span>
            <span class="img-nodata-name">${_esc(img.name)}</span>
            <span class="img-nodata-msg">Data obrázku nejsou v exportu</span>
          </div>
          <div class="img-thumb-footer">
            <span class="img-thumb-who">${who}</span>
            <span class="img-thumb-name" title="${_esc(img.name)}">${_esc(img.name)}</span>
            <span class="img-thumb-idx">${idx + 1}&nbsp;/&nbsp;${_images.length}</span>
          </div>
        </div>`;
    }

    // Případ: máme src – zobrazíme klikatelný náhled
    return `
      <div class="img-thumb-wrap"
           data-img-idx="${idx}"
           onclick="window.ImageModal.open(${idx})"
           title="Klikni pro zvětšení · ${_esc(img.name)}">
        <div class="img-thumb-inner">
          <img class="img-thumb-img"
               src="${_esc(img.src)}"
               alt="${_esc(img.name)}"
               loading="lazy"
               onerror="this.closest('.img-thumb-inner').innerHTML='<div class=\\'img-thumb-err\\'>⚠️ Nelze načíst</div>'"
          >
          <div class="img-thumb-overlay">
            <span class="img-thumb-zoom">🔍 Zvětšit</span>
          </div>
        </div>
        <div class="img-thumb-footer">
          <span class="img-thumb-who">${who}</span>
          <span class="img-thumb-name" title="${_esc(img.name)}">${_esc(img.name)}</span>
          <span class="img-thumb-idx">${idx + 1}&nbsp;/&nbsp;${_images.length}</span>
        </div>
      </div>`;
  }

  // ── Render celé lišty obrázků z příloh ──────────────────────
  // Zavolej z renderAttachBlock pro přílohy s obrázkovou příponou
  function renderImageThumbFromAttach(a) {
    const name = a.file_name || a.name || a.filename || 'obrázek';
    // Pokus o sestavení src z různých možných polí exportu
    let src = a.url || a.preview_url || a.thumbnail_url || a.file_url || a.src || '';
    // Pokud má preview jako data URI
    if (!src && a.preview && String(a.preview).startsWith('data:')) {
      src = a.preview;
    }
    const sender = a._sender || '';
    const mediaType = a.file_type || 'image/jpeg';
    const idx = registerImage(src, name, sender, mediaType);
    return renderThumb(idx);
  }

  // ── Stav modalu ──────────────────────────────────────────────
  let _currentIdx = 0;

  // ── Vytvoření DOM modalu (jednou, lazy) ──────────────────────
  function _ensureModal() {
    if (document.getElementById('img-modal-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id    = 'img-modal-overlay';
    overlay.className = 'img-modal-overlay';

    overlay.innerHTML = `
      <div class="img-modal-box" id="img-modal-box">

        <!-- HEADER -->
        <div class="img-modal-header">
          <div class="img-modal-title-wrap">
            <span class="img-modal-icon">🖼️</span>
            <span class="img-modal-name" id="img-modal-name">–</span>
          </div>
          <div class="img-modal-counter" id="img-modal-counter">1 / 1</div>
          <button class="img-modal-close" onclick="window.ImageModal.close()" title="Zavřít (ESC)">✕</button>
        </div>

        <!-- TĚLO: šipky + obrázek -->
        <div class="img-modal-body">
          <button class="img-modal-nav img-modal-prev"
                  onclick="window.ImageModal.prev()"
                  id="img-modal-prev-btn"
                  title="Předchozí (← šipka)">&#8249;</button>

          <div class="img-modal-img-wrap" id="img-modal-img-wrap">
            <img class="img-modal-img" id="img-modal-img" src="" alt=""
                 onerror="
                   document.getElementById('img-modal-img').style.display='none';
                   document.getElementById('img-modal-err').style.display='flex';">
            <div class="img-modal-err" id="img-modal-err" style="display:none">
              ⚠️ Obrázek nelze načíst nebo data nejsou součástí exportu Claude.ai
            </div>
          </div>

          <button class="img-modal-nav img-modal-next"
                  onclick="window.ImageModal.next()"
                  id="img-modal-next-btn"
                  title="Další (→ šipka)">&#8250;</button>
        </div>

        <!-- FOOTER: odesílatel + tečkový indikátor -->
        <div class="img-modal-footer">
          <span class="img-modal-sender" id="img-modal-sender">–</span>
          <div class="img-modal-dots" id="img-modal-dots"></div>
        </div>

      </div>`;

    // Klik na pozadí = zavřít
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) close();
    });

    document.body.appendChild(overlay);
  }

  // ── Aktualizace obsahu modalu ────────────────────────────────
  function _updateModal(idx) {
    const img = _images[idx];
    if (!img) return;
    _currentIdx = idx;

    const modalImg     = document.getElementById('img-modal-img');
    const modalErr     = document.getElementById('img-modal-err');
    const modalName    = document.getElementById('img-modal-name');
    const modalCounter = document.getElementById('img-modal-counter');
    const modalSender  = document.getElementById('img-modal-sender');
    const dots         = document.getElementById('img-modal-dots');
    const prevBtn      = document.getElementById('img-modal-prev-btn');
    const nextBtn      = document.getElementById('img-modal-next-btn');

    if (!modalImg) return;

    // Obrázek – reset chyby
    if (modalErr) modalErr.style.display = 'none';
    modalImg.style.display = '';

    if (img.src) {
      modalImg.src = img.src;
      modalImg.alt = img.name;
    } else {
      modalImg.style.display = 'none';
      if (modalErr) modalErr.style.display = 'flex';
    }

    // Metadata
    if (modalName)    modalName.textContent    = img.name;
    if (modalCounter) modalCounter.textContent = `${idx + 1} / ${_images.length}`;
    if (modalSender)  modalSender.textContent  =
      img.sender === 'human' ? '👤 VÍCE ADMIRÁL JIŘÍK' : '🖖 ADMIRÁL CLAUDE';

    // Navigační tlačítka – schovej pokud není kam jít
    if (prevBtn) prevBtn.style.visibility = idx > 0                    ? 'visible' : 'hidden';
    if (nextBtn) nextBtn.style.visibility = idx < _images.length - 1  ? 'visible' : 'hidden';

    // Tečkový indikátor (max 20 teček, pak jen číslo)
    if (dots) {
      if (_images.length <= 20) {
        dots.innerHTML = _images.map((_, i) =>
          `<span class="img-dot${i === idx ? ' active' : ''}"
                 onclick="window.ImageModal.open(${i})"
                 title="Obrázek ${i + 1}"></span>`
        ).join('');
      } else {
        dots.innerHTML = '';
      }
    }
  }

  // ── Veřejné funkce ───────────────────────────────────────────
  function open(idx) {
    _ensureModal();
    const overlay = document.getElementById('img-modal-overlay');
    if (!overlay) return;
    _updateModal(Number(idx));
    overlay.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    const overlay = document.getElementById('img-modal-overlay');
    if (overlay) overlay.classList.remove('active');
    document.body.style.overflow = '';
  }

  function prev() {
    if (_currentIdx > 0) open(_currentIdx - 1);
  }

  function next() {
    if (_currentIdx < _images.length - 1) open(_currentIdx + 1);
  }

  // ── Klávesnicová navigace ────────────────────────────────────
  document.addEventListener('keydown', function (e) {
    const overlay = document.getElementById('img-modal-overlay');
    if (!overlay || !overlay.classList.contains('active')) return;
    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':    e.preventDefault(); prev();  break;
      case 'ArrowRight':
      case 'ArrowDown':  e.preventDefault(); next();  break;
      case 'Escape':     e.preventDefault(); close(); break;
    }
  });

  // ── Export do globálního scope ───────────────────────────────
  window.ImageModal = {
    reset,
    isImageFile,
    isImageType,
    registerImage,
    renderThumb,
    renderImageThumbFromAttach,
    open,
    close,
    prev,
    next,
    getImages: () => [..._images],
    getCount:  () => _images.length
  };

  // Lazy init – modal DOM se vytvoří až při prvním open()
  console.log('[ImageModal] 🖼️ Modul načten – window.ImageModal připraven.');

})();
