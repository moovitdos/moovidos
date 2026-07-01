/**
 * api.js
 * ------
 * Thin data layer over the GitHub API + raw markdown files.
 * Every function is async, never throws to the caller on network failure
 * (it returns a clean empty result instead) and uses a tiny in-memory cache
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
   * Fetch ALL releases, following pagination (per_page=100) until a short
   * page signals the end. Returns the raw release objects from GitHub.
   * On any network/HTTP error returns whatever was gathered so far (possibly []).
   * @returns {Promise<Array<object>>}
   */
  async function fetchAllReleases() {
    return memoize('releases', async () => {
      const all = [];
      let page = 1;
      // Hard page cap as a safety net against an unexpected infinite loop.
      const MAX_PAGES = 50;

      while (page <= MAX_PAGES) {
        let response;
        try {
          response = await fetch(`${cfg.releasesApiUrl}?per_page=100&page=${page}`);
        } catch (err) {
          // Network failure: stop and return what we have.
          break;
        }
        if (!response.ok) break;

        let data;
        try {
          data = await response.json();
        } catch (err) {
          break;
        }
        if (!Array.isArray(data)) break;

        all.push(...data);
        if (data.length < 100) break;
        page++;
      }

      return all;
    });
  }

  /**
   * Fetch the contents of the /screenshots directory and return only image
   * entries, each reduced to `{ name, url }` (url = download_url).
   * Fails silently (returns []) on any error — matches old-site behavior.
   * @returns {Promise<Array<{name: string, url: string}>>}
   */
  async function fetchScreenshots() {
    return memoize('screenshots', async () => {
      try {
        const response = await fetch(cfg.screenshotsApiUrl);
        if (!response.ok) return [];
        const files = await response.json();
        if (!Array.isArray(files)) return [];
        return files
          .filter((f) => f && typeof f.name === 'string' && /\.(jpg|jpeg|png|webp|gif)$/i.test(f.name))
          .map((f) => ({ name: f.name, url: f.download_url }))
          .filter((img) => !!img.url);
      } catch (err) {
        return [];
      }
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
