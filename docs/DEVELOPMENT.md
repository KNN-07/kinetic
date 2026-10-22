# Develop Kinetic

Kinetic is a CEP panel with a browser interface and an ExtendScript host. The source has no package dependencies. **Node.js 18 or newer** is needed for the development commands; users do not need Node.js to run the installed panel.

## Local workflow

From the repository root:

```sh
npm test
npm run build
npm run preview
```

The preview server listens at `http://127.0.0.1:4173`. You can also open `index.html` directly. Browser preview supports the interface, curve editing, preset persistence, and library import/export. It cannot edit an AE project, and text previews are illustrative rather than AE renders.

After editing either source JSX file, run `npm run build`. This creates the self-contained `jsx/kinetic.jsx` loaded by the manifest. The build combines the text module before the host and removes source include directives. Keep the generated host in a release so installation does not require a build step.

## Source map

| Path | Responsibility |
| --- | --- |
| `index.html`, `css/panel.css` | Panel markup, layout, and styling. |
| `js/panel.js` | Interface state, controls, and previews. |
| `js/core.js` | Curve math and preset-library validation. |
| `js/bridge.js` | Serialized CEP requests, response validation, and in-flight command protection. |
| `jsx/host.jsx` | Native easing, layer creation and utilities, motion expressions, and dispatch. |
| `jsx/text.jsx` | Native text animators, expression selectors, and editable controls. |
| `jsx/kinetic.jsx` | Generated host bundle used by the installed extension. |
| `CSXS/manifest.xml` | AE host range, CEP 12 runtime, panel geometry, and resource paths. |
| `tests/` | Automated tests and the optional real-host smoke script. |
| `scripts/` | Build and local preview commands. |

## Compatibility and verification

The manifest targets **After Effects 2025 and 2026 (25.x/26.x)** with **CEP 12**. Host code uses ExtendScript-compatible ECMAScript 3. Browser code must work in CEP 12's Chromium 99 engine.

Automated tests cover core logic, request handling, mocked host operations, and generated text expressions. A passing mock test demonstrates behavior against that test model; it does not demonstrate AE API acceptance, native rendering, or operating-system compatibility.

The project remains an **early development build**. Native execution and rendering inside AE, actual extension installation on either operating system, and execution on macOS have not been verified. Visual verification of the 0.2 redesign is also pending. The README image is a labeled generated design concept, not a runtime screenshot. Release notes must preserve these distinctions until verification evidence is available.

### Real-host verification

1. Extract a complete release or build the source. In AE 2025 or 2026, choose **File → Scripts → Run Script File** and select `tests/ae-smoke.jsx`.
2. The smoke script creates a new test composition. It checks connection, the eight layer creators, native temporal easing, expression installation/removal, and text animator construction/removal.
3. Read the PASS/FAIL report. Preview the first and last two seconds of the resulting text animation; inspect character order, settling, exit timing, and expression warnings.
4. Open the installed panel in that disposable composition. Exercise each tool and Undo, a narrow docked panel, separated Position X/Y, locked layers, mixed text/non-text selections, and curve-library import/export.
5. Repeat on each claimed AE version and operating system. Record actual versions and distinguish API acceptance from visual/render review.

The smoke script is a starting point for host testing, not a complete compatibility certification.

## Tool behavior

### Easing

- The host edits pairs of selected keys only when they are adjacent in the property's actual keyframe sequence.
- Supported values are scalar and nonspatial 2D/3D numeric properties. Examples include Opacity, Rotation, Scale, and separated Position X/Y/Z.
- Spatial Position paths, Color, Shape, and Source Text are skipped. Spatial/roving keys are outside the supported easing scope. Properties with enabled expressions are also skipped.
- Bézier slopes are converted to signed, per-component native velocities. Exterior numerical ease values and interpolation types are preserved; edited keys use independent handles with temporal auto-Bezier and continuous flags disabled.
- AE's minimum influence is 0.1%. Finite endpoint handles may require a reported approximation. True vertical endpoint tangents are rejected because they require infinite native velocity.
- Curve-library import accepts validated data, not executable code. Saved curves use browser storage and can be exported to JSON.
- Shift-drag constrains a handle to the nearest horizontal or vertical axis through its endpoint, measured in graph pixels. Changing Shift during a drag immediately applies or releases the constraint. Shift+arrow keys retain their larger nudge step.

### Text

- Rise, Slide, Pop, Fade, Blur, and Spin use native text animators with expression selectors. Units are characters, words, and lines.
- In and Out begin at the playhead. Both starts an entrance at the playhead and finishes the exit at the layer's out point; enough layer duration must remain for both sequences.
- Generated effect sliders keep duration, stagger, distance, and overshoot editable in AE.
- Reapplying replaces Kinetic's own setup while preserving unrelated animators. Clear removes the generated setup rather than all text animation.
- Browser previews demonstrate timing and style; they are not exact AE font/layout or rendering simulations.

### Layers

- Creation supports text, solids, adjustment layers, nulls, rectangles, ellipses, cameras, and lights in the active composition. Creation uses the host's layer timing behavior; it does not promise a playhead-aligned in point.
- Anchor, center, and parent-null require static, unparented 2D layers with unseparated transforms and no enabled transform expressions. Anchor changes compensate for scale and rotation.
- Sequence follows selected layer stack order, keeping the first eligible layer's in point and offsetting the others by the selected frame interval.
- Reverse reverses selected layers' stack order while preserving unselected stack slots; it does not reverse time.
- Trim intersects each selected layer with the composition work area; layers outside the work area are skipped.
- Duplicate and numbered rename operate on unlocked selections.

### Motion

- Wiggle, Loop, Ping-pong, and Overshoot apply to eligible selected numeric properties that support expressions.
- Loop, Ping-pong, and Overshoot require at least two keyframes. Wiggle does not.
- Wiggle amplitude uses the property's units. Overshoot amplitude is velocity strength expressed as a percentage; frequency and decay control the oscillation.
- Kinetic does not overwrite another tool's or user's expression, even if that expression is disabled. Clear only removes expressions carrying Kinetic's ownership marker.

## Host bridge

### Custom scripts

The **Scripts** tab accepts plain-text ExtendScript up to 100,000 characters. Open JSX accepts `.jsx`/`.js`; Save JSX exports the current draft. Import never executes code. The draft persists in local browser storage. Ctrl/Cmd+Enter or **Run script** sends the editor contents to AE; browser preview never evaluates this code.

Scripts can run without an active composition. `print(...)` captures arguments separated by spaces and writes a line to the panel output. The final evaluation value is displayed when present; exceptions report their message and line number when AE supplies one. Output and result are each capped at 16,000 characters. `$.writeln` retains its normal ExtendScript behavior and is not captured.

Custom scripts have the host's full scripting access, including whatever file/network access AE allows; they are not sandboxed. Only run code you intend to execute. A normal undo group encloses execution, but errors do not roll back completed changes, and external actions may not support Undo. The panel cannot interrupt a running script. The bridge's 30-second response timeout is not cancellation: wait for AE to finish before another command can run. Scripts that manage their own undo groups, use preprocessors such as `#include`, or depend on `$.fileName` should be run as script files through AE instead of this text evaluator.

### Requests

The browser sends a whitelisted action and a JSON-serialized payload to `Kinetic.dispatch(request)`. The host returns serialized JSON containing `ok`, `message`, and optional `data` and `warnings` fields.

| Action | Purpose |
| --- | --- |
| `status` | Read active composition and selection counts. |
| `easing.apply` | Apply a cubic curve to supported selected adjacent keys. |
| `layers.create` | Create a supported layer type. |
| `layers.tool` | Run a selected layer utility. |
| `motion.apply`, `motion.clear` | Apply or remove owned motion expressions. |
| `text.animate`, `text.clear` | Apply or remove owned text animation. |
| `scripts.run` | Evaluate custom ExtendScript and return bounded `output` and `result` strings, retaining logs when evaluation fails. |

Only one bridge command is in flight at a time. A response timeout does not cancel ExtendScript; the lock stays in place until AE replies. Avoid retries that could apply a mutation twice. Mutation groups close in `finally`, and partial results expose skipped targets and reasons.

## Contributing

For bugs, [open an issue](https://github.com/KNN-07/kinetic/issues) with the exact AE version, OS version, selection/property type, steps to reproduce, and the panel message. A small disposable example project is useful when the issue depends on native AE behavior. Remove confidential artwork and project data before sharing.

For changes, preserve existing user expressions and unrelated layer content, retain undo behavior, and keep host errors visible. Add focused regression tests for host logic or data handling, then rebuild the bundled JSX. Check the interface at narrow docked and wide panel sizes. Describe separately what was tested in the browser, against mocks, and inside AE.

## References

- [Adobe CEP 12 HTML Extension Cookbook](https://github.com/Adobe-CEP/CEP-Resources/blob/master/CEP_12.x/Documentation/CEP%2012%20HTML%20Extension%20Cookbook.md)
- [After Effects scripting reference: Property](https://ae-scripting.docsforadobe.dev/property/property/)
- [After Effects scripting reference: Layer](https://ae-scripting.docsforadobe.dev/layer/layer/)

Kinetic is independently implemented. Commercial tools mentioned as workflow references do not provide its code, assets, or preset libraries.
