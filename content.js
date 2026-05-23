(function () {
  'use strict';

  console.log('[MantiTech] content script loaded');

  const NOTE_PREFIX   = 'mt_note__mat_';
  const API_KEY_STORE = 'mt_api_key';
  const API_BASE      = 'https://api.g2.galactictycoons.com';
  let activeModal     = null;
  let debounceTimer   = null;

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
    const display = document.querySelector('.mt-note-display');
    if (!display) return;
    display.textContent = text || '';
    display.style.display = text ? '' : 'none';
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

    const header  = makeEl('div', 'mt-modal-header');
    const titleEl = makeEl('span', 'mt-modal-title', title);
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

      if (!apiKey) {
        showApiKeyPrompt(btn, function () { showLedgerModal(btn); });
        return;
      }

      const modal = makeModal(name + ' — Ledger', 420);
      positionModal(modal, btn);
      const body = modal.querySelector('.mt-modal-body');
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

        function makeLedgerFooter(onChangeKey) {
          const footer   = makeEl('div', 'mt-ledger-footer');
          const changeBtn = makeEl('button', 'mt-ledger-change-key', 'Change API key');
          changeBtn.type = 'button';
          changeBtn.onclick = onChangeKey;
          footer.appendChild(changeBtn);
          return footer;
        }

        function onChangeKey() { showApiKeyPrompt(btn, function () { showLedgerModal(btn); }); }

        body.textContent = '';

        if (!entries.length) {
          body.append(
            makeEl('div', 'mt-ledger-empty', 'No buy/sell history for this material.'),
            makeLedgerFooter(onChangeKey)
          );
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

        body.append(table, makeLedgerFooter(onChangeKey));
      })
      .catch(function (err) {
        function onChangeKey() { showApiKeyPrompt(btn, function () { showLedgerModal(btn); }); }
        body.textContent = '';
        body.append(
          makeEl('div', 'mt-ledger-empty', 'Error: ' + String(err)),
          (function () { const f = makeEl('div','mt-ledger-footer'); const b = makeEl('button','mt-ledger-change-key','Change API key'); b.type='button'; b.onclick=onChangeKey; f.appendChild(b); return f; }())
        );
      });
    });
  }

  function showApiKeyPrompt(btn, onSet) {
    const modal = makeModal('MantiTech — API Key', 300);
    positionModal(modal, btn);
    const body = modal.querySelector('.mt-modal-body');

    const info  = makeEl('p', 'mt-api-info', 'Enter your GT API key (Settings → API in-game).');
    const input = document.createElement('input');
    input.className   = 'mt-api-input';
    input.type        = 'password';
    input.placeholder = 'Paste API key…';

    const footer    = makeEl('div', 'mt-modal-footer');
    const saveBtn   = makeBtn('Save', 'mt-save');
    const cancelBtn = makeBtn('Cancel', 'mt-cancel');
    footer.append(saveBtn, cancelBtn);

    body.append(info, input, footer);
    input.focus();

    saveBtn.onclick = function () {
      const key = input.value.trim();
      if (!key) return;
      chrome.storage.local.set({ [API_KEY_STORE]: key }, function () {
        closeModal();
        onSet();
      });
    };

    cancelBtn.onclick = closeModal;
  }

  // ── Button injection ───────────────────────────────────────────────────────

  function injectButtons() {
    if (!matIdFromUrl()) return;

    const existingBtn = document.querySelector('.mt-note-btn');
    if (existingBtn) {
      refreshNoteState(existingBtn);
      return;
    }

    const headerRow = document.querySelector('div.row.align-items-center.g-2.lh-xs');
    const actions   = headerRow?.querySelector('div.col-auto.d-flex.align-items-center.gap-2');
    if (!actions) return;

    document.querySelectorAll('.mt-note-display').forEach(function (el) { el.remove(); });

    // Pencil — note
    const noteBtn = document.createElement('button');
    noteBtn.type = 'button';
    noteBtn.className = 'btn btn-sm btn-square btn-secondary mt-note-btn';
    noteBtn.title = 'MantiTech: material note';
    noteBtn.innerHTML =
      '<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true">' +
        '<path d="M1 11.5V15h3.5l7-7L8 4.5l-7 7zm13.7-7.2a1 1 0 0 0 0-1.4l-2.6-2.6a1 1 0 0 0-1.4 0L9.2 1.8l4 4 1.5-1.5z"/>' +
      '</svg>';
    noteBtn.addEventListener('click', function (e) { e.stopPropagation(); showNoteModal(noteBtn); });
    actions.appendChild(noteBtn);

    // Ledger — buy/sell history
    const ledgerBtn = document.createElement('button');
    ledgerBtn.type = 'button';
    ledgerBtn.className = 'btn btn-sm btn-square btn-secondary mt-ledger-btn';
    ledgerBtn.title = 'MantiTech: buy/sell ledger';
    ledgerBtn.innerHTML =
      '<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14" aria-hidden="true">' +
        '<path d="M2 2h12v1.5H2V2zm0 3.5h12V7H2V5.5zm0 3.5h12v1.5H2V9zm0 3.5h7V14H2v-1.5z"/>' +
      '</svg>';
    ledgerBtn.addEventListener('click', function (e) { e.stopPropagation(); showLedgerModal(ledgerBtn); });
    actions.appendChild(ledgerBtn);

    // Note display below header
    const display = document.createElement('div');
    display.className = 'mt-note-display';
    display.style.display = 'none';
    display.addEventListener('click', function () { showNoteModal(noteBtn); });
    headerRow.insertAdjacentElement('afterend', display);

    refreshNoteState(noteBtn);
  }

  // ── Chat scroll indicator ─────────────────────────────────────────────────

  function setupScrollIndicators() {
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

  // ── Image probe ────────────────────────────────────────────────────────────

  function probeImage(url, a) {
    const img = document.createElement('img');
    img.className = 'mt-chat-img';
    img.alt = '';
    img.style.display = 'none';

    const scrollBody = a.closest('.card-body.overflow-auto');
    const wasAtBottom = scrollBody &&
      (scrollBody.scrollHeight - scrollBody.scrollTop - scrollBody.clientHeight < 60);

    img.onload  = function () {
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
      // probe deferred so <a> is in the DOM first
      const _ytId   = youtubeVideoId(m[0]);
      const _sunoId = !_ytId && sunoSongId(m[0]);
      requestAnimationFrame(_ytId
        ? (function (id, el) { return function () { insertYouTubePreview(id, el); }; }(_ytId, a))
        : _sunoId
          ? (function (id, el) { return function () { insertSunoPreview(id, el); }; }(_sunoId, a))
          : function () { probeImage(a.href, a); });
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

  // ── Tenor slash command ────────────────────────────────────────────────────

  const TENOR_KEY = 'LIVDSRZULELA';
  let tenorPicker  = null;
  let tenorDebounce = null;

  function closeTenorPicker() {
    if (tenorPicker) { tenorPicker.remove(); tenorPicker = null; }
  }

  function positionTenorPicker(picker, input) {
    const r = input.getBoundingClientRect();
    picker.style.left  = r.left + 'px';
    picker.style.width = r.width + 'px';
    picker.style.bottom = (window.innerHeight - r.top + 6) + 'px';
  }

  function showTenorPicker(input, query) {
    closeTenorPicker();
    if (!query.trim()) return;

    const picker = document.createElement('div');
    picker.className = 'mt-tenor-picker';
    document.body.appendChild(picker);
    tenorPicker = picker;
    positionTenorPicker(picker, input);

    let grid       = null;
    let nextPos    = '';
    let isLoading  = false;

    function appendResults(results) {
      results.forEach(function (result) {
        const url   = result.media?.[0]?.gif?.url;
        const thumb = result.media?.[0]?.tinygif?.url || url;
        if (!url) return;
        const img = document.createElement('img');
        img.className = 'mt-tenor-thumb';
        img.src = thumb;
        img.alt = result.content_description || '';
        img.addEventListener('click', function () {
          input.value = input.value.replace(/\/tenor\s+.+$/, url);
          input.dispatchEvent(new Event('input', { bubbles: true }));
          closeTenorPicker();
          input.focus();
        });
        grid.appendChild(img);
      });
    }

    function fetchPage(pos) {
      if (isLoading) return;
      isLoading = true;
      var url = 'https://api.tenor.com/v1/search?q=' + encodeURIComponent(query) +
                '&key=' + TENOR_KEY + '&limit=16' + (pos ? '&pos=' + pos : '');
      fetch(url)
        .then(function (r) { return r.json(); })
        .then(function (data) {
          isLoading = false;
          if (!grid) {
            picker.textContent = '';
            if (!data.results || !data.results.length) {
              picker.textContent = 'No results.';
              return;
            }
            grid = document.createElement('div');
            grid.className = 'mt-tenor-grid';
            picker.appendChild(grid);
          }
          nextPos = data.next || '';
          appendResults(data.results || []);
        })
        .catch(function () {
          isLoading = false;
          if (!grid) picker.textContent = 'Error loading GIFs.';
        });
    }

    picker.addEventListener('scroll', function () {
      if (nextPos && picker.scrollTop + picker.clientHeight >= picker.scrollHeight - 60) {
        fetchPage(nextPos);
      }
    });

    fetchPage('');
  }

  function setupTenorInput(input) {
    if (input.dataset.mtTenorSetup) return;
    input.dataset.mtTenorSetup = '1';
    input.addEventListener('input', function () {
      clearTimeout(tenorDebounce);
      const m = input.value.match(/\/tenor\s+(.+)$/);
      if (!m) { closeTenorPicker(); return; }
      const query = m[1];
      tenorDebounce = setTimeout(function () { showTenorPicker(input, query); }, 400);
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

    const sendWrap = textarea.nextElementSibling;
    const sendBtn  = sendWrap?.querySelector('button');
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
      picker.style.setProperty('--background',                   '#1e1e2e');
      picker.style.setProperty('--border-color',                 '#45475a');
      picker.style.setProperty('--indicator-color',              '#89b4fa');
      picker.style.setProperty('--input-border-color',           '#45475a');
      picker.style.setProperty('--input-font-color',             '#cdd6f4');
      picker.style.setProperty('--input-placeholder-color',      '#6c7086');
      picker.style.setProperty('--outline-color',                '#89b4fa');
      picker.style.setProperty('--category-button-active-color', '#89b4fa');
      picker.style.setProperty('--button-hover-background',      '#313244');
      picker.style.setProperty('--text-color',                   '#cdd6f4');
      picker.style.setProperty('--emoji-size',                   '1.5rem');
      picker.style.setProperty('--num-columns',                  '8');

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
    sendWrap.style.gap = '4px';
  }

  function setupEmojiPickers() {
    document.querySelectorAll('textarea[name="msg"]').forEach(setupEmojiPicker);
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
      setTimeout(injectButtons, 400);
    }
  }

  window.addEventListener('popstate',   onPossibleNavigation);
  window.addEventListener('hashchange', onPossibleNavigation);

  new MutationObserver(function () {
    onPossibleNavigation();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () { injectButtons(); linkifyMessages(); setupScrollIndicators(); setupTenorInputs(); setupEmojiPickers(); }, 250);
  }).observe(document.documentElement, { childList: true, subtree: true });

  injectButtons();
  setupScrollIndicators();
  setupTenorInputs();
  setupEmojiPickers();
})();
