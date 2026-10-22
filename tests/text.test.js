"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "../jsx/text.jsx"), "utf8");
function api() {
    const context = vm.createContext({});
    vm.runInContext(source, context, { filename: "text.jsx" });
    return context.KineticText;
}

function node(matchName, children = [], value) {
    const n = { matchName, name: matchName, children, value, expression: "", revision: 0, removed: false };
    for (const c of children) c.parent = n;
    return n;
}

// Handles become invalid after a sibling add/remove, as indexed AE groups do.
// Deliberately strict schemas catch translated labels and guessed property names.
class Handle {
    constructor(n, root) {
        this.n = n;
        this.root = root;
        this.ancestors = [];
        for (let p = n.parent; p; p = p.parent) this.ancestors.push([p, p.revision]);
    }
    check() {
        assert.ok(!this.n.removed, "removed handle used");
        for (const [p, rev] of this.ancestors) assert.equal(p.revision, rev, "stale indexed-group handle used");
    }
    get name() { this.check(); return this.n.name; }
    set name(v) { this.check(); this.n.name = v; }
    get matchName() { this.check(); return this.n.matchName; }
    get numProperties() { this.check(); return this.n.children.length; }
    get propertyIndex() { this.check(); return this.n.parent.children.indexOf(this.n) + 1; }
    get canSetExpression() { this.check(); return true; }
    get expressionError() { this.check(); return ""; }
    get expression() { this.check(); return this.n.expression; }
    set expression(v) { this.check(); this.n.expression = v; }
    set expressionEnabled(v) { this.check(); this.n.expressionEnabled = v; }
    get value() { this.check(); return this.n.value; }
    valueAtTime() { return this.value; }
    setValue(v) { this.check(); this.n.value = v; }
    property(key) {
        this.check();
        const found = typeof key === "number" ? this.n.children[key - 1] : this.n.children.find(c => c.name === key || c.matchName === key);
        return found ? new Handle(found, this.root) : null;
    }
    canAddProperty() { this.check(); return true; }
    addProperty(matchName) {
        this.check();
        if (this.root.failOn === matchName) throw new Error("Injected host rejection: " + matchName);
        let n;
        if (this.matchName === "ADBE Text Animators") {
            assert.equal(matchName, "ADBE Text Animator");
            n = node(matchName, [node("ADBE Text Selectors"), node("ADBE Text Animator Properties")]);
        } else if (this.matchName === "ADBE Text Selectors") {
            assert.equal(matchName, "ADBE Text Expressible Selector");
            n = node(matchName, [node("ADBE Text Range Type2", [], 1), node("ADBE Text Expressible Amount", [], [100, 100, 100])]);
        } else if (this.matchName === "ADBE Text Animator Properties") {
            assert.ok(["ADBE Text Opacity", "ADBE Text Position 3D", "ADBE Text Scale 3D", "ADBE Text Rotation", "ADBE Text Blur"].includes(matchName));
            n = node(matchName);
        } else if (this.matchName === "ADBE Effect Parade") {
            assert.equal(matchName, "ADBE Slider Control");
            n = node(matchName, [node("ADBE Slider Control-0001", [], 0)]);
        } else throw new Error("Unsupported add on " + this.matchName);
        n.parent = this.n;
        this.n.children.push(n);
        this.n.revision++;
        return new Handle(n, this.root);
    }
    remove() {
        this.check();
        const p = this.n.parent;
        p.children.splice(p.children.indexOf(this.n), 1);
        p.revision++;
        this.n.removed = true;
    }
}

function layer(text = "Hello world", props = {}) {
    const root = node("Layer", [
        node("ADBE Text Properties", [node("ADBE Text Document", [], { text, composedLineCount: props.lines || text.split(/\r|\n/).length }), node("ADBE Text Animators")]),
        node("ADBE Effect Parade")
    ]);
    return Object.assign({
        name: "Title", locked: false, inPoint: 0, outPoint: 10, root,
        property(key) { return new Handle(root, root).property(key); }
    }, props);
}
function comp(layers, time = 2) { return { selectedLayers: layers, time }; }
function anims(l) { return l.root.children[0].children[1].children; }
function controls(l) { return l.root.children[1].children; }
function amount(l, kind) {
    const a = anims(l).find(n => n.name.startsWith("Kinetic Text / " + kind));
    return a.children[0].children[0].children[1].expression;
}
function evaluate(l, expression, time, textIndex = 1, textTotal = 1) {
    return vm.runInNewContext(expression, {
        time, textIndex, textTotal, outPoint: l.outPoint,
        effect(name) {
            const c = controls(l).find(x => x.name === name);
            assert.ok(c, "expression control exists: " + name);
            return index => { assert.equal(index, 1); return c.children[0].value; };
        }
    });
}
function setControl(l, name, value) { controls(l).find(n => n.name.startsWith("Kinetic Text / " + name)).children[0].value = value; }

test("every preset creates native editable properties for every unit", () => {
    const kinetic = api();
    for (const preset of ["rise", "slide", "pop", "fade", "blur", "spin"]) {
        for (const unit of ["characters", "words", "lines"]) {
            const l = layer();
            const result = kinetic.animate({ preset, unit }, comp([l]));
            assert.equal(result.data.layers, 1);
            assert.equal(anims(l).length, preset === "fade" ? 1 : 2);
            assert.equal(controls(l).length, 4);
            for (const a of anims(l)) {
                assert.equal(a.matchName, "ADBE Text Animator");
                assert.equal(a.children[0].children[0].children[0].value, { characters: 1, words: 3, lines: 4 }[unit]);
                assert.match(a.children[0].children[0].children[1].expression, /^\/\/ KineticText\/v1/);
            }
        }
    }
});

test("In transitions from hidden to rest with ordered staggering at the playhead", () => {
    const l = layer("ABC"), kinetic = api();
    kinetic.animate({ duration: 1, stagger: 0.2 }, comp([l], 3));
    const expr = amount(l, "rise");
    assert.equal(evaluate(l, expr, 2, 1, 3), 100);
    assert.equal(evaluate(l, expr, 3, 1, 3), 100);
    assert.equal(evaluate(l, expr, 4, 1, 3), 0);
    assert.equal(evaluate(l, expr, 4.4, 3, 3), 0);
    assert.ok(evaluate(l, expr, 3.4, 1, 3) < evaluate(l, expr, 3.4, 3, 3));
});

test("Out starts at playhead, is visible before it, and finishes hidden", () => {
    const l = layer("AB"), kinetic = api();
    kinetic.animate({ mode: "out", duration: 1, stagger: 0.2 }, comp([l], 3));
    const expr = amount(l, "Opacity");
    assert.equal(evaluate(l, expr, 2, 1, 2), 0);
    assert.equal(evaluate(l, expr, 3, 1, 2), 0);
    assert.equal(evaluate(l, expr, 4, 1, 2), 100);
    assert.equal(evaluate(l, expr, 4.2, 2, 2), 100);
    assert.ok(evaluate(l, expr, 3.5, 1, 2) > evaluate(l, expr, 3.5, 2, 2));
});

test("Both enters at playhead and last exit completes at outPoint", () => {
    const l = layer("AB", { outPoint: 8 }), kinetic = api();
    kinetic.animate({ mode: "both", duration: 1, stagger: 0.2 }, comp([l], 2));
    const expr = amount(l, "Opacity");
    assert.equal(evaluate(l, expr, 2, 1, 2), 100);
    assert.equal(evaluate(l, expr, 4, 1, 2), 0);
    assert.equal(evaluate(l, expr, 6.8, 1, 2), 0);
    assert.equal(evaluate(l, expr, 8, 2, 2), 100);
});

test("reverse reverses the unit order and overshoot never makes opacity negative", () => {
    const l = layer("ABC"), kinetic = api();
    kinetic.animate({ preset: "pop", reverse: true, duration: 1, stagger: 0.2, overshoot: 1 }, comp([l], 2));
    const motion = amount(l, "pop"), opacity = amount(l, "Opacity");
    assert.equal(evaluate(l, motion, 2, 1, 3), 100);
    assert.ok(evaluate(l, motion, 2.5, 3, 3) < 0, "motion passes the resting value");
    assert.equal(evaluate(l, opacity, 2.5, 3, 3), 0, "opacity clamps overshoot");
    assert.ok(evaluate(l, motion, 2.2, 3, 3) < evaluate(l, motion, 2.2, 1, 3));
});

test("native slider edits are live and long edits fit the layer without In/Out overlap", () => {
    const l = layer("AB", { outPoint: 6 }), kinetic = api();
    kinetic.animate({ mode: "both", duration: 0.5, stagger: 0.1 }, comp([l], 2));
    setControl(l, "Duration", 10);
    setControl(l, "Stagger", 10);
    const expr = amount(l, "Opacity");
    assert.equal(evaluate(l, expr, 4, 2, 2), 0);
    assert.equal(evaluate(l, expr, 6, 2, 2), 100);
    setControl(l, "Distance", 200);
    const p = anims(l)[1].children[1].children[0];
    assert.deepEqual(Array.from(evaluate(l, p.expression, 3)), [0, 200, 0]);
});

test("reapply replaces only owned items and clear leaves other animators and effects", () => {
    const l = layer(), kinetic = api();
    const other = l.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
    other.name = "My handmade animation";
    const fx = l.property("ADBE Effect Parade").addProperty("ADBE Slider Control");
    fx.name = "My Slider";
    kinetic.animate({}, comp([l]));
    const oldNames = anims(l).map(x => x.name).filter(x => x.startsWith("Kinetic"));
    kinetic.animate({ preset: "blur" }, comp([l]));
    assert.equal(anims(l).length, 3);
    assert.equal(controls(l).length, 5);
    assert.ok(!anims(l).some(x => oldNames.includes(x.name)));
    assert.equal(kinetic.clear({}, comp([l])).data.layers, 1);
    assert.deepEqual(anims(l).map(x => x.name), ["My handmade animation"]);
    assert.deepEqual(controls(l).map(x => x.name), ["My Slider"]);
});

test("host rejection cleans up staging and preserves the previous animation", () => {
    const l = layer(), kinetic = api();
    kinetic.animate({ preset: "fade" }, comp([l]));
    const before = anims(l).map(x => x.name), controlsBefore = controls(l).map(x => x.name);
    l.root.failOn = "ADBE Text Blur";
    assert.throws(() => kinetic.animate({ preset: "blur" }, comp([l])), /Injected host rejection/);
    assert.deepEqual(anims(l).map(x => x.name), before);
    assert.deepEqual(controls(l).map(x => x.name), controlsBefore);
});

test("ownership survives renaming but an unrelated same-name animator is preserved", () => {
    const l = layer(), kinetic = api();
    kinetic.animate({ preset: "fade" }, comp([l]));
    anims(l)[0].name = "Renamed Kinetic";
    const other = l.property("ADBE Text Properties").property("ADBE Text Animators").addProperty("ADBE Text Animator");
    other.name = "Renamed Kinetic";
    kinetic.clear({}, comp([l]));
    assert.equal(anims(l).length, 1);
    assert.equal(anims(l)[0].children[0].children.length, 0);
});

test("invalid payload and overlap are rejected before changing the existing animation", () => {
    const l = layer("ABC", { outPoint: 4 }), kinetic = api();
    kinetic.animate({ preset: "fade" }, comp([l]));
    const before = anims(l).map(x => x.name);
    for (const payload of [{ preset: "constructor" }, { unit: "syllables" }, { duration: 0 }, { stagger: -1 }, { overshoot: 9 }, { mode: "other" }, { reverse: "false" }]) {
        assert.throws(() => kinetic.animate(payload, comp([l])));
    }
    assert.throws(() => kinetic.animate({ mode: "both", duration: 1, stagger: 1 }, comp([l])), /needs 6.00 seconds/);
    assert.deepEqual(anims(l).map(x => x.name), before);
});

test("mixed selection handles valid text while reporting skipped layers", () => {
    const good = layer("A"), locked = layer("B", { name: "Locked", locked: true });
    const empty = layer("  "), outside = layer("X", { inPoint: 5 });
    const kinetic = api();
    const result = kinetic.animate({}, comp([good, locked, empty, outside, { name: "Solid", property() { return null; } }]));
    assert.equal(result.data.layers, 1);
    assert.equal(result.warnings.length, 4);
    assert.equal(anims(locked).length, 0);
    assert.throws(() => kinetic.animate({}, comp([])), /Select at least/);
    assert.throws(() => kinetic.animate({}, comp([locked])), /locked/);
});

test("word and composed-line counts govern Both overlap preflight", () => {
    const kinetic = api(), words = layer("one two", { outPoint: 4.5 }), lines = layer("Soft wrapped line", { lines: 3, outPoint: 4.5 });
    assert.equal(kinetic.animate({ unit: "words", mode: "both", duration: 0.5, stagger: 0.5 }, comp([words])).data.layers, 1);
    assert.throws(() => kinetic.animate({ unit: "lines", mode: "both", duration: 0.5, stagger: 0.5 }, comp([lines])), /needs 3.00 seconds/);
    assert.equal(anims(lines).length, 0);
});

test("blur selector remains nonnegative with overshoot", () => {
    const l = layer("A"), kinetic = api();
    kinetic.animate({ preset: "blur", overshoot: 2, duration: 1 }, comp([l]));
    const expr = amount(l, "blur");
    for (let t = 1; t <= 4; t += 0.1) assert.ok(evaluate(l, expr, t) >= 0);
});
