/* Kinetic: original utilities for After Effects 25/26. ExtendScript ES3. */
#include "text.jsx"
var Kinetic = (function () {
    var MARKER = "// KINETIC_MOTION v1\n";
    function ownMotion(expression) { return /^\/\/ KINETIC_MOTION v1(?:\r\n|\r|\n)/.test(expression || ""); }

    function quote(s) {
        return '"' + String(s).replace(/[\\"\x00-\x1f\u2028\u2029]/g, function (c) {
            var map = {"\"": "\\\"", "\\": "\\\\", "\b": "\\b", "\f": "\\f", "\n": "\\n", "\r": "\\r", "\t": "\\t"};
            if (map[c]) { return map[c]; }
            var h = c.charCodeAt(0).toString(16);
            return "\\u" + ("0000" + h).slice(-4);
        }) + '"';
    }
    function stringify(v) {
        var parts = [], k, i;
        if (v === null || typeof v === "undefined") { return "null"; }
        if (typeof v === "string") { return quote(v); }
        if (typeof v === "number") { return isFinite(v) ? String(v) : "null"; }
        if (typeof v === "boolean") { return v ? "true" : "false"; }
        if (v instanceof Array) {
            for (i = 0; i < v.length; i++) { parts.push(stringify(v[i])); }
            return "[" + parts.join(",") + "]";
        }
        for (k in v) { if (v.hasOwnProperty(k)) { parts.push(quote(k) + ":" + stringify(v[k])); } }
        return "{" + parts.join(",") + "}";
    }
    function number(v, fallback, min, max, label) {
        if (typeof v === "undefined") { return fallback; }
        if (typeof v !== "number" || !isFinite(v) || v < min || v > max) { throw new Error(label + " must be between " + min + " and " + max + "."); }
        return v;
    }
    function name(v, fallback) {
        if (typeof v === "undefined" || v === "") { return fallback; }
        if (typeof v !== "string" || v.length > 160 || /[\x00-\x1f]/.test(v)) { throw new Error("Use a name of at most 160 characters without control characters."); }
        return v;
    }
    function color(v) {
        if (typeof v === "undefined") { v = "#8073ff"; }
        if (typeof v !== "string" || !/^#[0-9a-fA-F]{6}$/.test(v)) { throw new Error("Color must be a six-digit hex color, for example #8073ff."); }
        return [parseInt(v.substr(1, 2), 16) / 255, parseInt(v.substr(3, 2), 16) / 255, parseInt(v.substr(5, 2), 16) / 255];
    }
    function compOrNull() {
        var item = app.project && app.project.activeItem;
        return item && item instanceof CompItem ? item : null;
    }
    function requireComp() {
        var comp = compOrNull();
        if (!comp) { throw new Error("Open a composition first."); }
        return comp;
    }
    function undo(label, fn) {
        app.beginUndoGroup("Kinetic · " + label);
        try { return fn(); } finally { app.endUndoGroup(); }
    }
    function owner(prop) {
        try { return prop.propertyGroup(prop.propertyDepth); } catch (ignore) { return null; }
    }
    function propLabel(prop) {
        var layer = owner(prop);
        return (layer ? layer.name + " / " : "") + prop.name;
    }
    function leafProperties(comp) {
        var source = comp.selectedProperties || [], out = [], i;
        for (i = 0; i < source.length; i++) {
            if (source[i].propertyType === PropertyType.PROPERTY) { out.push(source[i]); }
        }
        return out;
    }
    function numeric(prop, spatial) {
        var t = prop.propertyValueType;
        return t === PropertyValueType.OneD || t === PropertyValueType.TwoD || t === PropertyValueType.ThreeD ||
            (spatial && (t === PropertyValueType.TwoD_SPATIAL || t === PropertyValueType.ThreeD_SPATIAL));
    }
    function result(count, noun, warnings, data) {
        return {ok: count > 0, message: count > 0 ? count + " " + noun + "." : "No changes made. " + (warnings.length ? warnings[0] : "Nothing eligible was selected."), data: data || {changed: count}, warnings: warnings};
    }
    function selectedLayers(comp) {
        var source = comp.selectedLayers || [], out = [], i;
        for (i = 0; i < source.length; i++) { out.push(source[i]); }
        out.sort(function (a, b) { return a.index - b.index; });
        if (!out.length) { throw new Error("Select at least one layer."); }
        return out;
    }
    function status() {
        var comp = compOrNull(), props = comp ? leafProperties(comp) : [], keys = 0, i;
        for (i = 0; i < props.length; i++) { keys += props[i].selectedKeys ? props[i].selectedKeys.length : 0; }
        return {ok: true, message: comp ? "Connected to " + comp.name + "." : "Connected. Open a composition to begin.", data: {
            version: app.version,
            comp: comp ? {name: comp.name, width: comp.width, height: comp.height, frameRate: comp.frameRate, time: comp.time} : null,
            layers: comp ? comp.selectedLayers.length : 0, properties: props.length, keyframes: keys
        }};
    }
    function endpointSlope(x1, y1, x2, y2) {
        if (x1 > 0) { return y1 / x1; }
        if (y1 !== 0) { throw new Error("A vertical endpoint handle has infinite velocity. Move the handle slightly inside the graph."); }
        if (x2 > 0) { return y2 / x2; }
        if (y2 !== 0) { throw new Error("This endpoint has infinite velocity. Move the handle slightly inside the graph."); }
        return 1;
    }
    function easeSnapshot(prop, k) {
        return {key: k, inEase: prop.keyInTemporalEase(k), outEase: prop.keyOutTemporalEase(k), inType: prop.keyInInterpolationType(k), outType: prop.keyOutInterpolationType(k),
            auto: prop.keyTemporalAutoBezier(k), continuous: prop.keyTemporalContinuous(k)};
    }
    function restoreEase(prop, states) {
        var i, s;
        for (i = 0; i < states.length; i++) {
            s = states[i];
            prop.setTemporalAutoBezierAtKey(s.key, false);
            prop.setTemporalContinuousAtKey(s.key, false);
            prop.setInterpolationTypeAtKey(s.key, s.inType, s.outType);
            prop.setTemporalEaseAtKey(s.key, s.inEase, s.outEase);
            prop.setTemporalContinuousAtKey(s.key, s.continuous);
            prop.setTemporalAutoBezierAtKey(s.key, s.auto);
        }
    }
    function applyEase(payload, comp) {
        var curve = payload.curve, warnings = [], props = leafProperties(comp), plans = [], i, j, p, layer, keys, a, b, dt, av, bv, dims, d, pair, plan, map, s;
        if (!(curve instanceof Array) || curve.length !== 4) { throw new Error("Curve must contain four control point values."); }
        for (i = 0; i < 4; i++) {
            if (typeof curve[i] !== "number") { throw new Error("Every curve control point must be a number."); }
            number(curve[i], 0, i % 2 === 0 ? 0 : -5, i % 2 === 0 ? 1 : 5, "Curve control point");
        }
        var outSlope = endpointSlope(curve[0], curve[1], curve[2], curve[3]);
        var inSlope = endpointSlope(1 - curve[2], 1 - curve[3], 1 - curve[0], 1 - curve[1]);
        var outInfluence = Math.max(0.1, curve[0] * 100), inInfluence = Math.max(0.1, (1 - curve[2]) * 100);
        if (curve[0] < 0.001 || curve[2] > 0.999) { warnings.push("Endpoint handles were adjusted to AE's minimum 0.1% influence; the curve is a close approximation."); }
        if (!props.length) { throw new Error("Select two adjacent keyframes on a numeric property."); }
        for (i = 0; i < props.length; i++) {
            p = props[i]; layer = owner(p);
            if (layer && layer.locked) { warnings.push(propLabel(p) + ": layer is locked."); continue; }
            if (!numeric(p, false)) { warnings.push(propLabel(p) + ": use scalar or nonspatial 2D/3D properties. For Position, choose Separate Dimensions first; spatial paths and Color are unsupported."); continue; }
            if (p.expressionEnabled) { warnings.push(propLabel(p) + ": disable its expression before easing keyframes."); continue; }
            keys = p.selectedKeys || [];
            if (keys.length < 2) { warnings.push(propLabel(p) + ": select at least two adjacent keyframes."); continue; }
            keys = keys.slice(0).sort(function (x, y) { return x - y; });
            plan = {prop: p, pairs: [], states: [], originals: []}; map = {};
            try {
                for (j = 0; j < keys.length - 1; j++) {
                    a = keys[j]; b = keys[j + 1];
                    if (b !== a + 1) { warnings.push(propLabel(p) + ": nonadjacent selected keys were skipped."); continue; }
                    dt = p.keyTime(b) - p.keyTime(a);
                    if (!(dt > 0)) { throw new Error("Keyframe times must increase."); }
                    av = p.keyValue(a); bv = p.keyValue(b);
                    if (typeof av === "number") { av = [av]; bv = [bv]; }
                    dims = av.length;
                    pair = {a: a, b: b, outEase: [], inEase: []};
                    for (d = 0; d < dims; d++) {
                        var delta = (bv[d] - av[d]) / dt;
                        pair.outEase.push(new KeyframeEase(delta * outSlope, outInfluence));
                        pair.inEase.push(new KeyframeEase(delta * inSlope, inInfluence));
                    }
                    plan.pairs.push(pair);
                    if (!map["k" + a]) { s = easeSnapshot(p, a); map["k" + a] = s; plan.states.push(s); plan.originals.push(easeSnapshot(p, a)); }
                    if (!map["k" + b]) { s = easeSnapshot(p, b); map["k" + b] = s; plan.states.push(s); plan.originals.push(easeSnapshot(p, b)); }
                    map["k" + a].outEase = pair.outEase; map["k" + a].outType = KeyframeInterpolationType.BEZIER;
                    map["k" + b].inEase = pair.inEase; map["k" + b].inType = KeyframeInterpolationType.BEZIER;
                }
                if (plan.pairs.length) { plans.push(plan); }
            } catch (error) { warnings.push(propLabel(p) + ": " + error.toString()); }
        }
        if (!plans.length) { return result(0, "keyframe pairs eased", warnings, {changed: 0, pairs: 0, properties: 0}); }
        return undo("Apply easing", function () {
            var pairCount = 0, propCount = 0, n, m, edit, state;
            for (n = 0; n < plans.length; n++) {
                edit = plans[n];
                try {
                    for (m = 0; m < edit.states.length; m++) {
                        state = edit.states[m];
                        edit.prop.setTemporalAutoBezierAtKey(state.key, false);
                        edit.prop.setTemporalContinuousAtKey(state.key, false);
                        edit.prop.setInterpolationTypeAtKey(state.key, state.inType, state.outType);
                        edit.prop.setTemporalEaseAtKey(state.key, state.inEase, state.outEase);
                    }
                    pairCount += edit.pairs.length; propCount++;
                } catch (error) {
                    try { restoreEase(edit.prop, edit.originals); } catch (restoreError) { warnings.push("Could not fully restore " + propLabel(edit.prop) + ". Use Edit > Undo to restore this operation."); }
                    warnings.push(propLabel(edit.prop) + ": easing failed: " + error.toString());
                }
            }
            if (pairCount) { warnings.push("Edited keys use independent temporal handles; their auto-Bezier and continuous flags are disabled. Exterior ease values and interpolation types are preserved."); }
            return result(pairCount, "keyframe pairs eased", warnings, {changed: pairCount, pairs: pairCount, properties: propCount});
        });
    }
    function createLayer(payload, comp) {
        var kind = payload.kind, kinds = {text: 1, solid: 1, adjustment: 1, "null": 1, rectangle: 1, ellipse: 1, camera: 1, light: 1};
        if (!kinds.hasOwnProperty(kind)) { throw new Error("Unknown layer kind."); }
        var layerName = name(payload.name, kind === "null" ? "Control" : kind.charAt(0).toUpperCase() + kind.slice(1));
        var rgb = color(payload.color), width = Math.round(number(payload.width, comp.width, 1, 30000, "Width")), height = Math.round(number(payload.height, comp.height, 1, 30000, "Height"));
        var textValue = typeof payload.text === "undefined" ? "Make it move." : payload.text;
        if (typeof textValue !== "string" || textValue.length > 10000) { throw new Error("Text must be a string of at most 10,000 characters."); }
        return undo("Create " + kind, function () {
            var layer, source, doc, group, contents, path, fill, rect, generatedSolid;
            try {
                if (kind === "solid" || kind === "adjustment") {
                    layer = comp.layers.addSolid(rgb, layerName, width, height, comp.pixelAspect, comp.duration);
                    generatedSolid = layer.source;
                    if (kind === "adjustment") { layer.adjustmentLayer = true; }
                } else if (kind === "null") { layer = comp.layers.addNull(comp.duration); }
                else if (kind === "camera") { layer = comp.layers.addCamera(layerName, [comp.width / 2, comp.height / 2]); }
                else if (kind === "light") { layer = comp.layers.addLight(layerName, [comp.width / 2, comp.height / 2]); }
                else if (kind === "text") {
                    layer = comp.layers.addText(textValue);
                    source = layer.property("ADBE Text Properties").property("ADBE Text Document");
                    doc = source.value; doc.fontSize = 80; doc.applyFill = true; doc.fillColor = rgb; source.setValue(doc);
                    rect = layer.sourceRectAtTime(comp.time, false);
                    layer.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([rect.left + rect.width / 2, rect.top + rect.height / 2]);
                } else {
                    layer = comp.layers.addShape();
                    group = layer.property("ADBE Root Vectors Group").addProperty("ADBE Vector Group"); group.name = "Shape";
                    contents = group.property("ADBE Vectors Group");
                    path = contents.addProperty(kind === "rectangle" ? "ADBE Vector Shape - Rect" : "ADBE Vector Shape - Ellipse");
                    path.property(kind === "rectangle" ? "ADBE Vector Rect Size" : "ADBE Vector Ellipse Size").setValue([width, height]);
                    fill = contents.addProperty("ADBE Vector Graphic - Fill"); fill.property("ADBE Vector Fill Color").setValue(rgb);
                }
                layer.name = layerName;
                if (kind !== "camera" && kind !== "light") { layer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2]); }
                return {ok: true, message: "Created " + layerName + ".", data: {changed: 1, name: layer.name, kind: kind}};
            } catch (error) {
                if (layer) { try { layer.remove(); } catch (ignore) {} }
                if (generatedSolid) { try { if (!generatedSolid.usedIn.length) { generatedSolid.remove(); } } catch (ignoreSource) {} }
                throw error;
            }
        });
    }
    function static2D(layer) {
        if (layer.threeDLayer || layer.parent) { return "requires an unparented 2D layer"; }
        var transform = layer.property("ADBE Transform Group"), names = ["ADBE Anchor Point", "ADBE Position", "ADBE Scale", "ADBE Rotate Z"], i, p;
        if (!transform) { return "has no 2D transform"; }
        for (i = 0; i < names.length; i++) {
            p = transform.property(names[i]);
            if (!p || p.numKeys > 0 || p.expressionEnabled || (names[i] === "ADBE Position" && p.dimensionsSeparated)) { return "requires static, unseparated 2D transforms without expressions"; }
        }
        return null;
    }
    function anchorLayer(layer, anchor, comp) {
        var t = layer.property("ADBE Transform Group"), ap = t.property("ADBE Anchor Point"), pos = t.property("ADBE Position"), old = ap.value, before = pos.value;
        var r = layer.sourceRectAtTime(comp.time, false), target = [r.left + r.width * anchor[0], r.top + r.height * anchor[1]];
        var scale = t.property("ADBE Scale").value, angle = t.property("ADBE Rotate Z").value * Math.PI / 180;
        var dx = (target[0] - old[0]) * scale[0] / 100, dy = (target[1] - old[1]) * scale[1] / 100;
        ap.setValue(target);
        try { pos.setValue([before[0] + dx * Math.cos(angle) - dy * Math.sin(angle), before[1] + dx * Math.sin(angle) + dy * Math.cos(angle)]); }
        catch (error) { ap.setValue(old); throw error; }
    }
    function layerTool(payload, comp) {
        var op = payload.op, ops = {anchor: 1, sequence: 1, parentNull: 1, duplicate: 1, reverse: 1, trim: 1, center: 1, rename: 1};
        if (!ops.hasOwnProperty(op)) { throw new Error("Unknown layer tool."); }
        var layers = selectedLayers(comp), eligible = [], warnings = [], i, reason, anchor = payload.anchor || [0.5, 0.5];
        var frames = number(payload.frames, 3, 0, 100000, "Stagger frames"), prefix = name(payload.prefix, "Layer");
        if (Math.floor(frames) !== frames) { throw new Error("Stagger frames must be a whole number."); }
        if (!(anchor instanceof Array) || anchor.length !== 2) { throw new Error("Anchor must contain two values from zero to one."); }
        if (typeof anchor[0] !== "number" || typeof anchor[1] !== "number") { throw new Error("Both anchor coordinates must be numbers."); }
        number(anchor[0], 0.5, 0, 1, "Horizontal anchor"); number(anchor[1], 0.5, 0, 1, "Vertical anchor");
        for (i = 0; i < layers.length; i++) {
            reason = layers[i].locked ? "layer is locked" : null;
            if (!reason && (op === "anchor" || op === "center" || op === "parentNull")) { reason = static2D(layers[i]); }
            if (!reason && op === "trim" && (Math.min(layers[i].outPoint, comp.workAreaStart + comp.workAreaDuration) <= Math.max(layers[i].inPoint, comp.workAreaStart))) { reason = "does not overlap the work area"; }
            if (reason) { warnings.push(layers[i].name + ": " + reason + "."); } else { eligible.push(layers[i]); }
        }
        if (op === "reverse" && eligible.length < 2) { warnings.push("Select at least two unlocked layers to reverse their stack order."); return result(0, "layers changed", warnings); }
        if (!eligible.length) { return result(0, "layers changed", warnings); }
        var sequenceStart = eligible[0].inPoint, targets = [], j;
        if (op === "sequence") {
            for (i = 0; i < eligible.length; i++) {
                var newStart = eligible[i].startTime + sequenceStart + i * frames / comp.frameRate - eligible[i].inPoint;
                number(newStart, 0, -10800, 10800, "Resulting layer start time"); targets.push(newStart);
            }
        }
        if (op === "reverse") {
            for (i = 1; i <= comp.numLayers; i++) { targets.push(comp.layer(i)); }
            for (i = 0; i < eligible.length; i++) { targets[eligible[i].index - 1] = eligible[eligible.length - 1 - i]; }
        }
        return undo(op, function () {
            var changed = 0, layer, n, control, pos, x = 0, y = 0, previousIn, previousOut;
            if (op === "reverse") {
                for (n = targets.length - 1; n >= 0; n--) {
                    layer = targets[n];
                    var isSelected = false;
                    for (j = 0; j < eligible.length; j++) { if (eligible[j] === layer) { isSelected = true; break; } }
                    if (isSelected) { if (n === targets.length - 1) { layer.moveToEnd(); } else { layer.moveBefore(targets[n + 1]); } }
                }
                return result(eligible.length, "layers reversed in stack order", warnings);
            }
            if (op === "parentNull") {
                for (n = 0; n < eligible.length; n++) { pos = eligible[n].property("ADBE Transform Group").property("ADBE Position").value; x += pos[0]; y += pos[1]; }
                try {
                    control = comp.layers.addNull(comp.duration); control.name = "Kinetic Control";
                    control.property("ADBE Transform Group").property("ADBE Anchor Point").setValue([0, 0]);
                    control.property("ADBE Transform Group").property("ADBE Position").setValue([x / eligible.length, y / eligible.length]);
                } catch (controlError) { if (control) { try { control.remove(); } catch (ignoreControl) {} } throw controlError; }
            }
            for (n = 0; n < eligible.length; n++) {
                layer = eligible[n];
                try {
                    if (op === "anchor") { anchorLayer(layer, anchor, comp); }
                    else if (op === "sequence") { layer.startTime = targets[n]; }
                    else if (op === "parentNull") { layer.parent = control; }
                    else if (op === "duplicate") { layer.duplicate(); }
                    else if (op === "trim") {
                        previousIn = layer.inPoint; previousOut = layer.outPoint;
                        try { layer.inPoint = Math.max(previousIn, comp.workAreaStart); layer.outPoint = Math.min(previousOut, comp.workAreaStart + comp.workAreaDuration); }
                        catch (trimError) { layer.inPoint = previousIn; layer.outPoint = previousOut; throw trimError; }
                    }
                    else if (op === "center") { layer.property("ADBE Transform Group").property("ADBE Position").setValue([comp.width / 2, comp.height / 2]); }
                    else if (op === "rename") { layer.name = prefix + " " + (n + 1 < 1000 ? ("000" + (n + 1)).slice(-3) : String(n + 1)); }
                    changed++;
                } catch (error) { warnings.push(layer.name + ": " + error.toString()); }
            }
            if (control && changed === 0) { try { control.remove(); } catch (ignore) {} }
            return result(changed, op === "sequence" ? "layers staggered from the first selected in-point" : "layers updated", warnings);
        });
    }
    function expressionFor(preset, frequency, amplitude, decay) {
        var head = MARKER + "// " + preset + "\n";
        if (preset === "wiggle") { return head + "wiggle(" + frequency + ", " + amplitude + ");"; }
        if (preset === "loop" || preset === "pingpong") { return head + 'numKeys > 1 ? loopOut("' + (preset === "loop" ? "cycle" : "pingpong") + '") : value;'; }
        return head + "var n = 0;\nif (numKeys > 0) { n = nearestKey(time).index; if (key(n).time > time) n--; }\n" +
            "var answer = value;\nif (n > 0 && n < numKeys + 1) {\n var t = time - key(n).time;\n var v = velocityAtTime(key(n).time - thisComp.frameDuration / 10);\n" +
            " answer = value + v * " + (amplitude / 100) + " * Math.sin(" + frequency + " * 2 * Math.PI * t) / Math.exp(" + decay + " * t);\n}\nanswer;";
    }
    function motion(payload, comp, clear) {
        var preset = payload.preset, presets = {wiggle: 1, loop: 1, pingpong: 1, overshoot: 1};
        if (!clear && !presets.hasOwnProperty(preset)) { throw new Error("Unknown motion preset."); }
        var frequency = number(payload.frequency, 2, 0.01, 100, "Frequency"), amplitude = number(payload.amplitude, 20, 0, 10000, "Amplitude"), decay = number(payload.decay, 5, 0.1, 100, "Decay");
        var props = leafProperties(comp), eligible = [], warnings = [], i, p, layer, expression = clear ? "" : expressionFor(preset, frequency, amplitude, decay);
        if (!props.length) { throw new Error("Select numeric properties in the timeline first."); }
        for (i = 0; i < props.length; i++) {
            p = props[i]; layer = owner(p);
            if (layer && layer.locked) { warnings.push(propLabel(p) + ": layer is locked."); continue; }
            if (!numeric(p, true) || !p.canSetExpression) { warnings.push(propLabel(p) + ": this property does not support numeric motion expressions."); continue; }
            if (clear) {
                if (!ownMotion(p.expression)) { warnings.push(propLabel(p) + ": no Kinetic motion expression to remove."); continue; }
            } else {
                if (p.expression && !ownMotion(p.expression)) { warnings.push(propLabel(p) + ": existing user expression preserved."); continue; }
                if (preset !== "wiggle" && p.numKeys < 2) { warnings.push(propLabel(p) + ": this preset needs at least two keyframes."); continue; }
            }
            eligible.push(p);
        }
        if (!eligible.length) { return result(0, "expressions updated", warnings); }
        return undo(clear ? "Remove motion" : "Apply motion", function () {
            var count = 0, n, prop, old, oldEnabled;
            for (n = 0; n < eligible.length; n++) {
                prop = eligible[n]; old = prop.expression; oldEnabled = prop.expressionEnabled;
                try {
                    prop.expression = expression;
                    if (!clear) { prop.expressionEnabled = true; if (prop.expressionError) { throw new Error(prop.expressionError); } }
                    count++;
                } catch (error) {
                    try { prop.expression = old; if (old) { prop.expressionEnabled = oldEnabled; } } catch (ignore) { warnings.push("Could not restore " + propLabel(prop) + ". Use Edit > Undo."); }
                    warnings.push(propLabel(prop) + ": " + error.toString());
                }
            }
            return result(count, clear ? "Kinetic motion expressions removed" : "motion expressions applied", warnings);
        });
    }
    // Deliberately executes user-provided ExtendScript in the AE host, not a sandbox.
    // A separate local activation prevents normal script var declarations from
    // replacing runner state; print is a local helper, not a global console patch.
    function evaluateScript(code, print) { return eval(code); }
    function runScript(payload) {
        var code = payload.code, output = "", outputTruncated = false, printed = false, valueText = "";
        var limit = 16000, outputMarker = "\n[output truncated]", resultMarker = "\n[result truncated]";
        if (typeof code !== "string" || !/\S/.test(code)) { throw new Error("Enter a nonempty ExtendScript script."); }
        if (code.length > 100000) { throw new Error("Script must contain at most 100,000 characters."); }
        function asText(value) {
            try { return String(value); } catch (ignore) { return "[Unable to convert value to text]"; }
        }
        function bounded(text, marker) { return text.length > limit ? text.substr(0, limit - marker.length) + marker : text; }
        function append(text) {
            if (outputTruncated) { return; }
            if (output.length + text.length <= limit) { output += text; return; }
            output = (output + text.substr(0, limit)).substr(0, limit - outputMarker.length) + outputMarker;
            outputTruncated = true;
        }
        function print() {
            var i;
            if (outputTruncated) { return; }
            if (printed) { append("\n"); }
            printed = true;
            for (i = 0; i < arguments.length && !outputTruncated; i++) {
                if (i > 0) { append(" "); }
                append(asText(arguments[i]));
            }
        }
        try {
            undo("Run script", function () {
                var value = evaluateScript(code, print);
                valueText = typeof value === "undefined" ? "" : bounded(asText(value), resultMarker);
            });
            return {ok: true, message: "Script completed.", data: {output: output, result: valueText}};
        } catch (error) {
            var line = null, detail;
            try { line = error && (error.line || error.lineNumber); } catch (ignoreLine) {}
            try { detail = error && error.message ? asText(error.message) : asText(error); } catch (ignoreMessage) { detail = "Unknown script error."; }
            detail = bounded(detail, "\n[error truncated]");
            return {ok: false, message: "Script failed" + (typeof line === "number" && isFinite(line) && line > 0 ? " at line " + line : "") + ": " + detail,
                data: {output: output, result: ""}};
        }
    }
    function dispatch(request) {
        try {
            if (!request || typeof request.action !== "string") { throw new Error("Request requires an action."); }
            if (request.action === "status") { return stringify(status()); }
            var payload = request.payload || {}, comp, response;
            if (typeof payload !== "object" || payload instanceof Array) { throw new Error("Payload must be an object."); }
            if (request.action === "scripts.run") { return stringify(runScript(payload)); }
            comp = requireComp();
            if (request.action === "easing.apply") { response = applyEase(payload, comp); }
            else if (request.action === "layers.create") { response = createLayer(payload, comp); }
            else if (request.action === "layers.tool") { response = layerTool(payload, comp); }
            else if (request.action === "motion.apply") { response = motion(payload, comp, false); }
            else if (request.action === "motion.clear") { response = motion(payload, comp, true); }
            else if (request.action === "text.animate" || request.action === "text.clear") {
                if (typeof KineticText === "undefined") { throw new Error("Text module is missing. Reinstall the complete extension folder."); }
                response = undo("Text animation", function () { return request.action === "text.animate" ? KineticText.animate(payload, comp) : KineticText.clear(payload, comp); });
                if (typeof response.ok === "undefined") { response.ok = true; }
            } else { throw new Error("Unknown action: " + request.action); }
            return stringify(response);
        } catch (error) {
            var failure = {ok: false, message: error.message || error.toString()};
            if (request && request.action === "scripts.run") { failure.data = {output: "", result: ""}; }
            return stringify(failure);
        }
    }
    return {dispatch: dispatch};
}());
