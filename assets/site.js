/*
 * Moovidos public site — data + rendering. Plain ES2017, no dependencies, no build step.
 *
 * Data logic is ported from the previous site (website/אתר קלוד/js/*.js) and must behave the same:
 *  - releases: GitHub API (paginated, live download counts) -> releases.json next to the page when the
 *    API refuses (60 anonymous requests/hour per IP — visitors behind filtered internet share one IP);
 *    the newest release is re-read from /releases/{id} when the list returns it without assets.
 *  - guide: User_Guide.md from raw.githubusercontent.com -> the copy served next to the page -> fallback card.
 * The screenshots are static files beside the features (assets/shots/); the viewer below only enlarges them.
 * No regex lookbehind, optional chaining or object spread: the site must still run on older Safari/iOS.
 */
(function () {
  'use strict';

  var CFG = {
    releasesApi: 'https://api.github.com/repos/moovitdos/moovidos/releases',
    releasesStatic: 'releases.json',
    releasesPage: 'https://github.com/moovitdos/moovidos/releases/latest',
    guideRaw: 'https://raw.githubusercontent.com/moovitdos/moovidos/main/User_Guide.md',
    guideLocal: 'User_Guide.md',
    guidePage: 'https://github.com/moovitdos/moovidos/blob/main/User_Guide.md',
    olderCount: 19
  };

  /* ------------------------------------------------------------------ *
   * Pure logic (window.MoovidosLogic) — same results as the old site
   * ------------------------------------------------------------------ */

  function formatDate(d) {
    return new Date(d).toLocaleDateString('he-IL', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  function formatSize(bytes) {
    if (!bytes) return '';
    var i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) * 1 + ' ' + ['B', 'KB', 'MB', 'GB'][i];
  }

  /** Strip the "[APP] " / "Release " prefixes from a release title. */
  function cleanTitle(name) {
    return String(name).replace(/^\[APP\]\s*/i, '').replace(/^Release\s+/i, '');
  }

  /**
   * full / lite APKs and the two data files: pack = moovidos_pack_*.zip (current data generation),
   * zip = any other .zip (moovidos_data_*.zip, the legacy generation). Single-APK releases: first .apk = full.
   */
  function findAssets(assets) {
    var res = { full: null, lite: null, zip: null, pack: null };
    var list = Array.isArray(assets) ? assets : [];
    list.forEach(function (a) {
      var name = (a.name || '').toLowerCase();
      if (name.indexOf('full') >= 0 && endsWith(name, '.apk')) res.full = a;
      else if (name.indexOf('lite') >= 0 && endsWith(name, '.apk')) res.lite = a;
      else if (name.indexOf('moovidos_pack_') === 0 && endsWith(name, '.zip')) res.pack = a;
      else if (endsWith(name, '.zip')) res.zip = a;
    });
    if (!res.full && !res.lite) {
      res.full = list.filter(function (a) { return endsWith(a.name || '', '.apk'); })[0] || null;
    }
    return res;
  }

  function sumDownloads(assets) {
    if (!Array.isArray(assets)) return 0;
    return assets.reduce(function (sum, a) { return sum + (a.download_count || 0); }, 0);
  }

  /** The oldest release that ships a moovidos_pack_*.zip = the data-format cutover, as "1.0.192". */
  function packSince(releases) {
    var valid = (Array.isArray(releases) ? releases : []).filter(function (r) { return r && !r.draft; });
    var withPack = valid.filter(function (r) {
      return (r.assets || []).some(function (a) { return /^moovidos_pack_.*\.zip$/i.test(a.name || ''); });
    });
    if (!withPack.length) return null;
    var stamp = function (r) { return new Date(r.published_at || r.created_at); };
    var oldest = withPack.reduce(function (acc, r) { return stamp(r) < stamp(acc) ? r : acc; });
    var raw = cleanTitle(oldest.tag_name || oldest.name || '');
    return raw ? String(raw).replace(/^v/i, '') : null;
  }

  function endsWith(s, suffix) {
    return s.length >= suffix.length && s.slice(s.length - suffix.length) === suffix;
  }

  /** "1.0.192" from tag v1.0.192 (or from the title when the tag is not a version). */
  function versionOf(r) {
    var tag = String(r.tag_name || '');
    if (/^v?\d/i.test(tag)) return tag.replace(/^v/i, '');
    return cleanTitle(r.name || tag).replace(/^\[[^\]]*\]\s*/, '').replace(/^Release\s+/i, '').replace(/^v/i, '');
  }

  var KIND_BY_TAG = { 'APP+DATA': 'אפליקציה + נתונים', 'DATA': 'נתונים', 'APP': 'אפליקציה' };

  /**
   * Release body -> { updated, items[], downloads[] }. Bodies look like
   *   **מה עודכן?** אפליקציה + נתונים / **תיאור השינויים:** / a,comma,separated,list / --- / גרסאות להורדה: 1. **…:** …
   * (older ones: "מה חדש?" + free lines). Every change survives; the repeated download explanation is kept apart.
   * A line is split into items at commas / "•"; a comma between two digits (230,000) stays. The release mail
   * (tools/updates/send_gmail_updates.py) follows the same rules.
   */
  function parseNotes(body) {
    var text = String(body || '').replace(/\\n/g, '\n').replace(/\r\n?/g, '\n');
    var out = { updated: null, items: [], downloads: [] };
    var inDownloads = false;
    text.split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (/^(-{3,}|_{3,}|\*{3,})$/.test(line) || /^<hr/i.test(line)) return;
      var plain = line.replace(/\*\*/g, '').trim();
      if (/^(גרסאות להורדה|downloads)/i.test(plain)) { inDownloads = true; return; }
      if (inDownloads) {
        var d = plain.replace(/^\d+[.)]\s*/, '');
        var m = d.match(/^([^:]{1,60}):\s*(.*)$/);
        out.downloads.push(m ? { title: m[1].trim(), text: m[2].trim() } : { title: '', text: d });
        return;
      }
      var up = plain.match(/^מה עודכן\?\s*(.*)$/);
      if (up) { out.updated = up[1].replace(/[.\s]+$/, '') || null; return; }
      if (/^#*\s*(מה התחדש בגרסה זו\?|מה חדש\?)\s*$/.test(plain)) return;
      var desc = line.match(/^\*\*תיאור השינויים:?\*\*:?\s*(.*)$/);
      if (desc) { line = desc[1].trim(); if (!line) return; }
      if (/^\[[a-z+ ]+\]$/i.test(line)) return;
      line = line.replace(/^#+\s*/, '');
      if (/^\d+[.)]\s/.test(line)) { out.items.push(line.replace(/^\d+[.)]\s*/, '')); return; }
      splitChanges(line).forEach(function (p) { out.items.push(p); });
    });
    if (!out.items.length) out.items.push('שיפורי ביצועים ושינויים פנימיים.');
    return out;
  }

  function splitChanges(line) {
    var parts = [];
    var cur = '';
    for (var i = 0; i < line.length; i++) {
      var c = line.charAt(i);
      var isComma = c === ',' || c === '،';
      var inNumber = /\d/.test(line.charAt(i - 1)) && /\d/.test(line.charAt(i + 1));
      if ((isComma && !inNumber) || c === '•') { parts.push(cur); cur = ''; } else { cur += c; }
    }
    parts.push(cur);
    return parts.map(function (p) { return p.replace(/^[•\-*\s]+/, '').trim(); }).filter(Boolean);
  }

  function kindOf(r, notes) {
    if (notes.updated) return notes.updated;
    var m = String(r.name || '').match(/^\[([A-Z+]+)\]/i);
    return m ? (KIND_BY_TAG[m[1].toUpperCase()] || null) : null;
  }

  window.MoovidosLogic = Object.freeze({
    findAssets: findAssets, formatSize: formatSize, cleanTitle: cleanTitle, sumDownloads: sumDownloads,
    packSince: packSince, formatDate: formatDate, parseNotes: parseNotes, versionOf: versionOf
  });

  /* ------------------------------------------------------------------ *
   * Small DOM helpers
   * ------------------------------------------------------------------ */

  var byId = function (id) { return document.getElementById(id); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /** Escaped text with **bold** kept. */
  function rich(s) { return esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); }
  /** Latin run (size, version) isolated LTR inside Hebrew — "35.2 MB", never "MB 35.2". */
  function ltr(s) { return '<bdi dir="ltr">' + esc(s) + '</bdi>'; }
  function icon(id) { return '<svg class="ic" aria-hidden="true"><use href="#' + id + '"/></svg>'; }

  /* ------------------------------------------------------------------ *
   * Network
   * ------------------------------------------------------------------ */

  var memo = {};
  function once(key, producer) {
    if (!memo[key]) memo[key] = producer();
    return memo[key];
  }

  async function fetchJson(url) {
    try {
      var res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  async function fetchText(url) {
    try {
      var res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return '';
      var text = await res.text();
      return text && text.trim() ? text : '';
    } catch (e) {
      return '';
    }
  }

  /** All releases from the API, following pagination; null when page 1 could not be read. */
  async function fetchReleasesFromApi() {
    var all = [];
    for (var page = 1; page <= 50; page++) {
      var data = null;
      try {
        var res = await fetch(CFG.releasesApi + '?per_page=100&page=' + page);
        if (res.ok) data = await res.json();
      } catch (e) {
        data = null;
      }
      if (!Array.isArray(data)) return page === 1 ? null : all;
      Array.prototype.push.apply(all, data);
      if (data.length < 100) break;
    }
    // The list endpoint can lag behind a just-published release and return it with assets: [].
    var latest = all.filter(function (r) { return r && !r.draft; })[0];
    if (latest && latest.id && !(Array.isArray(latest.assets) && latest.assets.length)) {
      var full = await fetchJson(CFG.releasesApi + '/' + latest.id);
      if (full && Array.isArray(full.assets) && full.assets.length) latest.assets = full.assets;
    }
    return all;
  }

  function fetchAllReleases() {
    return once('releases', async function () {
      var fromApi = await fetchReleasesFromApi();
      if (fromApi && fromApi.length) return fromApi;
      var fromFile = await fetchJson(CFG.releasesStatic);
      if (Array.isArray(fromFile) && fromFile.length) return fromFile;
      if (fromApi) return fromApi; // the API answered: there are genuinely no releases
      throw new Error('GitHub releases unavailable (API and releases.json)');
    });
  }

  function fetchGuide() {
    return once('guide', async function () {
      return (await fetchText(CFG.guideRaw)) || (await fetchText(CFG.guideLocal));
    });
  }

  /* ------------------------------------------------------------------ *
   * Downloads
   * ------------------------------------------------------------------ */

  /** The asset list of one release as a card: the full APK as the main button, the rest as rows. */
  function downloadCard(res, since) {
    var sinceHtml = since ? ltr(since) : '';
    var rows = [];
    if (res.lite) rows.push(dlRow(res.lite, 'lite', 'גרסה קלה', 'אפליקציה בלבד', 'i-android'));
    if (res.pack) rows.push(dlRow(res.pack, 'pack', 'נתונים בלבד', since ? 'לגרסה ' + sinceHtml + ' ומעלה' : 'לגרסה הנוכחית ומעלה', 'i-archive'));
    if (res.zip) {
      rows.push(res.pack
        ? dlRow(res.zip, 'zip', 'נתונים לגרסאות ישנות', since ? 'לגרסאות שלפני ' + sinceHtml : 'לגרסאות קודמות', 'i-archive')
        : dlRow(res.zip, 'zip', 'נתונים בלבד', 'לייבוא ידני', 'i-archive'));
    }
    var main = '';
    if (res.full) {
      var size = formatSize(res.full.size);
      main = '<a class="btn btn-primary dl-main" data-dl="full" href="' + esc(res.full.browser_download_url) + '">' +
        '<span class="dl-main__text"><span class="dl-main__title">גרסה מלאה</span>' +
        '<span class="dl-main__sub">כולל את כל הנתונים' + (size ? ' · ' + ltr(size) : '') + '</span></span>' +
        icon('i-download') + '</a>';
    }
    return '<aside class="card" aria-label="הורדה">' +
      '<div class="head"><img src="logo.png" alt="" width="56" height="56">' +
      '<div><b>מובידוס</b><span>רכישה חד-פעמית · אנדרואיד 4.4 ומעלה · התקנה ישירה</span></div></div>' +
      main +
      (rows.length ? '<div class="dl-list">' + rows.join('') + '</div>' : '') +
      '</aside>';
  }

  function dlRow(asset, key, title, sub, iconId) {
    var size = formatSize(asset.size);
    return '<a class="dl-row" data-dl="' + key + '" href="' + esc(asset.browser_download_url) + '">' + icon(iconId) +
      '<span class="dl-row__title">' + title + '</span>' +
      '<span class="dl-row__size">' + (size ? ltr(size) : '') + '</span>' +
      '<span class="dl-row__sub">' + sub + '</span></a>';
  }

  function changesHtml(items) {
    return '<ul class="changes">' + items.map(function (t) { return '<li>' + rich(t) + '</li>'; }).join('') + '</ul>';
  }

  function setState(el, state) { if (el) el.setAttribute('data-state', state); }

  function renderReleases(releases) {
    var area = byId('content-area');
    if (!area) return;
    var valid = (Array.isArray(releases) ? releases : []).filter(function (r) { return r && !r.draft; });
    if (!valid.length) {
      area.innerHTML = '<div class="state"><h3>אין עדיין עדכונים להצגה</h3><p>פרטי העדכונים יופיעו כאן ברגע שתפורסם גרסה.</p></div>';
      setState(area, 'empty');
      return;
    }

    var total = valid.reduce(function (sum, r) { return sum + sumDownloads(r.assets); }, 0);
    if (total > 0) {
      $$('[data-total-downloads]').forEach(function (el) {
        el.textContent = total.toLocaleString() + ' הורדות';
        el.hidden = false;
      });
    }

    var since = packSince(valid);
    var latest = valid[0];
    var assets = findAssets(latest.assets);
    var notes = parseNotes(latest.body);
    var kind = kindOf(latest, notes);
    var explain = notes.downloads.filter(function (d) { return d.title; });
    var version = versionOf(latest);

    // The hero button downloads the full APK directly once the release is known.
    if (assets.full) {
      $$('[data-hero-download]').forEach(function (a) { a.href = assets.full.browser_download_url; });
      $$('[data-hero-version]').forEach(function (el) {
        el.innerHTML = 'גרסה ' + ltr(version) + ' · ' + ltr(formatSize(assets.full.size));
        el.hidden = false;
      });
    }

    var html = '<div class="release" data-release="latest">' +
      '<div class="whatsnew">' +
        '<div class="rel-head"><h3>גרסה ' + ltr(version) + '</h3>' +
          '<span class="badge badge-live">הגרסה האחרונה</span>' +
          (kind ? '<span class="badge">' + esc(kind) + '</span>' : '') + '</div>' +
        '<p class="rel-meta"><time datetime="' + esc(latest.published_at || '') + '">' + esc(formatDate(latest.published_at)) + '</time>' +
          '<span><span class="num">' + sumDownloads(latest.assets).toLocaleString() + '</span> הורדות</span></p>' +
        '<h4 class="label">תיאור השינויים</h4>' + changesHtml(notes.items) +
        (explain.length ? '<details class="explain"><summary>גרסאות להורדה</summary><dl>' +
          explain.map(function (d) { return '<dt>' + rich(d.title) + '</dt><dd>' + rich(d.text) + '</dd>'; }).join('') +
          '</dl></details>' : '') +
      '</div>' +
      downloadCard(assets, since) +
    '</div>';

    var older = valid.slice(1, 1 + CFG.olderCount);
    if (older.length) {
      html += '<details class="history"><summary>' + icon('i-chev-d') + 'הצג גרסאות קודמות</summary><ol class="timeline">' +
        older.map(function (r) {
          var n = parseNotes(r.body);
          var k = kindOf(r, n);
          return '<li data-release="older"><div class="old-head">' +
            '<span class="old-v">' + ltr(versionOf(r)) + '</span>' +
            '<time class="old-date" datetime="' + esc(r.published_at || '') + '">' + esc(formatDate(r.published_at)) + '</time>' +
            '<span class="old-tags">' + (k ? '<span class="badge">' + esc(k) + '</span>' : '') + '<span class="badge">גרסה קודמת</span></span>' +
            '</div>' + changesHtml(n.items) + '</li>';
        }).join('') + '</ol></details>';
    }

    area.innerHTML = html;
    setState(area, 'ready');
  }

  function renderReleasesError() {
    var area = byId('content-area');
    if (!area) return;
    area.innerHTML = '<div class="state">' +
      '<h3>לא ניתן לטעון כרגע את רשימת הגרסאות.</h3>' +
      '<p>אפשר להוריד את הגרסה האחרונה ישירות מדף הגרסאות ב-GitHub:</p>' +
      '<a class="btn btn-primary" href="' + CFG.releasesPage + '" target="_blank" rel="noopener">' + icon('i-download') + 'לדף הגרסאות ב-GitHub</a>' +
      '</div>';
    setState(area, 'error');
  }

  async function loadReleases() {
    try {
      renderReleases(await fetchAllReleases());
    } catch (e) {
      renderReleasesError();
    }
  }

  /* ------------------------------------------------------------------ *
   * Screenshot viewer: the screenshots beside the features open enlarged
   * ------------------------------------------------------------------ */

  var shots = [];
  var viewer = { index: 0, opener: null };

  function wireShots() {
    var buttons = $$('.shot');
    shots = buttons.map(function (b) {
      var im = b.querySelector('img');
      return { url: im.getAttribute('src'), alt: im.getAttribute('alt') || '' };
    });
    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () { openViewer(i, b); });
    });
  }

  function viewerEl() { return document.querySelector('[data-lightbox]'); }

  function showShot(i) {
    var box = viewerEl();
    if (!box || !shots.length) return;
    viewer.index = Math.max(0, Math.min(i, shots.length - 1));
    var cur = shots[viewer.index];
    var img = box.querySelector('.lb-img');
    img.src = cur.url;
    img.alt = cur.alt;
    var counter = box.querySelector('[data-lightbox-counter]');
    counter.textContent = (viewer.index + 1) + ' / ' + shots.length;
    var prev = box.querySelector('[data-lightbox-prev]');
    var next = box.querySelector('[data-lightbox-next]');
    prev.disabled = viewer.index === 0;
    next.disabled = viewer.index === shots.length - 1;
    var single = shots.length <= 1;
    prev.hidden = single; next.hidden = single; counter.hidden = single;
  }

  function openViewer(i, opener) {
    var box = viewerEl();
    if (!box) return;
    viewer.opener = opener || document.activeElement;
    showShot(i);
    box.classList.add('is-open');
    box.setAttribute('aria-hidden', 'false');
    document.body.classList.add('is-locked');
    box.querySelector('[data-lightbox-close]').focus();
  }

  function closeViewer() {
    var box = viewerEl();
    if (!box || !box.classList.contains('is-open')) return;
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('is-locked');
    box.querySelector('.lb-img').removeAttribute('src');
    if (viewer.opener && viewer.opener.focus) viewer.opener.focus();
    viewer.opener = null;
  }

  function step(delta) {
    var t = viewer.index + delta;
    if (t >= 0 && t < shots.length) showShot(t);
  }

  function wireViewer() {
    var box = viewerEl();
    if (!box) return;
    box.querySelector('[data-lightbox-prev]').addEventListener('click', function (e) { e.stopPropagation(); step(-1); });
    box.querySelector('[data-lightbox-next]').addEventListener('click', function (e) { e.stopPropagation(); step(1); });
    box.addEventListener('click', function (e) {
      if (e.target === box || e.target.classList.contains('lb-stage') || e.target.closest('[data-lightbox-close]')) closeViewer();
    });
    document.addEventListener('keydown', function (e) {
      if (!box.classList.contains('is-open')) return;
      if (e.key === 'Escape' || e.key === 'Esc') { e.preventDefault(); closeViewer(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); step(1); }   // RTL: left = next
      else if (e.key === 'ArrowRight') { e.preventDefault(); step(-1); }
      else if (e.key === 'Tab') {                                        // keep focus inside the viewer
        var f = $$('button:not([disabled]):not([hidden])', box);
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    var x0 = null;
    box.addEventListener('touchstart', function (e) { x0 = e.changedTouches && e.changedTouches.length ? e.changedTouches[0].clientX : null; }, { passive: true });
    box.addEventListener('touchend', function (e) {
      if (x0 === null || !e.changedTouches || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - x0;
      x0 = null;
      if (Math.abs(dx) < 40) return;
      step(dx < 0 ? 1 : -1); // swipe left -> next (RTL)
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * Guide: a small markdown renderer (headings, paragraphs, nested lists, bold, code, links, rules)
   * ------------------------------------------------------------------ */

  function mdInline(s) {
    return esc(s)
      .replace(/`([^`]+)`/g, '<code dir="ltr">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>')
      .replace(/\[([^\]]+)\]\(#[^)]*\)/g, '$1');
  }

  function renderMarkdown(md) {
    var out = [];
    var para = [];
    var lists = []; // open lists: { tag, indent }
    var blank = false;

    function flushPara() {
      if (para.length) out.push('<p>' + mdInline(para.join(' ')) + '</p>');
      para = [];
    }
    function closeListsDeeperThan(indent) {
      while (lists.length && lists[lists.length - 1].indent > indent) out.push('</li></' + lists.pop().tag + '>');
    }

    md.replace(/\r\n?/g, '\n').split('\n').forEach(function (raw) {
      var line = raw.replace(/\s+$/, '');
      if (!line.trim()) { flushPara(); blank = true; return; }
      var h = line.match(/^(#{1,6})\s+(.*)$/);
      var item = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (h) {
        flushPara(); closeListsDeeperThan(-1);
        var lv = Math.min(h[1].length, 4);
        out.push('<h' + lv + '>' + mdInline(h[2].trim()) + '</h' + lv + '>');
      } else if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
        flushPara(); closeListsDeeperThan(-1);
        out.push('<hr>');
      } else if (item) {
        flushPara();
        var indent = item[1].replace(/\t/g, '    ').length;
        var tag = /\d/.test(item[2]) ? 'ol' : 'ul';
        var top = lists[lists.length - 1];
        if (!top || indent > top.indent + 1) {
          out.push('<' + tag + '><li>'); lists.push({ tag: tag, indent: indent });
        } else {
          closeListsDeeperThan(indent + 1);
          top = lists[lists.length - 1];
          if (top && top.tag === tag) {
            out.push('</li><li>');
          } else {
            if (top) out.push('</li></' + lists.pop().tag + '>');
            out.push('<' + tag + '><li>'); lists.push({ tag: tag, indent: indent });
          }
        }
        out.push(mdInline(item[3]));
      } else if (lists.length && !blank) {
        out.push(' ' + mdInline(line.trim())); // lazy continuation of the current item
      } else {
        closeListsDeeperThan(-1);
        para.push(line.trim());
      }
      blank = false;
    });
    flushPara();
    closeListsDeeperThan(-1);
    return out.join('');
  }

  var desktopReader = window.matchMedia ? window.matchMedia('(min-width: 901px)') : null;

  function renderGuide(md) {
    var body = byId('guide-content');
    var toc = document.querySelector('#guide [data-toc]');
    var cleaned = md
      .replace(/## תוכן עניינים[\s\S]*?(?=\n## )/i, '')  // the reader has its own table of contents
      .replace(/^\s*#\s[^\n]*\n/, '')                       // the section already carries the title
      .trim();
    body.innerHTML = renderMarkdown(cleaned);

    var heads = $$('h2, h3', body);
    var links = heads.map(function (h, i) {
      h.id = 'guide-' + (i + 1);
      return '<li><a href="#' + h.id + '"' + (h.tagName === 'H3' ? ' class="sub"' : '') + '>' + esc(h.textContent) + '</a></li>';
    });
    toc.innerHTML = '<details class="toc"' + (desktopReader && desktopReader.matches ? ' open' : '') + '>' +
      '<summary>ניווט בתוכן המדריך' + icon('i-chev-d') + '</summary><ol>' + links.join('') + '</ol></details>';
    if (desktopReader && desktopReader.addListener) {
      desktopReader.addListener(function (mq) { var d = toc.querySelector('details'); if (d && mq.matches) d.open = true; });
    }

    toc.addEventListener('click', function (e) {
      var a = e.target.closest ? e.target.closest('a[href^="#guide-"]') : null;
      if (!a) return;
      var target = byId(a.getAttribute('href').slice(1));
      if (!target) return;
      e.preventDefault();
      var box = body.getBoundingClientRect();
      if (box.top < 64 || box.bottom > window.innerHeight) body.scrollIntoView({ block: 'nearest' });
      if (isScroller(body)) {
        body.scrollTop = target.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 12;
      } else {
        target.scrollIntoView({ block: 'start' });
      }
      markToc(target.id);
    });

    var ticking = false;
    function spy() {
      ticking = false;
      var ref = isScroller(body) ? body.getBoundingClientRect().top + 40 : 120;
      var active = heads[0];
      for (var i = 0; i < heads.length; i++) {
        if (heads[i].getBoundingClientRect().top <= ref) active = heads[i]; else break;
      }
      if (active) markToc(active.id);
    }
    function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(spy); } }
    body.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    spy();
    setState(byId('guide'), 'ready');
  }

  function isScroller(el) {
    var oy = window.getComputedStyle(el).overflowY;
    return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight;
  }

  function markToc(id) {
    $$('#guide [data-toc] a').forEach(function (a) {
      var on = a.getAttribute('href') === '#' + id;
      a.classList.toggle('is-active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  }

  function renderGuideError() {
    var body = byId('guide-content');
    var toc = document.querySelector('#guide [data-toc]');
    body.innerHTML = '<div class="state"><h3>לא ניתן לטעון את המדריך</h3>' +
      '<p>מדריך העזרה אינו זמין כעת לצפייה ישירה (ייתכן עקב הגבלת בקשות ל-GitHub).</p>' +
      '<a class="btn btn-quiet" href="' + CFG.guidePage + '" target="_blank" rel="noopener">' + icon('i-book') + 'קריאת המדריך ישירות ב-GitHub</a></div>';
    toc.innerHTML = '<p class="toc">ניווט אינו זמין</p>';
    setState(byId('guide'), 'error');
  }

  async function loadGuide() {
    if (!byId('guide-content')) return;
    var md = await fetchGuide();
    if (md) renderGuide(md); else renderGuideError();
  }

  /* ------------------------------------------------------------------ *
   * Header: mark the section in view
   * ------------------------------------------------------------------ */

  function wireNav() {
    var links = $$('.nav a[href^="#"]');
    var sections = links.map(function (a) { return byId(a.getAttribute('href').slice(1)); });
    var ticking = false;
    function update() {
      ticking = false;
      var y = window.innerHeight * 0.3;
      var current = -1;
      sections.forEach(function (s, i) { if (s && s.getBoundingClientRect().top <= y) current = i; });
      links.forEach(function (a, i) { if (i === current) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); });
    }
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }, { passive: true });
    update();
  }

  /* ------------------------------------------------------------------ *
   * Header: the forum's account (signing in, the bell, the account's menu)
   * The forum's script draws it (assets/board.js, with board-text.js, board.css and Google Sans). It is loaded
   * here only for a member - a browser that keeps a session of the forum - or when "כניסה" is pressed, so a
   * visitor of the site pays nothing for it: no file, no request to the forum. forum.html loads it by itself.
   * ------------------------------------------------------------------ */

  var BOARD_SESSION = 'mv-board-token';      // where board.js keeps the session (TOKEN there)
  var BOARD_FILES = {
    styles: ['https://fonts.googleapis.com/css2?family=Google+Sans:wght@400..700&display=swap', 'assets/board.css'],
    scripts: ['assets/board-text.js', 'assets/board.js']      // in this order: board.js reads board-text.js
  };
  function loadBoard() {
    return once('board', function () {
      var loads = BOARD_FILES.styles.map(function (href) {
        return new Promise(function (resolve) {
          var link = document.createElement('link');
          link.rel = 'stylesheet';
          link.href = href;
          link.onload = link.onerror = resolve;          // a font that does not come is not a reason to wait
          document.head.appendChild(link);
        });
      });
      loads.push(new Promise(function (resolve, reject) {
        BOARD_FILES.scripts.forEach(function (src, i) {
          var script = document.createElement('script');
          script.src = src;
          script.async = false;                          // run in the order they were added
          if (i === BOARD_FILES.scripts.length - 1) { script.onload = resolve; script.onerror = reject; }
          document.head.appendChild(script);
        });
      }));
      return Promise.all(loads);
    });
  }
  function wireAccount() {
    var box = byId('user');
    if (!box) return;
    var member = false;
    try { member = !!localStorage.getItem(BOARD_SESSION); } catch (e) { /* storage blocked: a visitor */ }
    if (member) {
      box.setAttribute('data-pending', '');            // not "כניסה" for a moment: board.js draws his bell and menu
      document.documentElement.setAttribute('data-member', '');      // nor what only a visitor is offered (board.js corrects both)
      loadBoard().catch(function () { box.removeAttribute('data-pending'); });
    }
    // "כניסה / הרשמה" in the top bar, "הרשמה" in the forum's strip: the forum's dialog, its script loaded first.
    // The button is left as it is while that loads (board.js keeps a copy of the top bar's markup as it finds it -
    // a disabled one came back disabled after signing out); a second press waits for the same load.
    var opening = null;
    document.addEventListener('click', function (event) {
      var button = event.target.closest('[data-act="auth"]');
      if (!button || window.MoovidosBoard) return;     // once the forum's script is here, it answers by itself
      if (opening) return;
      opening = button.getAttribute('data-tab');
      loadBoard().then(function () {
        window.MoovidosBoard.auth(opening);
        opening = null;
      }, function () { opening = null; });
    });
  }

  /* ------------------------------------------------------------------ *
   * A one-time message: what is new on the site (#news in index.html)
   * Shown once per browser, a moment after the page: once it has appeared it is not shown again (its id is kept).
   * A browser that keeps nothing is not shown it at all - it could not stay "once" there.
   * ------------------------------------------------------------------ */

  var NEWS_SEEN = 'mv-site-news';
  function wireNews() {
    var card = byId('news');
    if (!card) return;
    var id = card.getAttribute('data-news');
    try { if (localStorage.getItem(NEWS_SEEN) === id) return; } catch (e) { return; }
    function close() { card.hidden = true; document.removeEventListener('keydown', onKey); }
    function onKey(event) {          // Escape closes it - unless a dialog or the screenshot viewer is the one in front
      if (event.key === 'Escape' && !document.querySelector('#modal .dialog, [data-lightbox].is-open')) close();
    }
    card.addEventListener('click', function (event) {
      if (event.target.closest('[data-news-close], [data-news-done]')) close();
    });
    setTimeout(function () {
      card.hidden = false;
      try { localStorage.setItem(NEWS_SEEN, id); } catch (e) { /* shown once in this visit anyway */ }
      document.addEventListener('keydown', onKey);
    }, 1800);
  }

  /* ------------------------------------------------------------------ */

  function boot() {
    wireNav();
    wireAccount();
    wireNews();
    wireViewer();
    wireShots();
    loadReleases();
    loadGuide();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
