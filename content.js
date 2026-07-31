(function () {
  'use strict';

  console.log('[MantiTech] content script loaded');

  // ── Font face injection ────────────────────────────────────────────────────
  // Relative url() in content-script CSS resolves against the page origin, not
  // the extension. Build @font-face rules here with absolute extension URLs.

  (function () {
    const base = chrome.runtime.getURL('fonts/');
    const faces = [
      ["'Orbitron'",        '400 900', 'orbitron.woff2'],
      ["'Share Tech Mono'", '400',     'sharetechmono.woff2'],
      ["'Exo 2'",           '400 700', 'exo2.woff2'],
      ["'Audiowide'",       '400',     'audiowide.woff2'],
      ["'Chakra Petch'",    '400',     'chakrapetch-400.woff2'],
      ["'Chakra Petch'",    '700',     'chakrapetch-700.woff2'],
      ["'Electrolize'",     '400',     'electrolize.woff2'],
      ["'Michroma'",        '400',     'michroma.woff2'],
      ["'Oxanium'",         '400 700', 'oxanium.woff2'],
      ["'Rajdhani'",        '400',     'rajdhani-400.woff2'],
      ["'Rajdhani'",        '600',     'rajdhani-600.woff2'],
      ["'Rajdhani'",        '700',     'rajdhani-700.woff2'],
      ["'Space Mono'",      '400',     'spacemono-400.woff2'],
      ["'Space Mono'",      '700',     'spacemono-700.woff2'],
      ["'Teko'",            '400 700', 'teko.woff2'],
      ["'VT323'",           '400',     'vt323.woff2'],
    ].map(function (f) {
      return '@font-face{font-family:' + f[0] + ';font-style:normal;font-weight:' + f[1] +
             ';font-display:swap;src:url("' + base + f[2] + '")format("woff2")}';
    }).join('');
    const style = document.createElement('style');
    style.textContent = faces;
    (document.head || document.documentElement).appendChild(style);
  }());;

  const NOTE_PREFIX     = 'mt_note__mat_';
  const API_KEY_STORE   = 'mt_api_key';
  const SETTINGS_STORE  = 'mt_settings';
  const SEEN_VER_STORE  = 'mt_seen_version';
  const API_BASE        = 'https://api.g2.galactictycoons.com';
  let activeModal      = null;
  let debounceTimer    = null;
  let marketPriceCache = null; // { ts: Date, prices: { matName.toLowerCase() → cents } }

  // ── Settings ───────────────────────────────────────────────────────────────

  const SETTINGS_DEFAULTS = {
    inlineImages:       true,
    ytSunoPreviews:     true,
    gifPicker:          true,
    emojiPicker:        true,
    scrollIndicator:    true,
    materialNotes:      true,
    ledger:             true,
    guildContent:       true,
    wishlistCopy:       true,
    cheapestIndicator:  true,
    theme:              'amberdark',
    font:               'orbitron',
    customTheme:        null,
  };

  const THEME_TOKENS = [
    { key: '--mt-bg-base',   label: 'Background', group: 'Base' },
    { key: '--mt-bg-mantle', label: 'Panel',       group: 'Base' },
    { key: '--mt-surface0',  label: 'Surface',     group: 'Base' },
    { key: '--mt-surface1',  label: 'Border',      group: 'Base' },
    { key: '--mt-text',      label: 'Text',        group: 'Text' },
    { key: '--mt-text-hi',   label: 'Emphasis',    group: 'Text' },
    { key: '--mt-overlay0',  label: 'Muted',       group: 'Text' },
    { key: '--mt-accent',    label: 'Accent',      group: 'Accent' },
    { key: '--mt-highlight', label: 'Highlight',   group: 'Accent' },
    { key: '--mt-positive',  label: 'Positive',    group: 'Accent' },
    { key: '--mt-negative',  label: 'Negative',    group: 'Accent' },
    { key: '--mt-planet-t1', label: 'T1',          group: 'Galaxy' },
    { key: '--mt-planet-t2', label: 'T2',          group: 'Galaxy' },
    { key: '--mt-planet-t3', label: 'T3',          group: 'Galaxy' },
    { key: '--mt-planet-t4', label: 'T4',          group: 'Galaxy' },
  ];

  const THEME_PRESETS = {
    amberdark: {
      '--mt-bg-base':   '#100805',
      '--mt-bg-mantle': '#1a0e06',
      '--mt-surface0':  '#251508',
      '--mt-surface1':  '#3d2410',
      '--mt-overlay0':  '#8a5e28',
      '--mt-text':      '#e8c060',
      '--mt-text-hi':   '#f0d090',
      '--mt-accent':    '#c8a020',
      '--mt-highlight': '#f0a010',
      '--mt-positive':  '#c89030',
      '--mt-negative':  '#c83010',
      '--mt-planet-t1': '#7a5530',
      '--mt-planet-t2': '#a87828',
      '--mt-planet-t3': '#d09a18',
      '--mt-planet-t4': '#f5c815',
    },
  };

  let settings = Object.assign({}, SETTINGS_DEFAULTS);

  function loadSettings(cb) {
    chrome.storage.local.get(SETTINGS_STORE, function (result) {
      settings = Object.assign({}, SETTINGS_DEFAULTS, result[SETTINGS_STORE] || {});
      if (cb) cb();
    });
  }

  function injectThemeVars(tokens, themeName) {
    var old = document.getElementById('mt-theme-vars');
    if (old) old.remove();
    if (!tokens) return;
    var selector = 'html[data-mt-theme="' + themeName + '"]';
    var vars = Object.keys(tokens).map(function(k) {
      return '  ' + k + ': ' + tokens[k] + ';';
    }).join('\n');
    var style = document.createElement('style');
    style.id = 'mt-theme-vars';
    style.textContent = selector + ' {\n' + vars + '\n}';
    (document.head || document.documentElement).appendChild(style);
  }

  function applyTheme(name) {
    var old = document.getElementById('mt-theme-vars');
    if (old) old.remove();
    if (!name || name === 'mocha') {
      delete document.documentElement.dataset.mtTheme;
      return;
    }
    document.documentElement.dataset.mtTheme = name;
    // Built-in themes have their tokens in style.css — only inject for custom themes
    if (!THEME_PRESETS[name]) {
      var tokens = name === 'custom' ? settings.customTheme : null;
      if (tokens) injectThemeVars(tokens, name);
    }
  }

  function applyFont(name) {
    if (name && name !== 'default') {
      document.documentElement.dataset.mtFont = name;
    } else {
      delete document.documentElement.dataset.mtFont;
    }
  }

  function saveSetting(key, value) {
    settings[key] = value;
    chrome.storage.local.get(SETTINGS_STORE, function (result) {
      const s = Object.assign({}, result[SETTINGS_STORE] || {});
      s[key] = value;
      chrome.storage.local.set({ [SETTINGS_STORE]: s });
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  function matIdFromUrl() {
    return window.location.pathname.match(/\/exchange\/(\d+)/)?.[1] ?? null;
  }

  function materialName() {
    const use = document.querySelector('div.row.align-items-center.g-2.lh-xs svg use');
    const href = use?.getAttribute('xlink:href') || use?.getAttribute('href') || '';
    return href.split('#')[1] ?? null;
  }

  function noteKey() {
    return NOTE_PREFIX + (matIdFromUrl() ?? 'x');
  }

  function fmtCents(cents) {
    return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '$';
  }

  function fmtDate(iso) {
    return iso ? iso.slice(0, 10) : '—';
  }

  function makeBtn(text, extraClass) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mt-btn' + (extraClass ? ' ' + extraClass : '');
    btn.textContent = text;
    return btn;
  }

  function makeEl(tag, cls, text) {
    const el = document.createElement(tag);
    if (cls)  el.className   = cls;
    if (text) el.textContent = text;
    return el;
  }

  // ── Note display ───────────────────────────────────────────────────────────

  function updateNoteDisplay(text) {
    const display = document.querySelector('.mt-exchange-note');
    if (!display) return;
    const textEl = display.querySelector('.mt-exchange-note-text');
    if (textEl) textEl.textContent = text || '';
    display.style.display = text ? 'flex' : 'none';
  }

  function refreshNoteState(btn) {
    const key = noteKey();
    chrome.storage.local.get(key, function (result) {
      const text = result[key] || '';
      btn.classList.toggle('mt-note-btn--active', !!text);
      updateNoteDisplay(text);
    });
  }

  // ── Modal base ─────────────────────────────────────────────────────────────

  function closeModal() {
    if (activeModal) { activeModal.remove(); activeModal = null; }
  }

  function makeModal(title, width) {
    closeModal();
    const modal = document.createElement('div');
    modal.className = 'mt-modal';
    if (width) modal.style.width = width + 'px';

    const header   = makeEl('div', 'mt-modal-header');
    const titleEl  = makeEl('span', 'mt-modal-title', title);
    const closeBtn = makeEl('button', 'mt-modal-close', '✕');
    closeBtn.setAttribute('aria-label', 'Close');
    header.append(titleEl, closeBtn);

    const body = makeEl('div', 'mt-modal-body');
    modal.append(header, body);
    document.body.appendChild(modal);
    activeModal = modal;
    closeBtn.onclick = closeModal;
    return modal;
  }

  function positionModal(modal, anchorEl) {
    const anchor = anchorEl.getBoundingClientRect();
    modal.style.left = (anchor.right - parseInt(modal.style.width || 270)) + 'px';
    modal.style.top  = (anchor.bottom + 6) + 'px';
    requestAnimationFrame(function () {
      const r = modal.getBoundingClientRect();
      if (r.bottom > window.innerHeight - 8)
        modal.style.top = (anchor.top - r.height - 6) + 'px';
      if (r.left < 8)
        modal.style.left = '8px';
    });
  }

  // ── Note modal ─────────────────────────────────────────────────────────────

  function showNoteModal(btn) {
    const key  = noteKey();
    const name = materialName() ?? ('Mat #' + (matIdFromUrl() ?? '?'));
    const modal = makeModal(name, 270);
    positionModal(modal, btn);

    chrome.storage.local.get(key, function (stored) {
      const existing = stored[key] || '';
      const body = modal.querySelector('.mt-modal-body');

      const ta = makeEl('textarea', 'mt-modal-ta');
      ta.placeholder = 'Add a note...';
      ta.value = existing;

      const footer  = makeEl('div', 'mt-modal-footer');
      const saveBtn = makeBtn('Save', 'mt-save');
      footer.appendChild(saveBtn);
      const delBtn = existing ? makeBtn('Delete', 'mt-delete') : null;
      if (delBtn) footer.appendChild(delBtn);
      const cancelBtn = makeBtn('Cancel', 'mt-cancel');
      footer.appendChild(cancelBtn);

      body.append(ta, footer);
      ta.focus();

      saveBtn.onclick = function () {
        const text = ta.value.trim();
        if (text) {
          chrome.storage.local.set({ [key]: text }, function () {
            btn.classList.add('mt-note-btn--active');
            updateNoteDisplay(text);
            closeModal();
          });
        } else {
          chrome.storage.local.remove(key, function () {
            btn.classList.remove('mt-note-btn--active');
            updateNoteDisplay('');
            closeModal();
          });
        }
      };

      if (delBtn) {
        delBtn.onclick = function () {
          chrome.storage.local.remove(key, function () {
            btn.classList.remove('mt-note-btn--active');
            updateNoteDisplay('');
            closeModal();
          });
        };
      }

      cancelBtn.onclick = closeModal;
    });
  }

  // ── Ledger modal ───────────────────────────────────────────────────────────

  function showLedgerModal(btn) {
    const matId = matIdFromUrl();
    if (!matId) return;
    const name = materialName() ?? ('Mat #' + matId);

    chrome.storage.local.get(API_KEY_STORE, function (result) {
      const apiKey = result[API_KEY_STORE];
      const modal  = makeModal(name + ' — Ledger', 420);
      positionModal(modal, btn);
      const body = modal.querySelector('.mt-modal-body');

      if (!apiKey) {
        body.appendChild(makeEl('div', 'mt-ledger-empty', 'No API key set. Add one in the MantiTech section of Settings.'));
        return;
      }

      body.appendChild(makeEl('div', 'mt-ledger-loading', 'Loading…'));

      fetch(API_BASE + '/public/company/cash-history', {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        const list = Array.isArray(data) ? data
                       : Array.isArray(data.items)   ? data.items
                       : Array.isArray(data.history)  ? data.history
                       : Array.isArray(data.entries)  ? data.entries
                       : Array.isArray(data.logs)     ? data.logs
                       : [];

        const entries = list
          .filter(function (e) { return String(e.matId) === matId; })
          .sort(function (a, b) { return b.date > a.date ? 1 : -1; });

        body.textContent = '';

        if (!entries.length) {
          body.appendChild(makeEl('div', 'mt-ledger-empty', 'No buy/sell history for this material.'));
          return;
        }

        const table = makeEl('table', 'mt-ledger-table');
        const thead = table.createTHead();
        const hrow  = thead.insertRow();
        [['Date',''],['Type',''],['Qty','text-end'],['Unit','text-end'],['Total','text-end'],['Party','']].forEach(function (col) {
          const th = document.createElement('th');
          th.textContent = col[0];
          if (col[1]) th.className = col[1];
          hrow.appendChild(th);
        });

        const tbody = table.createTBody();
        entries.forEach(function (e) {
          const isBuy = e.unitPrice < 0;
          const row   = tbody.insertRow();
          function addCell(text, cls) {
            const td = row.insertCell();
            td.textContent = text;
            if (cls) td.className = cls;
          }
          addCell(fmtDate(e.date));
          addCell(isBuy ? 'Buy' : 'Sell', isBuy ? 'mt-buy' : 'mt-sell');
          addCell(e.quantity.toLocaleString(), 'text-end');
          addCell(fmtCents(Math.abs(e.unitPrice)), 'text-end');
          addCell(fmtCents(Math.abs(e.unitPrice) * e.quantity), 'text-end');
          addCell(e.otherCompany?.name ?? '—');
        });

        body.appendChild(table);
      })
      .catch(function (err) {
        body.textContent = '';
        body.appendChild(makeEl('div', 'mt-ledger-empty', 'Error: ' + String(err)));
      });
    });
  }

  // ── Chat scroll indicator ─────────────────────────────────────────────────

  function setupScrollIndicators() {
    if (!settings.scrollIndicator) return;

    document.querySelectorAll('.card-body.overflow-auto').forEach(function (body) {
      if (body.dataset.mtScrollSetup) return;
      body.dataset.mtScrollSetup = '1';

      const bar = document.createElement('button');
      bar.type = 'button';
      bar.className = 'mt-scroll-bar';
      bar.textContent = '↓ Scroll to latest';
      bar.hidden = true;

      const footer = body.closest('.card')?.querySelector('.card-footer');
      if (footer) footer.before(bar);
      else body.after(bar);

      function atBottom() {
        return body.scrollHeight - body.scrollTop - body.clientHeight < 60;
      }

      let showTimer = null;

      function update() {
        if (atBottom()) {
          clearTimeout(showTimer);
          showTimer = null;
          bar.hidden = true;
        } else if (!showTimer) {
          showTimer = setTimeout(function () {
            showTimer = null;
            if (!atBottom()) bar.hidden = false;
          }, 750);
        }
      }

      body.addEventListener('scroll', update, { passive: true });
      new MutationObserver(update).observe(body, { childList: true });

      bar.addEventListener('click', function () {
        body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' });
      });

      update();
    });
  }

  // ── Chat link linkifier ────────────────────────────────────────────────────

  const URL_RE = /(https?:\/\/[^\s<>"]+)/g;

  function youtubeVideoId(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'youtu.be') return u.pathname.slice(1).split(/[?&#]/)[0] || null;
      if (u.hostname === 'youtube.com' || u.hostname === 'www.youtube.com') {
        if (u.pathname === '/watch') return u.searchParams.get('v');
        const shorts = u.pathname.match(/^\/(shorts|embed)\/([^/?#]+)/);
        if (shorts) return shorts[2];
      }
    } catch (e) {}
    return null;
  }

  function sunoSongId(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'suno.com' || u.hostname === 'www.suno.com') {
        const m = u.pathname.match(/^\/song\/([^/?#]+)/);
        if (m) return m[1];
      }
    } catch (e) {}
    return null;
  }

  function sunoShortUrl(url) {
    try {
      const u = new URL(url);
      if (u.hostname === 'suno.com' || u.hostname === 'www.suno.com') {
        const m = u.pathname.match(/^\/s\/([^/?#]+)/);
        if (m) return true;
      }
    } catch (e) {}
    return false;
  }

  function insertSunoPreview(songId, a) {
    const wrap = document.createElement('div');
    wrap.className = 'mt-suno-preview';

    const thumb = document.createElement('img');
    thumb.className = 'mt-suno-thumb';
    thumb.src = 'https://cdn2.suno.ai/image_' + songId + '.jpeg';
    thumb.alt = '';
    thumb.onerror = function () {
      thumb.style.display = 'none';
      wrap.classList.add('mt-suno-preview--no-thumb');
    };

    const play = document.createElement('div');
    play.className = 'mt-yt-play';
    play.innerHTML =
      '<svg viewBox="0 0 68 48" width="52" height="36">' +
        '<rect width="68" height="48" rx="10" fill="rgba(0,0,0,0.65)"/>' +
        '<polygon points="26,14 26,34 48,24" fill="#fff"/>' +
      '</svg>';

    wrap.append(thumb, play);
    wrap.addEventListener('click', function () {
      const iframe = document.createElement('iframe');
      iframe.className = 'mt-suno-iframe';
      iframe.src = 'https://suno.com/embed/' + songId;
      iframe.allow = 'autoplay; encrypted-media';
      iframe.allowFullscreen = true;
      wrap.replaceWith(iframe);
    });

    a.insertAdjacentElement('afterend', wrap);
  }

  function insertSunoPlaceholder(url, a) {
    const wrap = document.createElement('a');
    wrap.href      = url;
    wrap.target    = '_blank';
    wrap.rel       = 'noopener noreferrer';
    wrap.className = 'mt-suno-placeholder';
    wrap.innerHTML =
      '<svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor" aria-hidden="true">' +
        '<path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/>' +
      '</svg>' +
      '<span>Suno share link — cannot embed. Click to open song.</span>';
    a.insertAdjacentElement('afterend', wrap);
  }

  function insertYouTubePreview(videoId, a) {
    const wrap = document.createElement('div');
    wrap.className = 'mt-yt-preview';

    const thumb = document.createElement('img');
    thumb.className = 'mt-yt-thumb';
    thumb.src = 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
    thumb.alt = '';

    const play = document.createElement('div');
    play.className = 'mt-yt-play';
    play.innerHTML =
      '<svg viewBox="0 0 68 48" width="52" height="36">' +
        '<rect width="68" height="48" rx="10" fill="rgba(0,0,0,0.65)"/>' +
        '<polygon points="26,14 26,34 48,24" fill="#fff"/>' +
      '</svg>';

    wrap.append(thumb, play);
    wrap.addEventListener('click', function () {
      const iframe = document.createElement('iframe');
      iframe.className = 'mt-yt-iframe';
      iframe.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1';
      iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
      iframe.allowFullscreen = true;
      wrap.replaceWith(iframe);
    });

    a.insertAdjacentElement('afterend', wrap);
  }

  // ── Lightbox ───────────────────────────────────────────────────────────────

  let lightbox = null;

  function closeLightbox() {
    if (lightbox) { lightbox.remove(); lightbox = null; }
  }

  function openLightbox(src) {
    closeLightbox();
    lightbox = document.createElement('div');
    lightbox.className = 'mt-lightbox';
    const img = document.createElement('img');
    img.className = 'mt-lightbox-img';
    img.src = src;
    img.addEventListener('click', function (e) { e.stopPropagation(); });
    lightbox.appendChild(img);
    lightbox.addEventListener('click', closeLightbox);
    document.body.appendChild(lightbox);
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeLightbox(); closeTenorPicker(); closeEmojiPicker(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Tab') return;
    const activeSuggestion = document.querySelector('li[data-suggestion-index].active');
    if (!activeSuggestion) return;
    e.preventDefault();
    activeSuggestion.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }));
  }, true);

  // ── Image probe ────────────────────────────────────────────────────────────

  function probeImage(url, a) {
    const img = document.createElement('img');
    img.className = 'mt-chat-img';
    img.alt = '';
    img.style.display = 'none';

    const scrollBody = a.closest('.card-body.overflow-auto');
    const wasAtBottom = scrollBody &&
      (scrollBody.scrollHeight - scrollBody.scrollTop - scrollBody.clientHeight < 60);

    img.onload = function () {
      img.style.display = '';
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function () { openLightbox(url); });
      if (wasAtBottom) scrollBody.scrollTo({ top: scrollBody.scrollHeight, behavior: 'smooth' });
    };
    img.onerror = function () { img.remove(); };
    img.src = url;
    a.insertAdjacentElement('afterend', img);
  }

  function linkifyEl(el) {
    Array.from(el.childNodes).forEach(function (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        linkifyNode(node);
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName !== 'A' && node.getAttribute('role') !== 'button') {
        linkifyEl(node);
      }
    });
  }

  function linkifyNode(textNode) {
    const text = textNode.nodeValue;
    if (!URL_RE.test(text)) return;
    URL_RE.lastIndex = 0;

    const frag = document.createDocumentFragment();
    let last = 0, m;
    while ((m = URL_RE.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const a = document.createElement('a');
      a.href = m[0];
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.className = 'mt-chat-link';
      a.textContent = m[0];
      frag.appendChild(a);

      const _ytId      = youtubeVideoId(m[0]);
      const _sunoId    = !_ytId && sunoSongId(m[0]);
      const _sunoShort = !_ytId && !_sunoId && sunoShortUrl(m[0]);
      if (_ytId && settings.ytSunoPreviews) {
        requestAnimationFrame((function (id, el) { return function () { insertYouTubePreview(id, el); }; }(_ytId, a)));
      } else if (_sunoId && settings.ytSunoPreviews) {
        requestAnimationFrame((function (id, el) { return function () { insertSunoPreview(id, el); }; }(_sunoId, a)));
      } else if (_sunoShort && settings.ytSunoPreviews) {
        requestAnimationFrame((function (url, el) { return function () { insertSunoPlaceholder(url, el); }; }(m[0], a)));
      } else if (!_ytId && !_sunoId && !_sunoShort && settings.inlineImages) {
        requestAnimationFrame(function () { probeImage(a.href, a); });
      }

      last = m.index + m[0].length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  }

  function linkifyMessages() {
    document.querySelectorAll('.com-msg:not([data-mt-linked])').forEach(function (msg) {
      msg.dataset.mtLinked = '1';
      linkifyEl(msg);
    });
  }

  function linkifyGuildContent() {
    if (!settings.guildContent) return;
    document.querySelectorAll('.text-break.text-body-tertiary-solid:not([data-mt-linked])').forEach(function (el) {
      el.dataset.mtLinked = '1';
      linkifyEl(el);
    });
  }

  // ── GIF picker slash commands (/giphy, /klipy, /tenor) ─────────────────────

  const GIPHY_KEY_STORE       = 'mt_giphy_api_key';
  const KLIPY_KEY_STORE       = 'mt_klipy_api_key';
  const KLIPY_CUSTOMER_STORE  = 'mt_klipy_customer_id';
  let tenorPicker   = null;
  let tenorDebounce = null;

  function closeTenorPicker() {
    if (tenorPicker) { tenorPicker.remove(); tenorPicker = null; }
  }

  function positionTenorPicker(picker, input) {
    const r = input.getBoundingClientRect();
    picker.style.left   = r.left + 'px';
    picker.style.width  = r.width + 'px';
    picker.style.bottom = (window.innerHeight - r.top + 6) + 'px';
  }

  function getKlipyCustomerId(cb) {
    chrome.storage.local.get(KLIPY_CUSTOMER_STORE, function (result) {
      if (result[KLIPY_CUSTOMER_STORE]) { cb(result[KLIPY_CUSTOMER_STORE]); return; }
      const id = crypto.randomUUID();
      chrome.storage.local.set({ [KLIPY_CUSTOMER_STORE]: id }, function () { cb(id); });
    });
  }

  function showGifPicker(input, query, command) {
    closeTenorPicker();
    if (!query.trim()) return;

    const picker = document.createElement('div');
    picker.className = 'mt-tenor-picker';
    document.body.appendChild(picker);
    tenorPicker = picker;
    positionTenorPicker(picker, input);

    if (command === 'tenor') {
      const warning = document.createElement('div');
      warning.className = 'mt-tenor-deprecation-warning';
      warning.textContent = 'Tenor is deprecated, use giphy or klipy. Go to settings to input your API key(s)';
      picker.appendChild(warning);
      return;
    }

    const keyStore = command === 'giphy' ? GIPHY_KEY_STORE : KLIPY_KEY_STORE;

    chrome.storage.local.get(keyStore, function (result) {
      const apiKey = result[keyStore];
      if (!apiKey) {
        const empty = document.createElement('div');
        empty.className = 'mt-tenor-deprecation-warning';
        empty.textContent = 'No ' + (command === 'giphy' ? 'GIPHY' : 'KLIPY') + ' API key set. Add one in Settings.';
        picker.appendChild(empty);
        return;
      }

      const resultsWrap = document.createElement('div');
      picker.appendChild(resultsWrap);

      let grid           = null;
      let isLoading      = false;
      let more           = true;
      let giphyOffset    = 0;
      let giphyTotal     = Infinity;
      let klipyPage      = 1;
      let klipyCustomer  = null;

      function appendResults(items) {
        items.forEach(function (item) {
          if (!item.url) return;
          const img = document.createElement('img');
          img.className = 'mt-tenor-thumb';
          img.src = item.thumb;
          img.alt = item.alt;
          img.addEventListener('click', function () {
            input.value = input.value.replace(new RegExp('\\/' + command + '\\s+.+$'), item.url);
            input.dispatchEvent(new Event('input', { bubbles: true }));
            closeTenorPicker();
            input.focus();
          });
          grid.appendChild(img);
        });
      }

      function handlePage(data) {
        isLoading = false;
        let items;
        if (command === 'giphy') {
          items = (data.data || []).map(function (r) {
            return { url: r.images?.original?.url, thumb: r.images?.fixed_height_small?.url || r.images?.original?.url, alt: r.title || '' };
          });
          giphyTotal  = data.pagination?.total_count ?? giphyTotal;
          giphyOffset += (data.data ? data.data.length : 0);
          more = giphyOffset < giphyTotal;
        } else {
          const d    = data.data || {};
          const list = d.data || [];
          items = list.map(function (r) {
            const f    = r.file || {};
            const full = f.hd?.gif?.url || f.md?.gif?.url;
            return { url: full, thumb: f.sm?.gif?.url || f.xs?.gif?.url || full, alt: r.title || '' };
          });
          klipyPage += 1;
          more = !!d.has_next;
        }

        if (!grid) {
          resultsWrap.textContent = '';
          if (!items.length) { resultsWrap.textContent = 'No results.'; return; }
          grid = document.createElement('div');
          grid.className = 'mt-tenor-grid';
          resultsWrap.appendChild(grid);
        }
        appendResults(items);
      }

      function onError() {
        isLoading = false;
        if (!grid) resultsWrap.textContent = 'Error loading GIFs.';
      }

      function fetchPage() {
        if (isLoading || !more) return;
        isLoading = true;
        const url = command === 'giphy'
          ? 'https://api.giphy.com/v1/gifs/search?q=' + encodeURIComponent(query) +
            '&api_key=' + encodeURIComponent(apiKey) + '&limit=16&offset=' + giphyOffset
          : 'https://api.klipy.com/api/v1/' + encodeURIComponent(apiKey) + '/gifs/search?page=' + klipyPage +
            '&per_page=16&q=' + encodeURIComponent(query) + '&customer_id=' + encodeURIComponent(klipyCustomer);
        fetch(url).then(function (r) { return r.json(); }).then(handlePage).catch(onError);
      }

      picker.addEventListener('scroll', function () {
        if (more && picker.scrollTop + picker.clientHeight >= picker.scrollHeight - 60) fetchPage();
      });

      if (command === 'klipy') {
        getKlipyCustomerId(function (id) { klipyCustomer = id; fetchPage(); });
      } else {
        fetchPage();
      }
    });
  }

  function setupTenorInput(input) {
    if (input.dataset.mtTenorSetup) return;
    input.dataset.mtTenorSetup = '1';
    if (!settings.gifPicker) return;
    input.addEventListener('input', function () {
      clearTimeout(tenorDebounce);
      const m = input.value.match(/\/(tenor|giphy|klipy)\s+(.+)$/);
      if (!m) { closeTenorPicker(); return; }
      const command = m[1];
      const query   = m[2];
      tenorDebounce = setTimeout(function () { showGifPicker(input, query, command); }, 400);
    });
  }

  function setupTenorInputs() {
    document.querySelectorAll('textarea, input[type="text"]').forEach(setupTenorInput);
  }

  // ── Emoji picker ─────────────────────────────────────────────────────────

  let emojiPickerEl     = null;
  let emojiPickerTarget = null;

  function closeEmojiPicker() {
    if (emojiPickerEl) { emojiPickerEl.remove(); emojiPickerEl = null; emojiPickerTarget = null; }
  }

  function setupEmojiPicker(textarea) {
    if (textarea.dataset.mtEmojiSetup) return;
    textarea.dataset.mtEmojiSetup = '1';
    if (!settings.emojiPicker) return;

    const next    = textarea.nextElementSibling;
    const sendBtn = next?.tagName === 'BUTTON' ? next : next?.querySelector('button');
    if (!sendBtn) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-square mt-emoji-btn';
    btn.title = 'Emoji';
    btn.textContent = '🙂';

    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (emojiPickerEl && emojiPickerTarget === textarea) { closeEmojiPicker(); return; }
      closeEmojiPicker();

      const picker = document.createElement('emoji-picker');
      const rect = btn.getBoundingClientRect();
      picker.style.cssText =
        'position:fixed;z-index:999999;' +
        'bottom:' + (window.innerHeight - rect.top + 6) + 'px;' +
        'left:' + Math.max(4, rect.right - 350) + 'px;';
      var cs = getComputedStyle(document.documentElement);
      var g = function(v) { return cs.getPropertyValue(v).trim(); };
      var epVars = {
        '--background':                   g('--mt-bg-base'),
        '--border-color':                 g('--mt-surface1'),
        '--button-hover-background':      g('--mt-surface0'),
        '--text-color':                   g('--mt-text'),
        '--input-border-color':           g('--mt-surface1'),
        '--input-font-color':             g('--mt-text'),
        '--input-placeholder-color':      g('--mt-overlay0'),
        '--outline-color':                g('--mt-accent'),
        '--category-button-active-color': g('--mt-accent'),
        '--emoji-size':                   '1.5rem',
        '--num-columns':                  '8',
      };
      Object.keys(epVars).forEach(function(prop) {
        picker.style.setProperty(prop, epVars[prop]);
      });

      picker.addEventListener('emoji-click', function (ev) {
        const unicode = ev.detail.unicode;
        if (!unicode) return;
        const s = textarea.selectionStart, end = textarea.selectionEnd;
        textarea.value = textarea.value.slice(0, s) + unicode + textarea.value.slice(end);
        textarea.selectionStart = textarea.selectionEnd = s + unicode.length;
        textarea.dispatchEvent(new InputEvent('input', { bubbles: true }));
        textarea.focus();
        closeEmojiPicker();
      });

      document.body.appendChild(picker);
      emojiPickerEl     = picker;
      emojiPickerTarget = textarea;
    });

    sendBtn.insertAdjacentElement('beforebegin', btn);

    const bh = sendBtn.offsetHeight;
    const bw = sendBtn.offsetWidth;
    if (bh > 0) { btn.style.width = bw + 'px'; btn.style.height = bh + 'px'; }
  }

  function setupEmojiPickers() {
    document.querySelectorAll('textarea[name="msg"]').forEach(setupEmojiPicker);
  }

  // ── Wishlist copy ──────────────────────────────────────────────────────────

  function setupWishlistCopy() {
    if (!settings.wishlistCopy) return;
    const editBtn = document.querySelector('[data-popup-id="editWishlistExchange"]:not([data-mt-wishlist-setup])');
    if (!editBtn) return;
    editBtn.dataset.mtWishlistSetup = '1';

    const copyBtn = document.createElement('button');
    copyBtn.type = 'button';
    copyBtn.className = editBtn.className;
    copyBtn.title = 'Copy wishlist to clipboard';
    copyBtn.innerHTML =
      '<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true">' +
        '<path d="M10 0H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1V1a1 1 0 0 0-1-1zm0 11H3V1h7v10z"/>' +
        '<path d="M13 3v11H5v1h8a1 1 0 0 0 1-1V3h-1z"/>' +
      '</svg>';

    copyBtn.addEventListener('click', function () {
      const container = editBtn.closest('.card') || document.body;
      const rows = container.querySelectorAll('tr[role="button"]');
      const lines = [];
      rows.forEach(function (row) {
        const cells = row.querySelectorAll('td');
        if (cells.length < 2) return;
        const qtyInput = cells[1].querySelector('input[type="number"]');
        if (!qtyInput) return;
        const qty = qtyInput.value.trim();
        const name = Array.from(cells[0].childNodes)
          .filter(function (n) { return n.nodeType === Node.TEXT_NODE; })
          .map(function (n) { return n.textContent.trim(); })
          .filter(Boolean)
          .join('');
        if (name && qty) lines.push(':' + name + '; x' + qty);
      });
      if (!lines.length) return;
      const titleEl = container.querySelector('.dropdown-toggle .text-truncate');
      const title = titleEl ? titleEl.textContent.trim() : '';
      const text = (title ? title + '\n' : '') + lines.join('\n');
      navigator.clipboard.writeText(text)
        .then(function () {
          const rect = copyBtn.getBoundingClientRect();
          const toast = document.createElement('div');
          toast.className = 'mt-copy-toast';
          toast.textContent = 'Copied!';
          toast.style.left = (rect.left + rect.width / 2) + 'px';
          toast.style.top  = (rect.top - 8) + 'px';
          document.body.appendChild(toast);
          toast.addEventListener('animationend', function () { toast.remove(); });
        })
        .catch(function () {});
    });

    editBtn.insertAdjacentElement('afterend', copyBtn);
  }

  // ── My Offers cheapest indicator ──────────────────────────────────────────

  function refreshMarketPrices(table, btn) {
    chrome.storage.local.get(API_KEY_STORE, function (result) {
      const apiKey = result[API_KEY_STORE];
      if (!apiKey) {
        table.querySelectorAll('.mt-market-cell').forEach(function (td) {
          td.textContent = 'no key';
          td.className = 'mt-market-cell text-body-tertiary small';
        });
        return;
      }

      if (btn) btn.disabled = true;
      table.querySelectorAll('.mt-market-cell').forEach(function (td) {
        td.textContent = '…';
        td.className = 'mt-market-cell';
      });
      table.querySelectorAll('.mt-lowest-cell').forEach(function (td) { td.textContent = ''; });

      fetch(API_BASE + '/public/exchange/mat-prices', {
        headers: { 'Authorization': 'Bearer ' + apiKey }
      })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (data) {
        if (btn) btn.disabled = false;
        const arr = Array.isArray(data) ? data : (data.prices || data.materials || []);
        const priceMap = {};
        arr.forEach(function (item) {
          if (item.matName) priceMap[item.matName.toLowerCase()] = item.currentPrice;
        });
        marketPriceCache = { ts: new Date(), prices: priceMap };

        table.querySelectorAll('tbody tr').forEach(function (row) {
          const marketTd = row.querySelector('.mt-market-cell');
          if (!marketTd) return;

          const matName = (row.querySelector('td span')?.textContent || '').trim().toLowerCase();
          if (!matName) { marketTd.textContent = '—'; return; }

          const cells = row.querySelectorAll('td');
          const userPrice = parseFloat((cells[2]?.textContent || '0').replace(/[$,\s]/g, '')) || 0;

          const marketCents = priceMap[matName];
          if (marketCents === undefined) {
            marketTd.textContent = '—';
            marketTd.className = 'mt-market-cell';
            return;
          }

          const marketDollars = marketCents / 100;
          marketTd.textContent = fmtCents(marketCents);
          marketTd.className = 'mt-market-cell';

          const lowestTd = row.querySelector('.mt-lowest-cell');
          if (lowestTd) lowestTd.textContent = userPrice === marketDollars ? '✅' : '';
        });
      })
      .catch(function () {
        if (btn) btn.disabled = false;
        table.querySelectorAll('.mt-market-cell').forEach(function (td) {
          td.textContent = '—';
          td.className = 'mt-market-cell';
        });
        table.querySelectorAll('.mt-lowest-cell').forEach(function (td) { td.textContent = ''; });
      });
    });
  }

  function setupMyOffers() {
    if (!settings.cheapestIndicator) return;

    const myOffersTab = document.querySelector('button[data-tab="myoffers"].active');
    if (!myOffersTab) return;

    const card = myOffersTab.closest('.card');
    if (!card) return;

    const table = card.querySelector('table');
    if (!table || table.dataset.mtOffersSetup) return;
    table.dataset.mtOffersSetup = '1';

    const priceUnitTh = table.querySelector('thead tr')?.querySelectorAll('th')[2];
    if (!priceUnitTh) return;

    const marketTh = document.createElement('th');
    marketTh.className = 'col';
    marketTh.textContent = 'Market';
    priceUnitTh.insertAdjacentElement('afterend', marketTh);

    const lowestTh = document.createElement('th');
    lowestTh.className = 'col';
    lowestTh.textContent = 'Lowest';
    marketTh.insertAdjacentElement('afterend', lowestTh);

    table.querySelectorAll('tbody tr').forEach(function (row) {
      const cells = row.querySelectorAll('td');
      if (cells.length < 3) return;
      const marketTd = document.createElement('td');
      marketTd.className = 'mt-market-cell';
      marketTd.textContent = '—';
      cells[2].insertAdjacentElement('afterend', marketTd);
      const lowestTd = document.createElement('td');
      lowestTd.className = 'mt-lowest-cell';
      marketTd.insertAdjacentElement('afterend', lowestTd);
    });

    const cardBody = card.querySelector('.card-body');
    const offerHeader = cardBody?.querySelector('.d-flex.justify-content-between');
    if (!offerHeader) return;

    const refreshBtn = document.createElement('button');
    refreshBtn.type = 'button';
    refreshBtn.className = 'btn btn-sm btn-secondary btn-square';
    refreshBtn.title = 'Refresh exchange prices';
    refreshBtn.innerHTML =
      '<svg viewBox="0 0 16 16" fill="currentColor" width="12" height="12" aria-hidden="true">' +
        '<path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/>' +
        '<path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466z"/>' +
      '</svg>';
    refreshBtn.addEventListener('click', function () { refreshMarketPrices(table, refreshBtn); });

    offerHeader.appendChild(refreshBtn);
  }

  // ── Exchange info box ─────────────────────────────────────────────────────

  function setupExchangeInfoBox() {
    if (!matIdFromUrl()) return;

    const headerRow = document.querySelector('div.row.align-items-center.g-2.lh-xs');
    if (!headerRow) return;
    const boxSection = headerRow.closest('.box-section');
    if (!boxSection) return;

    // ── Phase 1: build box structure once ──
    if (!boxSection.dataset.mtInfoBoxSetup) {
      boxSection.dataset.mtInfoBoxSetup = '1';

      const box = document.createElement('div');
      box.className = 'mt-exchange-info';

      // Top row: price stats left, action buttons right
      const topRow = document.createElement('div');
      topRow.className = 'mt-exchange-top';

      const pricesDiv = document.createElement('div');
      pricesDiv.className = 'mt-exchange-prices';
      ['Max', 'Min'].forEach(function (label) {
        const stat = document.createElement('div');
        stat.className = 'mt-price-stat';
        const labelEl = document.createElement('span');
        labelEl.className = 'mt-price-label';
        labelEl.textContent = label;
        const valEl = document.createElement('span');
        valEl.className = 'mt-price-val';
        valEl.textContent = '—';
        stat.append(labelEl, valEl);
        pricesDiv.appendChild(stat);
      });
      topRow.appendChild(pricesDiv);

      const actionsDiv = document.createElement('div');
      actionsDiv.className = 'mt-exchange-actions';

      if (settings.materialNotes) {
        const noteBtn = document.createElement('button');
        noteBtn.type = 'button';
        noteBtn.className = 'mt-exchange-btn mt-note-btn';
        noteBtn.title = 'Material note';
        noteBtn.innerHTML =
          '<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true">' +
            '<path d="M1 11.5V15h3.5l7-7L8 4.5l-7 7zm13.7-7.2a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0L9.2 1.8l4 4 1.5-1.5z"/>' +
          '</svg>';
        noteBtn.addEventListener('click', function (e) { e.stopPropagation(); showNoteModal(noteBtn); });
        actionsDiv.appendChild(noteBtn);
        refreshNoteState(noteBtn);
      }

      if (settings.ledger) {
        const ledgerBtn = document.createElement('button');
        ledgerBtn.type = 'button';
        ledgerBtn.className = 'mt-exchange-btn mt-ledger-btn';
        ledgerBtn.title = 'Buy/sell ledger';
        ledgerBtn.innerHTML =
          '<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true">' +
            '<path d="M2 2h12v1.5H2V2zm0 3.5h12V7H2V5.5zm0 3.5h12v1.5H2V9zm0 3.5h7V14H2v-1.5z"/>' +
          '</svg>';
        ledgerBtn.addEventListener('click', function (e) { e.stopPropagation(); showLedgerModal(ledgerBtn); });
        actionsDiv.appendChild(ledgerBtn);
      }

      topRow.appendChild(actionsDiv);
      box.appendChild(topRow);

      const noteEl = document.createElement('div');
      noteEl.className = 'mt-exchange-note';
      noteEl.style.display = 'none';
      const noteLabelEl = document.createElement('span');
      noteLabelEl.className = 'mt-price-label';
      noteLabelEl.textContent = 'Notes';
      const noteDivider = document.createElement('hr');
      noteDivider.className = 'mt-exchange-note-hr';
      const noteTextEl = document.createElement('div');
      noteTextEl.className = 'mt-exchange-note-text';
      noteEl.append(noteLabelEl, noteDivider, noteTextEl);
      noteEl.addEventListener('click', function () {
        const btn = box.querySelector('.mt-note-btn');
        if (btn) showNoteModal(btn);
      });
      box.appendChild(noteEl);

      boxSection.insertAdjacentElement('afterend', box);
    }

    // ── Phase 2: wire price stats once #inputPrice is available ──
    const inputPrice = document.querySelector('#inputPrice');
    if (!inputPrice || inputPrice.dataset.mtPriceStatsSetup) return;
    inputPrice.dataset.mtPriceStatsSetup = '1';

    const box = document.querySelector('.mt-exchange-info');
    if (!box) return;

    const priceVals = box.querySelectorAll('.mt-price-val');
    const maxValEl  = priceVals[0] || null;
    const minValEl  = priceVals[1] || null;

    function formatPriceVal(el, value) {
      if (!el) return;
      el.textContent = '';
      if (isNaN(value)) { el.textContent = '—'; return; }
      const parts = value.toFixed(2).split('.');
      el.textContent = parts[0];
      const dec = document.createElement('small');
      dec.textContent = '.' + parts[1];
      const unit = document.createElement('small');
      unit.className = 'opacity-50';
      unit.textContent = '$';
      el.append(dec, unit);
    }

    function updatePriceStats() {
      formatPriceVal(maxValEl, parseFloat(inputPrice.getAttribute('max')));
      formatPriceVal(minValEl, parseFloat(inputPrice.getAttribute('min')));
    }

    updatePriceStats();
    new MutationObserver(updatePriceStats).observe(inputPrice, {
      attributes: true, attributeFilter: ['min', 'max']
    });

    // Min/Max quick-fill buttons inside the price input-group
    const inputGroup = inputPrice.closest('.input-group');
    const inputGroupText = inputGroup?.querySelector('.input-group-text');
    if (inputGroupText && !inputGroup.querySelector('.mt-price-btns')) {
      const btnGroup = document.createElement('div');
      btnGroup.className = 'btn-group btn-group-sm mt-price-btns';
      [['Min', 'min'], ['Max', 'max']].forEach(function (pair) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary mt-price-btn';
        btn.textContent = pair[0];
        btn.addEventListener('click', function () {
          const v = parseFloat(inputPrice.getAttribute(pair[1]));
          if (!isNaN(v)) { inputPrice.value = v; inputPrice.dispatchEvent(new Event('input', { bubbles: true })); inputPrice.focus(); }
        });
        btnGroup.appendChild(btn);
      });
      inputGroupText.insertAdjacentElement('afterend', btnGroup);
    }
  }

  // ── MantiTech settings card ────────────────────────────────────────────────

  function injectSettingsCard(modalBody) {
    if (modalBody.querySelector('.mt-settings-card')) return;

    const card   = makeEl('div', 'card mb-3 border-0 bg-body mt-settings-card');
    const header = makeEl('div', 'card-header', 'MantiTech');
    const body   = makeEl('div', 'card-body');

    // ── Theme selector ────────────────────────────────────────────────────────
    body.appendChild(makeEl('div', 'fw-semibold small mb-2', 'Theme'));
    const themeRow = makeEl('div', 'd-flex gap-2 flex-wrap mb-2');

    function setThemeActive(name) {
      themeRow.querySelectorAll('button').forEach(function (b) {
        b.className = 'btn btn-sm btn-outline-secondary';
      });
      const active = themeRow.querySelector('[data-theme="' + name + '"]');
      if (active) active.className = 'btn btn-sm btn-primary';
      customSection.style.display = name === 'custom' ? '' : 'none';
    }

    [['mocha', 'Mocha'], ['amberdark', 'Amberdark'], ['custom', 'Custom']].forEach(function (pair) {
      const themeName = pair[0], themeLabel = pair[1];
      const btn = makeEl('button', 'btn btn-sm ' + (settings.theme === themeName ? 'btn-primary' : 'btn-outline-secondary'), themeLabel);
      btn.type = 'button';
      btn.dataset.theme = themeName;
      btn.addEventListener('click', function () {
        if (themeName === 'custom' && !settings.customTheme) {
          settings.customTheme = Object.assign({}, THEME_PRESETS.amberdark);
          saveSetting('customTheme', settings.customTheme);
          refreshPickerValues(settings.customTheme);
        }
        saveSetting('theme', themeName);
        applyTheme(themeName);
        setThemeActive(themeName);
      });
      themeRow.appendChild(btn);
    });
    body.appendChild(themeRow);

    // ── Custom theme editor ───────────────────────────────────────────────────
    const customSection = makeEl('div', 'mb-3');
    customSection.style.display = settings.theme === 'custom' ? '' : 'none';

    // Color picker groups
    const groups = ['Base', 'Text', 'Accent', 'Galaxy'];
    const groupsWrap = makeEl('div', 'mt-token-groups');
    const swatches = {};

    groups.forEach(function (groupName) {
      const groupTokens = THEME_TOKENS.filter(function (t) { return t.group === groupName; });
      const groupDiv = document.createElement('div');

      const lbl = makeEl('div', 'mt-token-group-label', groupName);
      groupDiv.appendChild(lbl);

      const grid = makeEl('div', 'mt-token-grid');
      groupTokens.forEach(function (token) {
        const item = makeEl('label', 'mt-token-item');
        const input = document.createElement('input');
        input.type = 'color';
        input.className = 'mt-color-swatch';
        input.dataset.token = token.key;
        input.value = (settings.customTheme && settings.customTheme[token.key]) || THEME_PRESETS.amberdark[token.key] || '#888888';
        swatches[token.key] = input;

        input.addEventListener('input', function () {
          if (!settings.customTheme) settings.customTheme = Object.assign({}, THEME_PRESETS.amberdark);
          settings.customTheme[token.key] = input.value;
          if (settings.theme === 'custom') injectThemeVars(settings.customTheme, 'custom');
        });
        input.addEventListener('change', function () {
          if (!settings.customTheme) settings.customTheme = Object.assign({}, THEME_PRESETS.amberdark);
          settings.customTheme[token.key] = input.value;
          saveSetting('customTheme', settings.customTheme);
          if (settings.theme === 'custom') {
            injectThemeVars(settings.customTheme, 'custom');
          } else {
            saveSetting('theme', 'custom');
            applyTheme('custom');
            setThemeActive('custom');
          }
        });

        item.appendChild(input);
        item.appendChild(makeEl('span', '', token.label));
        grid.appendChild(item);
      });
      groupDiv.appendChild(grid);
      groupsWrap.appendChild(groupDiv);
    });
    customSection.appendChild(groupsWrap);

    // Import / Export
    const ioRow = makeEl('div', 'mt-theme-io');

    const exportBtn = makeEl('button', 'btn btn-sm btn-outline-secondary', 'Export JSON');
    exportBtn.type = 'button';
    exportBtn.addEventListener('click', function () {
      const tokens = settings.customTheme || THEME_PRESETS.amberdark;
      const json = JSON.stringify({ name: 'Custom', tokens: tokens }, null, 2);
      navigator.clipboard.writeText(json).then(function () {
        const r = exportBtn.getBoundingClientRect();
        const toast = document.createElement('div');
        toast.className = 'mt-copy-toast';
        toast.textContent = 'Copied!';
        toast.style.left = (r.left + r.width / 2) + 'px';
        toast.style.top  = (r.top - 8) + 'px';
        document.body.appendChild(toast);
        toast.addEventListener('animationend', function () { toast.remove(); });
      });
    });

    const importBtn = makeEl('button', 'btn btn-sm btn-outline-secondary', 'Import JSON');
    importBtn.type = 'button';

    const importArea = makeEl('div', 'mt-import-area');
    importArea.style.display = 'none';
    const importTa = makeEl('textarea', 'mt-import-ta');
    importTa.placeholder = 'Paste theme JSON here…';
    const applyImportBtn = makeEl('button', 'btn btn-sm btn-primary', 'Apply');
    applyImportBtn.type = 'button';
    applyImportBtn.addEventListener('click', function () {
      try {
        const parsed = JSON.parse(importTa.value.trim());
        const tokens = parsed.tokens || parsed;
        const valid = THEME_TOKENS.every(function (t) { return typeof tokens[t.key] === 'string'; });
        if (!valid) throw new Error('Missing tokens');
        settings.customTheme = tokens;
        saveSetting('customTheme', tokens);
        saveSetting('theme', 'custom');
        applyTheme('custom');
        setThemeActive('custom');
        refreshPickerValues(tokens);
        importArea.style.display = 'none';
        importTa.value = '';
      } catch (e) {
        importTa.style.borderColor = 'var(--mt-negative)';
        setTimeout(function () { importTa.style.borderColor = ''; }, 1500);
      }
    });
    importArea.append(importTa, applyImportBtn);

    importBtn.addEventListener('click', function () {
      importArea.style.display = importArea.style.display === 'none' ? '' : 'none';
    });

    ioRow.append(exportBtn, importBtn);
    customSection.append(ioRow, importArea);
    body.appendChild(customSection);

    function refreshPickerValues(tokens) {
      THEME_TOKENS.forEach(function (t) {
        if (swatches[t.key] && tokens[t.key]) swatches[t.key].value = tokens[t.key];
      });
    }

    // Font selector
    body.appendChild(makeEl('div', 'fw-semibold small mb-2 mt-2', 'Font'));
    const fontRow = makeEl('div', 'd-flex gap-2 flex-wrap mb-3');
    [
      ['default',      'Default'],
      ['orbitron',     'Orbitron'],
      ['sharetechmono','Share Tech Mono'],
      ['exo2',         'Exo 2'],
      ['audiowide',    'Audiowide'],
      ['chakrapetch',  'Chakra Petch'],
      ['electrolize',  'Electrolize'],
      ['michroma',     'Michroma'],
      ['oxanium',      'Oxanium'],
      ['rajdhani',     'Rajdhani'],
      ['spacemono',    'Space Mono'],
      ['teko',         'Teko'],
      ['vt323',        'VT323'],
    ].forEach(function (pair) {
      const fontKey = pair[0], fontLabel = pair[1];
      const btn = makeEl('button', 'btn btn-sm ' + (settings.font === fontKey ? 'btn-primary' : 'btn-outline-secondary'), fontLabel);
      btn.type = 'button';
      btn.addEventListener('click', function () {
        saveSetting('font', fontKey);
        applyFont(fontKey);
        fontRow.querySelectorAll('button').forEach(function (b) { b.className = 'btn btn-sm btn-outline-secondary'; });
        btn.className = 'btn btn-sm btn-primary';
      });
      fontRow.appendChild(btn);
    });
    body.appendChild(fontRow);

    const themeHr = document.createElement('hr');
    themeHr.className = 'opacity-20 my-3';
    body.appendChild(themeHr);

    // Toggle Features table
    const features = [
      ['inlineImages',    'Inline image previews'],
      ['ytSunoPreviews',  'YouTube & Suno previews'],
      ['gifPicker',       'GIF picker (/tenor)'],
      ['emojiPicker',     'Emoji picker'],
      ['scrollIndicator', 'Scroll to latest indicator'],
      ['materialNotes',   'Material notes (exchange)'],
      ['ledger',          'Buy/sell ledger (exchange)'],
      ['guildContent',    'Link previews on guild pages'],
      ['wishlistCopy',       'Copy wishlist to clipboard'],
      ['cheapestIndicator',  'Cheapest offer indicator (My Offers)'],
    ];

    const table = makeEl('table', 'table table-hover align-middle text-center mb-3');
    const thead = table.createTHead();
    const hrow  = thead.insertRow();
    const th1   = document.createElement('th');
    th1.className   = 'col text-start';
    th1.textContent = 'Toggle Features';
    const th2   = document.createElement('th');
    th2.className   = 'col-auto';
    th2.textContent = 'Enabled';
    hrow.append(th1, th2);

    const tbody = table.createTBody();
    features.forEach(function (feat) {
      const key = feat[0], label = feat[1];
      const row = tbody.insertRow();
      const td1 = row.insertCell();
      td1.className   = 'text-start';
      td1.textContent = label;
      const td2 = row.insertCell();
      const cb  = document.createElement('input');
      cb.type      = 'checkbox';
      cb.className = 'form-check-input cursor-pointer';
      cb.checked   = settings[key];
      cb.addEventListener('change', function () { saveSetting(key, cb.checked); });
      td2.appendChild(cb);
    });

    body.appendChild(table);

    // Update message dismissed indicator
    const updateRow = makeEl('div', 'd-flex align-items-center justify-content-between mb-3');
    const updateLabel = makeEl('span', 'small', 'Update message dismissed');
    const updateCb = document.createElement('input');
    updateCb.type = 'checkbox';
    updateCb.className = 'form-check-input cursor-pointer';

    const currentVersion = chrome.runtime.getManifest().version;
    chrome.storage.local.get(SEEN_VER_STORE, function (result) {
      updateCb.checked = result[SEEN_VER_STORE] === currentVersion;
    });

    updateCb.addEventListener('change', function () {
      if (updateCb.checked) {
        chrome.storage.local.set({ [SEEN_VER_STORE]: currentVersion });
        const toast = document.querySelector('.mt-update-toast');
        if (toast) toast.remove();
      } else {
        chrome.storage.local.remove(SEEN_VER_STORE, function () {
          checkForUpdate();
        });
      }
    });

    updateRow.append(updateLabel, updateCb);
    body.appendChild(updateRow);

    // API Key section
    const hr = document.createElement('hr');
    hr.className = 'opacity-20 my-3';
    body.appendChild(hr);

    body.appendChild(makeEl('div', 'fw-semibold small mb-1', 'API Key'));

    const apiInfo = makeEl('p', 'text-body-tertiary small mb-2', '');
    apiInfo.innerHTML = 'Required for the buy/sell ledger. Only needs <strong>Limited</strong> access — generate one in Settings → API keys.';
    body.appendChild(apiInfo);

    const inputGroup = makeEl('div', 'input-group input-group-sm');
    const apiInput   = document.createElement('input');
    apiInput.type        = 'password';
    apiInput.className   = 'form-control';
    apiInput.placeholder = 'Paste API key…';

    const saveBtn  = makeEl('button', 'btn btn-primary btn-sm', 'Save');
    saveBtn.type   = 'button';
    const clearBtn = makeEl('button', 'btn btn-outline-secondary btn-sm', 'Clear');
    clearBtn.type  = 'button';

    chrome.storage.local.get(API_KEY_STORE, function (result) {
      if (result[API_KEY_STORE]) apiInput.placeholder = '(key saved)';
    });

    saveBtn.addEventListener('click', function () {
      const key = apiInput.value.trim();
      if (!key) return;
      chrome.storage.local.set({ [API_KEY_STORE]: key }, function () {
        apiInput.value       = '';
        apiInput.placeholder = '(key saved)';
      });
    });

    clearBtn.addEventListener('click', function () {
      chrome.storage.local.remove(API_KEY_STORE, function () {
        apiInput.placeholder = 'Paste API key…';
      });
    });

    inputGroup.append(apiInput, saveBtn, clearBtn);
    body.appendChild(inputGroup);

    // GIF provider keys
    const gifHr = document.createElement('hr');
    gifHr.className = 'opacity-20 my-3';
    body.appendChild(gifHr);

    body.appendChild(makeEl('div', 'fw-semibold small mb-1', 'GIF Providers'));
    body.appendChild(makeEl('p', 'text-body-tertiary small mb-2',
      'Needed for the /giphy and /klipy chat commands. Tenor is deprecated.'));

    function buildKeyField(title, storeKey, linkUrl, linkLabel) {
      const wrap = makeEl('div', 'mb-2');
      wrap.appendChild(makeEl('div', 'small mb-1', title));

      const info = makeEl('p', 'text-body-tertiary small mb-1', '');
      info.innerHTML = 'Get a free key at <a href="' + linkUrl + '" target="_blank" rel="noopener noreferrer">' + linkLabel + '</a>.';
      wrap.appendChild(info);

      const group = makeEl('div', 'input-group input-group-sm');
      const input = document.createElement('input');
      input.type        = 'password';
      input.className   = 'form-control';
      input.placeholder = 'Paste API key…';

      const save  = makeEl('button', 'btn btn-primary btn-sm', 'Save');
      save.type   = 'button';
      const clear = makeEl('button', 'btn btn-outline-secondary btn-sm', 'Clear');
      clear.type  = 'button';

      chrome.storage.local.get(storeKey, function (result) {
        if (result[storeKey]) input.placeholder = '(key saved)';
      });

      save.addEventListener('click', function () {
        const key = input.value.trim();
        if (!key) return;
        chrome.storage.local.set({ [storeKey]: key }, function () {
          input.value       = '';
          input.placeholder = '(key saved)';
        });
      });

      clear.addEventListener('click', function () {
        chrome.storage.local.remove(storeKey, function () {
          input.placeholder = 'Paste API key…';
        });
      });

      group.append(input, save, clear);
      wrap.appendChild(group);
      return wrap;
    }

    body.appendChild(buildKeyField('GIPHY API Key', GIPHY_KEY_STORE,
      'https://developers.giphy.com/dashboard/', 'developers.giphy.com'));
    body.appendChild(buildKeyField('KLIPY API Key', KLIPY_KEY_STORE,
      'https://klipy.com/developers', 'klipy.com/developers'));

    body.appendChild(makeEl('p', 'text-body-tertiary small mt-3 mb-0', 'Some changes apply after navigating to a new page.'));

    card.append(header, body);

    // Insert before the last card (Reset company stays at the bottom)
    const cards = modalBody.querySelectorAll(':scope > .card');
    const lastCard = cards[cards.length - 1];
    if (lastCard) modalBody.insertBefore(card, lastCard);
    else modalBody.appendChild(card);
  }

  // ── Update toast ───────────────────────────────────────────────────────────

  function checkForUpdate() {
    const currentVersion = chrome.runtime.getManifest().version;
    chrome.storage.local.get(SEEN_VER_STORE, function (result) {
      if (result[SEEN_VER_STORE] === currentVersion) return;
      showUpdateToast(currentVersion);
    });
  }

  function showUpdateToast(version) {
    if (!document.body) {
      document.addEventListener('DOMContentLoaded', function () { showUpdateToast(version); }, { once: true });
      return;
    }

    fetch(chrome.runtime.getURL('update-message.txt'))
      .then(function (r) { return r.text(); })
      .then(function (msg) { renderUpdateToast(msg.trim().replace('{version}', version), version); })
      .catch(function () { renderUpdateToast('MantiTech updated to v' + version + '.', version); });
  }

  function renderUpdateToast(message, version) {
    const toast = document.createElement('div');
    toast.className = 'mt-update-toast';

    const text = document.createElement('div');
    text.className = 'mt-update-toast-text';
    text.textContent = message;

    const dismissBtn = document.createElement('button');
    dismissBtn.type = 'button';
    dismissBtn.className = 'mt-update-toast-dismiss';
    dismissBtn.textContent = '✕';
    dismissBtn.setAttribute('aria-label', 'Dismiss');
    dismissBtn.addEventListener('click', function () {
      chrome.storage.local.set({ [SEEN_VER_STORE]: version });
      toast.remove();
    });

    toast.append(text, dismissBtn);
    document.body.appendChild(toast);
  }

  // ── Dismiss on outside click ───────────────────────────────────────────────

  document.addEventListener('mousedown', function (e) {
    if (activeModal && !activeModal.contains(e.target)) closeModal();
    if (tenorPicker && !tenorPicker.contains(e.target)) closeTenorPicker();
    if (emojiPickerEl && !emojiPickerEl.contains(e.target) && !e.target.closest('.mt-emoji-btn')) closeEmojiPicker();
  });

  // ── SPA navigation ─────────────────────────────────────────────────────────

  let lastUrl = location.href;

  function onPossibleNavigation() {
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      closeModal();
      setTimeout(setupExchangeInfoBox, 400);
    }
  }

  window.addEventListener('popstate',   onPossibleNavigation);
  window.addEventListener('hashchange', onPossibleNavigation);

  new MutationObserver(function (mutations) {
    onPossibleNavigation();

    // Detect the game's settings modal opening and inject our card
    mutations.forEach(function (mutation) {
      mutation.addedNodes.forEach(function (node) {
        if (node.nodeType !== Node.ELEMENT_NODE) return;
        const title = node.querySelector && node.querySelector('.modal-title');
        if (title && title.textContent.trim() === 'Settings') {
          const body = node.querySelector('.modal-body');
          if (body) injectSettingsCard(body);
        }
      });
    });

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      setupExchangeInfoBox(); linkifyMessages(); linkifyGuildContent();
      setupScrollIndicators(); setupTenorInputs(); setupEmojiPickers();
      setupWishlistCopy(); setupMyOffers();
    }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });

  loadSettings(function () {
    applyTheme(settings.theme);
    applyFont(settings.font);
    setupExchangeInfoBox();
    linkifyMessages();
    linkifyGuildContent();
    setupScrollIndicators();
    setupTenorInputs();
    setupEmojiPickers();
    setupWishlistCopy();
    setupMyOffers();
    checkForUpdate();
  });
})();
