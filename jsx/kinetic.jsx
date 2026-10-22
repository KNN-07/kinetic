// Kinetic 0.2.0 — generated from text.jsx and host.jsx. Run npm run build after editing.
/* Kinetic native text animation. ExtendScript / ES3; host owns the undo group. */
var KineticText = (function () {
    var SIGNATURE = "// KineticText/v1";
    var serial = 0;
    var units = { characters: 1, words: 3, lines: 4 };
    var presets = { rise: true, slide: true, pop: true, fade: true, blur: true, spin: true };
    var directions = { up: [0, 1], down: [0, -1], left: [1, 0], right: [-1, 0] };

    function number(value, fallback, name, min, max) {
        var n = value === undefined ? fallback : Number(value);
        if (value === null || value === "" || !isFinite(n) || n < min || n > max) {
            throw new Error(name + " must be between " + min + " and " + max + ".");
        }
        return n;
    }

    function options(payload) {
        var p = payload || {}, o = {};
        o.preset = p.preset === undefined ? "rise" : p.preset;
        o.unit = p.unit === undefined ? "characters" : p.unit;
        o.mode = p.mode === undefined ? "in" : p.mode;
        o.direction = p.direction === undefined ? (o.preset === "slide" ? "left" : "up") : p.direction;
        if (!presets.hasOwnProperty(o.preset)) { throw new Error("Unknown text preset."); }
        if (!units.hasOwnProperty(o.unit)) { throw new Error("Choose characters, words, or lines."); }
        if (!directions.hasOwnProperty(o.direction)) { throw new Error("Unknown text direction."); }
        if (o.mode !== "in" && o.mode !== "out" && o.mode !== "both") { throw new Error("Choose In, Out, or Both."); }
        if (p.reverse !== undefined && p.reverse !== true && p.reverse !== false) { throw new Error("Reverse must be true or false."); }
        o.reverse = p.reverse === true;
        o.duration = number(p.duration, 0.6, "Duration", 0.04, 60);
        o.stagger = number(p.stagger, 0.04, "Stagger", 0, 10);
        o.distance = number(p.distance, 60, "Distance", 0, 10000);
        o.overshoot = number(p.overshoot, 0, "Overshoot", 0, 2);
        return o;
    }

    function animators(layer) {
        return layer.property("ADBE Text Properties").property("ADBE Text Animators");
    }

    function effects(layer) { return layer.property("ADBE Effect Parade"); }

    function isText(layer) {
        try { return !!layer.property("ADBE Text Properties"); } catch (e) { return false; }
    }

    function ownedAnimator(animator) {
        // The expression signature survives renaming a generated animator in the timeline.
        if (!animator || animator.matchName !== "ADBE Text Animator") { return false; }
        var selectors = animator.property("ADBE Text Selectors"), i, s, amount;
        for (i = 1; selectors && i <= selectors.numProperties; i++) {
            s = selectors.property(i);
            if (s.matchName === "ADBE Text Expressible Selector") {
                amount = s.property("ADBE Text Expressible Amount");
                if (amount && String(amount.expression).indexOf(SIGNATURE) === 0) { return true; }
            }
        }
        return false;
    }

    function ownedControl(effect) {
        return effect && effect.matchName === "ADBE Slider Control" && /^Kinetic Text \/ (Duration|Stagger|Distance|Overshoot) \[KT1:[0-9_]+\]$/.test(effect.name);
    }

    function namesOfOwned(group, predicate) {
        var names = [], i, p;
        for (i = 1; group && i <= group.numProperties; i++) {
            p = group.property(i);
            if (predicate(p)) { names.push(p.name); }
        }
        return names;
    }

    function contains(names, name) {
        var i;
        for (i = 0; i < names.length; i++) { if (names[i] === name) { return true; } }
        return false;
    }

    // Re-resolve each indexed group after any removal or addition. AE invalidates its handles.
    function removeNames(layer, accessor, names, predicate) {
        var i, group = accessor(layer);
        for (i = group.numProperties; i >= 1; i--) {
            group = accessor(layer);
            if (contains(names, group.property(i).name) && (!predicate || predicate(group.property(i)))) { group.property(i).remove(); }
        }
    }

    function textCount(layer, unit, time) {
        var source = layer.property("ADBE Text Properties").property("ADBE Text Document");
        var doc = source.valueAtTime ? source.valueAtTime(time, false) : source.value;
        var str = String(doc.text), matches, count;
        if (!str.replace(/\s/g, "")) { return 0; }
        if (unit === "words") { matches = str.match(/\S+/g); return matches ? matches.length : 0; }
        if (unit === "lines") {
            // Includes soft-wrapped box-text lines in AE 2025+ when available.
            try { count = doc.composedLineCount; } catch (ignored) { count = 0; }
            return typeof count === "number" && count > 0 ? count : str.split(/\r\n|\r|\n/).length;
        }
        // UTF-16 count is conservative for astral glyphs; newline separators are not characters.
        return str.replace(/\r\n|\r|\n/g, "").length;
    }

    function selection(comp) {
        if (!comp || !comp.selectedLayers || typeof comp.time !== "number") { throw new Error("Open a composition and select text layers."); }
        if (!comp.selectedLayers.length) { throw new Error("Select at least one text layer."); }
        return comp.selectedLayers;
    }

    function label(layer) { return '"' + layer.name + '"'; }

    function preflight(comp, o, warnings) {
        var selected = selection(comp), valid = [], i, layer, count, span, available, needed;
        for (i = 0; i < selected.length; i++) {
            layer = selected[i];
            if (!isText(layer)) { warnings.push(label(layer) + ": skipped (not a text layer)."); continue; }
            if (layer.locked) { warnings.push(label(layer) + ": skipped (locked)." ); continue; }
            if (comp.time < layer.inPoint || comp.time >= layer.outPoint) { warnings.push(label(layer) + ": move the playhead inside this layer."); continue; }
            count = textCount(layer, o.unit, comp.time);
            if (!count) { warnings.push(label(layer) + ": skipped (empty text)."); continue; }
            span = o.duration + Math.max(0, count - 1) * o.stagger;
            needed = o.mode === "both" ? 2 * span : span;
            available = layer.outPoint - comp.time;
            if (needed > available + 0.000001) {
                warnings.push(label(layer) + ": needs " + needed.toFixed(2) + " seconds from the playhead; only " + available.toFixed(2) + " available. Reduce duration/stagger or extend the layer.");
                continue;
            }
            valid.push(layer);
        }
        if (!valid.length) { throw new Error(warnings.length ? warnings.join("\n") : "Select an unlocked text layer."); }
        return valid;
    }

    function expression(o, start, controls, opacity) {
        var lines = [
            SIGNATURE,
            "function ktClamp(v,a,b){return Math.max(a,Math.min(b,v));}",
            'var ktD=Math.max(0.001,effect("' + controls.duration + '")(1));',
            'var ktS=Math.max(0,effect("' + controls.stagger + '")(1));',
            'var ktO=ktClamp(effect("' + controls.overshoot + '")(1),0,2);',
            "var ktStart=" + start + ";",
            "var ktN=Math.max(1,textTotal);",
            "var ktI=" + (o.reverse ? "ktN-textIndex" : "textIndex-1") + ";",
            "var ktSpan=ktD+(ktN-1)*ktS;"
        ];
        if (o.mode === "both") {
            // Initial overlap is rejected by preflight. Preserve non-overlap after source/control edits.
            lines.push("var ktFit=Math.min(1,Math.max(0.001,outPoint-ktStart)/(2*ktSpan));");
        } else {
            lines.push("var ktFit=Math.min(1,Math.max(0.001,outPoint-ktStart)/ktSpan);");
        }
        lines.push("ktD*=ktFit;ktS*=ktFit;ktSpan=ktD+(ktN-1)*ktS;");
        lines.push("function ktBack(p){if(p<=0){return 0;}if(p>=1){return 1;}var q=p-1,c=1.70158*ktO;return 1+(c+1)*q*q*q+c*q*q;}");
        if (o.mode === "in") {
            lines.push("var ktP=(time-ktStart-ktI*ktS)/ktD;", "var ktAmount=100*(1-ktBack(ktP));");
        } else if (o.mode === "out") {
            lines.push("var ktP=(time-ktStart-ktI*ktS)/ktD;", "var ktAmount=100*(1-ktBack(1-ktP));");
        } else {
            lines.push("var ktExit=outPoint-ktSpan;", "var ktAmount;", "if(time<ktExit){", "ktAmount=100*(1-ktBack((time-ktStart-ktI*ktS)/ktD));", "}else{", "ktAmount=100*(1-ktBack(1-(time-ktExit-ktI*ktS)/ktD));", "}");
        }
        lines.push(opacity ? "ktClamp(ktAmount,0,100);" : "ktAmount;");
        return lines.join("\n");
    }

    function setExpression(property, expr) {
        if (!property || property.canSetExpression === false) { throw new Error("This text property cannot accept an expression."); }
        property.expression = expr;
        property.expressionEnabled = true;
        if (property.expressionError) { throw new Error(property.expressionError); }
    }

    function addControl(layer, name, value, staged) {
        var group = effects(layer);
        if (group.canAddProperty && !group.canAddProperty("ADBE Slider Control")) { throw new Error("Slider Control is unavailable on this layer."); }
        var added = group.addProperty("ADBE Slider Control");
        added.name = name;
        staged.push(name);
        effects(layer).property(name).property("ADBE Slider Control-0001").setValue(value);
    }

    function animator(layer, name) { return animators(layer).property(name); }

    function addValue(layer, name, matchName, value, expr) {
        animator(layer, name).property("ADBE Text Animator Properties").addProperty(matchName);
        var prop = animator(layer, name).property("ADBE Text Animator Properties").property(matchName);
        prop.setValue(value);
        if (expr) { setExpression(prop, expr); }
    }

    function addAnimator(layer, name, o, start, controls, opacity, staged) {
        var a = animators(layer).addProperty("ADBE Text Animator");
        a.name = name;
        staged.push(name);
        var group = animator(layer, name).property("ADBE Text Selectors"), i;
        // AE normally adds no selector by script; tolerate hosts with a default selector.
        for (i = group.numProperties; i >= 1; i--) { animator(layer, name).property("ADBE Text Selectors").property(i).remove(); }
        animator(layer, name).property("ADBE Text Selectors").addProperty("ADBE Text Expressible Selector");
        animator(layer, name).property("ADBE Text Selectors").property(1).property("ADBE Text Range Type2").setValue(units[o.unit]);
        setExpression(animator(layer, name).property("ADBE Text Selectors").property(1).property("ADBE Text Expressible Amount"), expression(o, start, controls, opacity));
    }

    function build(layer, o, start) {
        serial++;
        var id = String(new Date().getTime()) + "_" + serial;
        var suffix = " [KT1:" + id + "]";
        var oldAnimators = namesOfOwned(animators(layer), ownedAnimator);
        var oldControls = namesOfOwned(effects(layer), ownedControl);
        var stagedAnimators = [], stagedControls = [], controls = {}, a, direction = directions[o.direction];
        var distanceExpr, reason;
        controls.duration = "Kinetic Text / Duration" + suffix;
        controls.stagger = "Kinetic Text / Stagger" + suffix;
        controls.distance = "Kinetic Text / Distance" + suffix;
        controls.overshoot = "Kinetic Text / Overshoot" + suffix;
        try {
            addControl(layer, controls.duration, o.duration, stagedControls);
            addControl(layer, controls.stagger, o.stagger, stagedControls);
            addControl(layer, controls.distance, o.distance, stagedControls);
            addControl(layer, controls.overshoot, o.overshoot, stagedControls);
            a = "Kinetic Text / Opacity" + suffix;
            addAnimator(layer, a, o, start, controls, true, stagedAnimators);
            addValue(layer, a, "ADBE Text Opacity", 0);
            if (o.preset !== "fade") {
                a = "Kinetic Text / " + o.preset + suffix;
                addAnimator(layer, a, o, start, controls, false, stagedAnimators);
                if (o.preset === "rise" || o.preset === "slide") {
                    distanceExpr = 'var d=Math.max(0,effect("' + controls.distance + '")(1));[' + direction[0] + '*d,' + direction[1] + '*d,0];';
                    addValue(layer, a, "ADBE Text Position 3D", [direction[0] * o.distance, direction[1] * o.distance, 0], distanceExpr);
                } else if (o.preset === "pop") {
                    addValue(layer, a, "ADBE Text Scale 3D", [0, 0, 0]);
                } else if (o.preset === "spin") {
                    addValue(layer, a, "ADBE Text Rotation", o.direction === "left" || o.direction === "up" ? -90 : 90);
                } else if (o.preset === "blur") {
                    // Blur must not become negative when the motion selector overshoots.
                    setExpression(animator(layer, a).property("ADBE Text Selectors").property(1).property("ADBE Text Expressible Amount"), expression(o, start, controls, true));
                    distanceExpr = 'var d=Math.max(0,effect("' + controls.distance + '")(1))/2;[d,d];';
                    addValue(layer, a, "ADBE Text Blur", [o.distance / 2, o.distance / 2], distanceExpr);
                }
            }
        } catch (e) {
            reason = e.message || String(e);
            try { removeNames(layer, animators, stagedAnimators); } catch (ignoredA) { reason += " (Use Undo to remove incomplete animators.)"; }
            try { removeNames(layer, effects, stagedControls); } catch (ignoredB) { reason += " (Use Undo to remove incomplete controls.)"; }
            throw new Error(reason);
        }
        // Commit only after all new expressions and properties were accepted.
        removeNames(layer, animators, oldAnimators, ownedAnimator);
        removeNames(layer, effects, oldControls, ownedControl);
    }

    function animate(payload, comp) {
        var o = options(payload), warnings = [], valid = preflight(comp, o, warnings), count = 0, i;
        for (i = 0; i < valid.length; i++) {
            try { build(valid[i], o, comp.time); count++; }
            catch (e) { warnings.push(label(valid[i]) + ": " + (e.message || String(e))); }
        }
        if (!count) { throw new Error(warnings.join("\n") || "No text animators were created."); }
        return { message: "Animated " + count + " text layer" + (count === 1 ? "." : "s."), data: { layers: count, preset: o.preset, unit: o.unit, mode: o.mode }, warnings: warnings };
    }

    function clear(payload, comp) {
        var selected = selection(comp), warnings = [], count = 0, i, layer, names, controlNames;
        for (i = 0; i < selected.length; i++) {
            layer = selected[i];
            if (!isText(layer)) { warnings.push(label(layer) + ": skipped (not a text layer)."); continue; }
            if (layer.locked) { warnings.push(label(layer) + ": skipped (locked)."); continue; }
            names = namesOfOwned(animators(layer), ownedAnimator);
            controlNames = namesOfOwned(effects(layer), ownedControl);
            if (names.length || controlNames.length) {
                removeNames(layer, animators, names, ownedAnimator);
                removeNames(layer, effects, controlNames, ownedControl);
                count++;
            }
        }
        return { message: count ? "Cleared Kinetic text animation from " + count + " layer" + (count === 1 ? "." : "s.") : "No Kinetic text animation found on the selected layers.", data: { layers: count }, warnings: warnings };
    }

    return { animate: animate, clear: clear };
}());


/* Kinetic: original utilities for After Effects 25/26. ExtendScript ES3. */

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
    function dispatch(request) {
        try {
            if (!request || typeof request.action !== "string") { throw new Error("Request requires an action."); }
            if (request.action === "status") { return stringify(status()); }
            var payload = request.payload || {}, comp = requireComp(), response;
            if (typeof payload !== "object" || payload instanceof Array) { throw new Error("Payload must be an object."); }
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
        } catch (error) { return stringify({ok: false, message: error.message || error.toString()}); }
    }
    return {dispatch: dispatch};
}());
