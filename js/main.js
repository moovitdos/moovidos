/**
 * main.js
 * -------
 * Entry point / orchestration. Wires the data layer (MoovitdosApi) to the
 * render layer (MoovitdosUi) on DOMContentLoaded, then installs the scroll
 * behavior (reveal animations, navbar active-link highlighting, navbar
 * floating effect). The guide is now an inline help center (see ui.js).
 *
 * Depends on: window.MoovitdosConfig, window.MoovitdosApi, window.MoovitdosUi.
 */
(function () {
  'use strict';

  const api = window.MoovitdosApi;
  const ui = window.MoovitdosUi;

  /* ------------------------------------------------------------------ *
   * Boot
   * ------------------------------------------------------------------ */

  function boot() {
    // Header entrance animations (staggered), mirroring the old site.
    document.querySelectorAll('header .reveal').forEach((el, i) => {
      setTimeout(() => el.classList.add('active'), i * 150);
    });

    // Synchronous render + fire-and-forget async loads.
    ui.renderInfo();
    ui.loadGuide();
    ui.loadScreenshots();
    loadReleases();

    installScrollHandler();

    // Run the scroll logic once so above-the-fold content reveals immediately.
    handleScroll();
  }

  /** Fetch + render releases, with a friendly Hebrew error fallback. */
  async function loadReleases() {
    try {
      const releases = await api.fetchAllReleases();
      ui.renderReleases(releases);
      // New content may now be on-screen; reveal anything already in view.
      handleScroll();
    } catch (error) {
      ui.renderReleasesError(error);
    }
  }

  /* ------------------------------------------------------------------ *
   * Scroll handling: reveal + navbar active link + floating navbar
   * ------------------------------------------------------------------ */

  /** Section ids tracked for navbar active-link highlighting. */
  const SECTION_IDS = ['home', 'info-section', 'content-area', 'gallery-section', 'guide', 'contact-section'];

  function handleScroll() {
    const scrollPos = window.scrollY;

    // Reveal animations.
    document.querySelectorAll('.reveal').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight - 50) {
        el.classList.add('active');
      }
    });

    // Determine the active section (last one whose top we've scrolled past).
    let activeId = '';
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id);
      if (el && scrollPos >= el.offsetTop - 150) {
        activeId = id;
      }
    }

    document.querySelectorAll('.navbar a').forEach((a) => {
      const href = a.getAttribute('href');
      if (href === `#${activeId}`) a.classList.add('active');
      else a.classList.remove('active');
    });

    // Floating effect for the navbar.
    const navbar = document.querySelector('.navbar');
    if (navbar) {
      if (scrollPos > 50) {
        navbar.style.padding = '12px 0';
        if (window.innerWidth > 768) {
          navbar.style.background = 'rgba(255, 255, 255, 0.8)';
          navbar.style.backdropFilter = 'blur(12px)';
        }
      } else {
        navbar.style.padding = '20px 0';
        navbar.style.background = 'transparent';
        navbar.style.backdropFilter = 'none';
      }
    }
  }

  function installScrollHandler() {
    // passive: true — we never preventDefault, so let the browser optimize.
    window.addEventListener('scroll', handleScroll, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * Kick off
   * ------------------------------------------------------------------ */

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    // Scripts use defer, so the DOM is typically ready by the time we run;
    // guard for the already-parsed case too.
    boot();
  }
})();
