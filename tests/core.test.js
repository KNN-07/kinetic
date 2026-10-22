const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../js/core.js');

test('cubic timing inverts x rather than treating the parameter as time', () => {
  const curve = [0.16, 1, 0.3, 1];
  assert.ok(core.sampleCurve(curve, 0.5) > 0.96);
  assert.equal(core.sampleCurve(curve, 0), 0);
  assert.equal(core.sampleCurve(curve, 1), 1);
  for (const x of [0.01, 0.2, 0.5, 0.9, 0.99]) assert.ok(Math.abs(core.sampleCurve([0, 0, 1, 1], x) - x) < 1e-8);
});
test('overshoot and anticipation survive sampling', () => {
  assert.ok(core.sampleCurve([0.34, 1.56, 0.64, 1], 0.6) > 1);
  assert.ok(core.sampleCurve([0.36, -0.45, 0.66, 1], 0.1) < 0);
});
test('all factory curves are valid, symmetric smooth easing has a centered midpoint', () => {
  core.presets.forEach(p => core.validateCurve(p.curve));
  assert.ok(Math.abs(core.sampleCurve(core.presets[0].curve, 0.5) - 0.5) < 1e-8);
});
test('parses pasted CSS/array/raw curves and rejects executable text, NaN, missing and out-of-range values', () => {
  for (const input of ['cubic-bezier(.25,0,.75,1)', '[0.25,0,0.75,1]', '.25, 0, .75, 1']) assert.deepEqual(core.parseCurve(input), [0.25, 0, 0.75, 1]);
  for (const input of ['alert(1)', '0,,1,1', '0,NaN,1,1', '1.1,0,1,1', '0,4,1,1', '0,0,1,1);alert(1)']) assert.throws(() => core.parseCurve(input));
  assert.throws(() => core.validateCurve([0, 0, 1, Infinity]));
});
test('library validation is atomic, bounded and normalizes unsafe ids', () => {
  const items = core.validateLibrary({schemaVersion:1, curves:[{id:'<script>', name:'  My curve  ', curve:[0.2,0,0.8,1]},{id:'same',name:'A',curve:[0,0,1,1]},{id:'same',name:'B',curve:[0,0,1,1]}]});
  assert.equal(items[0].name, 'My curve');
  assert.equal(items[0].id, 'imported-0');
  assert.notEqual(items[1].id, items[2].id);
  assert.throws(() => core.validateLibrary([{name:'Valid',curve:[0,0,1,1]},{name:'Bad',curve:[-1,0,1,1]}]));
  assert.throws(() => core.validateLibrary({schemaVersion:2,curves:[]}));
  assert.throws(() => core.validateLibrary(new Array(201).fill({name:'A',curve:[0,0,1,1]})));
});
