// ==UserScript==
// @name         NAP Gun Scale + Anim (Lite)
// @version      1.3.6
// @description  Gun scale modifier and weapon inspect animations. Ctrl+O menu.
// @author       napkin
// ==/UserScript==

(function () {
    'use strict';

    const VERSION = '1.3.6';
    const TAB_STORAGE_KEY = 'nap-gsa-tab';
    const WEAPON_SCALE_KEY = 'kirka-weapon-scale';
    const WEAPON_SCALE_ENABLED_KEY = 'kirka-weapon-scale-enabled';
    const WEAPON_OFFSET_X_KEY = 'kirka-weapon-offset-x';
    const WEAPON_OFFSET_Y_KEY = 'kirka-weapon-offset-y';
    const WEAPON_OFFSET_Z_KEY = 'kirka-weapon-offset-z';
    const GUNSCALE_CONFIGS_KEY = 'nap-gunscale-configs-v1';
    const GUNSCALE_ACTIVE_CONFIG_KEY = 'nap-gunscale-active-config';
    const WEAPON_ANIM_ENABLED_KEY = 'kirka-weapon-anim-enabled';
    const WEAPON_ANIM_INSPECT_KEY = 'kirka-weapon-anim-inspect-key';
    const WEAPON_ANIM_INSPECT_KEY_DEFAULT = 'q';
    const WEAPON_ANIM_ASSIGN_KEY = 'nap-weapon-anim-assign-v1';
    const GUNSCALE_CONFIGS_MAX = 20;
    const MENU_GHOST_KEY = 'nap-gsa-menu-ghost';

    const WEAPON_REGISTRY = {
        bayonet: { label: 'Bayonet', tab: 'melee' },
        tomahawk: { label: 'Tomahawk', tab: 'melee' },
        lar: { label: 'LAR', tab: 'guns' },
        ar9: { label: 'AR-9', tab: 'guns' },
        wheatie: { label: 'Wheatie', tab: 'guns' },
        mac10: { label: 'Mac-10', tab: 'guns' },
        scar: { label: 'Scar', tab: 'guns' },
        vita: { label: 'Vita', tab: 'guns' },
        shark: { label: 'Shark', tab: 'guns' },
        m60: { label: 'M60', tab: 'guns' },
        revolver: { label: 'Revolver', tab: 'guns' },
    };

    const WEAPON_DISPLAY_MAP = {
        Bayonet: 'Bayonet',
        Tomahawk: 'Tomahawk',
        LAR: 'LAR',
        'AR-9': 'AR-9',
        Weatie: 'Wheatie',
        Wheatie: 'Wheatie',
        'MAC-10': 'Mac-10',
        'Mac-10': 'Mac-10',
        Scar: 'Scar',
        Vita: 'Vita',
        Shark: 'Shark',
        M60: 'M60',
        Revolver: 'Revolver',
    };

    /* Melee keeps fixed butterfly. All other guns cycle among three kinds. */
    const INSPECT_ANIM_MELEE_BUTTERFLY = ['bayonet', 'tomahawk'];
    const INSPECT_ANIM_EXCLUDED = [];
    const ANIM_CYCLE = ['cowboy', 'clockwise', 'nudgeCcw'];
    const ANIM_KIND_SHORT = { cowboy: 'c', clockwise: 'w', nudgeCcw: 'n' };
    const ANIM_KIND_FROM_SHORT = { c: 'cowboy', w: 'clockwise', n: 'nudgeCcw' };
    /* Built-in defaults — not stored unless user changes them (overrides only). */
    const DEFAULT_WEAPON_ANIM_ASSIGN = {
        wheatie: 'cowboy',
        revolver: 'cowboy',
        shark: 'cowboy',
        vita: 'clockwise',
        mac10: 'clockwise',
        m60: 'clockwise',
        lar: 'nudgeCcw',
        ar9: 'nudgeCcw',
        scar: 'nudgeCcw',
    };
    const ANIM_SECTION_META = [
        { kind: 'cowboy', title: 'Cowboy spin:' },
        { kind: 'clockwise', title: 'Clockwise spin:' },
        { kind: 'nudgeCcw', title: 'Nudge and counterclockwise:' },
    ];

    /*
     * Nudge + counterclockwise: same 720ms easeOutCubic as clockwise (but opposite spin),
     * with a smooth outward float still in the bottom viewmodel HUD.
     */
    const PRESENT_OUT_DELTA = { x: -0.03, y: 0.04, z: 0.055 };
    const PRESENT_OUT_DURATION_MS = 720;

    const MELEE_WEAPON_KEYS = new Set(['Bayonet', 'Tomahawk']);
    const WEAPON_ANIM_EXCLUDED_MELEE = new Set(
        INSPECT_ANIM_EXCLUDED.map(function (id) { return WEAPON_REGISTRY[id].label; })
    );
    const INSPECT_ANIM_MELEE_BUTTERFLY_LABELS = new Set(
        INSPECT_ANIM_MELEE_BUTTERFLY.map(function (id) { return WEAPON_REGISTRY[id].label; })
    );

    const DOM_WEAPON_NAME_TO_ID = {
        bayonet: 'bayonet',
        tomahawk: 'tomahawk',
        lar: 'lar',
        ar9: 'ar9',
        weatie: 'wheatie',
        wheatie: 'wheatie',
        mac10: 'mac10',
        scar: 'scar',
        vita: 'vita',
        shark: 'shark',
        m60: 'm60',
        revolver: 'revolver',
    };

    const GEAR_ICON_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.506.506 0 0 0-.5-.42h-3.84c-.25 0-.46.18-.5.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2z"/></svg>';
    const ANIM_ICON_SVG = '<svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0 0 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 0 0 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>';

    function getStorageBool(key, fallback) {
        try {
            const saved = localStorage.getItem(key);
            if (saved === null) return fallback;
            return saved === 'true';
        } catch (_) {
            return fallback;
        }
    }

    function setStorageBool(key, value) {
        try { localStorage.setItem(key, String(!!value)); } catch (_) {}
    }

    function getStorageNum(key, fallback) {
        try {
            const saved = localStorage.getItem(key);
            if (saved === null) return fallback;
            const n = parseFloat(saved);
            return Number.isFinite(n) ? n : fallback;
        } catch (_) {
            return fallback;
        }
    }

    function loadWeaponScaleEnabled() {
        try {
            if (localStorage.getItem(WEAPON_SCALE_ENABLED_KEY) !== null) {
                return getStorageBool(WEAPON_SCALE_ENABLED_KEY, false);
            }
            const scale = getStorageNum(WEAPON_SCALE_KEY, 1);
            const ox = getStorageNum(WEAPON_OFFSET_X_KEY, 0);
            const oy = getStorageNum(WEAPON_OFFSET_Y_KEY, 0);
            const oz = getStorageNum(WEAPON_OFFSET_Z_KEY, 0);
            return scale !== 1 || ox !== 0 || oy !== 0 || oz !== 0;
        } catch (_) {
            return false;
        }
    }

    function normalizeWeaponScale(value) {
        const n = parseFloat(value);
        if (!Number.isFinite(n)) return 1;
        return Math.min(3, Math.max(0.1, n));
    }

    function normalizeWeaponOffset(value) {
        const n = parseFloat(value);
        if (!Number.isFinite(n)) return 0;
        return Math.min(0.5, Math.max(-0.5, n));
    }

    let weaponScaleEnabled = loadWeaponScaleEnabled();
    let weaponScale = normalizeWeaponScale(getStorageNum(WEAPON_SCALE_KEY, 1));
    let weaponOffsetX = normalizeWeaponOffset(getStorageNum(WEAPON_OFFSET_X_KEY, 0));
    let weaponOffsetY = normalizeWeaponOffset(getStorageNum(WEAPON_OFFSET_Y_KEY, 0));
    let weaponOffsetZ = normalizeWeaponOffset(getStorageNum(WEAPON_OFFSET_Z_KEY, 0));
    let weaponAnimEnabled = getStorageBool(WEAPON_ANIM_ENABLED_KEY, false);
    let weaponAnimInspectKey = (function () {
        try {
            const saved = localStorage.getItem(WEAPON_ANIM_INSPECT_KEY);
            const key = saved ? String(saved).toLowerCase() : WEAPON_ANIM_INSPECT_KEY_DEFAULT;
            if (key === 'x') {
                localStorage.setItem(WEAPON_ANIM_INSPECT_KEY, WEAPON_ANIM_INSPECT_KEY_DEFAULT);
                return WEAPON_ANIM_INSPECT_KEY_DEFAULT;
            }
            return key;
        } catch (_) {
            return WEAPON_ANIM_INSPECT_KEY_DEFAULT;
        }
    })();

    let gunScaleConfigs = {};
    let activeGunScaleConfigId = null;
    let menuHost = null;
    let menuGhostBtn = null;
    let menuGhostBg = getStorageBool(MENU_GHOST_KEY, false);
    let activeMenuTab = 'gunscale';
    let gunScaleSubEl = null;
    let gunScaleEnableBtn = null;
    let gunScaleSaveBtn = null;
    let gunScaleResetBtn = null;
    let gunScalePanelEl = null;
    let gunScaleSliderRows = null;
    let gunScaleConfigListEl = null;
    let gunScaleNamePromptEl = null;
    let gunScaleNameInput = null;
    let weaponAnimEnableBtn = null;
    let weaponAnimSubEl = null;
    let weaponAnimInspectKeyInput = null;
    let weaponAnimKeyMetaEl = null;
    let weaponAnimListsEl = null;
    /* id -> kind only when different from DEFAULT_WEAPON_ANIM_ASSIGN */
    let weaponAnimAssignOverrides = {};

    const weaponAnimState = {
        active: false,
        mode: null,
        angle: 0,
        presentBlend: 0,
        gunStartTime: 0,
        gunDuration: 720,
        gunTotalRotation: Math.PI * 2,
        meleeVelocity: 0,
        lastUpdate: 0,
        rafId: null,
        cachedDisplayName: null,
        cachedWeaponId: null,
    };

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function resetWeaponAnimMotion() {
        weaponAnimState.angle = 0;
        weaponAnimState.presentBlend = 0;
        weaponAnimState.meleeVelocity = 0;
    }

    const gunScaleScratchMatrix = new Float32Array(16);
    const weaponAnimScratchMatrix = new Float32Array(16);
    let spectatingCached = false;
    let domHeldWeaponId = null;
    let domWeaponObserver = null;

    const hookedGlEntries = [];
    const glToEntry = new WeakMap();
    let bridgeUnregisters = [];

    function needsGunScaleMods() {
        if (!weaponScaleEnabled) return false;
        return normalizeWeaponScale(weaponScale) !== 1
            || normalizeWeaponOffset(weaponOffsetX) !== 0
            || normalizeWeaponOffset(weaponOffsetY) !== 0
            || normalizeWeaponOffset(weaponOffsetZ) !== 0;
    }

    function persistGunScaleSettings() {
        try {
            localStorage.setItem(WEAPON_SCALE_ENABLED_KEY, String(!!weaponScaleEnabled));
            localStorage.setItem(WEAPON_SCALE_KEY, String(weaponScale));
            localStorage.setItem(WEAPON_OFFSET_X_KEY, String(weaponOffsetX));
            localStorage.setItem(WEAPON_OFFSET_Y_KEY, String(weaponOffsetY));
            localStorage.setItem(WEAPON_OFFSET_Z_KEY, String(weaponOffsetZ));
        } catch (_) {}
    }

    function applyGunScaleSettings() {
        weaponScale = normalizeWeaponScale(weaponScale);
        weaponOffsetX = normalizeWeaponOffset(weaponOffsetX);
        weaponOffsetY = normalizeWeaponOffset(weaponOffsetY);
        weaponOffsetZ = normalizeWeaponOffset(weaponOffsetZ);
        persistGunScaleSettings();
        refreshBridgeHandlers();
    }

    function setWeaponScaleEnabled(enabled) {
        weaponScaleEnabled = !!enabled;
        persistGunScaleSettings();
        refreshBridgeHandlers();
    }

    function resolveWeaponInternalName(displayName) {
        if (!displayName) return null;
        const trimmed = displayName.trim();
        if (WEAPON_DISPLAY_MAP[trimmed]) return WEAPON_DISPLAY_MAP[trimmed];
        const lower = trimmed.toLowerCase();
        for (const key in WEAPON_DISPLAY_MAP) {
            if (key.toLowerCase() === lower) return WEAPON_DISPLAY_MAP[key];
        }
        for (const weaponId in WEAPON_REGISTRY) {
            if (WEAPON_REGISTRY[weaponId].label.toLowerCase() === lower) {
                return WEAPON_REGISTRY[weaponId].label;
            }
        }
        return trimmed;
    }

    function getWeaponIdFromInternalName(internalName) {
        if (!internalName) return null;
        for (const weaponId in WEAPON_REGISTRY) {
            if (WEAPON_REGISTRY[weaponId].label === internalName) return weaponId;
        }
        return null;
    }

    function isMeleeWeaponId(weaponId) {
        if (!weaponId || !WEAPON_REGISTRY[weaponId]) return false;
        return WEAPON_REGISTRY[weaponId].tab === 'melee';
    }

    function loadWeaponAnimAssign() {
        weaponAnimAssignOverrides = {};
        try {
            const raw = localStorage.getItem(WEAPON_ANIM_ASSIGN_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== 'object') return;
            for (const id in parsed) {
                if (!Object.prototype.hasOwnProperty.call(DEFAULT_WEAPON_ANIM_ASSIGN, id)) continue;
                let kind = parsed[id];
                if (ANIM_KIND_FROM_SHORT[kind]) kind = ANIM_KIND_FROM_SHORT[kind];
                if (ANIM_CYCLE.indexOf(kind) < 0) continue;
                if (kind !== DEFAULT_WEAPON_ANIM_ASSIGN[id]) weaponAnimAssignOverrides[id] = kind;
            }
        } catch (_) {
            weaponAnimAssignOverrides = {};
        }
    }

    function persistWeaponAnimAssign() {
        try {
            const out = {};
            for (const id in weaponAnimAssignOverrides) {
                const kind = weaponAnimAssignOverrides[id];
                const short = ANIM_KIND_SHORT[kind];
                if (short) out[id] = short;
            }
            if (Object.keys(out).length === 0) localStorage.removeItem(WEAPON_ANIM_ASSIGN_KEY);
            else localStorage.setItem(WEAPON_ANIM_ASSIGN_KEY, JSON.stringify(out));
        } catch (_) {}
    }

    function getWeaponAnimKind(weaponId) {
        if (!weaponId) return 'clockwise';
        if (weaponAnimAssignOverrides[weaponId]) return weaponAnimAssignOverrides[weaponId];
        if (DEFAULT_WEAPON_ANIM_ASSIGN[weaponId]) return DEFAULT_WEAPON_ANIM_ASSIGN[weaponId];
        return 'clockwise';
    }

    function setWeaponAnimKind(weaponId, kind) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_WEAPON_ANIM_ASSIGN, weaponId)) return false;
        if (ANIM_CYCLE.indexOf(kind) < 0) return false;
        if (kind === DEFAULT_WEAPON_ANIM_ASSIGN[weaponId]) delete weaponAnimAssignOverrides[weaponId];
        else weaponAnimAssignOverrides[weaponId] = kind;
        persistWeaponAnimAssign();
        return true;
    }

    function cycleWeaponAnimKind(weaponId) {
        if (!Object.prototype.hasOwnProperty.call(DEFAULT_WEAPON_ANIM_ASSIGN, weaponId)) return null;
        const cur = getWeaponAnimKind(weaponId);
        const next = ANIM_CYCLE[(ANIM_CYCLE.indexOf(cur) + 1) % ANIM_CYCLE.length];
        setWeaponAnimKind(weaponId, next);
        return next;
    }

    function getWeaponIdsForAnimKind(kind) {
        const ids = [];
        for (const id in DEFAULT_WEAPON_ANIM_ASSIGN) {
            if (getWeaponAnimKind(id) === kind) ids.push(id);
        }
        ids.sort(function (a, b) {
            return WEAPON_REGISTRY[a].label.localeCompare(WEAPON_REGISTRY[b].label);
        });
        return ids;
    }

    function getSpinStyleForWeaponId(weaponId) {
        if (!weaponId) return 'localY';
        const kind = getWeaponAnimKind(weaponId);
        if (kind === 'cowboy') return weaponId === 'shark' ? 'localX' : 'cowboy';
        /* clockwise + nudgeCcw */
        return 'worldY';
    }

    function getSpinStyleForWeapon(displayName) {
        const weaponId = weaponAnimState.cachedWeaponId
            || getWeaponIdFromInternalName(resolveWeaponInternalName(displayName));
        return getSpinStyleForWeaponId(weaponId);
    }

    function normalizeDomWeaponName(raw) {
        if (!raw) return null;
        return raw.trim().toLowerCase().replace(/[\s\-_]/g, '');
    }

    function readSelectedWeaponNameFromDom() {
        const selected = document.querySelector('.weapon-cont .bottom.is-selected');
        if (!selected) return null;
        const parent = selected.parentElement;
        const nameEl = parent ? parent.querySelector('.weapon-name') : null;
        return nameEl && nameEl.textContent ? nameEl.textContent.trim() : null;
    }

    function readSelectedWeaponIdFromDom() {
        const name = readSelectedWeaponNameFromDom();
        if (!name) return null;
        const normalized = normalizeDomWeaponName(name);
        if (normalized && DOM_WEAPON_NAME_TO_ID[normalized]) return DOM_WEAPON_NAME_TO_ID[normalized];
        return getWeaponIdFromInternalName(resolveWeaponInternalName(name));
    }

    function updateDomHeldWeaponId() {
        const id = readSelectedWeaponIdFromDom();
        if (id) domHeldWeaponId = id;
    }

    function initDomWeaponTracker() {
        updateDomHeldWeaponId();
        if (domWeaponObserver || !document.body) return;
        domWeaponObserver = new MutationObserver(function () {
            updateDomHeldWeaponId();
        });
        domWeaponObserver.observe(document.body, {
            attributes: true,
            attributeFilter: ['class'],
            childList: true,
            subtree: true,
        });
    }

    function getHeldWeaponContext() {
        updateDomHeldWeaponId();
        if (domHeldWeaponId && WEAPON_REGISTRY[domHeldWeaponId]) {
            return { weaponId: domHeldWeaponId, displayName: WEAPON_REGISTRY[domHeldWeaponId].label };
        }
        const displayName = readSelectedWeaponNameFromDom();
        if (displayName) {
            const internalName = resolveWeaponInternalName(displayName);
            const weaponId = getWeaponIdFromInternalName(internalName);
            if (weaponId) return { weaponId: weaponId, displayName: internalName };
        }
        return { weaponId: null, displayName: null };
    }

    function isTomahawkHeld() {
        return domHeldWeaponId === 'tomahawk';
    }

    function columnLength3(m, i) {
        return Math.sqrt(m[i] * m[i] + m[i + 1] * m[i + 1] + m[i + 2] * m[i + 2]);
    }

    function classifyViewmodelMatrix(m) {
        if (!m || m.length < 16) return null;
        if (Math.abs(m[3]) > 0.001 || Math.abs(m[7]) > 0.001 || Math.abs(m[11]) > 0.001) return null;
        if (Math.abs(m[15] - 1.0) > 0.001) return null;
        const sx = columnLength3(m, 0);
        const sy = columnLength3(m, 4);
        const sz = columnLength3(m, 8);
        if (sx < 0.001 || sx > 15.0 || sy < 0.001 || sy > 15.0 || sz < 0.001 || sz > 15.0) return null;
        const distance = Math.sqrt(m[12] * m[12] + m[13] * m[13] + m[14] * m[14]);
        if (distance < 0.001 || distance > 0.6) return null;
        const maxScale = Math.max(sx, sy, sz);
        if (maxScale < 1.7) return 'weapon';
        return maxScale / Math.min(sx, sy, sz) < 1.05 ? 'weapon' : 'arms';
    }

    function isViewmodelMatrix(m) {
        if (!m || m.length < 16) return false;
        if (Math.abs(m[3]) > 0.001 || Math.abs(m[7]) > 0.001 || Math.abs(m[11]) > 0.001) return false;
        if (Math.abs(m[15] - 1.0) > 0.001) return false;
        const distance = Math.sqrt(m[12] * m[12] + m[13] * m[13] + m[14] * m[14]);
        return distance >= 0.001 && distance <= 0.6;
    }

    function getMatrixScaleSignature(m) {
        if (!m || m.length < 16) return null;
        return columnLength3(m, 0).toFixed(2) + ',' + columnLength3(m, 4).toFixed(2) + ',' + columnLength3(m, 8).toFixed(2);
    }

    function shouldApplyViewmodelMods(kind, vm, slice) {
        if (kind === 'weapon') return true;
        const held = getHeldWeaponContext();
        if (kind === 'arms' && held.weaponId && isMeleeWeaponId(held.weaponId)) return true;
        if (vm && vm.inViewmodelPass && isTomahawkHeld()) {
            if (kind === 'weapon' || kind === 'arms') return true;
            if (isViewmodelMatrix(slice)) return true;
        }
        return false;
    }

    function applyRotYToMatrix(source, out, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        out[0] = source[0] * c + source[8] * s;
        out[1] = source[1] * c + source[9] * s;
        out[2] = source[2] * c + source[10] * s;
        out[3] = source[3];
        out[4] = source[4];
        out[5] = source[5];
        out[6] = source[6];
        out[7] = source[7];
        out[8] = source[0] * -s + source[8] * c;
        out[9] = source[1] * -s + source[9] * c;
        out[10] = source[2] * -s + source[10] * c;
        out[11] = source[11];
        out[12] = source[12];
        out[13] = source[13];
        out[14] = source[14];
        out[15] = source[15];
    }

    function applyWorldRotYToMatrix(source, out, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        out[0] = c * source[0] + s * source[2];
        out[1] = source[1];
        out[2] = -s * source[0] + c * source[2];
        out[3] = source[3];
        out[4] = c * source[4] + s * source[6];
        out[5] = source[5];
        out[6] = -s * source[4] + c * source[6];
        out[7] = source[7];
        out[8] = c * source[8] + s * source[10];
        out[9] = source[9];
        out[10] = -s * source[8] + c * source[10];
        out[11] = source[11];
        out[12] = source[12];
        out[13] = source[13];
        out[14] = source[14];
        out[15] = source[15];
    }

    function applyRotXToMatrix(source, out, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        out[0] = source[0]; out[1] = source[1]; out[2] = source[2]; out[3] = source[3];
        out[4] = c * source[4] - s * source[8];
        out[5] = c * source[5] - s * source[9];
        out[6] = c * source[6] - s * source[10];
        out[7] = source[7];
        out[8] = s * source[4] + c * source[8];
        out[9] = s * source[5] + c * source[9];
        out[10] = s * source[6] + c * source[10];
        out[11] = source[11];
        out[12] = source[12]; out[13] = source[13]; out[14] = source[14]; out[15] = source[15];
    }

    function applyRotZToMatrix(source, out, angle) {
        const c = Math.cos(angle);
        const s = Math.sin(angle);
        out[0] = c * source[0] + s * source[4];
        out[1] = c * source[1] + s * source[5];
        out[2] = c * source[2] + s * source[6];
        out[3] = source[3];
        out[4] = -s * source[0] + c * source[4];
        out[5] = -s * source[1] + c * source[5];
        out[6] = -s * source[2] + c * source[6];
        out[7] = source[7];
        out[8] = source[8]; out[9] = source[9]; out[10] = source[10]; out[11] = source[11];
        out[12] = source[12]; out[13] = source[13]; out[14] = source[14]; out[15] = source[15];
    }

    function applyCowboyRollToMatrix(source, out, angle) {
        const colX = Math.abs(source[1]);
        const colY = Math.abs(source[5]);
        const colZ = Math.abs(source[9]);
        let axis = 'localY';
        if (colX <= colY && colX <= colZ) axis = 'localX';
        else if (colZ <= colY && colZ <= colX) axis = 'localZ';
        applySpinToMatrix(source, out, angle, axis);
    }

    function applySpinToMatrix(source, out, angle, axis) {
        if (axis === 'worldY') applyWorldRotYToMatrix(source, out, angle);
        else if (axis === 'cowboy') applyCowboyRollToMatrix(source, out, angle);
        else if (axis === 'localX') applyRotXToMatrix(source, out, angle);
        else if (axis === 'localZ') applyRotZToMatrix(source, out, angle);
        else applyRotYToMatrix(source, out, angle);
    }

    function stopWeaponAnimTicker() {
        if (weaponAnimState.rafId) {
            cancelAnimationFrame(weaponAnimState.rafId);
            weaponAnimState.rafId = null;
        }
    }

    function tickWeaponAnimFrame(now) {
        weaponAnimState.rafId = null;
        if (!weaponAnimState.active) {
            resetWeaponAnimMotion();
            return;
        }
        if (weaponAnimState.mode === 'gun') {
            const elapsed = now - weaponAnimState.gunStartTime;
            const t = Math.min(1, elapsed / weaponAnimState.gunDuration);
            if (t >= 1) {
                weaponAnimState.active = false;
                resetWeaponAnimMotion();
                return;
            }
            weaponAnimState.presentBlend = 0;
            weaponAnimState.angle = weaponAnimState.gunTotalRotation * easeOutCubic(t);
        } else if (weaponAnimState.mode === 'gunNudgeCcw') {
            const elapsed = now - weaponAnimState.gunStartTime;
            const t = Math.min(1, elapsed / weaponAnimState.gunDuration);
            if (t >= 1) {
                weaponAnimState.active = false;
                resetWeaponAnimMotion();
                return;
            }
            /* Same easing as clockwise, opposite direction. */
            weaponAnimState.angle = -weaponAnimState.gunTotalRotation * easeOutCubic(t);
            weaponAnimState.presentBlend = Math.sin(Math.PI * t);
        } else if (weaponAnimState.mode === 'melee') {
            const last = weaponAnimState.lastUpdate || now;
            const dt = Math.min(0.05, (now - last) / 1000);
            weaponAnimState.lastUpdate = now;
            weaponAnimState.presentBlend = 0;
            weaponAnimState.angle += weaponAnimState.meleeVelocity * dt;
            weaponAnimState.meleeVelocity *= Math.pow(0.015, dt);
            if (weaponAnimState.meleeVelocity < 0.35) {
                weaponAnimState.active = false;
                resetWeaponAnimMotion();
                return;
            }
        } else {
            weaponAnimState.active = false;
            resetWeaponAnimMotion();
            return;
        }
        weaponAnimState.rafId = requestAnimationFrame(tickWeaponAnimFrame);
    }

    function startWeaponAnimTicker() {
        if (!weaponAnimState.rafId) {
            weaponAnimState.rafId = requestAnimationFrame(tickWeaponAnimFrame);
        }
    }

    function triggerWeaponAnimInspect() {
        const held = getHeldWeaponContext();
        if (!held.displayName) return false;
        const internalName = resolveWeaponInternalName(held.displayName);
        if (WEAPON_ANIM_EXCLUDED_MELEE.has(internalName)) return false;

        const isMelee = INSPECT_ANIM_MELEE_BUTTERFLY_LABELS.has(internalName);
        const now = performance.now();
        weaponAnimState.active = true;
        weaponAnimState.lastUpdate = now;
        weaponAnimState.cachedDisplayName = held.displayName;
        weaponAnimState.cachedWeaponId = getWeaponIdFromInternalName(internalName);

        if (isMelee) {
            weaponAnimState.mode = 'melee';
            weaponAnimState.presentBlend = 0;
            weaponAnimState.meleeVelocity = Math.min(
                weaponAnimState.meleeVelocity + Math.PI * 6,
                Math.PI * 24
            );
        } else if (getWeaponAnimKind(weaponAnimState.cachedWeaponId) === 'nudgeCcw') {
            weaponAnimState.mode = 'gunNudgeCcw';
            weaponAnimState.gunStartTime = now;
            weaponAnimState.gunDuration = PRESENT_OUT_DURATION_MS;
            weaponAnimState.meleeVelocity = 0;
            weaponAnimState.angle = 0;
            weaponAnimState.presentBlend = 0;
        } else {
            weaponAnimState.mode = 'gun';
            weaponAnimState.gunStartTime = now;
            weaponAnimState.gunDuration = 720;
            weaponAnimState.meleeVelocity = 0;
            weaponAnimState.angle = 0;
            weaponAnimState.presentBlend = 0;
        }

        startWeaponAnimTicker();
        tickWeaponAnimFrame(now);
        return true;
    }

    function setWeaponAnimEnabled(enabled) {
        weaponAnimEnabled = !!enabled;
        setStorageBool(WEAPON_ANIM_ENABLED_KEY, weaponAnimEnabled);
        if (!weaponAnimEnabled) {
            stopWeaponAnimTicker();
            weaponAnimState.active = false;
            weaponAnimState.mode = null;
            resetWeaponAnimMotion();
            weaponAnimState.cachedDisplayName = null;
            weaponAnimState.cachedWeaponId = null;
        }
        refreshBridgeHandlers();
        refreshWeaponAnimUi();
    }

    function setWeaponAnimInspectKey(key) {
        const normalized = String(key || '').trim().toLowerCase();
        if (!normalized || normalized.length !== 1 || !/^[a-z0-9]$/.test(normalized)) return false;
        weaponAnimInspectKey = normalized;
        try { localStorage.setItem(WEAPON_ANIM_INSPECT_KEY, normalized); } catch (_) {}
        if (weaponAnimInspectKeyInput && document.activeElement !== weaponAnimInspectKeyInput) {
            weaponAnimInspectKeyInput.value = normalized.toUpperCase();
        }
        refreshWeaponAnimKeyMeta();
        return true;
    }

    function refreshWeaponAnimKeyMeta() {
        if (weaponAnimKeyMetaEl) {
            weaponAnimKeyMetaEl.textContent = 'set · ' + String(weaponAnimInspectKey || '?').toUpperCase();
            weaponAnimKeyMetaEl.classList.remove('is-listening');
        }
        if (weaponAnimInspectKeyInput && document.activeElement !== weaponAnimInspectKeyInput) {
            weaponAnimInspectKeyInput.classList.remove('is-listening');
            weaponAnimInspectKeyInput.value = String(weaponAnimInspectKey || '').toUpperCase();
        }
    }

    function paintEnableToggle(btn, enabled) {
        if (!btn) return;
        btn.classList.toggle('is-on', !!enabled);
        btn.textContent = enabled ? 'DISABLE' : 'ENABLE';
    }

    function refreshWeaponAnimUi() {
        if (weaponAnimSubEl) weaponAnimSubEl.classList.toggle('is-visible', !!weaponAnimEnabled);
        paintEnableToggle(weaponAnimEnableBtn, weaponAnimEnabled);
        refreshWeaponAnimKeyMeta();
    }

    function refreshGunScaleSaveBtn() {
        if (!gunScaleSaveBtn) return;
        /* Blue when freeform / dirty; grey while a saved config is selected or at max. */
        const atMax = Object.keys(gunScaleConfigs).length >= GUNSCALE_CONFIGS_MAX;
        const canSave = !activeGunScaleConfigId && !atMax;
        gunScaleSaveBtn.disabled = !canSave;
        gunScaleSaveBtn.classList.toggle('is-save-ready', canSave);
        gunScaleSaveBtn.classList.toggle('is-save-locked', !canSave);
        gunScaleSaveBtn.textContent = atMax ? 'Max ' + GUNSCALE_CONFIGS_MAX + ' configs' : 'Save as config';
    }

    function isEditableInputFocused() {
        const el = document.activeElement;
        if (!el) return false;
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
        return !!el.isContentEditable;
    }

    function bindWeaponAnimInspect() {
        if (window.__napGsaWeaponAnimInspect) return;
        window.__napGsaWeaponAnimInspect = true;
        document.addEventListener('keydown', function (event) {
            if (!weaponAnimEnabled) return;
            if (event.ctrlKey || event.altKey || event.metaKey) return;
            if (isEditableInputFocused()) return;
            if ((event.key || '').toLowerCase() !== weaponAnimInspectKey) return;
            if (!document.getElementById('game')) return;
            /* One inspect per key press. Ignore OS key-repeat; no hold-to-spam. */
            if (event.repeat) return;
            triggerWeaponAnimInspect();
        }, true);
    }

    function loadGunScaleConfigsFromStorage() {
        try {
            const raw = localStorage.getItem(GUNSCALE_CONFIGS_KEY);
            if (!raw) return {};
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : {};
        } catch (_) {
            return {};
        }
    }

    function persistGunScaleConfigs() {
        try { localStorage.setItem(GUNSCALE_CONFIGS_KEY, JSON.stringify(gunScaleConfigs)); } catch (_) {}
    }

    function setActiveGunScaleConfigId(id) {
        try {
            if (id) localStorage.setItem(GUNSCALE_ACTIVE_CONFIG_KEY, id);
            else localStorage.removeItem(GUNSCALE_ACTIVE_CONFIG_KEY);
        } catch (_) {}
    }

    function clearActiveGunScaleConfig() {
        activeGunScaleConfigId = null;
        setActiveGunScaleConfigId(null);
        renderGunScaleConfigList();
        refreshGunScaleSaveBtn();
    }

    function renderGunScaleConfigList() {
        if (!gunScaleConfigListEl) return;
        gunScaleConfigListEl.innerHTML = '';
        const ids = Object.keys(gunScaleConfigs);
        if (!ids.length) {
            const empty = document.createElement('div');
            empty.className = 'nap-gsa-config-empty';
            empty.textContent = 'no saved configs yet (max ' + GUNSCALE_CONFIGS_MAX + ') — tweak sliders and save';
            gunScaleConfigListEl.appendChild(empty);
            refreshGunScaleSaveBtn();
            return;
        }
        ids.sort(function (a, b) {
            return String(gunScaleConfigs[a].name).localeCompare(String(gunScaleConfigs[b].name));
        });
        ids.forEach(function (id) {
            const cfg = gunScaleConfigs[id];
            const row = document.createElement('div');
            row.className = 'nap-gsa-config-item';

            const removeBtn = document.createElement('button');
            removeBtn.type = 'button';
            removeBtn.className = 'nap-gsa-config-remove';
            removeBtn.setAttribute('aria-label', 'Remove config');
            removeBtn.textContent = '×';
            removeBtn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();
                deleteGunScaleConfig(id);
            });

            row.classList.toggle('is-on', id === activeGunScaleConfigId);

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'nap-gsa-config-btn';
            btn.textContent = cfg.name;
            btn.addEventListener('click', function () {
                hideGunScaleNamePrompt();
                if (activeGunScaleConfigId === id) clearActiveGunScaleConfig();
                else applyGunScaleConfigFromStore(id);
                btn.blur();
            });

            row.appendChild(removeBtn);
            row.appendChild(btn);
            gunScaleConfigListEl.appendChild(row);
        });
        refreshGunScaleSaveBtn();
    }

    function syncGunScaleSlidersToState() {
        if (!gunScaleSliderRows) return;
        gunScaleSliderRows.scale.setValue(weaponScale);
        gunScaleSliderRows.offsetX.setValue(weaponOffsetX);
        gunScaleSliderRows.offsetY.setValue(weaponOffsetY);
        gunScaleSliderRows.offsetZ.setValue(weaponOffsetZ);
    }

    function applyGunScaleConfigFromStore(id) {
        const cfg = gunScaleConfigs[id];
        if (!cfg) return;
        weaponScale = normalizeWeaponScale(cfg.scale);
        weaponOffsetX = normalizeWeaponOffset(cfg.offsetX);
        weaponOffsetY = normalizeWeaponOffset(cfg.offsetY);
        weaponOffsetZ = normalizeWeaponOffset(cfg.offsetZ);
        if (!weaponScaleEnabled) weaponScaleEnabled = true;
        applyGunScaleSettings();
        syncGunScaleSlidersToState();
        activeGunScaleConfigId = id;
        setActiveGunScaleConfigId(id);
        refreshGunScaleUi();
        renderGunScaleConfigList();
    }

    function saveCurrentGunScaleConfig(name) {
        const trimmed = String(name || '').trim();
        if (!trimmed) return false;
        if (Object.keys(gunScaleConfigs).length >= GUNSCALE_CONFIGS_MAX) return false;
        const id = 'cfg_' + Date.now();
        gunScaleConfigs[id] = {
            name: trimmed.slice(0, 32),
            scale: normalizeWeaponScale(weaponScale),
            offsetX: normalizeWeaponOffset(weaponOffsetX),
            offsetY: normalizeWeaponOffset(weaponOffsetY),
            offsetZ: normalizeWeaponOffset(weaponOffsetZ),
        };
        persistGunScaleConfigs();
        activeGunScaleConfigId = id;
        setActiveGunScaleConfigId(id);
        hideGunScaleNamePrompt();
        renderGunScaleConfigList();
        refreshGunScaleSaveBtn();
        return true;
    }

    function deleteGunScaleConfig(id) {
        if (!id || !gunScaleConfigs[id]) return;
        delete gunScaleConfigs[id];
        persistGunScaleConfigs();
        if (activeGunScaleConfigId === id) {
            activeGunScaleConfigId = null;
            setActiveGunScaleConfigId(null);
        }
        renderGunScaleConfigList();
        refreshGunScaleSaveBtn();
    }

    function refreshGunScaleUi() {
        if (!gunScaleSubEl || !gunScaleEnableBtn) return;
        gunScaleSubEl.classList.toggle('is-visible', !!weaponScaleEnabled);
        paintEnableToggle(gunScaleEnableBtn, weaponScaleEnabled);
        refreshGunScaleSaveBtn();
    }

    function initGunScaleConfigs() {
        gunScaleConfigs = loadGunScaleConfigsFromStorage();
        try {
            activeGunScaleConfigId = localStorage.getItem(GUNSCALE_ACTIVE_CONFIG_KEY) || null;
        } catch (_) {
            activeGunScaleConfigId = null;
        }
        if (activeGunScaleConfigId && !gunScaleConfigs[activeGunScaleConfigId]) {
            activeGunScaleConfigId = null;
            setActiveGunScaleConfigId(null);
        }
    }

    function resetAllViewmodelState() {
        for (let i = 0; i < hookedGlEntries.length; i += 1) {
            const vm = hookedGlEntries[i].vm;
            vm.inViewmodelPass = false;
            vm.tomahawkSigCount = 0;
        }
    }

    function onClear(ctx) {
        const entry = glToEntry.get(ctx.gl);
        if (!entry) return;
        entry.vm.inViewmodelPass = (ctx.args[0] === ctx.gl.DEPTH_BUFFER_BIT);
        if (entry.vm.inViewmodelPass) entry.vm.tomahawkSigCount = 0;
    }

    function onUniformMatrix4fv(ctx) {
        if (spectatingCached) return;

        const gunScaleMods = weaponScaleEnabled && needsGunScaleMods();
        const hasAnim = weaponAnimEnabled && weaponAnimState.active;
        if (!gunScaleMods && !hasAnim) return;

        const gl = ctx.gl;
        if (!gl || !gl.canvas || gl.canvas.id !== 'game') return;

        const entry = glToEntry.get(gl);
        const vm = entry ? entry.vm : null;
        const callArgs = ctx.args;
        const data = callArgs[2];
        if (!data || data.length < 16) return;

        const srcOffset = callArgs[3] || 0;
        let slice;
        if (srcOffset === 0 && data.length === 16) slice = data;
        else if (data.subarray) slice = data.subarray(srcOffset, srcOffset + 16);
        else slice = Array.prototype.slice.call(data, srcOffset, srcOffset + 16);

        if (vm && vm.inViewmodelPass && isTomahawkHeld()) {
            const sig = getMatrixScaleSignature(slice);
            if (sig === '1.54,0.92,2.24') vm.tomahawkSigCount = (vm.tomahawkSigCount || 0) + 1;
        }

        let kind = classifyViewmodelMatrix(slice);
        if (vm && vm.inViewmodelPass && isTomahawkHeld() && kind === 'weapon') {
            const sig = getMatrixScaleSignature(slice);
            if (sig === '1.54,0.92,2.24' && vm.tomahawkSigCount > 1) kind = 'arms';
        }

        const shouldModify = shouldApplyViewmodelMods(kind, vm, slice);
        let shouldAnimate = false;
        if (hasAnim) {
            const cachedInternal = resolveWeaponInternalName(weaponAnimState.cachedDisplayName);
            if (!WEAPON_ANIM_EXCLUDED_MELEE.has(cachedInternal)) {
                if ((weaponAnimState.mode === 'gun' || weaponAnimState.mode === 'gunNudgeCcw') && kind === 'weapon') {
                    shouldAnimate = true;
                } else if (weaponAnimState.mode === 'melee') {
                    shouldAnimate = shouldModify || (vm && vm.inViewmodelPass && isViewmodelMatrix(slice));
                }
            }
        }
        if (!shouldModify && !shouldAnimate) return;

        let matrix = gunScaleScratchMatrix;
        matrix.set(slice);

        if (gunScaleMods && shouldModify) {
            const scale = normalizeWeaponScale(weaponScale);
            const offsetX = normalizeWeaponOffset(weaponOffsetX);
            const offsetY = normalizeWeaponOffset(weaponOffsetY);
            const offsetZ = normalizeWeaponOffset(weaponOffsetZ);
            if (scale !== 1 || offsetX !== 0 || offsetY !== 0 || offsetZ !== 0) {
                matrix[0] *= scale; matrix[1] *= scale; matrix[2] *= scale;
                matrix[4] *= scale; matrix[5] *= scale; matrix[6] *= scale;
                matrix[8] *= scale; matrix[9] *= scale; matrix[10] *= scale;
                matrix[12] += offsetX;
                matrix[13] += offsetY;
                matrix[14] += offsetZ;
            }
        }

        if (hasAnim && shouldAnimate) {
            const isGunAnim = weaponAnimState.mode === 'gun' || weaponAnimState.mode === 'gunNudgeCcw';
            const spinAxis = isGunAnim
                ? getSpinStyleForWeapon(weaponAnimState.cachedDisplayName)
                : 'localY';
            applySpinToMatrix(matrix, weaponAnimScratchMatrix, weaponAnimState.angle, spinAxis);
            matrix = weaponAnimScratchMatrix;
            if (weaponAnimState.mode === 'gunNudgeCcw' && weaponAnimState.presentBlend > 0) {
                const b = weaponAnimState.presentBlend;
                matrix[12] += PRESENT_OUT_DELTA.x * b;
                matrix[13] += PRESENT_OUT_DELTA.y * b;
                matrix[14] += PRESENT_OUT_DELTA.z * b;
            }
        }

        ctx.matrixOverride = matrix;
    }

    function clearBridgeHandlers() {
        for (let i = 0; i < bridgeUnregisters.length; i += 1) bridgeUnregisters[i]();
        bridgeUnregisters = [];
    }

    function refreshBridgeHandlers() {
        const bridge = window.__NAP_GL_BRIDGE__;
        if (!bridge) return;
        clearBridgeHandlers();

        const gunScaleMods = needsGunScaleMods();
        const matrixHook = gunScaleMods || weaponAnimEnabled;
        if (!matrixHook) {
            resetAllViewmodelState();
            return;
        }

        function register(method, handler) {
            bridgeUnregisters.push(bridge.register(method, handler));
        }

        register('clear', onClear);
        register('uniformMatrix4fv', onUniformMatrix4fv);
    }

    function onBridgeContext(gl, natives) {
        if (glToEntry.has(gl)) return;
        const entry = {
            gl: gl,
            natives: natives,
            vm: { inViewmodelPass: false, tomahawkSigCount: 0 },
        };
        hookedGlEntries.push(entry);
        glToEntry.set(gl, entry);
    }

    function initBridge() {
        const bridge = window.__NAP_GL_BRIDGE__;
        if (!bridge) {
            console.error('[GunScaleAndAnim] NAP WebGL bridge not available');
            return;
        }
        bridge.onContext(onBridgeContext);
        refreshBridgeHandlers();
    }

    setInterval(function () {
        spectatingCached = !!document.querySelector('.infos .fps');
    }, 1000);

    function ensureMenuMounted() {
        if (!menuHost) return false;
        const root = document.documentElement || document.body;
        if (root && menuHost.parentNode !== root) root.appendChild(menuHost);
        return !!menuHost.isConnected;
    }

    function hideGunScaleNamePrompt() {
        if (!gunScaleNamePromptEl) return;
        gunScaleNamePromptEl.style.display = 'none';
        if (gunScaleNameInput) gunScaleNameInput.value = '';
    }

    function applyMenuGhostUi() {
        if (menuHost) menuHost.classList.toggle('is-ghost', !!menuGhostBg);
        paintEnableToggle(menuGhostBtn, menuGhostBg);
    }

    function setMenuGhostBg(enabled) {
        menuGhostBg = !!enabled;
        setStorageBool(MENU_GHOST_KEY, menuGhostBg);
        applyMenuGhostUi();
    }

    function setMenuOpen(open) {
        if (!ensureMenuMounted()) return;
        if (open) {
            menuHost.classList.add('is-open');
            applyMenuGhostUi();
        } else {
            menuHost.classList.remove('is-open');
            hideGunScaleNamePrompt();
        }
    }

    function isMenuOpen() {
        return !!(menuHost && menuHost.classList.contains('is-open'));
    }

    function toggleMenu() {
        if (!menuHost) return;
        setMenuOpen(!isMenuOpen());
    }

    function renderWeaponAnimLists() {
        if (!weaponAnimListsEl) return;
        weaponAnimListsEl.innerHTML = '';
        ANIM_SECTION_META.forEach(function (sectionMeta) {
            const section = document.createElement('div');
            section.className = 'nap-gsa-anim-section';
            const heading = document.createElement('div');
            heading.className = 'nap-gsa-anim-section-title';
            heading.textContent = sectionMeta.title;
            const list = document.createElement('div');
            list.className = 'nap-gsa-anim-weapons';
            getWeaponIdsForAnimKind(sectionMeta.kind).forEach(function (weaponId) {
                const item = document.createElement('span');
                item.className = 'nap-gsa-anim-weapon';
                item.dataset.weaponId = weaponId;
                item.textContent = WEAPON_REGISTRY[weaponId].label;
                list.appendChild(item);
            });
            section.appendChild(heading);
            section.appendChild(list);
            weaponAnimListsEl.appendChild(section);
        });
    }

    function bindWeaponAnimListContextMenu() {
        if (!weaponAnimListsEl || weaponAnimListsEl.dataset.bound) return;
        weaponAnimListsEl.dataset.bound = '1';
        weaponAnimListsEl.addEventListener('contextmenu', function (event) {
            if (!isMenuOpen()) return;
            const item = event.target && event.target.closest
                ? event.target.closest('.nap-gsa-anim-weapon')
                : null;
            if (!item || !weaponAnimListsEl.contains(item)) return;
            const weaponId = item.dataset.weaponId;
            if (!weaponId) return;
            event.preventDefault();
            event.stopPropagation();
            if (cycleWeaponAnimKind(weaponId)) renderWeaponAnimLists();
        });
    }

    function createGunScaleSliderRow(labelText, initialValue, min, max, step, formatValue, normalizeValue, defaultValue, onChange) {
        const row = document.createElement('div');
        row.className = 'nap-gsa-slider-row';
        const label = document.createElement('span');
        label.className = 'nap-gsa-row-label';
        label.textContent = labelText;
        const sliderWrap = document.createElement('div');
        sliderWrap.className = 'nap-gsa-slider-wrap';
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = String(min);
        slider.max = String(max);
        slider.step = String(step);
        slider.value = String(normalizeValue(initialValue));
        const valueLabel = document.createElement('span');
        valueLabel.className = 'nap-gsa-slider-val';
        let placeholderMode = false;

        function updateSliderFill() {
            const lo = parseFloat(slider.min);
            const hi = parseFloat(slider.max);
            const val = parseFloat(slider.value);
            slider.style.setProperty('--pct', ((hi === lo ? 0 : ((val - lo) / (hi - lo)) * 100)) + '%');
        }

        function paintValue() {
            const value = normalizeValue(slider.value);
            slider.value = String(value);
            updateSliderFill();
            if (placeholderMode) {
                valueLabel.textContent = 'edit';
                valueLabel.className = 'nap-gsa-slider-val is-placeholder';
                return;
            }
            valueLabel.className = 'nap-gsa-slider-val';
            valueLabel.textContent = formatValue(value);
        }

        function revealValue() {
            if (!placeholderMode) return;
            placeholderMode = false;
            paintValue();
        }

        paintValue();
        slider.addEventListener('pointerdown', revealValue);
        slider.addEventListener('input', function () {
            revealValue();
            paintValue();
            onChange(normalizeValue(slider.value));
        });

        sliderWrap.appendChild(slider);
        row.appendChild(label);
        row.appendChild(sliderWrap);
        row.appendChild(valueLabel);

        return {
            row: row,
            setValue: function (value) {
                placeholderMode = false;
                slider.value = String(normalizeValue(value));
                paintValue();
            },
            resetToDefault: function () {
                placeholderMode = true;
                slider.value = String(normalizeValue(defaultValue));
                paintValue();
            },
        };
    }

    function createTabHeader(titleText, descText) {
        const header = document.createElement('div');
        header.className = 'nap-gsa-header';
        const title = document.createElement('div');
        title.className = 'nap-gsa-title';
        title.textContent = titleText;
        const desc = document.createElement('div');
        desc.className = 'nap-gsa-desc';
        desc.textContent = descText;
        header.appendChild(title);
        header.appendChild(desc);
        return header;
    }

    function switchMenuTab(tabId, tabRail, panel) {
        if (tabId !== activeMenuTab) hideGunScaleNamePrompt();
        activeMenuTab = tabId;
        try { localStorage.setItem(TAB_STORAGE_KEY, tabId); } catch (_) {}
        tabRail.querySelectorAll('.nap-gsa-tab').forEach(function (tab) {
            const on = tab.dataset.tab === tabId;
            tab.classList.toggle('is-active', on);
            if (on) {
                tab.classList.remove('nap-gsa-tab-spin');
                void tab.offsetWidth;
                tab.classList.add('nap-gsa-tab-spin');
            }
        });
        panel.querySelectorAll('.nap-gsa-panel-pane').forEach(function (pane) {
            pane.classList.toggle('is-active', pane.dataset.panel === tabId);
        });
    }

    function buildMenu() {
        try {
            const oldStyle = document.getElementById('nap-gsa-styles');
            if (oldStyle) oldStyle.remove();
            const oldHost = document.getElementById('nap-gsa-host');
            if (oldHost) oldHost.remove();
        } catch (_) {}
        menuHost = null;

        try {
            const savedTab = localStorage.getItem(TAB_STORAGE_KEY);
            if (savedTab === 'gunscale' || savedTab === 'anim') activeMenuTab = savedTab;
        } catch (_) {}

        const style = document.createElement('style');
        style.id = 'nap-gsa-styles';
        style.textContent = [
            '#nap-gsa-host,#nap-gsa-host *{box-sizing:border-box!important;outline:none!important;-webkit-tap-highlight-color:transparent!important}',
            '#nap-gsa-host{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;height:100%!important;margin:0!important;padding:0!important;border:none!important;z-index:2147483646!important;display:none!important;pointer-events:none!important;background:transparent!important}',
            '#nap-gsa-host.is-open{display:block!important;pointer-events:auto!important}',
            '#nap-gsa-backdrop{position:fixed!important;top:0!important;left:0!important;right:0!important;bottom:0!important;width:100%!important;height:100%!important;z-index:0!important;background:rgba(4,6,14,.78)!important;pointer-events:auto!important}',
            '#nap-gsa-panel{position:fixed!important;top:20px!important;left:20px!important;right:20px!important;bottom:20px!important;width:auto!important;height:auto!important;max-width:none!important;max-height:none!important;z-index:1!important;border-radius:18px!important;border:1px solid rgba(255,255,255,.16)!important;background:#121624!important;box-shadow:0 28px 80px rgba(0,0,0,.75)!important;font:600 17px/1.4 Consolas,Monaco,monospace!important;color:#e8ecff!important;overflow:hidden!important;display:flex!important;flex-direction:column!important;pointer-events:auto!important;opacity:1!important;visibility:visible!important}',
            '.nap-gsa-close{position:absolute;top:10px;right:12px;z-index:5;width:40px;height:40px;border:none;border-radius:10px;background:rgba(255,255,255,.06);color:rgba(255,120,120,.85);font-size:28px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}',
            '.nap-gsa-close:hover{background:rgba(255,255,255,.1);color:#ff6b6b}',
            /* see-through: strip practically all solid panels */
            '#nap-gsa-host.is-ghost #nap-gsa-backdrop{background:transparent!important}',
            '#nap-gsa-host.is-ghost #nap-gsa-panel{background:rgba(18,22,36,.06)!important;border-color:rgba(255,255,255,.14)!important;box-shadow:none!important}',
            '#nap-gsa-host.is-ghost .nap-gsa-tabs{background:transparent!important;border-right-color:rgba(255,255,255,.08)!important}',
            '#nap-gsa-host.is-ghost .nap-gsa-body{background:transparent!important}',
            '#nap-gsa-host.is-ghost #nap-gsa-hint{background:transparent!important;border-top-color:rgba(255,255,255,.08)!important}',
            '#nap-gsa-host.is-ghost .nap-gsa-header{border-bottom-color:rgba(255,255,255,.08)!important}',
            '#nap-gsa-host.is-ghost .nap-gsa-anim-key-block{background:transparent!important;border-color:rgba(255,255,255,.08)!important}',
            '#nap-gsa-host.is-ghost .nap-gsa-anim-section{background:transparent!important;border-color:rgba(255,255,255,.08)!important}',
            '#nap-gsa-host.is-ghost .nap-gsa-config-prompt{background:transparent!important;border-color:rgba(255,255,255,.1)!important}',
            '#nap-gsa-host.is-ghost .nap-gsa-config-input{background:rgba(0,0,0,.2)!important}',
            '#nap-gsa-host.is-ghost .nap-gsa-tab{background:rgba(255,255,255,.04)!important}',
            '#nap-gsa-host.is-ghost .nap-gsa-tab.is-active{background:rgba(59,111,217,.22)!important}',
            '.nap-gsa-layout{display:flex;flex:1;min-height:0;height:100%}',
            '.nap-gsa-tabs{display:flex;flex-direction:column;gap:12px;padding:28px 16px;border-right:1px solid rgba(255,255,255,.1);background:#0c101c;flex-shrink:0}',
            '.nap-gsa-tab{width:64px;height:64px;border:1px solid rgba(255,255,255,.14);border-radius:12px;background:rgba(255,255,255,.05);color:rgba(255,255,255,.6);cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:border-color .2s ease,background .2s ease,color .2s ease,transform .2s ease}',
            '.nap-gsa-tab:hover{color:#fff;border-color:rgba(255,255,255,.28);transform:translateY(-1px)}',
            '.nap-gsa-tab.is-active{color:#fff;border-color:rgba(90,142,240,.75);background:rgba(59,111,217,.32)}',
            '.nap-gsa-tab svg{display:block;transition:transform .35s ease}',
            '.nap-gsa-tab.nap-gsa-tab-spin svg{animation:nap-gsa-icon-spin .48s cubic-bezier(.2,.8,.2,1)}',
            '@keyframes nap-gsa-icon-spin{0%{transform:rotate(0deg) scale(.88)}60%{transform:rotate(320deg) scale(1.08)}100%{transform:rotate(360deg) scale(1)}}',
            '.nap-gsa-body{flex:1;padding:28px 32px 18px;position:relative;min-width:0;min-height:0;background:#121624}',
            '.nap-gsa-panel-pane{position:absolute;top:28px;left:32px;right:32px;bottom:18px;overflow-y:auto;padding-right:8px;opacity:0;visibility:hidden;pointer-events:none;transform:translateY(10px);transition:opacity .24s ease,transform .24s ease,visibility .24s}',
            '.nap-gsa-panel-pane.is-active{opacity:1;visibility:visible;pointer-events:auto;transform:translateY(0)}',
            '.nap-gsa-header{display:flex;flex-direction:column;justify-content:flex-start;min-height:112px;margin:0 0 22px;padding:0 40px 18px 0;border-bottom:1px solid rgba(255,255,255,.1);box-sizing:border-box}',
            '.nap-gsa-title{margin:0 0 10px;font-size:28px;letter-spacing:.12em;text-transform:uppercase;color:rgba(255,255,255,.9);font-weight:700;line-height:1.15}',
            '.nap-gsa-desc{margin:0;font-size:16px;font-weight:500;color:rgba(255,255,255,.55);line-height:1.5;max-width:62ch}',
            '.nap-gsa-enable-btn{border:1px solid transparent;border-radius:10px;padding:9px 16px;cursor:pointer;font:inherit;font-size:13px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;flex-shrink:0;min-width:104px;transition:background .15s ease,border-color .15s ease,box-shadow .15s ease,transform .12s ease}',
            '.nap-gsa-enable-btn:hover{transform:translateY(-1px)}',
            '.nap-gsa-enable-btn:not(.is-on){color:#fff;background:linear-gradient(180deg,#5a8ef0,#3b6fd9);border-color:rgba(90,142,240,.55);box-shadow:0 6px 18px rgba(59,111,217,.28)}',
            '.nap-gsa-enable-btn.is-on{color:#fff;background:linear-gradient(180deg,#f87171,#dc2626);border-color:rgba(248,113,113,.5);box-shadow:0 6px 18px rgba(220,38,38,.22)}',
            '.nap-gsa-enable-inline{margin-left:auto}',
            '.nap-gsa-feature-toggle{display:flex;align-items:flex-end;justify-content:space-between;flex-wrap:wrap;gap:16px 24px;margin:0 0 18px;width:100%}',
            '.nap-gsa-feature-toggle-group{display:flex;flex-direction:column;align-items:flex-start;gap:8px}',
            '.nap-gsa-ghost-card{display:flex;flex-direction:column;align-items:stretch;gap:10px;margin-left:auto;padding:12px 14px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.03);min-width:168px;box-shadow:inset 0 1px 0 rgba(255,255,255,.04)}',
            '.nap-gsa-ghost-card-title{margin:0;font-size:12px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:rgba(255,255,255,.72);line-height:1.25}',
            '.nap-gsa-ghost-card .nap-gsa-enable-btn{width:100%}',
            '#nap-gsa-host.is-ghost .nap-gsa-ghost-card{background:rgba(255,255,255,.04)!important;border-color:rgba(255,255,255,.18)!important}',
            '.nap-gsa-slider-row{display:flex;align-items:center;gap:16px;margin-bottom:16px}',
            '.nap-gsa-row-label{font-size:16px;color:rgba(255,255,255,.72);flex-shrink:0;min-width:92px}',
            '.nap-gsa-slider-wrap{flex:1;height:40px;display:flex;align-items:center;padding:0 12px;overflow:visible}',
            '.nap-gsa-slider-wrap input[type=range]{-webkit-appearance:none;appearance:none;width:100%;height:40px;margin:0;background:transparent;cursor:pointer;--pct:50%}',
            '.nap-gsa-slider-wrap input[type=range]::-webkit-slider-runnable-track{height:10px;border-radius:999px;background:linear-gradient(90deg,#4d85e6 var(--pct),rgba(255,255,255,.14) var(--pct))}',
            '.nap-gsa-slider-wrap input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:22px;height:22px;margin-top:-6px;border-radius:50%;border:2px solid #fff;background:#3b6fd9;box-shadow:0 1px 6px rgba(0,0,0,.45)}',
            '.nap-gsa-slider-wrap input[type=range]::-moz-range-track{height:10px;border-radius:999px;background:rgba(255,255,255,.14)}',
            '.nap-gsa-slider-wrap input[type=range]::-moz-range-progress{height:10px;border-radius:999px;background:#4d85e6}',
            '.nap-gsa-slider-wrap input[type=range]::-moz-range-thumb{width:22px;height:22px;border-radius:50%;border:2px solid #fff;background:#3b6fd9;box-shadow:0 1px 6px rgba(0,0,0,.45)}',
            '.nap-gsa-slider-val{min-width:72px;text-align:right;font-size:16px;color:rgba(255,255,255,.82)}',
            '.nap-gsa-slider-val.is-placeholder{color:rgba(255,255,255,.35)}',
            '.nap-gsa-action-row{display:flex;flex-wrap:wrap;gap:12px;margin:10px 0 16px}',
            '.nap-gsa-btn{border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:10px 16px;cursor:pointer;font:inherit;font-size:14px;font-weight:650;letter-spacing:.03em;transition:background .15s ease,border-color .15s ease,opacity .15s ease,transform .12s ease}',
            '.nap-gsa-btn:hover:not(:disabled){transform:translateY(-1px)}',
            '.nap-gsa-btn-reset{color:#fff;background:linear-gradient(180deg,#f87171,#dc2626);border-color:rgba(248,113,113,.45);box-shadow:0 6px 16px rgba(220,38,38,.18)}',
            '.nap-gsa-btn-save.is-save-ready{color:#fff;background:linear-gradient(180deg,#5a8ef0,#3b6fd9);border-color:rgba(90,142,240,.55);box-shadow:0 6px 16px rgba(59,111,217,.26)}',
            '.nap-gsa-btn-save.is-save-locked,.nap-gsa-btn-save:disabled{color:rgba(255,255,255,.4);background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.1);box-shadow:none;cursor:not-allowed;opacity:.72}',
            '.nap-gsa-config-prompt{display:none;margin-bottom:14px;padding:14px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.04)}',
            '.nap-gsa-config-input{width:100%;box-sizing:border-box;margin-bottom:10px;padding:10px 12px;border-radius:10px;border:1px solid rgba(255,255,255,.16);background:rgba(0,0,0,.4);color:#e8ecff;font:inherit}',
            '.nap-gsa-config-list{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;align-items:center}',
            '.nap-gsa-config-item{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.16);border-radius:10px;background:rgba(255,255,255,.05);overflow:hidden;max-width:100%}',
            '.nap-gsa-config-item.is-on{border-color:#5a8ef0;background:#3b6fd9}',
            '.nap-gsa-config-remove{display:none;align-items:center;justify-content:center;width:28px;height:36px;margin:0;padding:0;border:none;border-right:1px solid rgba(248,113,113,.35);border-radius:0;cursor:pointer;flex-shrink:0;font:inherit;font-size:18px;font-weight:700;line-height:1;color:#f87171;background:rgba(127,29,29,.35)}',
            '.nap-gsa-config-item:hover .nap-gsa-config-remove{display:inline-flex}',
            '.nap-gsa-config-remove:hover{color:#fecaca;background:rgba(220,38,38,.55)}',
            '.nap-gsa-config-btn{border:none;border-radius:0;padding:8px 14px;cursor:pointer;color:rgba(255,255,255,.76);background:transparent;font:inherit;font-size:14px}',
            '.nap-gsa-config-item.is-on .nap-gsa-config-btn{color:#fff}',
            '.nap-gsa-config-empty{width:100%;font-size:14px;color:rgba(255,255,255,.36)}',
            '.nap-gsa-sub{display:none}.nap-gsa-sub.is-visible{display:block}',
            '.nap-gsa-anim-key-block{margin:0 0 20px;padding:14px 16px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}',
            '.nap-gsa-anim-key-row{display:flex;align-items:center;gap:12px;font-size:15px;color:rgba(255,255,255,.62);margin-bottom:6px}',
            '.nap-gsa-anim-key-label{flex-shrink:0}',
            '.nap-gsa-anim-key-input{width:48px;height:38px;border:1px solid rgba(255,255,255,.18);border-radius:10px;background:rgba(255,255,255,.06);color:rgba(255,255,255,.94);font:inherit;font-size:16px;font-weight:700;text-align:center;text-transform:uppercase;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease}',
            '.nap-gsa-anim-key-input.is-listening{border-color:rgba(250,204,21,.85);background:rgba(250,204,21,.1);box-shadow:0 0 0 3px rgba(250,204,21,.18),0 0 18px rgba(250,204,21,.22);color:#fde68a}',
            '.nap-gsa-anim-key-meta{margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.34)}',
            '.nap-gsa-anim-key-meta.is-listening{color:#fbbf24}',
            '.nap-gsa-anim-key-hint{margin:0;font-size:13px;line-height:1.5;color:rgba(255,255,255,.42);max-width:64ch}',
            '.nap-gsa-anim-section{margin-bottom:14px;padding:12px 14px;border-radius:12px;border:1px solid rgba(255,255,255,.08);background:rgba(255,255,255,.03)}',
            '.nap-gsa-anim-section-title{margin-bottom:8px;font-size:14px;letter-spacing:.04em;color:rgba(255,255,255,.6)}',
            '.nap-gsa-anim-weapons{display:flex;flex-wrap:wrap;gap:6px 18px}',
            '.nap-gsa-anim-weapon{font-size:15px;color:rgba(255,255,255,.78);cursor:context-menu;user-select:none;padding:2px 2px}.nap-gsa-anim-lists-tip{margin:8px 0 0;font-size:13px;line-height:1.5;color:rgba(255,255,255,.42);max-width:64ch}',
            '#nap-gsa-hint{margin:0;padding:14px 24px 18px;font-size:14px;color:rgba(255,255,255,.32);text-align:right;border-top:1px solid rgba(255,255,255,.08);background:#0c101c;flex-shrink:0}',
        ].join('');
        (document.documentElement || document.head || document.body).appendChild(style);

        menuHost = document.createElement('div');
        menuHost.id = 'nap-gsa-host';

        const backdrop = document.createElement('div');
        backdrop.id = 'nap-gsa-backdrop';
        backdrop.addEventListener('click', function () { setMenuOpen(false); });

        const panel = document.createElement('div');
        panel.id = 'nap-gsa-panel';
        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'nap-gsa-close';
        closeBtn.textContent = '\u00d7';
        closeBtn.addEventListener('click', function () { setMenuOpen(false); });

        const layout = document.createElement('div');


        layout.className = 'nap-gsa-layout';

        const tabRail = document.createElement('div');
        tabRail.className = 'nap-gsa-tabs';

        function createTabButton(tabId, title, iconSvg) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'nap-gsa-tab';
            btn.dataset.tab = tabId;
            btn.title = title;
            btn.innerHTML = iconSvg;
            btn.addEventListener('click', function () {
                switchMenuTab(tabId, tabRail, panel);
            });
            btn.addEventListener('animationend', function () {
                btn.classList.remove('nap-gsa-tab-spin');
            });
            return btn;
        }

        const gunScaleTabBtn = createTabButton('gunscale', 'Gun scale', GEAR_ICON_SVG);
        const animTabBtn = createTabButton('anim', 'Weapon animation', ANIM_ICON_SVG);
        tabRail.appendChild(gunScaleTabBtn);
        tabRail.appendChild(animTabBtn);

        const body = document.createElement('div');
        body.className = 'nap-gsa-body';

        const gunScalePanel = document.createElement('div');
        gunScalePanel.className = 'nap-gsa-panel-pane';
        gunScalePanel.dataset.panel = 'gunscale';
        gunScalePanelEl = gunScalePanel;

        gunScalePanel.appendChild(createTabHeader(
            'gun scale',
            'Custom gun size, and position on your screen. transparent backround optional, to see your gun as you edit, you can also save your selected values as named presets, up to 20'
        ));

        const gunScaleToggleRow = document.createElement('div');
        gunScaleToggleRow.className = 'nap-gsa-feature-toggle';

        const gunScaleEnableGroup = document.createElement('div');
        gunScaleEnableGroup.className = 'nap-gsa-feature-toggle-group';
        gunScaleEnableBtn = document.createElement('button');
        gunScaleEnableBtn.type = 'button';
        gunScaleEnableBtn.className = 'nap-gsa-enable-btn';
        gunScaleEnableBtn.addEventListener('click', function () {
            hideGunScaleNamePrompt();
            setWeaponScaleEnabled(!weaponScaleEnabled);
            refreshGunScaleUi();
            gunScaleEnableBtn.blur();
        });
        gunScaleEnableGroup.appendChild(gunScaleEnableBtn);

        const gunScaleGhostCard = document.createElement('div');
        gunScaleGhostCard.className = 'nap-gsa-ghost-card';
        const gunScaleGhostLabel = document.createElement('div');
        gunScaleGhostLabel.className = 'nap-gsa-ghost-card-title';
        gunScaleGhostLabel.textContent = 'transparent background';
        menuGhostBtn = document.createElement('button');
        menuGhostBtn.type = 'button';
        menuGhostBtn.className = 'nap-gsa-enable-btn';
        menuGhostBtn.addEventListener('click', function () {
            hideGunScaleNamePrompt();
            setMenuGhostBg(!menuGhostBg);
            menuGhostBtn.blur();
        });
        gunScaleGhostCard.appendChild(gunScaleGhostLabel);
        gunScaleGhostCard.appendChild(menuGhostBtn);

        gunScaleToggleRow.appendChild(gunScaleEnableGroup);
        gunScaleToggleRow.appendChild(gunScaleGhostCard);
        gunScalePanel.appendChild(gunScaleToggleRow);

        gunScaleSubEl = document.createElement('div');
        gunScaleSubEl.className = 'nap-gsa-sub';

        function onGunScaleSliderChange(axis, value) {
            if (axis === 'scale') weaponScale = value;
            else if (axis === 'x') weaponOffsetX = value;
            else if (axis === 'y') weaponOffsetY = value;
            else if (axis === 'z') weaponOffsetZ = value;
            activeGunScaleConfigId = null;
            setActiveGunScaleConfigId(null);
            renderGunScaleConfigList();
            applyGunScaleSettings();
            refreshGunScaleSaveBtn();
        }

        const gunScaleScaleRow = createGunScaleSliderRow('Scale', weaponScale, 0.1, 3, 0.01, function (v) { return v.toFixed(2) + 'x'; }, normalizeWeaponScale, 1, function (v) { onGunScaleSliderChange('scale', v); });
        const gunScaleOffsetXRow = createGunScaleSliderRow('Offset X', weaponOffsetX, -0.5, 0.5, 0.01, function (v) { return v.toFixed(2); }, normalizeWeaponOffset, 0, function (v) { onGunScaleSliderChange('x', v); });
        const gunScaleOffsetYRow = createGunScaleSliderRow('Offset Y', weaponOffsetY, -0.5, 0.5, 0.01, function (v) { return v.toFixed(2); }, normalizeWeaponOffset, 0, function (v) { onGunScaleSliderChange('y', v); });
        const gunScaleOffsetZRow = createGunScaleSliderRow('Offset Z', weaponOffsetZ, -0.5, 0.5, 0.01, function (v) { return v.toFixed(2); }, normalizeWeaponOffset, 0, function (v) { onGunScaleSliderChange('z', v); });
        gunScaleSliderRows = { scale: gunScaleScaleRow, offsetX: gunScaleOffsetXRow, offsetY: gunScaleOffsetYRow, offsetZ: gunScaleOffsetZRow };

        const gunScaleActionRow = document.createElement('div');
        gunScaleActionRow.className = 'nap-gsa-action-row';
        gunScaleResetBtn = document.createElement('button');
        gunScaleResetBtn.type = 'button';
        gunScaleResetBtn.className = 'nap-gsa-btn nap-gsa-btn-reset';
        gunScaleResetBtn.textContent = 'Reset to default';
        gunScaleResetBtn.addEventListener('click', function () {
            hideGunScaleNamePrompt();
            weaponScale = 1; weaponOffsetX = 0; weaponOffsetY = 0; weaponOffsetZ = 0;
            clearActiveGunScaleConfig();
            applyGunScaleSettings();
            gunScaleScaleRow.resetToDefault();
            gunScaleOffsetXRow.resetToDefault();
            gunScaleOffsetYRow.resetToDefault();
            gunScaleOffsetZRow.resetToDefault();
            gunScaleResetBtn.blur();
        });
        gunScaleSaveBtn = document.createElement('button');
        gunScaleSaveBtn.type = 'button';
        gunScaleSaveBtn.className = 'nap-gsa-btn nap-gsa-btn-save';
        gunScaleSaveBtn.textContent = 'Save as config';
        gunScaleSaveBtn.addEventListener('click', function () {
            if (gunScaleSaveBtn.disabled) return;
            gunScaleNamePromptEl.style.display = 'block';
            gunScaleNameInput.value = '';
            gunScaleNameInput.focus();
        });
        gunScaleActionRow.appendChild(gunScaleResetBtn);
        gunScaleActionRow.appendChild(gunScaleSaveBtn);

        gunScaleNamePromptEl = document.createElement('div');
        gunScaleNamePromptEl.className = 'nap-gsa-config-prompt';
        gunScaleNameInput = document.createElement('input');
        gunScaleNameInput.type = 'text';
        gunScaleNameInput.className = 'nap-gsa-config-input';
        gunScaleNameInput.maxLength = 32;
        gunScaleNameInput.placeholder = 'name this config';
        const gunScalePromptSaveBtn = document.createElement('button');
        gunScalePromptSaveBtn.type = 'button';
        gunScalePromptSaveBtn.className = 'nap-gsa-btn nap-gsa-btn-save is-save-ready';
        gunScalePromptSaveBtn.textContent = 'Save';
        gunScalePromptSaveBtn.addEventListener('click', function () {
            saveCurrentGunScaleConfig(gunScaleNameInput.value);
        });
        gunScaleNameInput.addEventListener('keydown', function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                saveCurrentGunScaleConfig(gunScaleNameInput.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                hideGunScaleNamePrompt();
            }
        });
        /* Dismiss unused name field when clicking other UI (empty or abandoned). */
        panel.addEventListener('pointerdown', function (event) {
            if (!gunScaleNamePromptEl || gunScaleNamePromptEl.style.display === 'none') return;
            if (gunScaleNamePromptEl.contains(event.target)) return;
            if (gunScaleSaveBtn && (event.target === gunScaleSaveBtn || gunScaleSaveBtn.contains(event.target))) return;
            hideGunScaleNamePrompt();
        });
        gunScaleNamePromptEl.appendChild(gunScaleNameInput);
        gunScaleNamePromptEl.appendChild(gunScalePromptSaveBtn);

        gunScaleConfigListEl = document.createElement('div');
        gunScaleConfigListEl.className = 'nap-gsa-config-list';

        gunScaleSubEl.appendChild(gunScaleScaleRow.row);
        gunScaleSubEl.appendChild(gunScaleOffsetXRow.row);
        gunScaleSubEl.appendChild(gunScaleOffsetYRow.row);
        gunScaleSubEl.appendChild(gunScaleOffsetZRow.row);
        gunScaleSubEl.appendChild(gunScaleActionRow);
        gunScaleSubEl.appendChild(gunScaleNamePromptEl);
        gunScaleSubEl.appendChild(gunScaleConfigListEl);
        gunScalePanel.appendChild(gunScaleSubEl);

        const animPanel = document.createElement('div');
        animPanel.className = 'nap-gsa-panel-pane';
        animPanel.dataset.panel = 'anim';

        animPanel.appendChild(createTabHeader(
            'weapon animation',
            'Custom inspect animations on your weapons.'
        ));

        const animToggleRow = document.createElement('div');
        animToggleRow.className = 'nap-gsa-feature-toggle';
        const animEnableGroup = document.createElement('div');
        animEnableGroup.className = 'nap-gsa-feature-toggle-group';
        weaponAnimEnableBtn = document.createElement('button');
        weaponAnimEnableBtn.type = 'button';
        weaponAnimEnableBtn.className = 'nap-gsa-enable-btn';
        weaponAnimEnableBtn.addEventListener('click', function () {
            setWeaponAnimEnabled(!weaponAnimEnabled);
            weaponAnimEnableBtn.blur();
        });
        animEnableGroup.appendChild(weaponAnimEnableBtn);
        animToggleRow.appendChild(animEnableGroup);
        animPanel.appendChild(animToggleRow);

        weaponAnimSubEl = document.createElement('div');
        weaponAnimSubEl.className = 'nap-gsa-sub';

        const animKeyBlock = document.createElement('div');
        animKeyBlock.className = 'nap-gsa-anim-key-block';

        const inspectKeyRow = document.createElement('div');
        inspectKeyRow.className = 'nap-gsa-anim-key-row';
        const inspectKeyLabel = document.createElement('span');
        inspectKeyLabel.className = 'nap-gsa-anim-key-label';
        inspectKeyLabel.textContent = 'Animation keybind';
        weaponAnimInspectKeyInput = document.createElement('input');
        weaponAnimInspectKeyInput.type = 'text';
        weaponAnimInspectKeyInput.className = 'nap-gsa-anim-key-input';
        weaponAnimInspectKeyInput.maxLength = 1;
        weaponAnimInspectKeyInput.value = weaponAnimInspectKey.toUpperCase();
        weaponAnimInspectKeyInput.setAttribute('spellcheck', 'false');
        weaponAnimInspectKeyInput.setAttribute('autocomplete', 'off');
        weaponAnimInspectKeyInput.addEventListener('focus', function () {
            weaponAnimInspectKeyInput.value = '';
            weaponAnimInspectKeyInput.classList.add('is-listening');
            if (weaponAnimKeyMetaEl) {
                weaponAnimKeyMetaEl.textContent = 'listening… press a key';
                weaponAnimKeyMetaEl.classList.add('is-listening');
            }
        });
        weaponAnimInspectKeyInput.addEventListener('blur', function () {
            weaponAnimInspectKeyInput.classList.remove('is-listening');
            weaponAnimInspectKeyInput.value = String(weaponAnimInspectKey || '').toUpperCase();
            refreshWeaponAnimKeyMeta();
        });
        weaponAnimInspectKeyInput.addEventListener('keydown', function (event) {
            event.preventDefault();
            event.stopPropagation();
            if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
            const key = (event.key || '').toLowerCase();
            if (key === 'escape') {
                weaponAnimInspectKeyInput.blur();
                return;
            }
            if (/^[a-z0-9]$/.test(key)) {
                setWeaponAnimInspectKey(key);
                weaponAnimInspectKeyInput.value = key.toUpperCase();
                weaponAnimInspectKeyInput.blur();
            }
        });

        inspectKeyRow.appendChild(inspectKeyLabel);
        inspectKeyRow.appendChild(weaponAnimInspectKeyInput);

        weaponAnimKeyMetaEl = document.createElement('p');
        weaponAnimKeyMetaEl.className = 'nap-gsa-anim-key-meta';

        const animKeyHint = document.createElement('p');
        animKeyHint.className = 'nap-gsa-anim-key-hint';
        animKeyHint.textContent = 'Your keybind will still work in kirka, if you want it as a reload animation, etc';

        animKeyBlock.appendChild(inspectKeyRow);
        animKeyBlock.appendChild(weaponAnimKeyMetaEl);
        animKeyBlock.appendChild(animKeyHint);

        weaponAnimSubEl.appendChild(animKeyBlock);
        weaponAnimListsEl = document.createElement('div');
        weaponAnimListsEl.className = 'nap-gsa-anim-lists';
        weaponAnimSubEl.appendChild(weaponAnimListsEl);
        const animListsTip = document.createElement('p');
        animListsTip.className = 'nap-gsa-anim-lists-tip';
        animListsTip.textContent = 'right click a weapon in the list to cycle it to the next animation';
        weaponAnimSubEl.appendChild(animListsTip);
        animPanel.appendChild(weaponAnimSubEl);
        bindWeaponAnimListContextMenu();
        renderWeaponAnimLists();

        body.appendChild(gunScalePanel);
        body.appendChild(animPanel);
        layout.appendChild(tabRail);
        layout.appendChild(body);
        panel.appendChild(closeBtn);
        panel.appendChild(layout);

        const hint = document.createElement('div');
        hint.id = 'nap-gsa-hint';
        hint.textContent = 'ctrl+o · esc to close';
        panel.appendChild(hint);

        menuHost.appendChild(backdrop);
        menuHost.appendChild(panel);
        const mountRoot = document.documentElement || document.body;
        if (mountRoot) mountRoot.appendChild(menuHost);

        switchMenuTab(activeMenuTab, tabRail, panel);
        refreshGunScaleUi();
        refreshWeaponAnimUi();
        renderGunScaleConfigList();
        applyMenuGhostUi();
    }

    function isCtrlO(event) {
        if (!event || !event.ctrlKey || event.altKey || event.metaKey) return false;
        const key = (event.key || '').toLowerCase();
        if (key === 'o') return true;
        /* Fallback if the game/Electron messes with event.key while pointer-locked */
        return event.code === 'KeyO';
    }

    function bindHotkeys() {
        if (window.__napGsaHotkeyHandler) {
            document.removeEventListener('keydown', window.__napGsaHotkeyHandler, true);
        }
        window.__napGsaHotkeyHandler = function (event) {
            if (isCtrlO(event)) {
                event.preventDefault();
                event.stopPropagation();
                if (typeof event.stopImmediatePropagation === 'function') event.stopImmediatePropagation();
                toggleMenu();
                return;
            }
            if ((event.key === 'Escape' || event.code === 'Escape') && isMenuOpen()) {
                event.preventDefault();
                event.stopPropagation();
                setMenuOpen(false);
            }
        };
        document.addEventListener('keydown', window.__napGsaHotkeyHandler, true);
        window.__napGsaHotkey = true;
    }

    function boot() {
        loadWeaponAnimAssign();
        initGunScaleConfigs();
        initDomWeaponTracker();
        buildMenu();
        bindHotkeys();
        bindWeaponAnimInspect();
        initBridge();
        console.log('[GunScaleAndAnim] v' + VERSION + ' ready — Ctrl+O');
    }

    if (document.body || document.documentElement) boot();
    else document.addEventListener('DOMContentLoaded', boot);
})();
