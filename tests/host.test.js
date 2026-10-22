const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../jsx/host.jsx'), 'utf8').replace(/^#include.*$/gm, '');
const types = {OneD: 1, TwoD: 2, ThreeD: 3, TwoD_SPATIAL: 4, ThreeD_SPATIAL: 5, COLOR: 6};
const clone = value => JSON.parse(JSON.stringify(value));

function makeProperty(options = {}) {
    const prop = {
        name: 'Opacity', propertyType: 1, propertyValueType: types.OneD, propertyDepth: 1,
        selectedKeys: [1, 2], numKeys: 2, canSetExpression: true, expression: '', expressionEnabled: false, expressionError: '',
        values: [0, 100], times: [0, 2], ease: {}, interpolation: {}, auto: {}, continuous: {},
        propertyGroup() { return this.layer; },
        keyValue(k) { return this.values[k - 1]; }, keyTime(k) { return this.times[k - 1]; },
        keyInTemporalEase(k) { return clone(this.ease[k]?.input || [{speed: 17, influence: 22}]); },
        keyOutTemporalEase(k) { return clone(this.ease[k]?.output || [{speed: 19, influence: 24}]); },
        keyInInterpolationType(k) { return this.interpolation[k]?.input || 'linear'; },
        keyOutInterpolationType(k) { return this.interpolation[k]?.output || 'linear'; },
        keyTemporalAutoBezier(k) { return this.auto[k] || false; },
        keyTemporalContinuous(k) { return this.continuous[k] || false; },
        setTemporalAutoBezierAtKey(k, v) { this.auto[k] = v; },
        setTemporalContinuousAtKey(k, v) { this.continuous[k] = v; },
        setInterpolationTypeAtKey(k, input, output) { this.interpolation[k] = {input, output}; },
        setTemporalEaseAtKey(k, input, output) { this.ease[k] = clone({input, output}); },
        ...options,
    };
    prop.layer ||= {name: 'Layer', locked: false};
    return prop;
}

function valueProperty(value) { return {value, numKeys: 0, expressionEnabled: false, setValue(v) { this.value = v; }}; }

function makeLayer(options = {}) {
    const transform = {
        'ADBE Anchor Point': valueProperty([0, 0]), 'ADBE Position': valueProperty([100, 100]),
        'ADBE Scale': valueProperty([100, 100]), 'ADBE Rotate Z': valueProperty(0),
    };
    return {
        name: 'Layer', index: 1, locked: false, threeDLayer: false, parent: null,
        inPoint: 0, outPoint: 10, startTime: 0, transform,
        property(name) { return name === 'ADBE Transform Group' ? {property: key => this.transform[key]} : null; },
        sourceRectAtTime() { return {left: -10, top: -20, width: 200, height: 100}; },
        ...options,
    };
}

function makeHost(props = [], layers = []) {
    function CompItem() {}
    const comp = new CompItem();
    Object.assign(comp, {name: 'Test "composition"', width: 1920, height: 1080, frameRate: 25, time: 1,
        duration: 10, pixelAspect: 1, workAreaStart: 2, workAreaDuration: 4, selectedProperties: props,
        selectedLayers: layers, numLayers: layers.length, layer(index) { return this.stack[index - 1]; }, stack: layers.slice(), layers: {}});
    const calls = {begin: 0, end: 0};
    const app = {version: '25.6', project: {activeItem: comp}, beginUndoGroup() { calls.begin++; }, endUndoGroup() { calls.end++; }};
    const context = vm.createContext({app, CompItem, PropertyType: {PROPERTY: 1}, PropertyValueType: types,
        KeyframeInterpolationType: {BEZIER: 'bezier'}, KeyframeEase: function (speed, influence) { this.speed = speed; this.influence = influence; }});
    vm.runInContext(source, context);
    const request = (action, payload) => JSON.parse(vm.runInContext(`Kinetic.dispatch(${JSON.stringify({action, payload})})`, context));
    return {comp, calls, app, request, context};
}

test('status serializes names and reports selected leaves and keys accurately', () => {
    const host = makeHost([makeProperty(), {propertyType: 2}], [makeLayer()]);
    const result = host.request('status');
    assert.equal(result.ok, true);
    assert.equal(result.data.comp.name, 'Test "composition"');
    assert.deepEqual([result.data.layers, result.data.properties, result.data.keyframes], [1, 1, 2]);
    assert.equal(host.calls.begin, 0);
});

test('status works without a comp; mutations fail without opening an undo group', () => {
    const host = makeHost(); host.app.project.activeItem = null;
    assert.equal(host.request('status').data.comp, null);
    assert.match(host.request('motion.apply', {preset: 'wiggle'}).message, /Open a composition/);
    assert.equal(host.calls.begin, 0);
});

test('native ease converts bezier slope to units per second and preserves exterior handles', () => {
    const prop = makeProperty(); const host = makeHost([prop]);
    const result = host.request('easing.apply', {curve: [0.25, 0.1, 0.75, 0.8]});
    assert.equal(result.ok, true); assert.equal(result.data.pairs, 1);
    assert.deepEqual(prop.ease[1].input, [{speed: 17, influence: 22}]);
    assert.deepEqual(prop.ease[2].output, [{speed: 19, influence: 24}]);
    assert.equal(prop.ease[1].output[0].speed, 20);
    assert.ok(Math.abs(prop.ease[2].input[0].speed - 40) < 1e-10);
    assert.equal(prop.ease[1].output[0].influence, 25);
    assert.deepEqual(prop.interpolation[1], {input: 'linear', output: 'bezier'});
    assert.deepEqual(prop.interpolation[2], {input: 'bezier', output: 'linear'});
    assert.deepEqual(host.calls, {begin: 1, end: 1});
});

test('chained multi-dimensional ease uses each component delta including negative motion', () => {
    const prop = makeProperty({propertyValueType: types.TwoD, numKeys: 3, selectedKeys: [1, 2, 3], times: [0, 1, 3], values: [[0, 100], [20, 80], [100, 60]]});
    const host = makeHost([prop]);
    const result = host.request('easing.apply', {curve: [0.25, 0.25, 0.75, 0.75]});
    assert.equal(result.data.pairs, 2); assert.equal(result.data.properties, 1);
    assert.deepEqual(prop.ease[2].input.map(x => x.speed), [20, -20]);
    assert.deepEqual(prop.ease[2].output.map(x => x.speed), [40, -10]);
    assert.deepEqual(prop.interpolation[2], {input: 'bezier', output: 'bezier'});
});

test('unsupported spatial/color, locked and nonadjacent properties are skipped honestly', () => {
    const spatial = makeProperty({propertyValueType: types.TwoD_SPATIAL});
    const color = makeProperty({propertyValueType: types.COLOR});
    const locked = makeProperty({layer: {name: 'Locked', locked: true}});
    const gaps = makeProperty({selectedKeys: [1, 3], numKeys: 3, values: [0, 50, 100], times: [0, 1, 2]});
    const host = makeHost([spatial, color, locked, gaps]);
    const result = host.request('easing.apply', {curve: [0.25, 0.1, 0.75, 0.8]});
    assert.equal(result.ok, false); assert.equal(result.data.pairs, 0);
    assert.match(result.warnings.join(' '), /Separate Dimensions/);
    assert.match(result.warnings.join(' '), /locked/);
    assert.match(result.warnings.join(' '), /nonadjacent/);
    assert.equal(host.calls.begin, 0);
});

test('coincident endpoint handles are adjusted with explicit approximation warning', () => {
    const prop = makeProperty(); const host = makeHost([prop]);
    const result = host.request('easing.apply', {curve: [0, 0, 1, 1]});
    assert.equal(result.ok, true);
    assert.equal(prop.ease[1].output[0].speed, 50);
    assert.equal(prop.ease[2].input[0].speed, 50);
    assert.match(result.warnings.join(' '), /approximation/);
});

test('infinite endpoint velocity and invalid curve fail before mutation', () => {
    const host = makeHost([makeProperty()]);
    assert.equal(host.request('easing.apply', {curve: [0, 1, 0.5, 1]}).ok, false);
    assert.equal(host.request('easing.apply', {curve: [1.2, 0, 0.5, 1]}).ok, false);
    assert.equal(host.calls.begin, 0);
});

test('easing failure restores the affected property and always ends undo group', () => {
    const prop = makeProperty(); const base = prop.setTemporalEaseAtKey;
    let failOnce = true;
    prop.setTemporalEaseAtKey = function (key, input, output) { if (key === 2 && failOnce) { failOnce = false; throw Error('AE refused write'); } base.call(this, key, input, output); };
    const host = makeHost([prop]);
    const result = host.request('easing.apply', {curve: [0.2, 0, 0.8, 1]});
    assert.equal(result.ok, false); assert.equal(result.data.pairs, 0);
    assert.equal(prop.ease[1].output[0].speed, 19);
    assert.deepEqual(prop.interpolation[1], {input: 'linear', output: 'linear'});
    assert.deepEqual(host.calls, {begin: 1, end: 1});
});

test('anchor relocation compensates static rotation and scale to preserve visual placement', () => {
    const layer = makeLayer(); layer.transform['ADBE Rotate Z'].value = 90; layer.transform['ADBE Scale'].value = [200, 50];
    const host = makeHost([], [layer]);
    const result = host.request('layers.tool', {op: 'anchor', anchor: [1, 1]});
    assert.equal(result.ok, true);
    assert.deepEqual(Array.from(layer.transform['ADBE Anchor Point'].value), [190, 80]);
    assert.ok(Math.abs(layer.transform['ADBE Position'].value[0] - 60) < 1e-10);
    assert.ok(Math.abs(layer.transform['ADBE Position'].value[1] - 480) < 1e-10);
});

test('anchor/center skip parented, animated and 3D layers before mutation', () => {
    const animated = makeLayer(); animated.transform['ADBE Position'].numKeys = 2;
    const host = makeHost([], [makeLayer({parent: {}}), makeLayer({threeDLayer: true}), animated]);
    assert.equal(host.request('layers.tool', {op: 'center'}).ok, false);
    assert.equal(host.calls.begin, 0);
});

test('sequence uses timeline stack order and preserves first selected in-point', () => {
    const first = makeLayer({index: 1, inPoint: 2, startTime: 1});
    const second = makeLayer({index: 2, inPoint: 4, startTime: 3});
    const host = makeHost([], [second, first]);
    const result = host.request('layers.tool', {op: 'sequence', frames: 5});
    assert.equal(result.data.changed, 2);
    assert.equal(first.startTime, 1);
    assert.ok(Math.abs(second.startTime - 1.2) < 1e-10);
});

test('trim intersects the work area and does not extend non-overlapping layers', () => {
    const layer = makeLayer(), outside = makeLayer({inPoint: 8, outPoint: 10});
    const host = makeHost([], [layer, outside]);
    const result = host.request('layers.tool', {op: 'trim'});
    assert.equal(result.data.changed, 1); assert.equal(layer.inPoint, 2); assert.equal(layer.outPoint, 6);
    assert.equal(outside.inPoint, 8);
});

test('reverse preserves unselected stack slots for every subset of five layers', () => {
    for (let mask = 0; mask < 32; mask++) {
        const stack = Array.from({length: 5}, (_, i) => makeLayer({name: String(i), index: i + 1}));
        const selected = stack.filter((_, i) => mask & (1 << i));
        if (selected.length < 2) continue;
        const host = makeHost([], selected); host.comp.stack = stack.slice(); host.comp.numLayers = 5;
        const update = () => host.comp.stack.forEach((layer, i) => { layer.index = i + 1; });
        stack.forEach(layer => {
            layer.moveToEnd = () => { host.comp.stack.splice(host.comp.stack.indexOf(layer), 1); host.comp.stack.push(layer); update(); };
            layer.moveBefore = target => { host.comp.stack.splice(host.comp.stack.indexOf(layer), 1); host.comp.stack.splice(host.comp.stack.indexOf(target), 0, layer); update(); };
        });
        const expected = stack.map(layer => selected.includes(layer) ? selected[selected.length - 1 - selected.indexOf(layer)] : layer);
        assert.equal(host.request('layers.tool', {op: 'reverse'}).ok, true);
        assert.deepEqual(host.comp.stack.map(x => x.name), expected.map(x => x.name), `mask ${mask}`);
    }
});

test('motion never replaces existing user expressions even when disabled', () => {
    const user = makeProperty({expression: 'time * 30', expressionEnabled: false});
    const fresh = makeProperty(); const host = makeHost([user, fresh]);
    const result = host.request('motion.apply', {preset: 'wiggle', frequency: 3, amplitude: 12});
    assert.equal(result.data.changed, 1); assert.equal(user.expression, 'time * 30');
    assert.match(fresh.expression, /^\/\/ KINETIC_MOTION v1\n/);
    assert.match(fresh.expression, /wiggle\(3, 12\)/);
    assert.equal(fresh.expressionEnabled, true);
});

test('motion clear removes only Kinetic motion and leaves user expressions intact', () => {
    const own = makeProperty({expression: '// KINETIC_MOTION v1\nwiggle(2, 20);'});
    const other = makeProperty({expression: 'value + 2'});
    const host = makeHost([own, other]);
    assert.equal(host.request('motion.clear').data.changed, 1);
    assert.equal(own.expression, ''); assert.equal(other.expression, 'value + 2');
});

test('motion ownership survives AE line-ending normalization without claiming lookalike prefixes', () => {
    const windows = makeProperty({expression: '// KINETIC_MOTION v1\r\nwiggle(2, 20);'});
    const legacy = makeProperty({expression: '// KINETIC_MOTION v1\rwiggle(2, 20);'});
    const lookalike = makeProperty({expression: '// KINETIC_MOTION v10\nvalue;'});
    const host = makeHost([windows, legacy, lookalike]);
    assert.equal(host.request('motion.clear').data.changed, 2);
    assert.equal(windows.expression, ''); assert.equal(legacy.expression, '');
    assert.equal(lookalike.expression, '// KINETIC_MOTION v10\nvalue;');
});

test('loop and overshoot require keyframes; invalid parameters cause no changes', () => {
    const prop = makeProperty({numKeys: 0}); const host = makeHost([prop]);
    assert.equal(host.request('motion.apply', {preset: 'loop'}).ok, false);
    assert.equal(host.request('motion.apply', {preset: 'overshoot'}).ok, false);
    assert.equal(host.request('motion.apply', {preset: 'wiggle', frequency: -1}).ok, false);
    assert.equal(prop.expression, ''); assert.equal(host.calls.begin, 0);
});

test('runtime expression errors roll back old expression and undo group closes', () => {
    const prop = makeProperty({expressionError: 'Unsupported expression'}); const host = makeHost([prop]);
    const result = host.request('motion.apply', {preset: 'wiggle'});
    assert.equal(result.ok, false); assert.equal(prop.expression, '');
    assert.deepEqual(host.calls, {begin: 1, end: 1});
});

test('layer creation validates all input before allocation', () => {
    const host = makeHost(); let created = false;
    host.comp.layers.addSolid = () => { created = true; return makeLayer(); };
    assert.equal(host.request('layers.create', {kind: 'solid', color: 'red'}).ok, false);
    assert.equal(host.request('layers.create', {kind: 'solid', width: 0}).ok, false);
    assert.equal(created, false); assert.equal(host.calls.begin, 0);
});

test('solid creation uses comp dimensions, pixel aspect and duration', () => {
    const host = makeHost(); let params;
    host.comp.layers.addSolid = (...args) => { params = args; return makeLayer(); };
    const result = host.request('layers.create', {kind: 'solid', name: 'Background', color: '#ff0000'});
    assert.equal(result.ok, true);
    assert.deepEqual(Array.from(params[0]), [1, 0, 0]);
    assert.deepEqual(params.slice(1), ['Background', 1920, 1080, 1, 10]);
    assert.deepEqual(host.calls, {begin: 1, end: 1});
});

test('text dispatch wraps module in undo and preserves explicit no-change failures', () => {
    const host = makeHost();
    host.context.KineticText = {animate() { return {ok: false, message: 'No text selected'}; }, clear() { throw Error('No text'); }};
    assert.equal(host.request('text.animate').ok, false);
    assert.equal(host.request('text.clear').ok, false);
    assert.deepEqual(host.calls, {begin: 2, end: 2});
});

test('custom scripts execute without a composition and capture local print plus final value', () => {
    const host = makeHost(); host.app.project.activeItem = null;
    const result = host.request('scripts.run', {code: 'print("AE", app.version); print(7, true, null); 6 * 7;'});
    assert.equal(result.ok, true);
    assert.deepEqual(result.data, {output: 'AE 25.6\n7 true null', result: '42'});
    assert.deepEqual(host.calls, {begin: 1, end: 1});
    assert.equal(typeof host.context.print, 'undefined');
});

test('custom script validation happens before execution or undo grouping', () => {
    const host = makeHost(); host.app.project.activeItem = null;
    for (const payload of [{}, {code: null}, {code: 7}, {code: ''}, {code: ' \n\t '}, {code: 'x'.repeat(100001)}, []]) {
        const result = host.request('scripts.run', payload);
        assert.equal(result.ok, false);
        assert.deepEqual(result.data, {output: '', result: ''});
    }
    assert.deepEqual(host.calls, {begin: 0, end: 0});
    assert.equal(host.request('scripts.run', {code: '// ' + 'x'.repeat(99997)}).ok, true);
});

test('custom script errors preserve output and report native line detail without rollback claims', () => {
    const host = makeHost();
    const result = host.request('scripts.run', {code: 'print("before failure"); app.project.scriptChange = 123; var failure = new Error("Expected failure"); failure.line = 3; throw failure;'});
    assert.equal(result.ok, false);
    assert.match(result.message, /Script failed at line 3: Expected failure/);
    assert.deepEqual(result.data, {output: 'before failure', result: ''});
    assert.equal(host.app.project.scriptChange, 123);
    assert.deepEqual(host.calls, {begin: 1, end: 1});
});

test('custom scripts report syntax errors and primitive throws while closing the undo group', () => {
    const host = makeHost();
    assert.equal(host.request('scripts.run', {code: 'var = ;'}).ok, false);
    const thrownNull = host.request('scripts.run', {code: 'print("still captured"); throw null;'});
    assert.equal(thrownNull.ok, false); assert.match(thrownNull.message, /null/);
    assert.equal(thrownNull.data.output, 'still captured');
    const fallbackLine = host.request('scripts.run', {code: 'throw {message:"Other line property", lineNumber:7};'});
    assert.match(fallbackLine.message, /at line 7/);
    assert.deepEqual(host.calls, {begin: 3, end: 3});
});

test('custom script print and returned values have bounded output with visible truncation', () => {
    const host = makeHost();
    const result = host.request('scripts.run', {code: 'var longText = new Array(20002).join("a"); print(longText); print("later"); longText;'});
    assert.equal(result.ok, true);
    assert.equal(result.data.output.length, 16000); assert.match(result.data.output, /\[output truncated\]$/);
    assert.equal(result.data.result.length, 16000); assert.match(result.data.result, /\[result truncated\]$/);
});

test('custom script local declarations do not leak and $.writeln remains untouched', () => {
    const host = makeHost(); let globalWrite = '';
    const writeln = text => { globalWrite += text; };
    host.context.$ = {writeln};
    const result = host.request('scripts.run', {code: 'var localOnly = 5; var output = "local declaration"; print(output); $.writeln("native destination");'});
    assert.equal(result.ok, true);
    assert.equal(result.data.output, 'local declaration'); assert.equal(result.data.result, '');
    assert.equal(globalWrite, 'native destination'); assert.equal(host.context.$.writeln, writeln);
    assert.equal(typeof host.context.localOnly, 'undefined');
    assert.equal(typeof host.context.output, 'undefined');
});

test('custom script output survives undo-finalization failure', () => {
    const host = makeHost();
    host.app.endUndoGroup = () => { host.calls.end++; throw Error('Undo finalization failed'); };
    const result = host.request('scripts.run', {code: 'print("completed code"); 123;'});
    assert.equal(result.ok, false); assert.equal(result.data.output, 'completed code');
    assert.match(result.message, /Undo finalization failed/);
    assert.deepEqual(host.calls, {begin: 1, end: 1});
});
