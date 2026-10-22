(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.KineticCore = api;
}(typeof window !== 'undefined' ? window : this, function () {
  'use strict';
  var presets = [
    { id: 'smooth', name: 'Smooth', curve: [0.42, 0, 0.58, 1] },
    { id: 'snappy', name: 'Snappy', curve: [0.76, 0, 0.24, 1] },
    { id: 'ease-out', name: 'Ease out', curve: [0.16, 1, 0.3, 1] },
    { id: 'ease-in', name: 'Ease in', curve: [0.7, 0, 0.84, 0] },
    { id: 'anticipate', name: 'Anticipate', curve: [0.36, -0.45, 0.66, 1] },
    { id: 'overshoot', name: 'Overshoot', curve: [0.34, 1.56, 0.64, 1] },
    { id: 'gentle', name: 'Gentle', curve: [0.25, 0.1, 0.25, 1] },
    { id: 'linear', name: 'Linear', curve: [0.333333, 0.333333, 0.666667, 0.666667] }
  ];
  function validateCurve(curve) {
    if (!Array.isArray(curve) || curve.length !== 4 || curve.some(function (n) { return typeof n !== 'number' || !isFinite(n); })) {
      throw new Error('A curve needs four finite numbers: x1, y1, x2, y2.');
    }
    if (curve[0] < 0 || curve[0] > 1 || curve[2] < 0 || curve[2] > 1) throw new Error('Time handles (X) must be between 0 and 1.');
    if (curve[1] < -2 || curve[1] > 3 || curve[3] < -2 || curve[3] > 3) throw new Error('Value handles (Y) must be between -2 and 3.');
    return curve.slice();
  }
  function parseCurve(text) {
    if (typeof text !== 'string' || text.length > 200) throw new Error('Paste four comma-separated numbers or cubic-bezier(...).');
    var clean = text.trim().replace(/^cubic-bezier\s*\(/i, '').replace(/\)$/, '').replace(/^\[/, '').replace(/\]$/, '');
    var pieces = clean.split(',');
    if (pieces.some(function (part) { return !part.trim() || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(part.trim()); })) throw new Error('Curve values must be numbers.');
    return validateCurve(pieces.map(Number));
  }
  function component(t, a, b) { var s = 1 - t; return 3 * s * s * t * a + 3 * s * t * t * b + t * t * t; }
  function sampleCurve(curve, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var low = 0, high = 1, t = 0.5;
    for (var i = 0; i < 35; i++) { t = (low + high) / 2; if (component(t, curve[0], curve[2]) < x) low = t; else high = t; }
    return component((low + high) / 2, curve[1], curve[3]);
  }
  function validateLibrary(input) {
    var list = Array.isArray(input) ? input : input && input.curves;
    if (input && input.schemaVersion !== undefined && input.schemaVersion !== 1) throw new Error('Unsupported preset library version.');
    if (!Array.isArray(list) || list.length > 200) throw new Error('A library must contain at most 200 curves.');
    var ids = Object.create(null);
    return list.map(function (item, index) {
      if (!item || typeof item.name !== 'string' || !item.name.trim() || item.name.length > 64) throw new Error('Each preset needs a name of 1–64 characters.');
      var id = typeof item.id === 'string' && /^[a-z0-9_-]{1,80}$/i.test(item.id) ? item.id : 'imported-' + index;
      if (ids[id]) id += '-' + index;
      while (ids[id]) id += '-copy';
      ids[id] = true;
      return { id: id, name: item.name.trim(), curve: validateCurve(item.curve) };
    });
  }
  return { presets: presets, validateCurve: validateCurve, parseCurve: parseCurve, sampleCurve: sampleCurve, validateLibrary: validateLibrary };
}));
