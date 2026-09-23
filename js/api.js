/**
 * api.js
 * ------
 * Thin data layer over the GitHub API + raw markdown files.
 * Every function is async and returns a clean empty result on network failure — except
 * fetchAllReleases, which rejects when neither the API nor releases.json answered (so the
 * page can say so instead of "no releases yet") — and uses a tiny in-memory cache
 * so repeated calls within a single page load do not re-hit the network.
 *
 * Exposes `window.MoovitdosApi`.
 * Depends on `window.MoovitdosConfig` (loaded first via defer).
 */
(function () {
  'use strict';

  const cfg = window.MoovitdosConfig;

  /** Simple per-page-load memo cache: key -> resolved value. */
  const cache = new Map();

  /**
   * Run a producer once per key and memoize its resolved value.
   * If the producer rejects, the failure is cached too so we do not retry
   * a hopeless request repeatedly during the same page load.
   * @template T
   * @param {string} key
   * @param {() => Promise<T>} producer
   * @returns {Promise<T>}
   */
  function memoize(key, producer) {
    if (!cache.has(key)) {
      cache.set(key, producer());
    }
    return cache.get(key);
  }

  /**
   * GET a JSON document; null on any network / HTTP / parse error.
   * `no-cache` revalidates with the server, so a static file rewritten by the site sync
   * (releases.json after a release) is picked up instead of a stale browser copy.
   * @param {string} url
   * @returns {Promise<any|null>}
   */
  async function fetchJson(url) {
    try {
      const response = await fetch(url, { cache: 'no-cache' });
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      return null;
    }
  }

  /**
   * All releases from the GitHub API, following pagination (per_page=100) until a short page.
   * null when the FIRST page could not be read (HTTP 403 once the anonymous 60/hour/IP quota
   * is used up, network error…); a later page failing returns what was gathered so far.
   * @returns {Promise<Array<object>|null>}
   */
  async function fetchReleasesFromApi() {
    const all = [];
    // Hard page cap as a safety net against an unexpected infinite loop.
    const MAX_PAGES = 50;

    for (let page = 1; page <= MAX_PAGES; page++) {
      let data = null;
      try {
        const response = await fetch(`${cfg.releasesApiUrl}?per_page=100&page=${page}`);
        if (response.ok) data = await response.json();
      } catch (err) {
        data = null;
      }
      if (!Array.isArray(data)) return page === 1 ? null : all;

      all.push(...data);
      if (data.length < 100) break;
    }

    // The list endpoint can lag behind a just-published release and return it with
    // `assets: []` (v1.0.192, 23.9.2026: the release page and /releases/{id} had all four
    // files while the list showed none for 10+ minutes). The latest release carries the
    // download buttons, so re-read it on its own when that happens — one extra request, only then.
    const latest = all.find((r) => r && !r.draft);
    if (latest && latest.id && !(Array.isArray(latest.assets) && latest.assets.length)) {
      const full = await fetchJson(`${cfg.releasesApiUrl}/${latest.id}`);
      if (full && Array.isArray(full.assets) && full.assets.length) latest.assets = full.assets;
    }

    return all;
  }

  /**
   * Releases for the site, newest first. The API first (live download counts); when it
   * refuses — 60 anonymous requests/hour per IP, shared by everyone behind a filtered-internet
   * or office IP — the static releases.json that the site sync writes next to the page.
   * Until 23.9.2026 a refused API returned [] and the site said "אין עדיין עדכונים" with no
   * download buttons. Rejects only when neither source answered, so the caller can show an
   * error with a link to the GitHub releases page.
   * @returns {Promise<Array<object>>}
   */
  async function fetchAllReleases() {
    return memoize('releases', async () => {
      const fromApi = await fetchReleasesFromApi();
      if (fromApi && fromApi.length) return fromApi;

      const fromFile = await fetchJson(cfg.releasesStaticUrl);
      if (Array.isArray(fromFile) && fromFile.length) return fromFile;

      if (fromApi) return fromApi; // the API answered: there are genuinely no releases
      throw new Error('GitHub releases unavailable (API and releases.json)');
    });
  }

  /**
   * Gallery images as `{ name, url }`. screenshots.json (written by the site sync, served by
   * Pages with no request quota) first; the API directory listing only when it is missing.
   * Fails silently (returns []) — matches old-site behavior.
   * @returns {Promise<Array<{name: string, url: string}>>}
   */
  async function fetchScreenshots() {
    return memoize('screenshots', async () => {
      const fromFile = await fetchJson(cfg.screenshotsStaticUrl);
      if (Array.isArray(fromFile) && fromFile.length) {
        return fromFile.filter((img) => img && typeof img.url === 'string' && img.url);
      }

      const files = await fetchJson(cfg.screenshotsApiUrl);
      if (!Array.isArray(files)) return [];
      return files
        .filter((f) => f && typeof f.name === 'string' && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name))
        .map((f) => ({ name: f.name, url: f.download_url }))
        .filter((img) => !!img.url);
    });
  }

  /**
   * Fetch the raw User Guide markdown text.
   * Returns '' on any error or if the file is empty/whitespace.
   * @returns {Promise<string>}
   */
  async function fetchGuideMarkdown() {
    return memoize('guide', async () => {
      try {
        const response = await fetch(cfg.guideRawUrl);
        if (!response.ok) return '';
        const text = await response.text();
        return text && text.trim() ? text : '';
      } catch (err) {
        return '';
      }
    });
  }

  window.MoovitdosApi = Object.freeze({
    fetchAllReleases,
    fetchScreenshots,
    fetchGuideMarkdown
  });
})();
