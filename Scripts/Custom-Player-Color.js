// ==UserScript==
// @name         Custom Player Head and Body Colors
// @description  Solid head + body colors only via Array.isArray skin swap.
// @version      1.0.0
// @author       https kirkacommunityhub
// @match        *://kirka.io/*
// @run-at       document-start
// ==/UserScript==


(function () {
  'use strict';

  // --- config (edit these) ---
  const ENABLED = true;
  const HEAD_COLOR = '#BB000E'; //red
  const BODY_COLOR = '#000000';  //black
  // ---------------------------

  if (!ENABLED) {
    return;
  }

  const SKIN_SIZE = 64;

  function makeSolidSkinImage(headHex, bodyHex) {
    const canvas = document.createElement('canvas');
    canvas.width = SKIN_SIZE;
    canvas.height = SKIN_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }
    // Same coarse layout as the tiny Custom Player Color script:
    // top half UV ~ head, bottom half ~ body (solid blocks, not full UV painting).
    ctx.fillStyle = bodyHex;
    ctx.fillRect(0, SKIN_SIZE / 2, SKIN_SIZE, SKIN_SIZE / 2);
    ctx.fillStyle = headHex;
    ctx.fillRect(0, 0, SKIN_SIZE, SKIN_SIZE / 2);

    const img = new Image();
    img.src = canvas.toDataURL('image/png');
    return img;
  }

  const skinImage = makeSolidSkinImage(HEAD_COLOR, BODY_COLOR);
  if (!skinImage) {
    return;
  }

  const skinSrc = skinImage.src;
  const nativeIsArray = Array.isArray;

  // Hot path: Array.isArray is called a lot — keep work minimal and exit early.
  Array.isArray = function napSolidSkinIsArray(value) {
    if (
      value != null &&
      typeof value === 'object' &&
      value.map &&
      value.map.image
    ) {
      const img = value.map.image;
      const w = img.width || img.naturalWidth || 0;
      const h = img.height || img.naturalHeight || 0;
      if (w === SKIN_SIZE && h === SKIN_SIZE && img.src !== skinSrc) {
        img.src = skinSrc;
        value.map.needsUpdate = true;
      }
    }
    return nativeIsArray(value);
  };

  console.log('[NAP Solid Colors] active', HEAD_COLOR, BODY_COLOR);
})();
