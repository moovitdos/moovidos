/**
 * ui.js
 * -----
 * All DOM rendering for the Moovitdos landing page.
 * Pure-ish render helpers that take data (from MoovitdosApi) and write into
 * the shared contract elements. No network calls live here.
 *
 * Exposes `window.MoovitdosUi`. The guide is an inline help center whose
 * generated TOC links call `window.MoovitdosUi.scrollDocsTo(...)`.
 *
 * Depends on: window.MoovitdosConfig, window.MoovitdosApi, and the global
 * `marked` library (loaded in the HTML <head>).
 */
(function () {
  'use strict';

  const cfg = window.MoovitdosConfig;
  const api = window.MoovitdosApi;

  /* ------------------------------------------------------------------ *
   * Small utilities
   * ------------------------------------------------------------------ */

  /** Safe getElementById wrapper. @returns {HTMLElement|null} */
  const byId = (id) => document.getElementById(id);

  /**
   * Parse markdown via `marked`, degrading gracefully if marked is missing.
   * @param {string} md
   * @returns {string} HTML string
   */
  function parseMarkdown(md) {
    if (typeof marked !== 'undefined' && marked && typeof marked.parse === 'function') {
      return marked.parse(md);
    }
    // Fallback: escape & keep line breaks so we never inject raw markdown.
    return String(md)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  /**
   * Format an ISO date string as a Hebrew long date (he-IL).
   * @param {string} d
   * @returns {string}
   */
  function formatDate(d) {
    return new Date(d).toLocaleDateString('he-IL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  /**
   * Human-readable file size. Mirrors the old site's logic exactly.
   * @param {number} bytes
   * @returns {string}
   */
  function formatSize(bytes) {
    if (!bytes) return '';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) * 1 + ' ' + ['B', 'KB', 'MB', 'GB'][i];
  }

  /** Strip the "[APP] " / "Release " prefixes from a release title. */
  function cleanTitle(name) {
    return String(name)
      .replace(/^\[APP\]\s*/i, '')
      .replace(/^Release\s+/i, '');
  }

  /**
   * Classify a release's assets into full / lite / zip APK buckets.
   * Falls back to the first .apk as "full" for single-APK releases.
   * @param {Array<object>} assets
   * @returns {{full: object|null, lite: object|null, zip: object|null}}
   */
  function findAssets(assets) {
    const res = { full: null, lite: null, zip: null };
    const list = Array.isArray(assets) ? assets : [];
    list.forEach((a) => {
      const name = (a.name || '').toLowerCase();
      if (name.includes('full') && name.endsWith('.apk')) res.full = a;
      else if (name.includes('lite') && name.endsWith('.apk')) res.lite = a;
      else if (name.endsWith('.zip')) res.zip = a;
    });
    // Fallback for single-APK releases.
    if (!res.full && !res.lite) res.full = list.find((a) => (a.name || '').endsWith('.apk')) || null;
    return res;
  }

  /** Sum download_count across a release's assets. */
  function sumDownloads(assets) {
    if (!Array.isArray(assets)) return 0;
    return assets.reduce((sum, a) => sum + (a.download_count || 0), 0);
  }

  /* ------------------------------------------------------------------ *
   * Info cards
   * ------------------------------------------------------------------ */

  /**
   * Build the info cards from SITE_INFO_CONTENT and inject them into
   * #info-section, then reveal the section.
   */
  function renderInfo() {
    const container = byId('info-section');
    if (!container) return;
    const C = cfg.SITE_INFO_CONTENT;

    let html = `
                <div class="section-header">
                    <h2>${C.title}</h2>
                    <p>${C.intro}</p>
                </div>
                <div class="info-grid">
            `;

    C.sections.forEach((s) => {
      const cls = s.title === 'עלות ורכישה' ? 'info-card glass pricing-card' : 'info-card glass';
      html += `
                    <div class="${cls}">
                        <h4>${s.icon} ${s.title}</h4>
                        ${s.content ? `<p>${s.content}</p>` : ''}
                        ${s.list ? `<ul>${s.list.map((li) => `<li>${li}</li>`).join('')}</ul>` : ''}
                        ${s.price ? `<p><strong>${s.price}</strong></p>` : ''}
                        ${s.footer ? `<p style="font-size:0.85rem; opacity:0.8; margin-top:auto;">${s.footer}</p>` : ''}
                    </div>
                `;
    });

    html += `
                </div>
                <div class="info-card glass" style="margin-top: 30px; border-right: 4px solid var(--accent-color);">
                    <h4>${C.feedback.title}</h4>
                    <p>${C.feedback.content}</p>
                </div>
            `;

    container.innerHTML = html;
    container.style.display = 'block';
    container.classList.add('active');
  }

  /* ------------------------------------------------------------------ *
   * Releases
   * ------------------------------------------------------------------ */

  /** Build the download buttons HTML for the latest release. */
  function buildDownloadButtons(res) {
    let downloadsHtml = '';

    downloadsHtml += `
                        <p style="text-align:center; font-size:0.85rem; color:var(--text-secondary); margin-bottom:14px;">רכישה חד-פעמית · אנדרואיד 4.4 ומעלה · התקנה ישירה</p>
                    `;

    if (res.full) {
      downloadsHtml += `
                        <a href="${res.full.browser_download_url}" class="download-btn full-btn" style="flex-direction: column;">
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                                <span style="font-size: 1.3rem;">גרסה מלאה</span>
                                <small style="font-size: 0.8rem; opacity: 0.9;">כולל את כל הנתונים (${formatSize(res.full.size)})</small>
                            </div>
                            <div style="display: flex; gap: 12px; margin-top: 12px;">
                                <svg fill="currentColor" width="28" height="28" viewBox="0 0 24 24"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.28-.54-.37-.83-.22-.3.16-.42.54-.26.85l1.84 3.18C4.8 11.16 3.5 13.84 3.5 16.5h17c0-2.66-1.3-5.34-2.9-7.02zM7 14.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm10 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>
                                <svg fill="currentColor" width="28" height="28" viewBox="0 0 24 24"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                            </div>
                        </a>
                    `;
    }
    if (res.lite) {
      downloadsHtml += `
                        <a href="${res.lite.browser_download_url}" class="download-btn secondary lite-btn" style="flex-direction: column;">
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                                <span style="font-size: 1.1rem;">גרסה קלה</span>
                                <small style="font-size: 0.75rem;">אפליקציה בלבד (${formatSize(res.lite.size)})</small>
                            </div>
                            <svg fill="currentColor" width="26" height="26" viewBox="0 0 24 24" style="margin-top: 10px;"><path d="M17.6 9.48l1.84-3.18c.16-.31.04-.69-.26-.85-.29-.15-.65-.06-.83.22l-1.88 3.24c-2.86-1.21-6.08-1.21-8.94 0L5.65 5.67c-.19-.28-.54-.37-.83-.22-.3.16-.42.54-.26.85l1.84 3.18C4.8 11.16 3.5 13.84 3.5 16.5h17c0-2.66-1.3-5.34-2.9-7.02zM7 14.5c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1zm10 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1z"/></svg>
                        </a>
                    `;
    }
    if (res.zip) {
      downloadsHtml += `
                        <a href="${res.zip.browser_download_url}" class="download-btn tertiary zip-btn" style="flex-direction: column;">
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                                <span style="font-size: 1rem;">נתונים בלבד</span>
                                <small style="font-size: 0.75rem;">לייבוא ידני (${formatSize(res.zip.size)})</small>
                            </div>
                            <svg fill="currentColor" width="26" height="26" viewBox="0 0 24 24" style="margin-top: 10px;"><path d="M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z"/></svg>
                        </a>
                    `;
    }

    return downloadsHtml;
  }

  /** Render the "coming soon / download unavailable" placeholder. */
  function renderPlaceholder(area) {
    area.innerHTML = `
                        <div class="hero-card glass reveal active" style="margin-top: 40px; padding: 60px 40px;">
                            <div style="margin-bottom: 25px;">
                                <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="var(--accent-color)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="animation: pulse 2s infinite;">
                                    <circle cx="12" cy="12" r="10"></circle>
                                    <polyline points="12 6 12 12 16 14"></polyline>
                                </svg>
                            </div>
                            <h2 class="version-title" style="margin-bottom: 16px;">אין עדיין עדכונים להצגה</h2>
                            <p style="color: var(--text-secondary); margin: 0;">פרטי העדכונים יופיעו כאן ברגע שתפורסם גרסה.</p>
                        </div>
                        <style>
                            @keyframes pulse {
                                0% { transform: scale(1); opacity: 1; }
                                50% { transform: scale(1.1); opacity: 0.7; }
                                100% { transform: scale(1); opacity: 1; }
                            }
                        </style>
                    `;
  }

  /**
   * Render the friendly Hebrew network-error message into #content-area.
   * @param {Error} error
   */
  function renderReleasesError(error) {
    const area = byId('content-area');
    if (!area) return;
    const message = error && error.message ? error.message : '';
    area.innerHTML = `
                    <div class="error">
                        אירעה שגיאה בטעינת הנתונים.<br>
                        אנא ודא שאתה מחובר לאינטרנט ונסה לרענן את העמוד.<br>
                        <small dir="ltr">${message}</small>
                    </div>
                `;
  }

  /**
   * Render releases into #content-area: a featured latest hero + history list,
   * and update + show the total-downloads chip.
   * @param {Array<object>} releases
   */
  function renderReleases(releases) {
    const area = byId('content-area');
    if (!area) return;

    const valid = (Array.isArray(releases) ? releases : []).filter((r) => r && !r.draft);
    if (!valid.length) {
      renderPlaceholder(area);
      return;
    }

    // Restore the total-downloads chip in the navbar.
    const total = valid.reduce((sum, r) => sum + sumDownloads(r.assets), 0);
    const chip = byId('nav-total-chip');
    if (chip && total > 0) {
      chip.innerText = total.toLocaleString();
      chip.style.display = 'inline-block';
    }

    // Release notes ("what changed") with the same cleanup the old site applied.
    const cleanupNotes = (body, isLatest) => {
      let raw = (body || 'שיפורי ביצועים ושינויים פנימיים.')
        .replace(/### (מה התחדש בגרסה זו\?|מה חדש\?)/gi, '');
      if (!isLatest) raw = raw.replace(/---[\s\S]*?גרסאות להורדה:[\s\S]*$/i, '');
      raw = raw
        .replace(/(\d+)\.\s\*\*/g, '<br>$1. **')
        .replace(/---/g, '<hr style="border:0; border-top:1px solid var(--border-light); margin: 15px 0;">')
        .trim();
      return parseMarkdown(raw).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    };

    // One organized list — every version's changes shown together (all open).
    // The latest is featured with download buttons + download count; older
    // versions show their notes only (no per-version downloads).
    const items = valid.slice(0, 20).map((r, i) => {
      const isLatest = i === 0;
      const ver = cleanTitle(r.name || r.tag_name);
      const date = formatDate(r.published_at);
      const notes = cleanupNotes(r.body, isLatest);

      if (isLatest) {
        const downloadsHtml = buildDownloadButtons(findAssets(r.assets));
        const dlCount = sumDownloads(r.assets);
        return `
          <div class="history-item glass" style="flex-direction: column; align-items: flex-start; gap: 15px; border: 2px solid var(--accent-color);">
            <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <strong dir="ltr" style="font-size: 1.3rem;">${ver}</strong>
                <small style="color: var(--text-secondary);">${date}</small>
              </div>
              <span class="badge-latest" style="margin-bottom: 0; padding: 4px 12px; font-size: 0.8rem;">הגרסה האחרונה</span>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-secondary); opacity: 0.8; width: 100%;">
              <strong>${dlCount.toLocaleString()}</strong> הורדות
            </div>
            <div class="history-notes" style="width: 100%; border-right-color: var(--accent-color);">${notes}</div>
            ${downloadsHtml ? `<div class="download-grid">${downloadsHtml}</div>` : ''}
          </div>`;
      }
      return `
        <div class="history-item glass" style="flex-direction: column; align-items: flex-start; gap: 8px;">
          <div style="display: flex; justify-content: space-between; width: 100%; align-items: center;">
            <div>
              <strong dir="ltr">${ver}</strong>
              <small>${date}</small>
            </div>
            <span style="font-size: 0.8rem; color: var(--text-muted);">גרסה קודמת</span>
          </div>
          <div class="history-notes">${notes}</div>
        </div>`;
    }).join('');

    area.innerHTML = `<div class="history-section reveal active" style="display:flex; flex-direction:column; gap:15px;">${items}</div>`;
  }

  /* ------------------------------------------------------------------ *
   * Gallery
   * ------------------------------------------------------------------ */

  /**
   * Immersive viewer (lightbox) state.
   *  - galleryImages: the rendered screenshot list, so prev/next can step it.
   *  - lightboxIndex: index of the image currently shown.
   *  - lightboxPrevFocus: the thumbnail that opened it (focus is restored here).
   */
  let galleryImages = [];
  let lightboxIndex = 0;
  let lightboxPrevFocus = null;

  /** Build a meaningful Hebrew alt for a screenshot. @returns {string} */
  function galleryAlt(img) {
    return img && img.name ? `צילום מסך — ${img.name}` : 'צילום מסך מובידוס';
  }

  /**
   * Build the empty/fallback state markup for the gallery. Shown (instead of
   * silently hiding the section) when there are no screenshots — whether the
   * folder is empty or the GitHub request failed (api returns [] for both).
   * @returns {string}
   */
  function galleryEmptyMarkup() {
    return `
      <div class="gallery-empty" role="status">
        <svg class="gallery-empty-icon" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2.5" ry="2.5"></rect>
          <circle cx="8.5" cy="8.5" r="1.6"></circle>
          <polyline points="21 15 16 10 5 21"></polyline>
        </svg>
        <h3 class="gallery-empty-title">צילומי מסך יעלו בקרוב</h3>
        <p class="gallery-empty-text">אנחנו מכינים הצצה למסכי האפליקציה. בינתיים אפשר לקרוא על התכונות ולהוריד את האפליקציה.</p>
      </div>`;
  }

  /**
   * Show the image at `galleryImages[idx]` in the open viewer and update the
   * prev/next button enabled-state and position label.
   * @param {number} idx
   */
  function renderLightboxAt(idx) {
    const img = byId('gallery-lightbox-img');
    const counter = byId('gallery-lightbox-counter');
    const prevBtn = byId('gallery-lightbox-prev');
    const nextBtn = byId('gallery-lightbox-next');
    if (!img || !galleryImages.length) return;

    lightboxIndex = Math.max(0, Math.min(idx, galleryImages.length - 1));
    const cur = galleryImages[lightboxIndex];
    img.src = cur.url;
    img.alt = galleryAlt(cur);

    // "current of total" — kept LTR for the numerals.
    if (counter) counter.textContent = `${lightboxIndex + 1} / ${galleryImages.length}`;

    // prev = towards index 0, next = towards the end. Disable at the edges.
    const atFirst = lightboxIndex === 0;
    const atLast = lightboxIndex === galleryImages.length - 1;
    if (prevBtn) { prevBtn.disabled = atFirst; }
    if (nextBtn) { nextBtn.disabled = atLast; }
    // Hide the whole nav when there's only one screenshot.
    const single = galleryImages.length <= 1;
    [prevBtn, nextBtn, counter].forEach((el) => { if (el) el.hidden = single; });
  }

  /** Step the viewer by a delta (clamped). @param {number} delta */
  function stepLightbox(delta) {
    if (!galleryImages.length) return;
    const target = lightboxIndex + delta;
    if (target < 0 || target >= galleryImages.length) return;
    renderLightboxAt(target);
  }

  /**
   * Open the immersive viewer at a given index, remembering the trigger so
   * focus can be restored on close. Keyboard/ swipe wiring lives in wireLightbox.
   * @param {number} idx
   * @param {HTMLElement|null} trigger
   */
  function openLightbox(idx, trigger) {
    const lightbox = byId('gallery-lightbox');
    if (!lightbox || !galleryImages.length) return;
    lightboxPrevFocus = trigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    renderLightboxAt(typeof idx === 'number' ? idx : 0);
    lightbox.classList.add('active');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.classList.add('gallery-lightbox-open');
    const closeBtn = byId('gallery-lightbox-close');
    if (closeBtn) closeBtn.focus();
  }

  /** Close the viewer and restore focus to the thumbnail that opened it. */
  function closeLightbox() {
    const lightbox = byId('gallery-lightbox');
    const img = byId('gallery-lightbox-img');
    if (!lightbox) return;
    lightbox.classList.remove('active');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('gallery-lightbox-open');
    if (img) img.removeAttribute('src');
    if (lightboxPrevFocus && typeof lightboxPrevFocus.focus === 'function') {
      lightboxPrevFocus.focus();
    }
    lightboxPrevFocus = null;
  }

  /** Wire up the viewer's close / navigation affordances (once). */
  function wireLightbox() {
    const lightbox = byId('gallery-lightbox');
    if (!lightbox || lightbox._wired) return;
    lightbox._wired = true;

    const prevBtn = byId('gallery-lightbox-prev');
    const nextBtn = byId('gallery-lightbox-next');
    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(-1); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); stepLightbox(1); });

    // Backdrop / close-button click closes; clicks on the image or arrows don't.
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox || e.target.closest('[data-lightbox-close]')) {
        closeLightbox();
      }
    });

    // Keyboard: Esc closes; arrows step. RTL — ArrowLeft advances (towards the
    // visually-left, later screenshots), ArrowRight goes back.
    document.addEventListener('keydown', (e) => {
      if (!lightbox.classList.contains('active')) return;
      if (e.key === 'Escape') { closeLightbox(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stepLightbox(1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepLightbox(-1); }
    });

    // Touch swipe between images (RTL): swipe LEFT -> next, swipe RIGHT -> prev.
    let touchX = null;
    const stage = lightbox.querySelector('.gallery-lightbox-stage') || lightbox;
    stage.addEventListener('touchstart', (e) => {
      touchX = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientX : null;
    }, { passive: true });
    stage.addEventListener('touchend', (e) => {
      if (touchX === null || !e.changedTouches || !e.changedTouches.length) return;
      const dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) < 40) return;       // ignore tiny drags / taps
      if (dx < 0) stepLightbox(1);          // swipe left -> next (RTL)
      else stepLightbox(-1);                // swipe right -> prev
    }, { passive: true });
  }

  /**
   * Build one flat, Play-Store-style screenshot thumbnail: a raw rounded image
   * (no device chrome) inside a focusable <button> so Enter/Space activate it.
   * @param {{name?: string, url: string}} img
   * @param {number} idx
   * @returns {HTMLButtonElement}
   */
  function buildGalleryCard(img, idx) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'gallery-card';
    card.setAttribute('aria-label', 'הגדלת צילום מסך של האפליקציה');

    const el = document.createElement('img');
    el.src = img.url;
    el.className = 'gallery-img';
    el.alt = galleryAlt(img);
    el.loading = 'lazy';
    el.decoding = 'async';

    card.appendChild(el);
    card.addEventListener('click', () => openLightbox(idx, card));
    return card;
  }

  /**
   * Fetch screenshots and render a horizontal, scroll-snap carousel (Google
   * Play style) into #gallery-container, then reveal #gallery-section. When
   * there are no screenshots (empty folder or a failed GitHub request) a
   * graceful empty-state card is shown instead of the section disappearing.
   */
  async function loadScreenshots() {
    const container = byId('gallery-container');
    const section = byId('gallery-section');
    if (!container || !section) return;

    wireLightbox();

    const images = await api.fetchScreenshots();
    galleryImages = images.slice();

    container.innerHTML = '';
    if (!images.length) {
      container.classList.add('is-empty');
      section.classList.add('is-empty');
      container.removeAttribute('role');
      container.removeAttribute('aria-label');
      container.innerHTML = galleryEmptyMarkup();
    } else {
      container.classList.remove('is-empty');
      section.classList.remove('is-empty');
      // The carousel is a horizontally-scrollable group of screenshots.
      container.setAttribute('role', 'group');
      container.setAttribute('aria-label', 'צילומי מסך מהאפליקציה — ניתן לגלול לצדדים');
      const frag = document.createDocumentFragment();
      images.forEach((img, i) => frag.appendChild(buildGalleryCard(img, i)));
      container.appendChild(frag);
    }

    section.style.display = 'block';
    section.classList.add('active');
  }

  /* ------------------------------------------------------------------ *
   * Guide / Help center (inline, sidebar TOC) — mirrors the new site
   * ------------------------------------------------------------------ */

  /**
   * Fetch the guide markdown and render it as an inline help center with a
   * generated sidebar table-of-contents. Falls back to a "read on GitHub"
   * card if the markdown can't be loaded.
   */
  async function loadGuide() {
    if (!byId('docs-content')) return;
    try {
      const text = await api.fetchGuideMarkdown();
      if (text && text.trim()) injectGuide(text);
      else injectGuideFallback();
    } catch (e) {
      injectGuideFallback();
    }
  }

  /**
   * Render the guide markdown into #docs-content and build the sidebar TOC
   * (#docs-sidebar) from its h2/h3 headings, with scroll-spy highlighting.
   * @param {string} markdownText
   */
  function injectGuide(markdownText) {
    if (!markdownText || !markdownText.trim()) return;
    const docsContent = byId('docs-content');
    const docsSidebar = byId('docs-sidebar');
    if (!docsContent || !docsSidebar) return;

    // Drop any internal "table of contents" heading to avoid redundancy.
    const cleaned = markdownText
      .replace(/## תוכן עניינים[\s\S]*?(?=\n## )/i, '')
      .trim();

    docsContent.innerHTML = parseMarkdown(cleaned);

    // Build the sidebar from headings, tagging each with a stable id.
    const headings = docsContent.querySelectorAll('h2, h3');
    let sidebarHtml = '';
    headings.forEach((h, index) => {
      const headingId = `guide-heading-${index}`;
      h.id = headingId;
      const isSub = h.tagName.toLowerCase() === 'h3';
      const className = isSub ? 'support-nav-link sub-heading' : 'support-nav-link main-heading';
      sidebarHtml += `
        <a href="#${headingId}" class="${className}" onclick="window.MoovitdosUi.scrollDocsTo('${headingId}'); return false;">
          ${h.innerText}
        </a>`;
    });
    docsSidebar.innerHTML = sidebarHtml;

    const firstLink = docsSidebar.querySelector('.support-nav-link');
    if (firstLink) firstLink.classList.add('active');

    // Scroll-spy: highlight the sidebar link of the heading nearest the top.
    const handleGuideScroll = () => {
      const containerTop = docsContent.getBoundingClientRect().top;
      let activeId = null;
      for (let i = 0; i < headings.length; i++) {
        const relativeTop = headings[i].getBoundingClientRect().top - containerTop;
        if (relativeTop <= 30) activeId = headings[i].id;
        else break;
      }
      if (!activeId && headings.length) activeId = headings[0].id;
      if (activeId) {
        docsSidebar.querySelectorAll('.support-nav-link').forEach((link) => {
          link.classList.toggle('active', link.getAttribute('href') === `#${activeId}`);
        });
      }
    };

    if (docsContent._scrollSpyHandler) {
      docsContent.removeEventListener('scroll', docsContent._scrollSpyHandler);
    }
    docsContent._scrollSpyHandler = handleGuideScroll;
    docsContent.addEventListener('scroll', handleGuideScroll, { passive: true });
  }

  /**
   * Smooth-scroll the guide reader to a heading and mark its sidebar link.
   * @param {string} id
   */
  function scrollDocsTo(id) {
    const target = byId(id);
    const docsContent = byId('docs-content');
    if (!target || !docsContent) return;
    document.querySelectorAll('.support-nav-link').forEach((link) => {
      link.classList.toggle('active', link.getAttribute('href') === `#${id}`);
    });
    const top = target.getBoundingClientRect().top
      - docsContent.getBoundingClientRect().top
      + docsContent.scrollTop - 12;
    docsContent.scrollTo({ top, behavior: 'smooth' });
  }

  /** Friendly fallback when the guide markdown can't be loaded. */
  function injectGuideFallback() {
    const docsContent = byId('docs-content');
    const docsSidebar = byId('docs-sidebar');
    if (docsContent) {
      docsContent.innerHTML = `
        <div class="support-fallback-card">
          <svg aria-hidden="true" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="var(--text-secondary)" stroke-width="1.5"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>
          <h3>לא ניתן לטעון את המדריך</h3>
          <p>מדריך העזרה אינו זמין כעת לצפייה ישירה (ייתכן עקב הגבלת בקשות ל-GitHub).</p>
          <a href="${cfg.guideRawUrl}" target="_blank" rel="noopener" class="support-fallback-btn download-btn secondary">
            קריאת המדריך ישירות ב-GitHub
          </a>
        </div>`;
    }
    if (docsSidebar) {
      docsSidebar.innerHTML = '<span class="support-sidebar-fallback">ניווט אינו זמין</span>';
    }
  }

  window.MoovitdosUi = Object.freeze({
    renderInfo,
    renderReleases,
    renderReleasesError,
    loadScreenshots,
    openLightbox,
    closeLightbox,
    loadGuide,
    injectGuide,
    injectGuideFallback,
    scrollDocsTo,
    // exported for potential reuse / testing
    findAssets,
    formatDate,
    formatSize
  });
})();
