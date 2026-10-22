(function () {
  'use strict';
  var Core = window.KineticCore;
  var Bridge = window.KineticBridge;
  var $ = function (id) { return document.getElementById(id); };
  var all = function (selector) { return Array.prototype.slice.call(document.querySelectorAll(selector)); };
  var STORAGE_KEY = 'kinetic.curves.v1';
  var SETTINGS_KEY = 'kinetic.settings.v1';
  var curve = Core.presets[0].curve.slice();
  var curveLabel = Core.presets[0].name;
  var savedCurves = [];
  var settings = { repeat: false, reduceMotion: false };
  var activePage = 'ease';
  var activeLibrary = 'built-in';
  var selectedText = 'rise';
  var selectedMotion = 'wiggle';
  var animations = {};
  var mutationBusy = false;
  var statusBusy = false;
  var toastTimer = null;
  var lastFocus = null;
  var drag = null;
  var graphRange = { min: 0, max: 1 };
  var textPresets = [
    { id: 'rise', name: 'Rise', glyph: 'A↑' }, { id: 'slide', name: 'Slide', glyph: '→A' },
    { id: 'pop', name: 'Pop', glyph: 'Aa' }, { id: 'fade', name: 'Fade', glyph: 'A·' },
    { id: 'blur', name: 'Blur', glyph: 'A≈' }, { id: 'spin', name: 'Spin', glyph: 'A↗' }
  ];
  var motionPresets = [
    { id: 'wiggle', name: 'Wiggle', glyph: '∿', description: 'Add organic variation to a property. Tune the pace and how far it wanders.', caption: 'ORGANIC, CONTINUOUS MOVEMENT', requirements: 'Select a numeric property such as Position, Rotation, or Scale.' },
    { id: 'loop', name: 'Loop', glyph: '↻', description: 'Keep a keyframed movement going, cycling from its end back to its beginning.', caption: 'GOOD MOVES DESERVE A REPEAT', requirements: 'Select a numeric property with at least two keyframes. Repeats after the last keyframe.' },
    { id: 'pingpong', name: 'Ping-pong', glyph: '↔', description: 'Play a keyframed movement forward, then backward. And back again.', caption: 'THERE. AND BACK AGAIN.', requirements: 'Select a numeric property with at least two keyframes. Reverses after the last keyframe.' },
    { id: 'overshoot', name: 'Overshoot', glyph: '⌁', description: 'Let a keyframed movement spring past its destination and settle naturally.', caption: 'A SATISFYING LITTLE SETTLE', requirements: 'Select a numeric property with at least two keyframes. The incoming keyframe velocity drives the spring.' }
  ];

  function icon(name) { return '<svg aria-hidden="true"><use href="#i-' + name + '"/></svg>'; }
  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function round(value) { return Math.round(value * 1000) / 1000; }
  function reducedMotion() { return settings.reduceMotion || (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); }
  function notify(message, error) {
    clearTimeout(toastTimer);
    $('toast-message').textContent = message;
    $('toast').classList.toggle('error', !!error);
    $('toast').hidden = false;
    toastTimer = setTimeout(function () { $('toast').hidden = true; }, error ? 11000 : 6500);
  }
  function readNumber(id, min, max, integer) {
    var input = $(id);
    var value = Number(input.value);
    if (!input.value.trim() || !Number.isFinite(value) || value < min || value > max || (integer && Math.floor(value) !== value)) {
      input.focus();
      throw new Error(input.labels && input.labels[0] ? input.labels[0].textContent.trim() + ' must be ' + (integer ? 'a whole number ' : '') + 'between ' + min + ' and ' + max + '.' : 'Enter a valid value between ' + min + ' and ' + max + '.');
    }
    return value;
  }
  function attempt(callback) { try { return callback(); } catch (error) { notify(error.message, true); return null; } }
  function storeSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (error) { notify('Settings cannot be saved in this environment.', true); } }
  function persistLibrary(next) {
    var normalized;
    try { normalized = Core.validateLibrary(next); }
    catch (error) { notify(error.message + ' Your existing library is unchanged.', true); return false; }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, curves: normalized })); savedCurves = normalized; return true; }
    catch (error) { notify('Your library could not be saved. Export a JSON copy to keep your curves.', true); return false; }
  }
  try { var library = localStorage.getItem(STORAGE_KEY); if (library) savedCurves = Core.validateLibrary(JSON.parse(library)); }
  catch (error) { notify('The saved curve library could not be read. Import a valid JSON backup to recover it.', true); }
  try { var savedSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); settings.repeat = savedSettings.repeat === true; settings.reduceMotion = savedSettings.reduceMotion === true; } catch (error) { /* Storage can be disabled in a sandboxed browser. */ }

  async function refreshStatus(showErrors) {
    if (statusBusy || mutationBusy) return;
    statusBusy = true;
    try {
      var result = await Bridge.call('status', {});
      if (!result.ok) { $('selection-context').textContent = result.message; $('connection-dot').classList.remove('connected'); if (showErrors) notify(result.message, true); return; }
      var data = result.data || {};
      if (!Bridge.isHost || data.preview) { $('selection-context').textContent = 'Local preview · no After Effects connection'; }
      else if (!data.comp) { $('selection-context').textContent = 'After Effects ' + (data.version || '') + ' · open a composition'; }
      else {
        var layers = Array.isArray(data.layers) ? data.layers.length : Number(data.layers) || 0;
        var keys = Array.isArray(data.keyframes) ? data.keyframes.length : Number(data.keyframes) || 0;
        $('selection-context').textContent = data.comp.name + ' · ' + layers + ' layer' + (layers === 1 ? '' : 's') + ' · ' + keys + ' keyframe' + (keys === 1 ? '' : 's') + ' selected';
      }
      $('selection-context').title = $('selection-context').textContent;
      $('connection-dot').classList.toggle('connected', Bridge.isHost);
    } catch (error) { $('selection-context').textContent = 'Could not connect to After Effects'; if (showErrors) notify(error.message, true); }
    finally { statusBusy = false; }
  }
  async function runHost(action, payload, button) {
    if (mutationBusy) { notify('Wait for the current After Effects action to finish.', true); return; }
    if (statusBusy && Bridge.isHost) { notify('Checking the current selection. Try again in a moment.'); return; }
    mutationBusy = true;
    var original = button ? button.innerHTML : '';
    var wasDisabled = button ? button.disabled : false;
    if (button) { var narrowButton = button.offsetWidth < 110; button.disabled = true; button.setAttribute('aria-busy', 'true'); button.innerHTML = '<span class="busy-label">' + (narrowButton ? '' : 'Working…') + '</span>'; }
    try {
      var result = await Bridge.call(action, payload || {});
      var warnings = Array.isArray(result.warnings) ? result.warnings.filter(Boolean) : [];
      notify(result.message + (warnings.length ? ' ' + warnings.join(' ') : ''), !result.ok);
    } catch (error) { notify(error.message || 'After Effects could not complete this action.', true); }
    finally { mutationBusy = false; if (button) { button.innerHTML = original; button.disabled = wasDisabled; button.removeAttribute('aria-busy'); } refreshStatus(false); }
  }
  $('preview-banner').hidden = Bridge.isHost;
  $('selection-context').hidden = !Bridge.isHost;
  $('refresh-status').addEventListener('click', function () { refreshStatus(true); });
  window.addEventListener('focus', function () { refreshStatus(false); });
  setInterval(function () { if (Bridge.isHost && !document.hidden) refreshStatus(false); }, 6000);
  $('dismiss-toast').addEventListener('click', function () { $('toast').hidden = true; clearTimeout(toastTimer); });

  function cancelAnimation(name) { if (animations[name]) cancelAnimationFrame(animations[name]); animations[name] = null; }
  function cancelAnimations() { Object.keys(animations).forEach(cancelAnimation); $('curve-tracer').setAttribute('hidden', ''); }
  function switchPage(name) {
    activePage = name;
    cancelAnimations();
    all('[data-tab]').forEach(function (button) { var active = button.dataset.tab === name; button.classList.toggle('active', active); button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
    all('.tool-page').forEach(function (section) { section.hidden = section.id !== 'page-' + name; });
    if (name === 'text') previewText();
    if (name === 'motion') previewMotion();
  }
  all('[data-tab]').forEach(function (button, index, buttons) {
    button.addEventListener('click', function () { switchPage(button.dataset.tab); });
    button.addEventListener('keydown', function (event) {
      var next = event.key === 'ArrowRight' ? (index + 1) % buttons.length : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
      if (next !== null) { event.preventDefault(); switchPage(buttons[next].dataset.tab); buttons[next].focus(); }
    });
  });

  function graphX(value) { return 30 + value * 394; }
  function graphY(value) { return 252 - (value - graphRange.min) * 240 / (graphRange.max - graphRange.min); }
  function curvePath(values, left, bottom, width, height, min, max) {
    var x = function (n) { return left + n * width; };
    var y = function (n) { return bottom - (n - min) * height / (max - min); };
    return 'M' + x(0) + ',' + y(0) + ' C' + x(values[0]) + ',' + y(values[1]) + ' ' + x(values[2]) + ',' + y(values[3]) + ' ' + x(1) + ',' + y(1);
  }
  function miniCurve(values) {
    var min = Math.min(0, values[1], values[3]), max = Math.max(1, values[1], values[3]);
    return '<svg class="mini-curve" viewBox="0 0 90 46" aria-hidden="true"><path d="' + curvePath(values, 5, 41, 80, 36, min, max) + '" fill="none"/></svg>';
  }
  function updateCurve(next, label) {
    try { curve = Core.validateCurve(next); }
    catch (error) { notify(error.message, true); drawCurve(); return; }
    curveLabel = label || 'Custom';
    cancelAnimation('curve'); $('curve-tracer').setAttribute('hidden', '');
    drawCurve();
  }
  function drawCurve() {
    if (!drag) graphRange = { min: Math.min(0, curve[1], curve[3]), max: Math.max(1, curve[1], curve[3]) };
    var path = curvePath(curve, 30, 252, 394, 240, graphRange.min, graphRange.max);
    $('curve-path').setAttribute('d', path);
    $('curve-area').setAttribute('d', path + ' L424,252 L30,252 Z');
    var endpoints = all('.endpoint');
    endpoints[0].setAttribute('cy', graphY(0)); endpoints[1].setAttribute('cy', graphY(1));
    document.querySelector('.axis-line').setAttribute('d', 'M30 12V252H424');
    document.querySelector('.diagonal-line').setAttribute('d', 'M30,' + graphY(0) + ' 424,' + graphY(1));
    document.querySelector('.graph-annotation-top span').textContent = graphRange.max.toFixed(1);
    $('axis-y-min').textContent = graphRange.min.toFixed(1);
    $('axis-y-mid').textContent = ((graphRange.max + graphRange.min) / 2).toFixed(1);
    [0, 1].forEach(function (i) {
      var handle = $('handle-' + (i + 1));
      var line = $('handle-line-' + (i + 1));
      var px = graphX(curve[i * 2]), py = graphY(curve[i * 2 + 1]);
      handle.setAttribute('cx', px); handle.setAttribute('cy', py);
      handle.setAttribute('aria-valuenow', curve[i * 2]);
      handle.setAttribute('aria-valuetext', 'X ' + curve[i * 2] + ', Y ' + curve[i * 2 + 1]);
      line.setAttribute('x1', graphX(i)); line.setAttribute('y1', graphY(i)); line.setAttribute('x2', px); line.setAttribute('y2', py);
    });
    ['x1', 'y1', 'x2', 'y2'].forEach(function (id, i) { $(id).value = round(curve[i]); });
    $('curve-code').value = curve.map(round).join(', ');
    $('curve-name').textContent = curveLabel;
    all('.curve-preset').forEach(function (button) { var active = Core.presets[Number(button.dataset.index)].curve.every(function (value, index) { return Math.abs(value - curve[index]) < 0.001; }); button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    $('preview-object').style.left = '0%';
    $('preview-progress').style.width = '0%';
    $('curve-preview-time').textContent = '0.0 / 1.2s';
  }
  Core.presets.forEach(function (preset, index) {
    var button = document.createElement('button'); button.className = 'curve-preset'; button.dataset.index = index; button.setAttribute('aria-pressed', 'false'); button.title = preset.curve.join(', '); button.innerHTML = miniCurve(preset.curve);
    var label = document.createElement('span'); label.textContent = preset.name; button.appendChild(label);
    button.addEventListener('click', function () { updateCurve(preset.curve, preset.name); if (!reducedMotion()) previewCurve(); });
    $('curve-presets').appendChild(button);
  });
  $('preset-count').textContent = String(Core.presets.length).padStart(2, '0');
  ['x1', 'y1', 'x2', 'y2'].forEach(function (id, index) { $(id).addEventListener('change', function () { var next = curve.slice(); next[index] = $(id).value.trim() ? Number($(id).value) : NaN; updateCurve(next); }); });
  function commitCurveCode() { try { updateCurve(Core.parseCurve($('curve-code').value)); } catch (error) { drawCurve(); notify(error.message, true); } }
  $('curve-code').addEventListener('change', commitCurveCode);
  $('curve-code').addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); commitCurveCode(); } });
  [0, 1].forEach(function (index) {
    var handle = $('handle-' + (index + 1));
    handle.addEventListener('pointerdown', function (event) { event.preventDefault(); handle.focus(); drag = { index: index, pointerId: event.pointerId }; handle.setPointerCapture(event.pointerId); });
    handle.addEventListener('pointermove', function (event) {
      if (!drag || drag.index !== index || drag.pointerId !== event.pointerId) return;
      var svg = $('curve-editor'), point = svg.createSVGPoint(); point.x = event.clientX; point.y = event.clientY;
      var p = point.matrixTransform(svg.getScreenCTM().inverse());
      var next = curve.slice(); next[index * 2] = round(clamp((p.x - 30) / 394, 0, 1)); next[index * 2 + 1] = round(clamp(graphRange.min + (252 - p.y) * (graphRange.max - graphRange.min) / 240, -2, 3)); updateCurve(next);
    });
    function endDrag(event) { if (!drag || drag.index !== index) return; drag = null; if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId); drawCurve(); }
    handle.addEventListener('pointerup', endDrag); handle.addEventListener('pointercancel', endDrag);
    handle.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? .1 : .01; var next = curve.slice();
      if (event.key === 'ArrowLeft') next[index * 2] = clamp(round(next[index * 2] - step), 0, 1);
      else if (event.key === 'ArrowRight') next[index * 2] = clamp(round(next[index * 2] + step), 0, 1);
      else if (event.key === 'ArrowUp') next[index * 2 + 1] = clamp(round(next[index * 2 + 1] + step), -2, 3);
      else if (event.key === 'ArrowDown') next[index * 2 + 1] = clamp(round(next[index * 2 + 1] - step), -2, 3);
      else return;
      event.preventDefault(); updateCurve(next);
    });
  });
  $('reverse-curve').title = 'Reverse time: swap the ease-in and ease-out profiles';
  $('reverse-curve').addEventListener('click', function () { updateCurve([1 - curve[2], 1 - curve[3], 1 - curve[0], 1 - curve[1]].map(round)); });
  $('mirror-curve').title = 'Mirror the first handle around the center to make a symmetric curve';
  $('mirror-curve').addEventListener('click', function () { updateCurve([curve[0], curve[1], 1 - curve[0], 1 - curve[1]].map(round)); });
  $('reset-curve').addEventListener('click', function () { updateCurve(Core.presets[0].curve, Core.presets[0].name); });
  $('copy-curve').addEventListener('click', async function () {
    var text = 'cubic-bezier(' + curve.map(round).join(', ') + ')';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
      else { var area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.left = '-9999px'; document.body.appendChild(area); area.select(); var copied = document.execCommand('copy'); area.remove(); if (!copied) throw new Error('Clipboard unavailable'); }
      notify('Curve copied: ' + text);
    } catch (error) { $('curve-code').focus(); $('curve-code').select(); notify('Copy the selected curve values with Ctrl/Cmd+C.', true); }
  });
  function previewCurve() {
    cancelAnimation('curve');
    if (reducedMotion()) { $('preview-object').style.left = '100%'; $('preview-progress').style.width = '100%'; $('curve-preview-time').textContent = '1.2 / 1.2s'; $('curve-tracer').setAttribute('hidden', ''); return; }
    var start = performance.now(); $('curve-tracer').removeAttribute('hidden');
    function tick(now) {
      var elapsed = now - start; var t = clamp(elapsed / 1200, 0, 1); var y = Core.sampleCurve(curve, t);
      $('preview-object').style.left = (clamp(y, 0, 1) * 100) + '%'; $('preview-progress').style.width = (clamp(y, 0, 1) * 100) + '%'; $('curve-preview-time').textContent = (t * 1.2).toFixed(1) + ' / 1.2s'; $('curve-tracer').setAttribute('cx', graphX(t)); $('curve-tracer').setAttribute('cy', graphY(y));
      if (elapsed < 1600) animations.curve = requestAnimationFrame(tick);
      else if (settings.repeat && activePage === 'ease' && !document.hidden) { start = now; animations.curve = requestAnimationFrame(tick); }
      else { $('curve-tracer').setAttribute('hidden', ''); animations.curve = null; }
    }
    animations.curve = requestAnimationFrame(tick);
  }
  $('preview-curve').addEventListener('click', previewCurve);
  $('apply-ease').addEventListener('click', function () { runHost('easing.apply', { curve: curve.slice() }, this); });

  function chooseLibrary(name) {
    activeLibrary = name;
    $('curve-presets').hidden = name !== 'built-in';
    $('saved-curves').hidden = name !== 'saved';
    ['built-in', 'saved'].forEach(function (value) { var button = $('library-' + value); button.classList.toggle('active', name === value); button.setAttribute('aria-pressed', String(name === value)); });
  }
  $('library-built-in').addEventListener('click', function () { chooseLibrary('built-in'); });
  $('library-saved').addEventListener('click', function () { chooseLibrary('saved'); });

  function renderLibrary() {
    $('saved-curves').textContent = '';
    if (!savedCurves.length) { $('saved-curves').innerHTML = '<div class="library-empty"><strong>No saved curves</strong>Use + to save the current curve.</div>'; return; }
    savedCurves.forEach(function (preset, index) {
      var row = document.createElement('div'); row.className = 'saved-curve';
      var button = document.createElement('button'); button.innerHTML = miniCurve(preset.curve); var label = document.createElement('span'); label.textContent = preset.name; button.appendChild(label); button.title = preset.name;
      button.addEventListener('click', function () { updateCurve(preset.curve, preset.name); });
      var remove = document.createElement('button'); remove.className = 'icon-button compact'; remove.innerHTML = icon('trash'); remove.setAttribute('aria-label', 'Delete ' + preset.name + ' from library'); remove.title = 'Delete saved curve';
      remove.addEventListener('click', function () { var next = savedCurves.slice(); next.splice(index, 1); if (persistLibrary(next)) { renderLibrary(); notify('Removed “' + preset.name + '” from your library.'); } });
      row.appendChild(button); row.appendChild(remove); $('saved-curves').appendChild(row);
    });
  }
  function openModal(title, content, setup) {
    lastFocus = document.activeElement; $('modal-title').textContent = title; $('modal-content').innerHTML = content; $('modal').hidden = false;
    if (setup) setup();
    var focusable = $('modal-content').querySelector('input,button,select'); (focusable || $('close-modal')).focus();
  }
  function closeModal() { $('modal').hidden = true; if (lastFocus && document.contains(lastFocus)) lastFocus.focus(); }
  $('close-modal').addEventListener('click', closeModal);
  $('modal').addEventListener('click', function (event) { if (event.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', function (event) {
    if ($('modal').hidden) return;
    if (event.key === 'Escape') { event.preventDefault(); closeModal(); }
    if (event.key === 'Tab') { var focusables = all('#modal button,#modal input,#modal select').filter(function (node) { return !node.disabled && !node.hidden; }); var first = focusables[0], last = focusables[focusables.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); } }
  });
  $('save-curve').addEventListener('click', function () {
    if (savedCurves.length >= 200) { notify('Your library has reached 200 curves. Remove an unused curve before saving another.', true); return; }
    openModal('Save curve', '<p>Keep this curve in your local library. Export the library to take it to another machine.</p><form id="save-curve-form"><label class="modal-label" for="save-name">Curve name</label><input id="save-name" class="modal-input" maxlength="64" required autocomplete="off"><div class="modal-actions"><button class="secondary-button" id="cancel-save" type="button">Cancel</button><button class="primary-button" type="submit">Save curve</button></div></form>', function () {
      $('save-name').value = curveLabel === 'Custom' ? 'My curve' : curveLabel; $('cancel-save').addEventListener('click', closeModal);
      $('save-curve-form').addEventListener('submit', function (event) { event.preventDefault(); var name = $('save-name').value.trim(); if (!name) { $('save-name').focus(); return; } var next = savedCurves.concat([{ id: 'curve-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), name: name, curve: curve.slice() }]); if (persistLibrary(next)) { renderLibrary(); chooseLibrary('saved'); curveLabel = name; drawCurve(); closeModal(); notify('“' + name + '” saved to your library.'); } });
    }); $('save-name').select();
  });
  $('import-curves').addEventListener('click', function () { $('library-file').click(); });
  $('library-file').addEventListener('change', function () {
    var file = this.files && this.files[0]; if (!file) return;
    if (file.size > 512000) { notify('Choose a curve library smaller than 500 KB.', true); this.value = ''; return; }
    var reader = new FileReader();
    reader.onload = function () {
      attempt(function () {
        var imported = Core.validateLibrary(JSON.parse(String(reader.result))); var next = savedCurves.slice(); var added = 0;
        imported.forEach(function (item) { if (!next.some(function (existing) { return existing.name === item.name && existing.curve.every(function (value, index) { return value === item.curve[index]; }); })) { next.push({ id: 'import-' + Date.now() + '-' + added, name: item.name, curve: item.curve }); added++; } });
        next = Core.validateLibrary(next);
        if (persistLibrary(next)) { renderLibrary(); chooseLibrary('saved'); notify(added ? 'Imported ' + added + ' curve' + (added === 1 ? '' : 's') + ' into your library.' : 'These curves are already in your library.'); }
      }); $('library-file').value = '';
    };
    reader.onerror = function () { notify('That file could not be read.', true); $('library-file').value = ''; };
    reader.readAsText(file);
  });
  $('export-curves').addEventListener('click', function () {
    var data = JSON.stringify({ schemaVersion: 1, curves: savedCurves }, null, 2);
    var url = URL.createObjectURL(new Blob([data], { type: 'application/json' })); var link = document.createElement('a'); link.href = url; link.download = 'kinetic-curves.json'; document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 30000); notify('Curve library export requested (' + savedCurves.length + ' curves).');
  });

  function textPayload() { return { preset: selectedText, unit: $('text-unit').value, direction: $('text-direction').value, mode: $('text-mode').value, duration: readNumber('text-duration', .05, 30), stagger: readNumber('text-stagger', 0, 5), distance: readNumber('text-distance', 0, 2000), reverse: $('text-reverse').checked, overshoot: readNumber('text-overshoot', 0, 200) / 100 }; }
  textPresets.forEach(function (preset) {
    var button = document.createElement('button'); button.className = 'text-preset' + (preset.id === selectedText ? ' active' : ''); button.dataset.preset = preset.id; button.setAttribute('aria-pressed', String(preset.id === selectedText));
    var glyph = document.createElement('span'); glyph.className = 'text-preset-glyph'; glyph.textContent = preset.glyph; var label = document.createElement('span'); label.textContent = preset.name; button.appendChild(glyph); button.appendChild(label);
    button.addEventListener('click', function () { selectedText = preset.id; if (selectedText === 'slide') $('text-direction').value = 'left'; else if (selectedText === 'rise') $('text-direction').value = 'up'; all('.text-preset').forEach(function (item) { var active = item.dataset.preset === selectedText; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); }); previewText(); }); $('text-presets').appendChild(button);
  });
  function buildTextPreview(unit) {
    var container = $('text-preview'); container.textContent = '';
    ['Make it move'].forEach(function (line) {
      var lineNode = document.createElement('span'); lineNode.className = 'text-line'; var pieces = unit === 'lines' ? [line] : unit === 'words' ? line.match(/\S+\s*/g) : line.split('');
      pieces.forEach(function (piece) { var span = document.createElement('span'); span.className = 'text-unit'; span.textContent = piece; lineNode.appendChild(span); }); container.appendChild(lineNode);
    });
    return all('#text-preview .text-unit');
  }
  function previewText() {
    var config = attempt(textPayload); if (!config) return;
    cancelAnimation('text'); var units = buildTextPreview(config.unit);
    if (reducedMotion()) return;
    var start = performance.now(); var inTime = config.duration + (units.length - 1) * config.stagger; var total = config.mode === 'both' ? inTime * 2 + .8 : inTime + .6;
    function ease(t) { var c = 1.70158 * config.overshoot; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); }
    function tick(now) {
      var elapsed = (now - start) / 1000;
      units.forEach(function (span, index) {
        var order = config.reverse ? units.length - 1 - index : index; var t = clamp((elapsed - order * config.stagger) / config.duration, 0, 1);
        var outPhase = config.mode === 'out' || (config.mode === 'both' && elapsed > inTime + .8);
        if (config.mode === 'both' && outPhase) t = clamp((elapsed - inTime - .8 - order * config.stagger) / config.duration, 0, 1);
        var p = outPhase ? ease(1 - t) : ease(t); var displacement = (1 - p) * Math.min(config.distance, 130); var dx = 0, dy = 0, scale = 1, rotation = 0, blur = 0;
        if (selectedText === 'rise' || selectedText === 'slide') { var direction = config.direction; if (direction === 'up') dy = displacement; else if (direction === 'down') dy = -displacement; else if (direction === 'left') dx = displacement; else dx = -displacement; }
        if (selectedText === 'pop') scale = Math.max(.01, p);
        if (selectedText === 'spin') rotation = (1 - p) * (config.direction === 'up' || config.direction === 'left' ? -90 : 90);
        if (selectedText === 'blur') blur = Math.max(0, (1 - p) * Math.min(config.distance / 2, 30));
        span.style.opacity = clamp(p, 0, 1); span.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ') rotate(' + rotation + 'deg)'; span.style.filter = blur > .01 ? 'blur(' + blur + 'px)' : '';
      });
      if (elapsed < total) animations.text = requestAnimationFrame(tick);
      else if (settings.repeat && activePage === 'text' && !document.hidden) { start = now; animations.text = requestAnimationFrame(tick); }
      else animations.text = null;
    }
    animations.text = requestAnimationFrame(tick);
  }
  $('preview-text').addEventListener('click', previewText);
  all('[data-text-unit]').forEach(function (button) {
    button.addEventListener('click', function () {
      $('text-unit').value = button.dataset.textUnit;
      all('[data-text-unit]').forEach(function (item) { var active = item.dataset.textUnit === $('text-unit').value; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); });
      previewText();
    });
  });
  $('text-unit').addEventListener('change', function () { all('[data-text-unit]').forEach(function (item) { var active = item.dataset.textUnit === $('text-unit').value; item.classList.toggle('active', active); item.setAttribute('aria-pressed', String(active)); }); });
  all('#page-text input,#page-text select').forEach(function (input) { input.addEventListener('change', previewText); });
  $('apply-text').addEventListener('click', function () { var payload = attempt(textPayload); if (payload) runHost('text.animate', payload, this); });
  $('clear-text').addEventListener('click', function () { runHost('text.clear', {}, this); });

  var layerKinds = [{ kind: 'text', label: 'Text', icon: 'text' }, { kind: 'solid', label: 'Solid', icon: 'square' }, { kind: 'adjustment', label: 'Adjustment', icon: 'adjust' }, { kind: 'null', label: 'Null', icon: 'null' }, { kind: 'rectangle', label: 'Rectangle', icon: 'square' }, { kind: 'ellipse', label: 'Ellipse', icon: 'circle' }, { kind: 'camera', label: 'Camera', icon: 'camera' }, { kind: 'light', label: 'Light', icon: 'light' }];
  layerKinds.forEach(function (item) {
    var button = document.createElement('button'); button.className = 'create-layer'; button.innerHTML = icon(item.icon); var label = document.createElement('span'); label.textContent = item.label; button.appendChild(label); button.setAttribute('aria-label', 'Create ' + item.label.toLowerCase() + ' layer');
    button.addEventListener('click', function () { var payload = attempt(function () { var value = { kind: item.kind, color: $('layer-color').value, text: $('layer-text').value }; if ($('layer-name').value.trim()) value.name = $('layer-name').value.trim(); if ($('layer-width').value.trim()) value.width = readNumber('layer-width', 1, 30000, true); if ($('layer-height').value.trim()) value.height = readNumber('layer-height', 1, 30000, true); return value; }); if (payload) runHost('layers.create', payload, button); }); $('layer-creators').appendChild(button);
  });
  $('layer-color').addEventListener('input', function () { $('layer-color-value').textContent = this.value.toUpperCase(); });
  ['Top left', 'Top center', 'Top right', 'Middle left', 'Center', 'Middle right', 'Bottom left', 'Bottom center', 'Bottom right'].forEach(function (label, index) { var button = document.createElement('button'); button.title = label; button.setAttribute('aria-label', 'Set anchor to ' + label.toLowerCase()); button.addEventListener('click', function () { runHost('layers.tool', { op: 'anchor', anchor: [(index % 3) / 2, Math.floor(index / 3) / 2] }, button); }); $('anchor-grid').appendChild(button); });
  [{ op: 'parentNull', name: 'Parent null', icon: 'null', title: 'Parent selected supported layers to a new null' }, { op: 'duplicate', name: 'Duplicate', icon: 'copy', title: 'Duplicate selected layers' }, { op: 'reverse', name: 'Reverse', icon: 'layers', title: 'Reverse selected layer stack order' }, { op: 'trim', name: 'Trim', icon: 'square', title: 'Trim selected layers to the work area' }, { op: 'center', name: 'Center', icon: 'grid', title: 'Center selected supported layers in the composition' }].forEach(function (item) { var button = document.createElement('button'); button.title = item.title; var label = document.createElement('span'); label.textContent = item.name; button.appendChild(label); button.insertAdjacentHTML('beforeend', icon(item.icon)); button.addEventListener('click', function () { runHost('layers.tool', { op: item.op }, button); }); $('layer-utilities').appendChild(button); });
  $('sequence-layers').addEventListener('click', function () { var frames = attempt(function () { return readNumber('sequence-frames', 0, 10000, true); }); if (frames !== null) runHost('layers.tool', { op: 'sequence', frames: frames }, this); });
  $('rename-layers').addEventListener('click', function () { var prefix = $('rename-prefix').value.trim(); if (!prefix) { $('rename-prefix').focus(); notify('Enter a name prefix for the selected layers.', true); return; } runHost('layers.tool', { op: 'rename', prefix: prefix }, this); });
  $('quick-anchor').addEventListener('click', function () { runHost('layers.tool', { op: 'anchor', anchor: [.5, .5] }, this); });
  $('quick-null').addEventListener('click', function () { runHost('layers.create', { kind: 'null' }, this); });
  $('quick-duplicate').addEventListener('click', function () { runHost('layers.tool', { op: 'duplicate' }, this); });
  $('quick-sequence').addEventListener('click', function () { var frames = attempt(function () { return readNumber('sequence-frames', 0, 10000, true); }); if (frames !== null) runHost('layers.tool', { op: 'sequence', frames: frames }, this); });

  function chooseMotion(name) {
    selectedMotion = name; var preset = motionPresets.find(function (item) { return item.id === name; });
    $('motion-title').textContent = preset.name; $('motion-description').textContent = preset.description; $('motion-caption').textContent = preset.name + ' preview'; $('motion-requirements').textContent = preset.requirements;
    var tunable = name === 'wiggle' || name === 'overshoot'; $('frequency-field').hidden = !tunable; $('amplitude-field').hidden = !tunable; $('decay-field').hidden = name !== 'overshoot';
    document.querySelector('#amplitude-field label span').textContent = name === 'overshoot' ? 'velocity %' : 'property units';
    all('.motion-preset').forEach(function (button) { var active = button.dataset.preset === name; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
    previewMotion();
  }
  motionPresets.forEach(function (preset) { var button = document.createElement('button'); button.className = 'motion-preset'; button.dataset.preset = preset.id; var glyph = document.createElement('span'); glyph.className = 'motion-glyph'; glyph.textContent = preset.glyph; var label = document.createElement('span'); label.textContent = preset.name; button.appendChild(glyph); button.appendChild(label); button.addEventListener('click', function () { chooseMotion(preset.id); }); $('motion-presets').appendChild(button); });
  function motionPayload() { return { preset: selectedMotion, frequency: selectedMotion === 'wiggle' || selectedMotion === 'overshoot' ? readNumber('motion-frequency', .01, 100) : 2, amplitude: selectedMotion === 'wiggle' || selectedMotion === 'overshoot' ? readNumber('motion-amplitude', 0, 10000) : 20, decay: selectedMotion === 'overshoot' ? readNumber('motion-decay', .1, 100) : 5 }; }
  function previewMotion() {
    cancelAnimation('motion'); $('motion-object').style.transform = '';
    if (activePage !== 'motion' || reducedMotion()) return;
    var config = attempt(motionPayload); if (!config) return;
    var start = performance.now();
    function tick(now) {
      var t = (now - start) / 1000; var x = 0, y = 0, rotation = 0; var amplitude = Math.min(config.amplitude, 75), freq = Math.min(config.frequency, 10);
      if (selectedMotion === 'wiggle') { x = (Math.sin(t * freq * 3.7) + Math.sin(t * freq * 7.1) * .32) * amplitude; y = (Math.cos(t * freq * 4.9) + Math.sin(t * freq * 2.3) * .3) * amplitude * .6; rotation = Math.sin(t * freq * 3) * 5; }
      else if (selectedMotion === 'loop') { var loop = (t % 1.8) / 1.8; x = (Core.sampleCurve([.42, 0, .58, 1], loop) - .5) * 140; rotation = loop * 90; }
      else if (selectedMotion === 'pingpong') { x = Math.sin(t * 2.5 - Math.PI / 2) * 70; rotation = Math.sin(t * 2.5) * 9; }
      else { var phase = t % 2.7; x = phase < .45 ? -75 + Core.sampleCurve([.42, 0, .58, 1], phase / .45) * 75 : Math.sin((phase - .45) * freq * 2 * Math.PI) * amplitude * Math.exp(-config.decay * (phase - .45)); }
      $('motion-object').style.transform = 'translate(' + x + 'px,' + y + 'px) rotate(' + rotation + 'deg)';
      if (t < 5.4 || (settings.repeat && activePage === 'motion' && !document.hidden)) animations.motion = requestAnimationFrame(tick);
      else animations.motion = null;
    }
    animations.motion = requestAnimationFrame(tick);
  }
  $('preview-motion').addEventListener('click', previewMotion);
  all('#page-motion input').forEach(function (input) { input.addEventListener('change', previewMotion); });
  $('apply-motion').addEventListener('click', function () { var payload = attempt(motionPayload); if (payload) runHost('motion.apply', payload, this); });
  $('clear-motion').addEventListener('click', function () { runHost('motion.clear', {}, this); });

  $('help-button').addEventListener('click', function () {
    openModal('Kinetic help', '<p><strong>Kinetic 0.2.0</strong> is an independent toolkit for After Effects 2025 and 2026. Everything starts with the active composition and your selection.</p><div class="help-entry"><strong>Ease · select keyframes first</strong><p>Select two or more keyframes on a numeric property. Drag a handle, use arrow keys (Shift for larger steps), or paste cubic-bezier values. For Position, use Separate Dimensions first. Spatial Position and Color are skipped. AE may clamp extreme endpoint influences.</p></div><div class="help-entry"><strong>Text · select text layers</strong><p>Choose a movement and apply it at the playhead. Animation uses native text animators. In and Out each start at the playhead. In + out starts at the playhead and ends its exit at the layer out point. Remove clears Kinetic animators only.</p></div><div class="help-entry"><strong>Layers · keep building</strong><p>Create a layer with optional naming, fill, and size. Layer utilities affect your selection. Trim uses the work area; reverse changes stack order. Anchor relocation preserves the artwork position. Anchor and Parent to null require static, unparented 2D layers.</p></div><div class="help-entry"><strong>Motion · select properties</strong><p>Select numeric properties to add an expression. Loop, Ping-pong, and Overshoot need at least two keyframes. Existing unrelated expressions are preserved. Remove clears Kinetic expressions only.</p></div><div class="help-entry"><strong>Your work stays local</strong><p>Saved curves live in this panel’s local storage. Export JSON for a backup. Browser previews demonstrate the controls; editing a composition requires the installed After Effects extension. All preview animations are illustrative.</p></div><div class="help-entry"><strong>Undo</strong><p>Use Edit → Undo in After Effects to undo an applied action.</p></div>');
  });
  $('settings-button').addEventListener('click', function () {
    openModal('Settings', '<p>Preview and local storage preferences.</p><label class="settings-row"><input type="checkbox" id="setting-repeat"><span>Repeat previews<small>Keep curve, text, and motion previews playing.</small></span></label><label class="settings-row"><input type="checkbox" id="setting-reduce"><span>Reduce motion<small>Show static previews. Your system preference is always respected.</small></span></label><div class="help-entry"><strong>Local by design</strong><p>No account, uploads, or network assets. Settings and saved curves stay on this device.</p></div>', function () {
      $('setting-repeat').checked = settings.repeat; $('setting-reduce').checked = settings.reduceMotion;
      $('setting-repeat').addEventListener('change', function () { settings.repeat = this.checked; storeSettings(); });
      $('setting-reduce').addEventListener('change', function () { settings.reduceMotion = this.checked; storeSettings(); cancelAnimations(); if (activePage === 'text') buildTextPreview($('text-unit').value); if (activePage === 'motion') $('motion-object').style.transform = ''; });
    });
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) cancelAnimations(); else refreshStatus(false); });
  drawCurve(); renderLibrary(); buildTextPreview('characters'); chooseMotion('wiggle'); refreshStatus(false);
}());
