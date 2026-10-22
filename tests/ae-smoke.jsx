/* Optional real-host check. Run with File > Scripts > Run Script File in AE 2025/2026.
   Creates a NEW unsaved test composition. Does not touch existing compositions.
   It intentionally leaves the test comp available for visual inspection. */
#include "../jsx/kinetic.jsx"
(function () {
    var report = [], failed = 0, comp, layer, prop, i;
    function check(label, fn) {
        try { fn(); report.push("PASS  " + label); }
        catch (e) { failed++; report.push("FAIL  " + label + ": " + (e.message || String(e))); }
    }
    function assert(value, message) { if (!value) { throw new Error(message); } }
    function command(action, payload) {
        var raw = Kinetic.dispatch({action: action, payload: payload || {}});
        // This is a response from the bundled host, never an imported user file.
        var result = eval("(" + raw + ")");
        assert(result.ok, result.message);
        return result;
    }
    function selectOnly(target) {
        for (var n = 1; n <= comp.numLayers; n++) { comp.layer(n).selected = false; }
        target.selected = true;
    }
    try {
    if (!app.project) { app.newProject(); }
    comp = app.project.items.addComp("Kinetic smoke " + new Date().getTime(), 1280, 720, 1, 12, 30);
    comp.openInViewer(); comp.time = 0;
    check("Host connection", function () { assert(command("status").data.comp.name === comp.name, "Wrong active composition"); });
    var kinds = ["solid", "adjustment", "null", "rectangle", "ellipse", "camera", "light", "text"];
    for (i = 0; i < kinds.length; i++) {
        (function (kind) { check("Create " + kind, function () {
            var before = comp.numLayers;
            command("layers.create", {kind:kind, name:"Smoke " + kind, color:"#d0f67a", width:220, height:120, text:"MAKE\rIT MOVE"});
            assert(comp.numLayers === before + 1, "Expected one new layer");
        }); }(kinds[i]));
    }
    // Hide test camera/light and fill layers to leave text and shapes readable.
    for (i = 1; i <= comp.numLayers; i++) { comp.layer(i).enabled = comp.layer(i).name === "Smoke text"; }
    layer = comp.layer("Smoke text");
    assert(layer, "Text creation failed; dependent animation tests cannot run.");
    selectOnly(layer);
    prop = layer.property("ADBE Transform Group").property("ADBE Opacity");
    prop.setValueAtTime(0, 0); prop.setValueAtTime(1, 100);
    prop.selected = true; prop.setSelectedAtKey(1, true); prop.setSelectedAtKey(2, true);
    check("Native temporal easing", function () {
        command("easing.apply", {curve:[0.42,0,0.58,1]});
        assert(Math.abs(prop.keyOutTemporalEase(1)[0].influence - 42) < 0.001, "Wrong outgoing influence");
        assert(prop.keyOutInterpolationType(1) === KeyframeInterpolationType.BEZIER, "Missing native Bezier");
    });
    check("Loop expression and ownership-aware removal", function () {
        command("motion.apply", {preset:"loop",frequency:2,amplitude:20,decay:5});
        prop.valueAtTime(2, false);
        assert(!prop.expressionError, prop.expressionError);
        command("motion.clear"); assert(prop.expression === "", "Expression was not cleared");
    });
    prop.setSelectedAtKey(1,false); prop.setSelectedAtKey(2,false); prop.selected = false;
    prop.removeKey(2); prop.removeKey(1); prop.setValue(100);
    var presets = ["rise", "slide", "pop", "fade", "blur", "spin"], units = ["characters", "words", "lines"];
    for (i = 0; i < presets.length; i++) {
        (function (preset, unit) { check("Text " + preset + " / " + unit, function () {
            command("text.animate", {preset:preset,unit:unit,mode:"both",direction:"up",duration:0.6,stagger:0.04,distance:60,reverse:false,overshoot:0.25});
            assert(layer.property("ADBE Text Properties").property("ADBE Text Animators").numProperties > 0, "No native animators");
        }); }(presets[i], units[i % units.length]));
    }
    check("Clear native text animation", function () {
        command("text.clear");
        assert(layer.property("ADBE Text Properties").property("ADBE Text Animators").numProperties === 0, "Owned animators remain");
    });
    check("Anchor compensation", function () {
        command("layers.tool", {op:"anchor",anchor:[0.5,0.5]});
    });
    check("Leave a native text animation for visual review", function () {
        command("text.animate", {preset:"rise",unit:"characters",mode:"both",direction:"up",duration:0.65,stagger:0.045,distance:70,reverse:false,overshoot:0.3});
    });
    comp.time = 1.5;
    } catch (setupError) {
        failed++;
        report.push("FAIL  Test setup/dependent checks: " + (setupError.message || String(setupError)));
    }
    report.push("", "AE " + app.version, "Failures: " + failed,
        "The new test composition remains open. Preview its first and last 2 seconds.",
        "Check expression warning badges, character order, settling and exit visually.",
        "This script checks API acceptance; it does not replace visual/render QA.");
    $.writeln(report.join("\n"));
    alert(report.join("\n"), "Kinetic host smoke test");
}());
