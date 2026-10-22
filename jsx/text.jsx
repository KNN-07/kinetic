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
