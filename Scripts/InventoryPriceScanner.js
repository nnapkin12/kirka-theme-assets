// ==UserScript==
// @name          Inventory Price Scanner
// @version      0.2.0
// @description  Ctrl+K for menu
//  inventory pricer, scans each page (chars, wpns, chests,) Prices from luke skywalk (avg/BROS/yzzz).
// @author       napkin
// ==/UserScript==

(function () {
  'use strict';

  const VERSION = '0.2.0';
  const MENU_HOTKEY = 'k'; // Ctrl+K (Ctrl+Shift+K also works)

  const PRICE_API_URL = 'https://kirka.lukeskywalk.com/finalUpdatedBaseList.json';
  const SKINS_JSON_URL =
    'https://raw.githubusercontent.com/nnapkin12/napkin-theme-assets/main/misc/skins.json';
  const SKYWALK_SITE_URL = 'https://kirka.lukeskywalk.com/';
  const SKYWALK_RENDER_CDN = 'https://kirka.lukeskywalk.com/static/renders/';
  const SKYWALK_ITEMS_URL = 'https://kirka.lukeskywalk.com/items.html';
  const SKINS_DB_PAGE_URL =
    'https://github.com/nnapkin12/napkin-theme-assets/blob/main/misc/skins.json';
  const SKINS_REPO_URL = 'https://github.com/nnapkin12/napkin-theme-assets';
  const SKINS_CACHE_KEY = 'nap-invscan-skins-v2';

  const SCAN_POLL_MS = 200; // unused — scans are button-only
  const TAB_SWITCH_MS = 550;
  const PRICE_CACHE_MS = 10 * 60 * 1000;
  const CATALOG_SEARCH_MS = 120;

  const WEAPONS = [
    'VITA', 'Shark', 'LAR', 'AR-9', 'SCAR', 'Weatie', 'M60', 'Revolver',
    'Bayonet', 'Tomahawk', 'MAC-10',
  ];

  const RARITY_LABEL = {
    U: 'Uncommon',
    C: 'Common',
    R: 'Rare',
    E: 'Epic',
    L: 'Legendary',
    M: 'Mythical',
    P: 'Paranormal',
  };

  const RARITY_CSS = {
    U: 'ips-rarity-u',
    C: 'ips-rarity-c',
    R: 'ips-rarity-r',
    E: 'ips-rarity-e',
    L: 'ips-rarity-l',
    M: 'ips-rarity-m',
    P: 'ips-rarity-p',
  };

  const RARITY_FROM_CODE = {
    0: 'C', // Common
    1: 'R', // Rare
    2: 'E', // Epic
    3: 'L', // Legendary
    4: 'M', // Mythical
    5: 'P', // Paranormal
  };

  const PRICELIST_OPTIONS = [
    { value: 'default', label: 'Default (average)' },
    { value: 'automatic', label: 'Automatic' },
    { value: 'bros', label: 'BROS' },
    { value: 'yzzz', label: 'yzzz' },
  ];

  const mappingConfigs = {
    skywalk: {
      default: { name: 'itemName', type: 'type', price: 'average', rarity: 'rarity' },
      automatic: { name: 'itemName', type: 'type', price: 'automatic', rarity: 'rarity' },
      bros: { name: 'itemName', type: 'type', price: 'bros', rarity: 'rarity' },
      yzzz: { name: 'itemName', type: 'type', price: 'yzzz', rarity: 'rarity' },
    },
  };

  const LS = {
    pricelist: 'nap_invscan_pricelist',
    fallbackOn: 'nap_invscan_fallback_on',
    fallbackList: 'nap_invscan_fallback_list',
    scanned: 'nap_invscan_scanned_v1',
  };

  let priceList = [];
  let priceListLoadedAt = 0;
  let skinIndex = null;
  let skinIndexLoading = null;

  /** @type {Map<string, object>} */
  let scannedItems = new Map();
  let totals = { weapons: 0, characters: 0, chests: 0, grand: 0 };

  let menuRoot = null;
  let floatBtn = null;
  let menuOpen = false;
  let scanningAllTabs = false;
  let selectedItemKey = '';
  let searchQuery = '';
  let listFingerprint = '';

  /** @type {'inventory' | 'catalog'} */
  let mainTab = 'inventory';
  let catalogSearch = '';
  /** @type {'all' | 'characters' | 'weapons' | 'other'} */
  let catalogScope = 'all';
  let catalogSearchTimer = 0;
  let catalogRenderedAt = 0;

  let ui = {};

  function loadSettings() {
    return {
      pricelist: localStorage.getItem(LS.pricelist) || 'default',
      fallbackOn: localStorage.getItem(LS.fallbackOn) === 'true',
      fallbackList: localStorage.getItem(LS.fallbackList) || 'automatic',
    };
  }

  function saveSettings(partial) {
    if (partial.pricelist != null) localStorage.setItem(LS.pricelist, partial.pricelist);
    if (partial.fallbackOn != null) localStorage.setItem(LS.fallbackOn, String(!!partial.fallbackOn));
    if (partial.fallbackList != null) localStorage.setItem(LS.fallbackList, partial.fallbackList);
  }

  function openExternal(url) {
    try {
      if (window.__NAP_IPC__ && typeof window.__NAP_IPC__.openExternalUrl === 'function') {
        window.__NAP_IPC__.openExternalUrl(url);
        return;
      }
    } catch (_) {}
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  function safeFileName(parts) {
    return parts
      .filter(Boolean)
      .join('-')
      .replace(/[^\w.\-]+/g, '_')
      .replace(/_+/g, '_')
      .slice(0, 120);
  }

  function resolveTextureDownloadUrl(row) {
    if (!row || row.type !== 'Weapon') return null;
    const catalog = resolveCatalogSkin(row.name, row.weapon);
    if (catalog && catalog.shortKey) {
      return {
        url: 'https://kirka.io/assets/img/texture.' + catalog.shortKey + '.webp',
        shortKey: catalog.shortKey,
        kind: 'texture',
      };
    }
    if (row.renderUrl) {
      return { url: row.renderUrl, shortKey: null, kind: 'render' };
    }
    return null;
  }

  function canSaveTexture(row) {
    return !!(row && row.type === 'Weapon' && resolveTextureDownloadUrl(row));
  }

  async function saveTextureWebp(row, buttonEl) {
    const info = resolveTextureDownloadUrl(row);
    if (!info) {
      setStatus('No texture in NAP DB for this item (guns/knives only).');
      return;
    }
    const label = buttonEl ? buttonEl.textContent : '';
    if (buttonEl) {
      buttonEl.disabled = true;
      buttonEl.textContent = 'Saving…';
    }
    try {
      const resp = await fetch(info.url, { mode: 'cors', cache: 'no-cache' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const blob = await resp.blob();
      const fileName =
        safeFileName([
          row.weapon || 'weapon',
          row.name,
          info.kind === 'texture' ? 'texture' : 'render',
        ]) + '.webp';

      if (typeof window.showSaveFilePicker === 'function') {
        const handle = await window.showSaveFilePicker({
          suggestedName: fileName,
          types: [
            {
              description: 'WebP image',
              accept: { 'image/webp': ['.webp'] },
            },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setStatus('Saved ' + fileName);
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objectUrl;
        a.download = fileName;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(objectUrl), 4000);
        setStatus('Download started — check Downloads for ' + fileName);
      }
    } catch (err) {
      console.warn('[InvScan] Save failed:', err);
      openExternal(info.url);
      setStatus('Could not auto-save — opened texture URL instead.');
    } finally {
      if (buttonEl) {
        buttonEl.disabled = false;
        buttonEl.textContent = label || 'Save texture webp';
      }
    }
  }

  function loadScannedFromStorage() {
    try {
      const raw = localStorage.getItem(LS.scanned);
      if (!raw) return;
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return;
      scannedItems = new Map(arr.map((row) => [row.key, row]));
      recomputeTotals();
    } catch (_) {}
  }

  function persistScanned() {
    try {
      localStorage.setItem(LS.scanned, JSON.stringify(Array.from(scannedItems.values())));
    } catch (_) {}
  }

  function fmt(n) {
    if (n == null || isNaN(n)) return '0';
    return Number(n).toLocaleString('en-US');
  }

  function parsePrice(val) {
    if (val == null) return 0;
    return parseFloat(String(val).replace(/[.,]/g, '')) || 0;
  }

  function normName(s) {
    return String(s || '').trim().toLowerCase();
  }

  function itemKey(name, rarity, type, weapon) {
    return [normName(name), rarity || '', type || '', weapon || ''].join('|');
  }

  async function fetchPriceList(force) {
    const now = Date.now();
    if (!force && priceList.length && now - priceListLoadedAt < PRICE_CACHE_MS) return priceList;
    try {
      const resp = await fetch(PRICE_API_URL);
      priceList = await resp.json();
      priceListLoadedAt = now;
    } catch (err) {
      console.warn('[InvScan] Price fetch failed:', err);
    }
    return priceList;
  }

  /** Characters / weapons / chests+cards — Skywalk list has characters; skins.json does not. */
  function catalogBucket(type) {
    if (type === 'Character') return 'characters';
    if (type === 'Chest' || type === 'Card') return 'other';
    return 'weapons';
  }

  function rarityBorderColor(code) {
    switch (code) {
      case 'C':
        return '#7fffd4';
      case 'R':
        return '#00ffff';
      case 'E':
        return '#8a2be2';
      case 'L':
        return '#ffa500';
      case 'P':
        return '#c0c0c0';
      case 'M':
        return '#b22222';
      case 'U':
        return '#b0b8c4';
      default:
        return 'rgba(255,170,70,0.45)';
    }
  }

  /** Same CDN pattern as kirka.lukeskywalk.com/items.html — images stay in browser HTTP cache, not localStorage. */
  function skywalkRenderUrls(itemName, type) {
    const t = String(type || '');
    const name = String(itemName || '');
    const isChar = t === 'Character' || t === 'Characters';
    const isCard = t === 'Card';
    const ext = isChar || isCard ? '.png' : '.webp';
    const primary =
      SKYWALK_RENDER_CDN + encodeURIComponent(t) + '/' + encodeURIComponent(name) + '-render' + ext;
    let fallbackName = name;
    if (isChar) fallbackName = 'James';
    else if (!isCard) fallbackName = t;
    const fallbackExt = isChar || t === 'Characters' || isCard ? '.png' : '.webp';
    const fallback =
      SKYWALK_RENDER_CDN +
      encodeURIComponent(t) +
      '/' +
      encodeURIComponent(fallbackName) +
      '-render' +
      fallbackExt;
    return { primary, fallback };
  }

  function filteredCatalogEntries() {
    const settings = loadSettings();
    const q = normName(catalogSearch);
    const out = { characters: [], weapons: [], other: [] };

    for (let i = 0; i < priceList.length; i++) {
      const e = priceList[i];
      const name = e.itemName || '';
      const type = e.type || '';
      if (q) {
        const hay = (
          name +
          ' ' +
          type +
          ' ' +
          (RARITY_LABEL[e.rarity] || e.rarity || '')
        ).toLowerCase();
        if (hay.indexOf(q) === -1) continue;
      }
      const bucket = catalogBucket(type);
      if (catalogScope !== 'all' && catalogScope !== bucket) continue;
      const urls = skywalkRenderUrls(name, type);
      out[bucket].push({
        name,
        type,
        rarity: e.rarity || '',
        rarityLabel: RARITY_LABEL[e.rarity] || e.rarity || '?',
        price: getPriceFromEntry(e, settings),
        renderUrl: urls.primary,
        renderFallback: urls.fallback,
      });
    }

    function sortRows(a, b) {
      const ta = String(a.type).localeCompare(String(b.type));
      if (ta) return ta;
      return String(a.name).localeCompare(String(b.name));
    }
    out.characters.sort(sortRows);
    out.weapons.sort(sortRows);
    out.other.sort(sortRows);
    return out;
  }

  function createCatalogCard(row) {
    const card = document.createElement('div');
    card.className = 'ips-cat-card';
    card.style.borderColor = rarityBorderColor(row.rarity);
    card.title = row.name + ' · ' + row.type + ' · ' + row.rarityLabel;

    const img = document.createElement('img');
    img.className = 'ips-cat-img' + (row.type === 'Character' ? ' ips-cat-img-char' : '');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = row.name;
    img.draggable = false;
    img.src = row.renderUrl;
    img.addEventListener('error', () => {
      if (img.dataset.fb) return;
      img.dataset.fb = '1';
      img.src = row.renderFallback;
    });
    card.appendChild(img);

    const nameEl = document.createElement('div');
    nameEl.className = 'ips-cat-name';
    nameEl.textContent = row.name;
    card.appendChild(nameEl);

    const meta = document.createElement('div');
    meta.className = 'ips-cat-meta';
    const typeEl = document.createElement('span');
    typeEl.textContent = row.type;
    const priceEl = document.createElement('span');
    priceEl.className = 'ips-cat-price';
    priceEl.textContent = fmt(row.price);
    meta.appendChild(typeEl);
    meta.appendChild(priceEl);
    card.appendChild(meta);
    return card;
  }

  function renderCatalogGrid() {
    if (!ui.catalogScroll) return;
    const data = filteredCatalogEntries();
    const frag = document.createDocumentFragment();
    let total = 0;

    function addSection(title, rows) {
      if (!rows.length) return;
      total += rows.length;
      const sec = document.createElement('section');
      sec.className = 'ips-cat-section';
      const h = document.createElement('h3');
      h.className = 'ips-cat-heading';
      h.textContent = title + ' (' + rows.length + ')';
      sec.appendChild(h);
      const grid = document.createElement('div');
      grid.className = 'ips-cat-grid';
      for (let i = 0; i < rows.length; i++) {
        grid.appendChild(createCatalogCard(rows[i]));
      }
      sec.appendChild(grid);
      frag.appendChild(sec);
    }

    if (catalogScope === 'all' || catalogScope === 'characters') {
      addSection('Characters', data.characters);
    }
    if (catalogScope === 'all' || catalogScope === 'weapons') {
      addSection('Weapons', data.weapons);
    }
    if (catalogScope === 'all' || catalogScope === 'other') {
      addSection('Chests & Cards', data.other);
    }

    ui.catalogScroll.innerHTML = '';
    if (!total) {
      const empty = document.createElement('div');
      empty.className = 'ips-empty';
      empty.style.padding = '24px';
      empty.textContent = priceList.length
        ? 'No items match your search.'
        : 'Loading Skywalk catalog…';
      ui.catalogScroll.appendChild(empty);
    } else {
      ui.catalogScroll.appendChild(frag);
    }

    if (ui.catalogCount) ui.catalogCount.textContent = total + ' shown';
    catalogRenderedAt = Date.now();
  }

  function scheduleCatalogRender() {
    if (catalogSearchTimer) clearTimeout(catalogSearchTimer);
    catalogSearchTimer = setTimeout(() => {
      catalogSearchTimer = 0;
      renderCatalogGrid();
    }, CATALOG_SEARCH_MS);
  }

  async function ensureCatalogLoaded(force) {
    setStatus('Loading Skywalk catalog…');
    await fetchPriceList(!!force);
    renderCatalogGrid();
    setStatus(
      priceList.length
        ? 'Catalog ready · ' +
            priceList.length +
            ' Skywalk entries (memory cache ~10 min, images via browser cache).'
        : 'Catalog fetch failed — check network.'
    );
  }

  function setMainTab(tab) {
    mainTab = tab === 'catalog' ? 'catalog' : 'inventory';
    if (ui.tabInv) ui.tabInv.classList.toggle('ips-tab-active', mainTab === 'inventory');
    if (ui.tabCat) ui.tabCat.classList.toggle('ips-tab-active', mainTab === 'catalog');
    if (ui.invChrome) {
      ui.invChrome.style.display = mainTab === 'inventory' ? 'flex' : 'none';
    }
    if (ui.catalogChrome) {
      ui.catalogChrome.style.display = mainTab === 'catalog' ? 'flex' : 'none';
    }
    if (mainTab === 'catalog') ensureCatalogLoaded(false);
    else refreshUi(true);
  }

  function findSkywalkEntry(name, rarity, type) {
    const n = String(name || '').trim();
    for (let i = 0; i < priceList.length; i++) {
      const e = priceList[i];
      if (e.itemName !== n) continue;
      if (type && e.type && e.type !== type) continue;
      if (rarity && e.rarity && e.rarity !== rarity) continue;
      return e;
    }
    for (let i = 0; i < priceList.length; i++) {
      const e = priceList[i];
      if (e.itemName === n && (!rarity || e.rarity === rarity)) return e;
    }
    return null;
  }

  function getPriceFromEntry(entry, settings) {
    if (!entry) return 0;
    const map = mappingConfigs.skywalk[settings.pricelist] || mappingConfigs.skywalk.default;
    let p = parsePrice(entry[map.price]);
    if (p === 0 && settings.fallbackOn) {
      const fbMap = mappingConfigs.skywalk[settings.fallbackList] || mappingConfigs.skywalk.automatic;
      p = parsePrice(entry[fbMap.price]);
    }
    return p;
  }

  function lookupByTypeName(name, typeName, settings) {
    for (let i = 0; i < priceList.length; i++) {
      const e = priceList[i];
      if (e.itemName === name && e.type === typeName) {
        return { entry: e, price: getPriceFromEntry(e, settings) };
      }
    }
    return { entry: null, price: 0 };
  }

  function lookupByRarity(name, rarity, settings) {
    const entry = findSkywalkEntry(name, rarity, null);
    return { entry, price: getPriceFromEntry(entry, settings) };
  }

  function lookupPrice(name, rarity, type, weaponType, settings) {
    if (type === 'Card' || type === 'Chest') {
      return lookupByTypeName(name, type, settings);
    }
    if (type === 'Character') {
      const byType = findSkywalkEntry(name, rarity, 'Character');
      if (byType) return { entry: byType, price: getPriceFromEntry(byType, settings) };
      return lookupByRarity(name, rarity, settings);
    }
    if (type === 'Weapon') {
      const byWeapon = weaponType ? findSkywalkEntry(name, rarity, weaponType) : null;
      if (byWeapon) return { entry: byWeapon, price: getPriceFromEntry(byWeapon, settings) };
      return lookupByRarity(name, rarity, settings);
    }
    return lookupByRarity(name, rarity, settings);
  }

  function shortKeyToHash(shortKey) {
    if (!shortKey) return '';
    return shortKey.indexOf('.webp') !== -1 ? shortKey : `texture.${shortKey}.webp`;
  }

  function hashToShortKey(textureKey) {
    const m = String(textureKey || '').toLowerCase().match(/^texture\.([a-f0-9]+)\.webp$/i);
    return m ? m[1] : '';
  }

  function buildSkinIndex(payload) {
    const byNameWeapon = new Map();
    const byName = new Map();
    if (!payload || !payload.skins) return { byNameWeapon, byName };

    const renders = payload.renders || {};
    const renderBases = payload.renderBases || null;

    function renderForShort(shortKey) {
      const raw = renders[shortKey];
      if (typeof raw === 'string') return raw;
      if (Array.isArray(raw) && raw.length >= 2 && renderBases) {
        const base = renderBases[raw[0]];
        return base ? base + raw[1] : '';
      }
      return shortKey ? `https://kirka.io/assets/img/render-mini.${shortKey}.webp` : '';
    }

    for (const shortKey in payload.skins) {
      const row = payload.skins[shortKey];
      const weaponRaw = String(row[0] || '');
      const skinName = String(row[1] || '');
      const weaponNorm = weaponRaw.toLowerCase().replace(/[^a-z0-9]/g, '');
      const nameNorm = normName(skinName);
      const renderUrl = renderForShort(shortKey);
      const rec = {
        shortKey,
        hash: shortKeyToHash(shortKey),
        name: skinName,
        weapon: weaponRaw,
        weaponNorm,
        rarityCode: RARITY_FROM_CODE[row[2]] || 'M',
        rarity: RARITY_LABEL[RARITY_FROM_CODE[row[2]]] || 'Mythical',
        renderUrl,
      };
      byNameWeapon.set(`${nameNorm}|${weaponNorm}`, rec);
      if (!byName.has(nameNorm)) byName.set(nameNorm, rec);
    }
    return { byNameWeapon, byName };
  }

  async function ensureSkinIndex() {
    if (skinIndex) return skinIndex;
    if (skinIndexLoading) return skinIndexLoading;
    skinIndexLoading = (async () => {
      try {
        const cached = localStorage.getItem(SKINS_CACHE_KEY);
        if (cached) {
          skinIndex = buildSkinIndex(JSON.parse(cached));
        }
      } catch (_) {}
      try {
        const resp = await fetch(SKINS_JSON_URL);
        const payload = await resp.json();
        localStorage.setItem(SKINS_CACHE_KEY, JSON.stringify(payload));
        skinIndex = buildSkinIndex(payload);
      } catch (err) {
        console.warn('[InvScan] skins.json failed:', err);
        if (!skinIndex) skinIndex = buildSkinIndex(null);
      }
      skinIndexLoading = null;
      return skinIndex;
    })();
    return skinIndexLoading;
  }

  function resolveCatalogSkin(name, weapon) {
    if (!skinIndex) return null;
    const nameNorm = normName(name);
    const weaponNorm = String(weapon || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    return (
      skinIndex.byNameWeapon.get(nameNorm + '|' + weaponNorm) ||
      skinIndex.byName.get(nameNorm) ||
      null
    );
  }

  function resolveRenderUrl(name, weaponLabel, domImgSrc) {
    if (domImgSrc && /^https?:/.test(domImgSrc)) return domImgSrc;
    const hit = resolveCatalogSkin(name, weaponLabel);
    return hit ? hit.renderUrl : domImgSrc || '';
  }

  /**
   * Prefer NAP skins.json rarity (Antique=Paranormal/5), then skywalk, then DOM color.
   * DOM often mis-reads paranormal as Uncommon.
   */
  function resolveRarityCode(name, weapon, domRarity) {
    const catalog = resolveCatalogSkin(name, weapon);
    if (catalog && catalog.rarityCode) return catalog.rarityCode;

    let entry = null;
    if (weapon) entry = findSkywalkEntry(name, null, weapon);
    if (!entry) entry = findSkywalkEntry(name, null, 'Character');
    if (!entry) entry = findSkywalkEntry(name, null, null);
    if (entry && entry.rarity) return entry.rarity;

    return domRarity || 'U';
  }

  function getWeaponClass(subject) {
    for (let i = 0; i < WEAPONS.length; i++) {
      if (subject.classList.contains(WEAPONS[i])) return WEAPONS[i];
    }
    return null;
  }

  function rarityFromSubject(subject) {
    const rarSkinElem = subject.querySelector('.rar-skin');
    if (!rarSkinElem) return null;
    const bg = getComputedStyle(rarSkinElem).backgroundImage || '';
    // Paranormal — black / near-black frames (DOM often fails → Uncommon)
    if (
      bg.includes('rgb(0, 0, 0)') ||
      bg.includes('rgb(0,0,0)') ||
      bg.includes('rgb(20, 20, 20)') ||
      bg.includes('rgb(17, 17, 17)') ||
      bg.includes('rgb(10, 10, 10)')
    ) {
      return 'P';
    }
    if (bg.includes('rgb(137, 4, 20)')) return 'M';
    if (bg.includes('rgb(255, 133, 45)')) return 'L';
    if (bg.includes('rgb(162, 45, 255)')) return 'E';
    if (bg.includes('rgb(24, 99, 198)')) return 'R';
    if (bg.includes('rgb(101, 213, 139)')) return 'C';
    return null;
  }

  function classifySubject(subject) {
    if (subject.classList.contains('character-card')) {
      return { tab: 'Chest', type: 'Card', weapon: null };
    }
    if (subject.classList.contains('chest')) {
      return { tab: 'Chest', type: 'Chest', weapon: null };
    }
    if (subject.classList.contains('body-skin')) {
      return { tab: 'Character', type: 'Character', weapon: null };
    }
    if (subject.classList.contains('weapon-skin')) {
      return { tab: 'Weapon', type: 'Weapon', weapon: getWeaponClass(subject) };
    }
    return { tab: 'Unknown', type: null, weapon: null };
  }

  function getInventoryEl() {
    return document.querySelector('.inventory');
  }

  function isInventoryVisible() {
    const inv = getInventoryEl();
    if (!inv) return false;
    const style = getComputedStyle(inv);
    return style.display !== 'none' && style.visibility !== 'hidden' && inv.offsetParent !== null;
  }

  function readSubject(subject, settings) {
    const itemNameElem = subject.querySelector('.hover-btns-group .item-name');
    const countElem = subject.querySelector('.bottom-subj .count');
    const imgElem = subject.querySelector('.subj-img, img');
    if (!itemNameElem) return null;

    const name = itemNameElem.textContent.trim();
    const count = countElem ? parseInt(countElem.textContent.trim(), 10) || 1 : 1;
    const { tab, type, weapon } = classifySubject(subject);
    const domRarity =
      type === 'Card' || type === 'Chest' ? null : rarityFromSubject(subject);
    const rarity =
      type === 'Card' || type === 'Chest'
        ? null
        : resolveRarityCode(name, weapon, domRarity);

    const { entry, price } = lookupPrice(name, rarity, type, weapon, settings);

    const domImg = imgElem ? imgElem.src || imgElem.getAttribute('src') : '';
    const renderUrl = resolveRenderUrl(name, weapon, domImg);

    const key = itemKey(name, rarity, type, weapon);
    return {
      key,
      name,
      count,
      rarity,
      rarityLabel: rarity ? RARITY_LABEL[rarity] || rarity : '—',
      type,
      weapon,
      tab,
      pricePerItem: price,
      totalPrice: price * count,
      renderUrl,
      domImg,
      skywalk: entry,
      scannedAt: Date.now(),
    };
  }

  function scanVisibleInventory(settings, options) {
    const opts = options || {};
    const inventory = getInventoryEl();
    if (!inventory) return { count: 0, tab: null };

    const subjects = inventory.querySelectorAll('.content .subjects .subject');
    const found = [];
    let tabHint = null;

    subjects.forEach((subject) => {
      const row = readSubject(subject, settings);
      if (!row) return;
      tabHint = row.tab;
      found.push(row);
    });

    if (opts.replaceAll) {
      scannedItems.clear();
    } else if (opts.replaceTab && tabHint) {
      Array.from(scannedItems.keys()).forEach((key) => {
        const existing = scannedItems.get(key);
        if (existing && existing.tab === tabHint) scannedItems.delete(key);
      });
    }

    found.forEach((row) => {
      scannedItems.set(row.key, row);
    });

    recomputeTotals();
    persistScanned();
    return { count: found.length, tab: tabHint };
  }

  function recomputeTotals() {
    totals = { weapons: 0, characters: 0, chests: 0, grand: 0 };
    scannedItems.forEach((row) => {
      totals.grand += row.totalPrice || 0;
      if (row.tab === 'Weapon') totals.weapons += row.totalPrice || 0;
      else if (row.tab === 'Character') totals.characters += row.totalPrice || 0;
      else if (row.tab === 'Chest') totals.chests += row.totalPrice || 0;
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function scanAllInventoryTabs(settings) {
    if (scanningAllTabs) return;
    const inventory = getInventoryEl();
    if (!inventory) {
      setStatus('Open Kirka inventory first, then scan.');
      return;
    }

    scanningAllTabs = true;
    setStatus('Clearing old scan & scanning all tabs…');
    disableScanButtons(true);

    // Fresh full inventory — wipe everything first
    scannedItems.clear();
    recomputeTotals();
    persistScanned();
    selectedItemKey = '';
    listFingerprint = '';

    const tabs = Array.from(inventory.querySelectorAll('.tab-bar .tab'));
    if (!tabs.length) {
      const result = scanVisibleInventory(settings, { replaceAll: false });
      setStatus(
        result.count
          ? `Scanned ${result.count} items (no tab bar found).`
          : 'No items found on screen.'
      );
      scanningAllTabs = false;
      disableScanButtons(false);
      refreshUi(true);
      return;
    }

    for (let i = 0; i < tabs.length; i++) {
      tabs[i].click();
      setStatus(`Scanning tab ${i + 1}/${tabs.length}…`);
      await sleep(TAB_SWITCH_MS);
      // Wait a bit more so Kirka finishes rendering big inventories
      await sleep(350);
      scanVisibleInventory(settings, { replaceTab: true });
      refreshTotalsUi();
    }

    setStatus(`Fresh full scan done — ${scannedItems.size} unique items.`);
    scanningAllTabs = false;
    disableScanButtons(false);
    refreshUi(true);
  }

  function disableScanButtons(disabled) {
    if (ui.scanBtn) ui.scanBtn.disabled = disabled;
    if (ui.scanAllBtn) ui.scanAllBtn.disabled = disabled;
  }

  function isEditableInputFocused() {
    const el = document.activeElement;
    if (!el) return false;
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return !!el.isContentEditable;
  }

  function isMenuHotkey(event) {
    if (!event || !event.ctrlKey || event.altKey || event.metaKey) return false;
    const key = (event.key || '').toLowerCase();
    const code = event.code || '';
    if (key === MENU_HOTKEY || code === 'KeyK') return true;
    if (event.shiftKey && (key === MENU_HOTKEY || code === 'KeyK')) return true;
    return false;
  }

  function setFloatBtnVisible(visible) {
    if (!floatBtn) return;
    floatBtn.style.display = visible ? 'flex' : 'none';
  }

  function setStatus(text) {
    if (ui.status) ui.status.textContent = text;
  }

  function sortedItems() {
    const q = normName(searchQuery);
    return Array.from(scannedItems.values())
      .filter((row) => {
        if (!q) return true;
        const hay = [
          row.name,
          row.type,
          row.weapon,
          row.rarityLabel,
          row.tab,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.indexOf(q) !== -1;
      })
      .sort((a, b) => {
        if (b.totalPrice !== a.totalPrice) return b.totalPrice - a.totalPrice;
        return a.name.localeCompare(b.name);
      });
  }

  function getListFingerprint() {
    return (
      sortedItems()
        .map((r) => r.key + ':' + r.count + ':' + r.totalPrice + ':' + (r.rarity || ''))
        .join('|') +
      '::' +
      searchQuery +
      '::' +
      selectedItemKey
    );
  }

  function rarityClass(rarity) {
    return RARITY_CSS[rarity] || 'ips-rarity-u';
  }

  function selectItem(key) {
    selectedItemKey = key || '';
    highlightMiniList(selectedItemKey);
    renderItemDetail(selectedItemKey);
  }

  function refreshTotalsUi() {
    if (ui.totalGrand) ui.totalGrand.textContent = fmt(totals.grand);
    if (ui.totalWeapons) ui.totalWeapons.textContent = fmt(totals.weapons);
    if (ui.totalChars) ui.totalChars.textContent = fmt(totals.characters);
    if (ui.totalChests) ui.totalChests.textContent = fmt(totals.chests);
    if (ui.itemCount) ui.itemCount.textContent = String(scannedItems.size);
  }

  function renderItemDetail(key) {
    if (!ui.detail) return;
    ui.detail.innerHTML = '';
    const row = key ? scannedItems.get(key) : null;
    if (!row) {
      ui.detail.innerHTML =
        '<p class="ips-empty">Select an item from the list to view price data and render.</p>';
      return;
    }

    const wrap = document.createElement('div');
    wrap.className = 'ips-detail-grid';

    const imgCol = document.createElement('div');
    imgCol.className = 'ips-detail-img-col';
    if (row.renderUrl) {
      const img = document.createElement('img');
      img.className = 'ips-detail-img';
      img.alt = row.name;
      img.src = row.renderUrl;
      imgCol.appendChild(img);
    } else {
      const missing = document.createElement('div');
      missing.className = 'ips-no-img';
      missing.textContent = 'No render found';
      imgCol.appendChild(missing);
    }

    // Guns + knives only (NAP skins DB) — not characters/chests
    if (canSaveTexture(row)) {
      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.className = 'ips-btn ips-save-tex';
      saveBtn.textContent = 'Save texture webp';
      saveBtn.title = 'Download texture.webp from NAP skins DB / Kirka CDN';
      saveBtn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        saveTextureWebp(row, saveBtn);
      });
      imgCol.appendChild(saveBtn);
    }

    wrap.appendChild(imgCol);

    const metaCol = document.createElement('div');
    metaCol.className = 'ips-detail-meta';

    const title = document.createElement('h3');
    title.className = 'ips-detail-title';
    title.textContent = row.name;
    metaCol.appendChild(title);

    const rarityPill = document.createElement('div');
    rarityPill.className = 'ips-detail-rarity ' + rarityClass(row.rarity);
    rarityPill.textContent = row.rarityLabel;
    metaCol.appendChild(rarityPill);

    const table = document.createElement('dl');
    table.className = 'ips-kv';
    const add = (k, v, opt) => {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      if (opt && opt.big) dd.classList.add('ips-kv-big');
      table.appendChild(dt);
      table.appendChild(dd);
    };

    // Weapons (guns + bayonet/tomahawk): Type === Weapon is redundant next to Weapon
    if (row.type === 'Weapon') {
      if (row.weapon) add('Weapon', row.weapon);
    } else {
      add('Type', row.type || '—');
      if (row.weapon) add('Weapon', row.weapon);
    }
    add('Price each', fmt(row.pricePerItem), { big: true });
    add('You own', row.count + 'x (' + fmt(row.totalPrice) + ')', { big: true });

    if (row.skywalk) {
      const e = row.skywalk;
      if (e.inventory != null) add('Units (Global)', fmt(e.inventory), { big: true });
      if (e.average != null) add('Average', fmt(parsePrice(e.average)));
      if (e.automatic != null) add('Automatic', fmt(parsePrice(e.automatic)));
      if (e.bros != null) add('BROS', fmt(parsePrice(e.bros)));
      if (e.bolt != null) add('Bolt', fmt(parsePrice(e.bolt)));
      if (e.fate != null) add('Fate', fmt(parsePrice(e.fate)));
      if (e.coefficient != null) add('Coefficient', String(e.coefficient));
      if (e.createdAt) add('Listed since', new Date(e.createdAt).toLocaleDateString());
    } else {
      add('Skywalk', 'No matching entry');
    }

    metaCol.appendChild(table);
    wrap.appendChild(metaCol);
    ui.detail.appendChild(wrap);
  }

  function refreshUi(forceList) {
    refreshTotalsUi();
    refreshMiniList(!!forceList);
    if (selectedItemKey && scannedItems.has(selectedItemKey)) {
      renderItemDetail(selectedItemKey);
      highlightMiniList(selectedItemKey);
    } else if (selectedItemKey) {
      selectedItemKey = '';
      renderItemDetail('');
    }
  }

  async function runScanOnce() {
    const settings = loadSettings();
    await fetchPriceList(true);
    await ensureSkinIndex();
    if (!isInventoryVisible()) {
      setStatus('Inventory not open — open Kirka inventory, or use cached data.');
      refreshUi(true);
      return;
    }
    // Replace this tab's items cleanly (no stale duplicates)
    const result = scanVisibleInventory(settings, { replaceTab: true });
    setStatus(
      result.count
        ? `Fresh scan: ${result.count} items on ${result.tab || 'current'} tab.`
        : 'No items found on screen.'
    );
    refreshUi(true);
  }

  function openMenu() {
    if (!menuRoot) buildMenu();
    // Force visible — Kirka/community CSS often overrides plain display:flex
    menuRoot.classList.add('ips-open');
    menuRoot.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'bottom:0',
      'width:100vw',
      'height:100vh',
      'z-index:2147483647',
      'display:block',
      'visibility:visible',
      'opacity:1',
      'pointer-events:auto',
      'margin:0',
      'padding:0',
    ].join(' !important;') + ' !important;';
    document.body.classList.add('ips-menu-open');
    menuOpen = true;
    setFloatBtnVisible(false);
    // Button-only scanning — never auto-poll
    fetchPriceList(false)
      .then(() => ensureSkinIndex())
      .then(() => {
        if (mainTab === 'catalog') return ensureCatalogLoaded(false);
        refreshUi(true);
      });
  }

  function closeMenu() {
    if (!menuRoot) return;
    menuRoot.classList.remove('ips-open');
    menuRoot.style.cssText = [
      'position:fixed',
      'top:0',
      'left:0',
      'right:0',
      'bottom:0',
      'width:100vw',
      'height:100vh',
      'z-index:2147483647',
      'display:none',
      'pointer-events:none',
    ].join(' !important;') + ' !important;';
    document.body.classList.remove('ips-menu-open');
    menuOpen = false;
    setFloatBtnVisible(true);
  }

  function toggleMenu() {
    if (menuOpen) closeMenu();
    else openMenu();
  }

  function clearScanned() {
    scannedItems.clear();
    totals = { weapons: 0, characters: 0, chests: 0, grand: 0 };
    selectedItemKey = '';
    listFingerprint = '';
    persistScanned();
    refreshUi(true);
    setStatus('Cleared cached scan.');
  }

  function buildMenu() {
    const existing = document.getElementById('ips-menu-root');
    if (existing) {
      // Stale/empty root from an earlier broken load — rebuild
      if (!existing.querySelector('.ips-panel')) {
        existing.remove();
      } else {
        menuRoot = existing;
        return;
      }
    }

    if (!document.getElementById('ips-menu-styles')) {
      const style = document.createElement('style');
      style.id = 'ips-menu-styles';
      style.textContent = `
      #ips-menu-root, #ips-menu-root * { box-sizing: border-box !important; }
      #ips-menu-root {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        z-index: 2147483647 !important;
        display: none !important;
        pointer-events: none !important;
        font-family: "Rajdhani", "Segoe UI", system-ui, sans-serif !important;
        color: #f3f4f6 !important;
        overflow: hidden !important;
        visibility: visible !important;
        opacity: 1 !important;
        background: transparent !important;
      }
      #ips-menu-root.ips-open {
        display: block !important;
        pointer-events: auto !important;
        visibility: visible !important;
        opacity: 1 !important;
      }
      #ips-menu-root .ips-backdrop {
        position: fixed !important;
        top: 0 !important; left: 0 !important;
        width: 100vw !important; height: 100vh !important;
        background: rgba(4, 6, 14, 0.82) !important;
        backdrop-filter: blur(6px);
        -webkit-backdrop-filter: blur(6px);
        z-index: 0 !important;
      }
      #ips-menu-root .ips-panel {
        position: fixed !important;
        top: 12px !important;
        left: 12px !important;
        right: 12px !important;
        bottom: 12px !important;
        width: auto !important;
        height: auto !important;
        z-index: 1 !important;
        display: flex !important;
        flex-direction: column !important;
        border: 1px solid rgba(255, 170, 70, 0.35) !important;
        border-radius: 10px !important;
        background: linear-gradient(145deg, #12182a 0%, #0b0f18 100%) !important;
        box-shadow: 0 24px 80px rgba(0,0,0,0.55) !important;
        overflow: hidden !important;
        opacity: 1 !important;
        visibility: visible !important;
      }
      #ips-menu-root .ips-header {
        display: flex !important; align-items: center !important; justify-content: space-between !important;
        gap: 16px !important;
        padding: 14px 18px !important; border-bottom: 1px solid rgba(255,255,255,0.08) !important;
        background: rgba(255,140,30,0.06) !important; flex-shrink: 0 !important;
      }
      #ips-menu-root .ips-header-left {
        display: flex !important; align-items: center !important; gap: 14px !important;
        min-width: 0 !important; flex: 1 1 auto !important; flex-wrap: wrap !important;
      }
      #ips-menu-root .ips-header-text { min-width: 0 !important; }
      #ips-menu-root .ips-title {
        margin: 0 !important; font-size: 22px !important; font-weight: 900 !important;
        color: #ffd27a !important; letter-spacing: 0.02em !important;
      }
      #ips-menu-root .ips-sub { margin: 2px 0 0 !important; font-size: 12px !important; color: rgba(255,255,255,0.45) !important; }
      #ips-menu-root .ips-header-links {
        display: flex !important; align-items: center !important; gap: 8px !important;
        flex-wrap: wrap !important;
      }
      #ips-menu-root .ips-link-btn {
        border: 1px solid rgba(255,170,70,0.4) !important;
        border-radius: 7px !important;
        background: rgba(0,0,0,0.28) !important;
        color: #ffe8c0 !important;
        padding: 7px 12px !important;
        font: inherit !important;
        font-size: 12px !important;
        font-weight: 800 !important;
        letter-spacing: 0.03em !important;
        cursor: pointer !important;
        white-space: nowrap !important;
      }
      #ips-menu-root .ips-link-btn:hover {
        background: rgba(255,140,30,0.28) !important;
        border-color: rgba(255,210,120,0.65) !important;
        color: #fff !important;
      }
      #ips-menu-root .ips-header-right {
        display: flex !important; align-items: center !important; gap: 8px !important; flex-shrink: 0 !important;
      }
      #ips-menu-root .ips-close {
        width: 36px !important; height: 36px !important; border: none !important; border-radius: 8px !important;
        background: rgba(255,255,255,0.08) !important; color: #fff !important; font-size: 22px !important;
        cursor: pointer !important; line-height: 1 !important;
      }
      #ips-menu-root .ips-close:hover { background: rgba(255,100,60,0.35) !important; }
      #ips-menu-root .ips-save-tex {
        width: 100% !important;
        margin-top: 12px !important;
        justify-content: center !important;
        display: inline-flex !important;
        align-items: center !important;
      }
      #ips-menu-root .ips-stats {
        display: grid !important; grid-template-columns: repeat(5, minmax(0, 1fr)) !important; gap: 8px !important;
        padding: 10px 18px !important; border-bottom: 1px solid rgba(255,255,255,0.06) !important; flex-shrink: 0 !important;
      }
      #ips-menu-root .ips-stat {
        padding: 8px 10px !important; border-radius: 8px !important;
        background: rgba(255,255,255,0.04) !important; border: 1px solid rgba(255,255,255,0.06) !important;
      }
      #ips-menu-root .ips-stat-label { font-size: 10px !important; text-transform: uppercase !important; color: rgba(255,255,255,0.42) !important; }
      #ips-menu-root .ips-stat-val { font-size: 18px !important; font-weight: 900 !important; color: #ffd27a !important; margin-top: 2px !important; }
      #ips-menu-root .ips-toolbar {
        display: flex !important; flex-wrap: wrap !important; gap: 8px !important; align-items: center !important;
        padding: 10px 18px !important; border-bottom: 1px solid rgba(255,255,255,0.06) !important; flex-shrink: 0 !important;
      }
      #ips-menu-root .ips-toolbar label { font-size: 12px !important; color: rgba(255,255,255,0.55) !important; }
      #ips-menu-root .ips-toolbar select, #ips-menu-root .ips-toolbar button {
        font: inherit !important; font-size: 13px !important; font-weight: 700 !important;
      }
      #ips-menu-root .ips-toolbar select {
        background: rgba(0,0,0,0.35) !important; color: #fff !important; border: 1px solid rgba(255,170,70,0.4) !important;
        border-radius: 6px !important; padding: 6px 8px !important;
      }
      #ips-menu-root .ips-btn {
        border: 1px solid rgba(255,170,70,0.45) !important; border-radius: 6px !important;
        background: rgba(255,140,30,0.18) !important; color: #ffe8c0 !important;
        padding: 7px 12px !important; cursor: pointer !important;
      }
      #ips-menu-root .ips-btn:hover { background: rgba(255,140,30,0.32) !important; }
      #ips-menu-root .ips-btn:disabled { opacity: 0.45 !important; cursor: not-allowed !important; }
      #ips-menu-root .ips-btn-danger {
        border-color: rgba(255,80,80,0.45) !important; background: rgba(180,40,40,0.2) !important; color: #ffb4b4 !important;
      }
      #ips-menu-root .ips-check { display: flex !important; align-items: center !important; gap: 6px !important; font-size: 12px !important; }
      #ips-menu-root .ips-body {
        flex: 1 1 auto !important; min-height: 0 !important; height: 100% !important; display: grid !important;
        grid-template-columns: minmax(300px, 380px) 1fr !important; gap: 0 !important;
        overflow: hidden !important;
      }
      #ips-menu-root .ips-list-pane {
        border-right: 1px solid rgba(255,255,255,0.06) !important;
        padding: 14px 18px !important;
        overflow-x: hidden !important;
        overflow-y: scroll !important;
        height: 100% !important;
        min-height: 0 !important;
        display: flex !important;
        flex-direction: column !important;
      }
      #ips-menu-root .ips-list-pane::-webkit-scrollbar,
      #ips-menu-root .ips-detail-pane::-webkit-scrollbar,
      #ips-menu-root .ips-mini-list::-webkit-scrollbar {
        width: 12px !important;
        height: 12px !important;
        display: block !important;
        background: rgba(0,0,0,0.25) !important;
      }
      #ips-menu-root .ips-list-pane::-webkit-scrollbar-thumb,
      #ips-menu-root .ips-detail-pane::-webkit-scrollbar-thumb,
      #ips-menu-root .ips-mini-list::-webkit-scrollbar-thumb {
        background: rgba(255,170,70,0.55) !important;
        border-radius: 8px !important;
        border: 2px solid rgba(0,0,0,0.25) !important;
      }
      #ips-menu-root .ips-list-pane::-webkit-scrollbar-track,
      #ips-menu-root .ips-detail-pane::-webkit-scrollbar-track {
        background: rgba(0,0,0,0.35) !important;
      }
      #ips-menu-root .ips-search {
        width: 100% !important;
        margin: 0 0 12px 0 !important;
        flex-shrink: 0 !important;
        background: rgba(0,0,0,0.45) !important;
        color: #fff !important;
        border: 1px solid rgba(255,170,70,0.45) !important;
        border-radius: 8px !important;
        padding: 10px 12px !important;
        font: inherit !important;
        font-size: 15px !important;
        font-weight: 700 !important;
        outline: none !important;
      }
      #ips-menu-root .ips-search::placeholder {
        color: rgba(255,255,255,0.35) !important;
      }
      #ips-menu-root .ips-mini-list {
        display: flex !important;
        flex-direction: column !important;
        gap: 4px !important;
        flex: 1 1 auto !important;
        min-height: 0 !important;
        overflow-y: auto !important;
        overflow-x: hidden !important;
        padding-right: 4px !important;
      }
      #ips-menu-root .ips-mini-item {
        display: flex !important;
        align-items: center !important;
        gap: 8px !important;
        padding: 8px 10px !important;
        border-radius: 6px !important;
        cursor: pointer !important;
        border: 1px solid transparent !important;
        background: rgba(255,255,255,0.03) !important;
        user-select: none !important;
        -webkit-user-select: none !important;
        flex-shrink: 0 !important;
        pointer-events: auto !important;
      }
      #ips-menu-root .ips-mini-item:hover, #ips-menu-root .ips-mini-item.ips-active {
        border-color: rgba(255,170,70,0.35) !important;
        background: rgba(255,140,30,0.12) !important;
      }
      #ips-menu-root .ips-mini-thumb {
        width: 40px !important; height: 40px !important; object-fit: contain !important;
        background: rgba(0,0,0,0.35) !important; border-radius: 4px !important;
        pointer-events: none !important; flex-shrink: 0 !important;
      }
      #ips-menu-root .ips-mini-meta { flex: 1 !important; min-width: 0 !important; pointer-events: none !important; }
      #ips-menu-root .ips-mini-name {
        font-size: 14px !important; font-weight: 800 !important;
        white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
        color: #fff !important;
      }
      #ips-menu-root .ips-mini-price {
        font-size: 12px !important; color: rgba(255,255,255,0.7) !important;
        display: flex !important; flex-wrap: wrap !important; gap: 6px !important; align-items: center !important;
        margin-top: 2px !important;
      }
      #ips-menu-root .ips-mini-price .ips-val { color: #ffd27a !important; font-weight: 800 !important; }
      #ips-menu-root .ips-rarity {
        font-weight: 900 !important; letter-spacing: 0.02em !important;
      }
      #ips-menu-root .ips-rarity-u { color: #b0b8c4 !important; }
      #ips-menu-root .ips-rarity-c { color: #65d58b !important; }
      #ips-menu-root .ips-rarity-r { color: #4ea1ff !important; }
      #ips-menu-root .ips-rarity-e { color: #c56bff !important; }
      #ips-menu-root .ips-rarity-l { color: #ffd27a !important; }
      #ips-menu-root .ips-rarity-m { color: #ff3b4a !important; }
      #ips-menu-root .ips-rarity-p {
        color: #111 !important;
        background: #f0f0f0 !important;
        padding: 0 5px !important;
        border-radius: 3px !important;
      }
      #ips-menu-root .ips-detail-pane {
        padding: 18px 22px !important;
        overflow: auto !important;
        height: 100% !important;
        min-height: 0 !important;
      }
      #ips-menu-root .ips-detail-grid {
        display: grid !important;
        grid-template-columns: minmax(280px, 42%) 1fr !important;
        gap: 28px !important;
        align-items: start !important;
        min-height: 100% !important;
      }
      #ips-menu-root .ips-detail-img-col {
        position: sticky !important;
        top: 0 !important;
      }
      #ips-menu-root .ips-detail-img {
        width: 100% !important;
        min-height: 320px !important;
        max-height: min(58vh, 520px) !important;
        object-fit: contain !important;
        background: rgba(0,0,0,0.4) !important;
        border-radius: 12px !important;
        padding: 16px !important;
        border: 1px solid rgba(255,170,70,0.2) !important;
      }
      #ips-menu-root .ips-no-img {
        width: 100% !important; min-height: 280px !important;
        display: flex !important; align-items: center !important; justify-content: center !important;
        background: rgba(0,0,0,0.35) !important; border-radius: 12px !important;
        color: rgba(255,255,255,0.35) !important; font-size: 16px !important;
      }
      #ips-menu-root .ips-detail-title {
        margin: 0 0 8px !important; font-size: 34px !important; font-weight: 900 !important; color: #fff !important;
        line-height: 1.1 !important;
      }
      #ips-menu-root .ips-detail-rarity {
        display: inline-block !important;
        font-size: 16px !important;
        font-weight: 900 !important;
        margin-bottom: 18px !important;
      }
      #ips-menu-root .ips-kv {
        display: grid !important;
        grid-template-columns: 180px 1fr !important;
        gap: 12px 18px !important;
        margin: 0 !important;
        align-items: baseline !important;
      }
      #ips-menu-root .ips-kv dt {
        color: rgba(255,255,255,0.45) !important;
        font-size: 15px !important;
        font-weight: 700 !important;
      }
      #ips-menu-root .ips-kv dd {
        margin: 0 !important;
        font-size: 18px !important;
        font-weight: 800 !important;
        color: #fff !important;
      }
      #ips-menu-root .ips-kv dd.ips-kv-big {
        font-size: 28px !important;
        font-weight: 900 !important;
        color: #ffd27a !important;
      }
      #ips-menu-root .ips-empty { color: rgba(255,255,255,0.4) !important; font-size: 16px !important; }
      #ips-menu-root .ips-footer {
        padding: 8px 18px !important; border-top: 1px solid rgba(255,255,255,0.06) !important;
        font-size: 11px !important; color: rgba(255,255,255,0.38) !important;
        display: flex !important; justify-content: space-between !important; gap: 12px !important; flex-shrink: 0 !important;
      }
      #ips-menu-root .ips-status { color: #ffd27a !important; }
      #ips-menu-root .ips-tabs {
        display: flex !important; gap: 6px !important; padding: 8px 18px 0 !important;
        flex-shrink: 0 !important; border-bottom: 1px solid rgba(255,255,255,0.06) !important;
      }
      #ips-menu-root .ips-tab {
        border: 1px solid transparent !important; border-bottom: none !important;
        border-radius: 8px 8px 0 0 !important;
        background: transparent !important; color: rgba(255,255,255,0.55) !important;
        padding: 8px 16px !important; font: inherit !important; font-size: 13px !important;
        font-weight: 800 !important; cursor: pointer !important; letter-spacing: 0.03em !important;
      }
      #ips-menu-root .ips-tab:hover { color: #ffe8c0 !important; background: rgba(255,140,30,0.1) !important; }
      #ips-menu-root .ips-tab.ips-tab-active {
        color: #ffd27a !important; background: rgba(255,140,30,0.16) !important;
        border-color: rgba(255,170,70,0.35) !important;
      }
      #ips-menu-root .ips-inv-chrome,
      #ips-menu-root .ips-catalog-chrome {
        flex: 1 1 auto !important; min-height: 0 !important;
        display: flex !important; flex-direction: column !important; overflow: hidden !important;
      }
      #ips-menu-root .ips-catalog-toolbar {
        display: flex !important; flex-wrap: wrap !important; gap: 8px !important;
        align-items: center !important; padding: 10px 18px !important;
        border-bottom: 1px solid rgba(255,255,255,0.06) !important; flex-shrink: 0 !important;
      }
      #ips-menu-root .ips-catalog-search {
        flex: 1 1 220px !important; min-width: 160px !important; margin: 0 !important;
      }
      #ips-menu-root .ips-scope {
        display: flex !important; flex-wrap: wrap !important; gap: 6px !important;
      }
      #ips-menu-root .ips-scope-btn {
        border: 1px solid rgba(255,170,70,0.35) !important; border-radius: 6px !important;
        background: rgba(0,0,0,0.28) !important; color: rgba(255,255,255,0.7) !important;
        padding: 6px 10px !important; font: inherit !important; font-size: 12px !important;
        font-weight: 800 !important; cursor: pointer !important;
      }
      #ips-menu-root .ips-scope-btn.ips-scope-active {
        background: rgba(255,140,30,0.28) !important; color: #ffe8c0 !important;
        border-color: rgba(255,210,120,0.55) !important;
      }
      #ips-menu-root .ips-catalog-count {
        font-size: 12px !important; color: rgba(255,255,255,0.45) !important;
        font-weight: 700 !important; margin-left: auto !important;
      }
      #ips-menu-root .ips-catalog-scroll {
        flex: 1 1 auto !important; min-height: 0 !important; overflow: auto !important;
        padding: 12px 18px 18px !important;
      }
      #ips-menu-root .ips-catalog-scroll::-webkit-scrollbar {
        width: 12px !important; display: block !important; background: rgba(0,0,0,0.25) !important;
      }
      #ips-menu-root .ips-catalog-scroll::-webkit-scrollbar-thumb {
        background: rgba(255,170,70,0.55) !important; border-radius: 8px !important;
        border: 2px solid rgba(0,0,0,0.25) !important;
      }
      #ips-menu-root .ips-cat-section { margin-bottom: 18px !important; }
      #ips-menu-root .ips-cat-heading {
        margin: 0 0 10px !important; font-size: 14px !important; font-weight: 900 !important;
        color: #ffd27a !important; letter-spacing: 0.04em !important; text-transform: uppercase !important;
      }
      #ips-menu-root .ips-cat-grid {
        display: grid !important;
        grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
        gap: 10px !important;
      }
      @media (max-width: 1400px) {
        #ips-menu-root .ips-cat-grid { grid-template-columns: repeat(5, minmax(0, 1fr)) !important; }
      }
      @media (max-width: 1100px) {
        #ips-menu-root .ips-cat-grid { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
      }
      #ips-menu-root .ips-cat-card {
        display: flex !important; flex-direction: column !important; gap: 6px !important;
        padding: 8px !important; border-radius: 8px !important;
        border: 2px solid rgba(255,170,70,0.35) !important;
        background: rgba(255,255,255,0.03) !important; min-width: 0 !important;
      }
      #ips-menu-root .ips-cat-card:hover {
        background: rgba(255,140,30,0.1) !important;
      }
      #ips-menu-root .ips-cat-img {
        width: 100% !important; aspect-ratio: 1 / 1 !important; object-fit: contain !important;
        background: rgba(0,0,0,0.35) !important; border-radius: 6px !important;
        pointer-events: none !important;
      }
      #ips-menu-root .ips-cat-img-char {
        object-fit: cover !important; object-position: top center !important;
      }
      #ips-menu-root .ips-cat-name {
        font-size: 12px !important; font-weight: 800 !important; color: #fff !important;
        white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important;
        line-height: 1.2 !important;
      }
      #ips-menu-root .ips-cat-meta {
        display: flex !important; justify-content: space-between !important; gap: 6px !important;
        font-size: 11px !important; color: rgba(255,255,255,0.5) !important; font-weight: 700 !important;
      }
      #ips-menu-root .ips-cat-price { color: #ffd27a !important; font-weight: 800 !important; }
      body.ips-menu-open { overflow: hidden !important; }
    `;
      document.head.appendChild(style);
    }

    menuRoot = document.createElement('div');
    menuRoot.id = 'ips-menu-root';
    menuRoot.style.cssText =
      'position:fixed !important; top:0 !important; left:0 !important; right:0 !important; bottom:0 !important; width:100vw !important; height:100vh !important; z-index:2147483647 !important; display:none !important; pointer-events:none !important;';

    const backdrop = document.createElement('div');
    backdrop.className = 'ips-backdrop';
    backdrop.addEventListener('click', () => closeMenu());
    menuRoot.appendChild(backdrop);

    const panel = document.createElement('div');
    panel.className = 'ips-panel';

    const header = document.createElement('div');
    header.className = 'ips-header';

    const headerLeft = document.createElement('div');
    headerLeft.className = 'ips-header-left';

    const headText = document.createElement('div');
    headText.className = 'ips-header-text';
    const title = document.createElement('h2');
    title.className = 'ips-title';
    title.textContent = 'Inventory Price Scanner';
    const sub = document.createElement('p');
    sub.className = 'ips-sub';
    sub.textContent = `v${VERSION} · Ctrl+K · button-only scan`;
    headText.appendChild(title);
    headText.appendChild(sub);
    headerLeft.appendChild(headText);

    const links = document.createElement('div');
    links.className = 'ips-header-links';
    function makeLinkBtn(label, url, titleTip) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ips-link-btn';
      btn.textContent = label;
      btn.title = titleTip || url;
      btn.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        openExternal(url);
      });
      links.appendChild(btn);
    }
    makeLinkBtn('Skywalk', SKYWALK_SITE_URL, 'Open kirka.lukeskywalk.com');
    makeLinkBtn('Skins DB', SKINS_DB_PAGE_URL, 'Open NAP skins.json database');
    makeLinkBtn('my GitHub', SKINS_REPO_URL, 'Open nnapkin12/napkin-theme-assets');
    headerLeft.appendChild(links);
    header.appendChild(headerLeft);

    const headerRight = document.createElement('div');
    headerRight.className = 'ips-header-right';
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'ips-close';
    closeBtn.title = 'Close (Esc)';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => closeMenu());
    headerRight.appendChild(closeBtn);
    header.appendChild(headerRight);
    panel.appendChild(header);

    const tabs = document.createElement('div');
    tabs.className = 'ips-tabs';
    ui.tabInv = document.createElement('button');
    ui.tabInv.type = 'button';
    ui.tabInv.className = 'ips-tab ips-tab-active';
    ui.tabInv.textContent = 'Inventory';
    ui.tabInv.addEventListener('click', () => setMainTab('inventory'));
    ui.tabCat = document.createElement('button');
    ui.tabCat.type = 'button';
    ui.tabCat.className = 'ips-tab';
    ui.tabCat.textContent = 'Catalog';
    ui.tabCat.title = 'Browse all Skywalk items (characters + weapons)';
    ui.tabCat.addEventListener('click', () => setMainTab('catalog'));
    tabs.appendChild(ui.tabInv);
    tabs.appendChild(ui.tabCat);
    panel.appendChild(tabs);

    ui.invChrome = document.createElement('div');
    ui.invChrome.className = 'ips-inv-chrome';

    const stats = document.createElement('div');
    stats.className = 'ips-stats';
    function stat(label, refKey) {
      const box = document.createElement('div');
      box.className = 'ips-stat';
      const lbl = document.createElement('div');
      lbl.className = 'ips-stat-label';
      lbl.textContent = label;
      const val = document.createElement('div');
      val.className = 'ips-stat-val';
      box.appendChild(lbl);
      box.appendChild(val);
      stats.appendChild(box);
      ui[refKey] = val;
    }
    stat('Grand total', 'totalGrand');
    stat('Weapons', 'totalWeapons');
    stat('Characters', 'totalChars');
    stat('Chests', 'totalChests');
    stat('Unique items', 'itemCount');
    ui.invChrome.appendChild(stats);

    const toolbar = document.createElement('div');
    toolbar.className = 'ips-toolbar';

    const settings = loadSettings();

    const plLabel = document.createElement('label');
    plLabel.textContent = 'Pricelist';
    toolbar.appendChild(plLabel);
    const plSelect = document.createElement('select');
    PRICELIST_OPTIONS.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      plSelect.appendChild(o);
    });
    plSelect.value = settings.pricelist;
    plSelect.addEventListener('change', () => {
      saveSettings({ pricelist: plSelect.value });
      repriceAll();
      refreshUi();
      if (mainTab === 'catalog') renderCatalogGrid();
      if (ui.catPlSelect) ui.catPlSelect.value = plSelect.value;
    });
    toolbar.appendChild(plSelect);

    const fbLabel = document.createElement('label');
    const fbCheck = document.createElement('input');
    fbCheck.type = 'checkbox';
    fbCheck.checked = settings.fallbackOn;
    fbLabel.className = 'ips-check';
    fbLabel.appendChild(fbCheck);
    fbLabel.appendChild(document.createTextNode('Fallback'));
    fbCheck.addEventListener('change', () => {
      saveSettings({ fallbackOn: fbCheck.checked });
      repriceAll();
      refreshUi();
      if (mainTab === 'catalog') renderCatalogGrid();
    });
    toolbar.appendChild(fbLabel);

    ui.scanBtn = document.createElement('button');
    ui.scanBtn.type = 'button';
    ui.scanBtn.className = 'ips-btn';
    ui.scanBtn.textContent = 'Scan current tab';
    ui.scanBtn.addEventListener('click', () => runScanOnce());
    toolbar.appendChild(ui.scanBtn);

    ui.scanAllBtn = document.createElement('button');
    ui.scanAllBtn.type = 'button';
    ui.scanAllBtn.className = 'ips-btn';
    ui.scanAllBtn.textContent = 'Scan all tabs';
    ui.scanAllBtn.addEventListener('click', () => scanAllInventoryTabs(loadSettings()));
    toolbar.appendChild(ui.scanAllBtn);

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'ips-btn ips-btn-danger';
    clearBtn.textContent = 'Clear cache';
    clearBtn.addEventListener('click', () => clearScanned());
    toolbar.appendChild(clearBtn);

    ui.invChrome.appendChild(toolbar);

    const body = document.createElement('div');
    body.className = 'ips-body';

    const listPane = document.createElement('div');
    listPane.className = 'ips-list-pane';

    ui.searchInput = document.createElement('input');
    ui.searchInput.type = 'search';
    ui.searchInput.className = 'ips-search';
    ui.searchInput.placeholder = 'Search skins, weapons, rarity…';
    ui.searchInput.autocomplete = 'off';
    ui.searchInput.addEventListener('input', () => {
      searchQuery = ui.searchInput.value || '';
      refreshMiniList(true);
    });
    listPane.appendChild(ui.searchInput);

    ui.miniList = document.createElement('div');
    ui.miniList.className = 'ips-mini-list';
    listPane.appendChild(ui.miniList);

    // Delegated click — no per-row listeners, single reliable hit target
    ui.miniList.addEventListener(
      'pointerdown',
      (event) => {
        const item =
          event.target && event.target.closest
            ? event.target.closest('.ips-mini-item')
            : null;
        if (!item || !ui.miniList.contains(item)) return;
        event.preventDefault();
        event.stopPropagation();
        selectItem(item.dataset.key || '');
      },
      true
    );

    body.appendChild(listPane);

    ui.detail = document.createElement('div');
    ui.detail.className = 'ips-detail-pane';
    body.appendChild(ui.detail);

    ui.invChrome.appendChild(body);
    panel.appendChild(ui.invChrome);

    // —— Catalog tab (Skywalk items.html style, memory-cached list) ——
    ui.catalogChrome = document.createElement('div');
    ui.catalogChrome.className = 'ips-catalog-chrome';
    ui.catalogChrome.style.display = 'none';

    const catToolbar = document.createElement('div');
    catToolbar.className = 'ips-catalog-toolbar';

    ui.catalogSearch = document.createElement('input');
    ui.catalogSearch.type = 'search';
    ui.catalogSearch.className = 'ips-search ips-catalog-search';
    ui.catalogSearch.placeholder = 'Search all items…';
    ui.catalogSearch.autocomplete = 'off';
    ui.catalogSearch.addEventListener('input', () => {
      catalogSearch = ui.catalogSearch.value || '';
      scheduleCatalogRender();
    });
    catToolbar.appendChild(ui.catalogSearch);

    const scopeWrap = document.createElement('div');
    scopeWrap.className = 'ips-scope';
    const scopeOpts = [
      { id: 'all', label: 'All' },
      { id: 'characters', label: 'Characters' },
      { id: 'weapons', label: 'Weapons' },
      { id: 'other', label: 'Other' },
    ];
    ui.scopeBtns = {};
    scopeOpts.forEach((opt) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ips-scope-btn' + (catalogScope === opt.id ? ' ips-scope-active' : '');
      btn.textContent = opt.label;
      btn.addEventListener('click', () => {
        catalogScope = opt.id;
        Object.keys(ui.scopeBtns).forEach((k) => {
          ui.scopeBtns[k].classList.toggle('ips-scope-active', k === opt.id);
        });
        renderCatalogGrid();
      });
      ui.scopeBtns[opt.id] = btn;
      scopeWrap.appendChild(btn);
    });
    catToolbar.appendChild(scopeWrap);

    const catPlLabel = document.createElement('label');
    catPlLabel.textContent = 'Price';
    catToolbar.appendChild(catPlLabel);
    ui.catPlSelect = document.createElement('select');
    PRICELIST_OPTIONS.forEach((opt) => {
      const o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      ui.catPlSelect.appendChild(o);
    });
    ui.catPlSelect.value = settings.pricelist;
    ui.catPlSelect.addEventListener('change', () => {
      saveSettings({ pricelist: ui.catPlSelect.value });
      plSelect.value = ui.catPlSelect.value;
      repriceAll();
      refreshUi();
      renderCatalogGrid();
    });
    catToolbar.appendChild(ui.catPlSelect);

    const refreshCatBtn = document.createElement('button');
    refreshCatBtn.type = 'button';
    refreshCatBtn.className = 'ips-btn';
    refreshCatBtn.textContent = 'Refresh';
    refreshCatBtn.title = 'Force re-fetch Skywalk list';
    refreshCatBtn.addEventListener('click', () => ensureCatalogLoaded(true));
    catToolbar.appendChild(refreshCatBtn);

    const openSkywalkBtn = document.createElement('button');
    openSkywalkBtn.type = 'button';
    openSkywalkBtn.className = 'ips-btn';
    openSkywalkBtn.textContent = 'Skywalk site';
    openSkywalkBtn.addEventListener('click', () => openExternal(SKYWALK_ITEMS_URL));
    catToolbar.appendChild(openSkywalkBtn);

    ui.catalogCount = document.createElement('span');
    ui.catalogCount.className = 'ips-catalog-count';
    ui.catalogCount.textContent = '';
    catToolbar.appendChild(ui.catalogCount);

    ui.catalogChrome.appendChild(catToolbar);

    ui.catalogScroll = document.createElement('div');
    ui.catalogScroll.className = 'ips-catalog-scroll';
    ui.catalogChrome.appendChild(ui.catalogScroll);
    panel.appendChild(ui.catalogChrome);

    const footer = document.createElement('div');
    footer.className = 'ips-footer';
    ui.status = document.createElement('span');
    ui.status.className = 'ips-status';
    ui.status.textContent =
      'Open Kirka inventory, then press Scan current tab or Scan all tabs. No auto-scan.';
    footer.appendChild(ui.status);
    const hint = document.createElement('span');
    hint.textContent = 'Esc or × to close · Catalog uses Skywalk list (not localStorage dumps)';
    footer.appendChild(hint);
    panel.appendChild(footer);

    menuRoot.appendChild(panel);
    (document.body || document.documentElement).appendChild(menuRoot);
  }

  function highlightMiniList(key) {
    if (!ui.miniList) return;
    const nodes = ui.miniList.children;
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (!el.classList || !el.classList.contains('ips-mini-item')) continue;
      el.classList.toggle('ips-active', el.dataset.key === key);
    }
  }

  function refreshMiniList(force) {
    if (!ui.miniList) return;
    const fp = getListFingerprint();
    if (!force && fp === listFingerprint) return;
    listFingerprint = fp;

    const scrollTop = ui.miniList.scrollTop;
    const frag = document.createDocumentFragment();
    const rows = sortedItems();

    if (!rows.length) {
      const empty = document.createElement('div');
      empty.className = 'ips-empty';
      empty.style.padding = '8px';
      empty.textContent = scannedItems.size
        ? 'No items match your search.'
        : 'No items scanned yet — open inventory & scan.';
      frag.appendChild(empty);
    } else {
      rows.forEach((row) => {
        const item = document.createElement('div');
        item.className = 'ips-mini-item' + (row.key === selectedItemKey ? ' ips-active' : '');
        item.dataset.key = row.key;

        if (row.renderUrl) {
          const thumb = document.createElement('img');
          thumb.className = 'ips-mini-thumb';
          thumb.src = row.renderUrl;
          thumb.alt = '';
          thumb.draggable = false;
          item.appendChild(thumb);
        }

        const meta = document.createElement('div');
        meta.className = 'ips-mini-meta';

        const name = document.createElement('div');
        name.className = 'ips-mini-name';
        name.textContent = row.name;

        const price = document.createElement('div');
        price.className = 'ips-mini-price';

        const val = document.createElement('span');
        val.className = 'ips-val';
        val.textContent = fmt(row.totalPrice);

        const count = document.createElement('span');
        count.textContent = row.count + 'x';

        const rarity = document.createElement('span');
        rarity.className = 'ips-rarity ' + rarityClass(row.rarity);
        rarity.textContent = row.rarityLabel;

        price.appendChild(val);
        price.appendChild(count);
        price.appendChild(rarity);

        meta.appendChild(name);
        meta.appendChild(price);
        item.appendChild(meta);
        frag.appendChild(item);
      });
    }

    ui.miniList.innerHTML = '';
    ui.miniList.appendChild(frag);
    ui.miniList.scrollTop = scrollTop;
  }

  function repriceAll() {
    const settings = loadSettings();
    scannedItems.forEach((row, key) => {
      const { entry, price } = lookupPrice(row.name, row.rarity, row.type, row.weapon, settings);
      row.pricePerItem = price;
      row.totalPrice = price * row.count;
      row.skywalk = entry;
      scannedItems.set(key, row);
    });
    recomputeTotals();
    persistScanned();
  }

  function buildFloatingButton() {
    if (floatBtn || document.getElementById('ips-float-btn')) {
      floatBtn = document.getElementById('ips-float-btn');
      return;
    }

    if (!document.getElementById('ips-float-styles')) {
      const style = document.createElement('style');
      style.id = 'ips-float-styles';
      style.textContent = `
        #ips-float-btn {
          position: fixed;
          right: 14px;
          bottom: 14px;
          z-index: 2147483000;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 999px;
          border: 1px solid rgba(255, 170, 70, 0.55);
          background: rgba(18, 24, 42, 0.92);
          color: #ffe8c0;
          font-family: "Rajdhani", "Segoe UI", system-ui, sans-serif;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: 0.03em;
          cursor: pointer;
          box-shadow: 0 8px 28px rgba(0,0,0,0.45), 0 0 16px rgba(255,140,30,0.25);
          pointer-events: auto;
        }
        #ips-float-btn:hover {
          background: rgba(255, 140, 30, 0.22);
          border-color: rgba(255, 210, 120, 0.75);
        }
        #ips-float-btn .ips-float-dot {
          width: 8px; height: 8px; border-radius: 50%;
          background: #ffd27a;
          box-shadow: 0 0 8px rgba(255,210,120,0.9);
        }
      `;
      document.head.appendChild(style);
    }

    floatBtn = document.createElement('button');
    floatBtn.type = 'button';
    floatBtn.id = 'ips-float-btn';
    floatBtn.title = 'Open invscan menu (Ctrl+K)';
    floatBtn.innerHTML = '<span class="ips-float-dot"></span><span>Open inventory scan</span>';
    floatBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      openMenu();
    });
    document.body.appendChild(floatBtn);
  }

  function handleHotkeyEvent(event) {
    if (!isMenuHotkey(event)) return;
    if (isEditableInputFocused()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleMenu();
  }

  function bindHotkeys() {
    if (window.__napInvScanHotkeys) return;
    window.__napInvScanHotkeys = true;

    document.addEventListener('keydown', handleHotkeyEvent, true);
    window.addEventListener('keydown', handleHotkeyEvent, true);

    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape' && menuOpen) {
          event.preventDefault();
          event.stopImmediatePropagation();
          closeMenu();
        }
      },
      true
    );
  }

  function initInventoryPriceScanner() {
    // Drop stale menu/styles from older broken builds
    const staleRoot = document.getElementById('ips-menu-root');
    if (staleRoot) staleRoot.remove();
    const staleStyle = document.getElementById('ips-menu-styles');
    if (staleStyle) staleStyle.remove();
    menuRoot = null;
    window.__napInvScanHotkeys = false;

    loadScannedFromStorage();
    buildMenu();
    buildFloatingButton();
    bindHotkeys();
    fetchPriceList(false);
    ensureSkinIndex();
    refreshUi();
    console.log('[InvScan] v' + VERSION + ' ready — Ctrl+K or bottom-right button');
  }

  window.__NAP_INV_SCAN__ = {
    open: openMenu,
    close: closeMenu,
    toggle: toggleMenu,
    rescan: runScanOnce,
  };

  if (document.body) {
    initInventoryPriceScanner();
  } else {
    const bodyWait = setInterval(() => {
      if (!document.body) return;
      clearInterval(bodyWait);
      initInventoryPriceScanner();
    }, 250);
  }
})();
