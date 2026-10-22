# Validation record — Kinetic 0.3.0

Date: 23 October 2026 (Asia/Singapore).

## Completed

- **53 automated tests pass**, run with Node.js 24.13.1 on Windows. Includes curve math and library validation, browser/CEP bridge protocol, host behavior with mocks, text selector-expression evaluation, custom script evaluation against mocks, and smoke-test failure reporting.
- Host tests cover signed scalar and vector easing velocities, exterior easing preservation, rollback on host rejection, invalid selections, rotation/scale anchor compensation, every selected subset in a five-layer reverse-order scenario, sequence/trim, and expression ownership.
- Text tests cover all six presets and all three unit types, In/Out/Both timing, reverse ordering, overshoot, live controls, indexed-group invalidation, staged replacement/rollback, and preservation of unrelated animators/effects.
- Source JSX and AE smoke script parse as **ECMAScript 3** with Acorn. Browser scripts parse as ECMAScript 2020, within CEP 12's Chromium 99 syntax support.
- Manifest XML parses; all resource paths are present. Build produces one self-contained `jsx/kinetic.jsx`, removing runtime include-path dependence.
- Windows installer: PowerShell parser and `-WhatIf` dry run passed. This did **not** install the extension or change registry settings.
- macOS installer: Bash syntax checked. It was **not** installed on a Mac.
- Prior 0.1 browser interaction checks: all four tabs accessible; wide easing view rendered; 340px docked Text and Layers layouts had no horizontal overflow; custom curve editing; save/reload persistence; text unit/mode/overshoot controls; layer creation preview response; invalid fractional frame offset rejected; motion preset switching; valid JSON library import; invalid import rejected without replacing prior curves; export produced a JSON file containing the two expected test curves. The 0.2 interface has a separate verification record below.
- Apply actions in preview correctly say that editing requires After Effects. No fabricated AE result was shown. Browser logs inspected during the initial preview contained no errors or warnings.

## Boundaries

After Effects was not available in the inspected standard Adobe installation directory. **No actual AE host execution, project rendering, installation, or macOS execution is claimed.** Mock tests cannot establish API acceptance or rendering behavior in either AE version.

Test presets are confined to the localhost preview's local storage; no test presets are bundled with the extension.

## Redesigned interface

The 0.2 redesign passed JavaScript syntax checks and a static DOM binding audit: 127 unique IDs, with all literal JavaScript ID references resolved. That version had 44 passing tests. A separate source review covered the graph coordinate conversion, library toggle, and text-unit control wiring.

**Visual and browser-interaction verification of the 0.2 redesign is pending.** The preview origin was blocked by the browser's saved permission policy, so no runtime screenshot or responsive-layout result is claimed for this version. The generated concept in `docs/design/` is a design reference, not evidence of runtime behavior. The three-panel page at `docs/screenshots.html` can be used for a future visual review.

## Shift constraints and Scripts workspace (0.3)

- Static review covers Shift-drag for both endpoints and axes, expanded Y ranges, immediate modifier changes, pointer cancellation, and retention of Shift+arrow nudging.
- The final panel passes ECMAScript 2020 syntax checks and a DOM reference audit (139 unique markup IDs, no duplicate or unresolved literal ID references).
- Nine new automated tests cover script execution without a composition, validation before execution, print/final-result capture, syntax/runtime errors, line details, preservation of prior edits/logs on failure, output bounds, local declarations, unchanged `$.writeln`, and bridge serialization limits. Preview refuses script execution.
- The import handler ignores stale file-read callbacks and keeps edits made while a file is loading. Script output is rendered as text, not HTML.
- These are source and mock checks. Shift pointer interaction, script import/export in the browser, real AE script execution, and the five-tab layout still need runtime verification. The saved browser permission block remains unresolved.

## Run the real-host smoke test

1. In After Effects 2025 or 2026, choose **File → Scripts → Run Script File** and select `tests/ae-smoke.jsx` from the complete extracted bundle.
2. The test creates a new, unsaved `Kinetic smoke …` composition. It does not modify existing compositions. It checks connection, all eight layer creators, native temporal easing, expression installation/removal, and text animator construction/removal.
3. Read the PASS/FAIL dialog. The test comp remains open with a text entrance/exit for visual inspection. Preview the first and final two seconds and inspect for expression warnings. This step requires AE and has not been run here.
4. Open the installed panel and test each action in that disposable composition, including a docked 320px panel, Undo, separated Position X/Y, a locked layer, mixed text/non-text selections, and native saved-curve import/export. Repeat on the intended AE version and OS.

This release is an installable development build, not a certified production replacement for the entire referenced commercial toolsets.
