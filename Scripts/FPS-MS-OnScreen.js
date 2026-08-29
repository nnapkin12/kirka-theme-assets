// ==UserScript==
// @name         NAP FPS / MS HUD
// @description  Bottom-right FPS/ms: enables Kirka stats in-match, reads #fps/#ping
// @version      1.2.0
// @author       NAP
// @match        *://kirka.io/*
// @run-at       document-idle
// ==/UserScript==


(function () {
  'use strict';

  const ENABLED = true;
  const MATCH_PREFIX = 'https://kirka.io/games/';
  const POLL_MS = 500;
  const ENABLE_RETRY_MS = 2000;
  const HUD_ID = 'nap-fps-ms-hud';
  const STYLE_ID = 'nap-fps-ms-hud-styles';
  const OVERLAY_STYLE_ID = 'nap-fps-overlay-hide-styles';
  const HIDE_ROW_IDS = ['region', 'version', 'triangles', 'tickTime', 'inputDelay'];

  if (!ENABLED) {
    return;
  }

  let lastEnableAttemptAt = 0;
  let routeHooksInstalled = false;

  function ensureHudStyles() {
    if (document.getElementById(STYLE_ID)) {
      return;
    }
    const s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = `
      #${HUD_ID} {
        position: fixed;
        right: 14px;
        bottom: 14px;
        z-index: 2147483640;
        padding: 8px 12px;
        border-radius: 10px;
        color: #d1d5db;
        font: 600 11px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif;
        font-variant-numeric: tabular-nums;
        pointer-events: none;
        letter-spacing: 0.02em;
        text-align: right;
        background: rgba(8, 12, 22, 0.92);
        border: 1px solid rgba(74, 222, 128, 0.45);
        box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45), 0 0 16px rgba(74, 222, 128, 0.15);
        user-select: none;
      }
      #${HUD_ID} .nap-hud-stats { color: #e5e7eb; }
      #${HUD_ID}.nap-hidden { display: none !important; }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function ensureOverlayHideStyles() {
    if (document.getElementById(OVERLAY_STYLE_ID)) {
      return;
    }
    const s = document.createElement('style');
    s.id = OVERLAY_STYLE_ID;
    // parking : keep nodes updating, not on-screen.
    s.textContent = `
      body.nap-fps-in-game #overlay.nap-fps-overlay-pinned:not(.nap-fps-overlay-live) {
        display: none !important;
      }
      body.nap-fps-in-game #overlay.nap-fps-overlay-pinned.nap-fps-overlay-live {
        position: fixed !important;
        left: -10000px !important;
        top: -10000px !important;
        width: 1px !important;
        height: 1px !important;
        overflow: hidden !important;
        opacity: 0 !important;
        visibility: hidden !important;
        pointer-events: none !important;
        z-index: -1 !important;
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }

  function ensureHud() {
    ensureHudStyles();
    let hud = document.getElementById(HUD_ID);
    if (hud) {
      return hud;
    }
    hud = document.createElement('div');
    hud.id = HUD_ID;
    hud.className = 'nap-hidden';
    hud.innerHTML = '<div class="nap-hud-stats"></div>';
    (document.documentElement || document.body).appendChild(hud);
    return hud;
  }

  function isVisible(el) {
    if (!el) {
      return false;
    }
    try {
      const st = window.getComputedStyle(el);
      if (!st || st.display === 'none' || st.visibility === 'hidden') {
        return false;
      }
      if (Number(st.opacity) === 0) {
        return false;
      }
      const r = el.getBoundingClientRect();
      return r.width > 2 && r.height > 2;
    } catch (_) {
      return false;
    }
  }

  /**  /games/ URL (+ interface when present). */
  function isInMatch() {
    let onGamesUrl = false;
    try {
      onGamesUrl = String(window.location.href || '').startsWith(MATCH_PREFIX);
    } catch (_) {
      onGamesUrl = false;
    }
    if (!onGamesUrl) {
      return false;
    }

    const gameUi = document.querySelector('.desktop-game-interface');
    // Joining: URL ready before HUD mounts
    if (!gameUi) {
      return true;
    }
    // Leaving but URL briefly still /games/: hide if main HUD is gone
    return isVisible(gameUi);
  }

  /** Text-only gate (do not require on-screen — overlay is intentionally park-offscreen). */
  function readOverlayStatsRaw() {
    const fps = document.getElementById('fps');
    const ping = document.getElementById('ping');
    if (!fps || !ping) {
      return null;
    }
    const fpsText = fps.textContent || '';
    const pingText = ping.textContent || '';
    if (!/FPS:\s*[\d.]+/i.test(fpsText) || !/PING:\s*[\d.]+/i.test(pingText)) {
      return null;
    }
    return { fpsText, pingText };
  }

  function readGameStats() {
    const raw = readOverlayStatsRaw();
    if (!raw) {
      return null;
    }
    const fm = raw.fpsText.match(/([\d.]+)/);
    const pm = raw.pingText.match(/([\d.]+)/);
    if (!fm || !pm) {
      return null;
    }
    return { fps: fm[1], ms: pm[1] };
  }

  function setOverlayLive(live) {
    const overlay = document.getElementById('overlay');
    if (!overlay) {
      return;
    }
    overlay.classList.toggle('nap-fps-overlay-live', !!live);
  }

  function dispatchInfoKey() {
    const ipc = window.__NAP_IPC__;
    if (ipc && typeof ipc.sendKeyTap === 'function') {
      return ipc.sendKeyTap('i');
    }
    const opts = {
      key: 'i',
      code: 'KeyI',
      keyCode: 73,
      which: 73,
      bubbles: true,
      cancelable: true,
    };
    [document, window, document.body].forEach((target) => {
      if (!target) {
        return;
      }
      target.dispatchEvent(new KeyboardEvent('keydown', opts));
      target.dispatchEvent(new KeyboardEvent('keyup', opts));
    });
    return Promise.resolve(false);
  }

  function decorateOverlayRows(overlay) {
    overlay.querySelectorAll('span[id]').forEach((span) => {
      const row = span.parentElement;
      if (!row) {
        return;
      }
      if (HIDE_ROW_IDS.indexOf(span.id) !== -1) {
        row.setAttribute('data-nap-fps-hide', '1');
      }
    });
  }

  function tryEnableOverlayStats() {
    if (readOverlayStatsRaw()) {
      setOverlayLive(true);
      return;
    }

    const now = Date.now();
    if (now - lastEnableAttemptAt < ENABLE_RETRY_MS) {
      return;
    }
    lastEnableAttemptAt = now;

    if (!document.getElementById('overlay')) {
      return;
    }

    Promise.resolve(dispatchInfoKey()).then(() => {
      setTimeout(() => {
        if (readOverlayStatsRaw()) {
          setOverlayLive(true);
        }
      }, 120);
    });
  }

  function pinKirkaOverlay() {
    if (!isInMatch()) {
      if (document.body) {
        document.body.classList.remove('nap-fps-in-game');
      }
      setOverlayLive(false);
      const overlay = document.getElementById('overlay');
      if (overlay) {
        overlay.classList.remove('nap-fps-overlay-pinned', 'nap-fps-overlay-live');
      }
      return;
    }

    ensureOverlayHideStyles();
    if (document.body) {
      document.body.classList.add('nap-fps-in-game');
    }

    const overlay = document.getElementById('overlay');
    if (!overlay) {
      tryEnableOverlayStats();
      return;
    }

    overlay.classList.add('nap-fps-overlay-pinned');
    decorateOverlayRows(overlay);

    if (readOverlayStatsRaw()) {
      setOverlayLive(true);
    } else {
      setOverlayLive(false);
      tryEnableOverlayStats();
    }
  }

  function hideHud(hud) {
    hud.classList.add('nap-hidden');
    const line = hud.querySelector('.nap-hud-stats');
    if (line) {
      line.textContent = '';
    }
  }

  function showHud(hud, stats) {
    const line = hud.querySelector('.nap-hud-stats');
    if (line) {
      line.textContent = stats.fps + ' FPS  ·  ' + stats.ms + ' ms';
    }
    hud.classList.remove('nap-hidden');
  }

  function tick() {
    const hud = ensureHud();

    if (!isInMatch()) {
      pinKirkaOverlay();
      hideHud(hud);
      return;
    }

    pinKirkaOverlay();
    const stats = readGameStats();
    if (!stats) {
      hideHud(hud);
      return;
    }

    showHud(hud, stats);
  }

  function installRouteHooks() {
    if (routeHooksInstalled) {
      return;
    }
    routeHooksInstalled = true;

    const bump = () => {
      setTimeout(tick, 50);
    };

    window.addEventListener('popstate', bump);
    window.addEventListener('hashchange', bump);

    const wrap = (name) => {
      const orig = history[name];
      if (typeof orig !== 'function') {
        return;
      }
      history[name] = function napFpsHistoryWrap() {
        const ret = orig.apply(this, arguments);
        bump();
        return ret;
      };
    };
    wrap('pushState');
    wrap('replaceState');
  }

  function boot() {
    ensureHud();
    installRouteHooks();
    tick();
    setInterval(tick, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }

  console.log('[FPS/MS] script active — enabled park + HUD');
})();
