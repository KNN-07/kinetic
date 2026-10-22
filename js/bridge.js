(function (root) {
  'use strict';
  var cep = root.__adobe_cep__;
  var isHost = !!(cep && typeof cep.evalScript === 'function');
  var busy = false;
  var actions = ['status', 'easing.apply', 'layers.create', 'layers.tool', 'motion.apply', 'motion.clear', 'text.animate', 'text.clear'];
  function call(action, payload) {
    if (actions.indexOf(action) < 0) return Promise.resolve({ ok: false, message: 'Unknown Kinetic command.' });
    if (!isHost) {
      return Promise.resolve(action === 'status'
        ? { ok: true, message: 'Browser preview — open Kinetic inside After Effects to edit a composition.', data: { version: null, comp: null, layers: 0, properties: 0, keyframes: 0, preview: true } }
        : { ok: false, message: 'Preview only. Open Window → Extensions → Kinetic in After Effects to apply this action.' });
    }
    if (busy) return Promise.resolve({ ok: false, message: 'After Effects is processing the previous command. Please wait.' });
    var request;
    try {
      request = JSON.stringify({ action: action, payload: payload || {} }).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
      if (request.length > 20000) throw new Error('Command is too large.');
    } catch (error) { return Promise.resolve({ ok: false, message: error.message || 'Invalid command.' }); }
    busy = true;
    return new Promise(function (resolve) {
      // A timeout does not cancel ExtendScript. Keep the lock until its callback arrives
      // so a slow command cannot be duplicated by an automatic retry or another click.
      var done = false;
      var timer = setTimeout(function () {
        done = true;
        resolve({ ok: false, message: 'After Effects has not replied yet. Check for an open dialog; do not repeat the action. The panel will unlock when AE replies.' });
      }, 30000);
      try {
        var script = '(typeof Kinetic !== "undefined" && Kinetic.dispatch) ? Kinetic.dispatch(' + request + ') : "KINETIC_NOT_LOADED"';
        cep.evalScript(script, function (raw) {
          busy = false;
          clearTimeout(timer);
          if (done) return;
          done = true;
          try {
            if (raw === 'KINETIC_NOT_LOADED') throw new Error('Kinetic host script did not load. Reinstall the complete extension and restart After Effects.');
            if (!raw || raw === 'EvalScript error.') throw new Error('After Effects could not run the command. Close dialogs, check the composition, then try again.');
            var result = JSON.parse(raw);
            if (!result || typeof result.ok !== 'boolean' || typeof result.message !== 'string') throw new Error('After Effects returned an invalid response.');
            resolve(result);
          } catch (error) { resolve({ ok: false, message: error.message }); }
        });
      } catch (error) {
        busy = false;
        clearTimeout(timer);
        if (!done) { done = true; resolve({ ok: false, message: error.message || 'Unable to contact After Effects.' }); }
      }
    });
  }
  root.KineticBridge = { isHost: isHost, call: call };
}(window));
