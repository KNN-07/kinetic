# Changelog

## 0.3.0 — 2026-10-23

### Added

- Hold Shift while dragging Bézier handles to align them horizontally or vertically with their endpoint. The constraint responds immediately to pressing/releasing Shift during a drag.
- Scripts workspace with a persistent ExtendScript draft, JSX import/export, Ctrl/Cmd+Enter execution, and a bounded output/error log.
- `print(...)` logging for custom scripts, execution without an active composition, and explicit failure reporting without claiming rollback.

### Verification

- Automated and source checks only. Native AE execution and visual verification remain pending.

## 0.2.0 — 2026-10-23

### Changed

- Refreshed the panel with a compact layout centered on the curve graph, a charcoal/violet/amber palette, and a smaller toolbar.
- Added four-column preset and layer grids, a Built-in/Saved curve-library toggle, segmented text-unit controls, and compact quick actions.
- Reworked the README around the toolkit, screenshots, and release installation.
- Added separate installation and development guides, including tool behavior and compatibility boundaries.

### Compatibility

- Targets After Effects 2025/2026 through CEP 12.
- This is an early development release. Native AE execution, rendering, and installation on Windows or macOS remain unverified.

## 0.1.0 — 2026-10-23

### Added

- Cubic Bézier editing, native temporal easing, and local curve-library import/export.
- Six native text-animation presets with character, word, and line sequencing.
- Eight layer creators plus anchor, sequence, parent-null, duplicate, reverse, trim, center, and rename utilities.
- Wiggle, Loop, Ping-pong, and Overshoot expressions with ownership-aware removal.
- CEP bridge, Windows/macOS installation scripts, browser preview, automated tests, and an optional AE smoke script.

### Compatibility

- Initial development build targeting AE 2025/2026; native host execution and rendering were not verified.
