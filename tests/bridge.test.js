const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync(require('node:path').join(__dirname, '../js/bridge.js'), 'utf8');
function bridge(evalScript) {
  const context = {window: evalScript ? {__adobe_cep__:{evalScript}} : {}, setTimeout, clearTimeout, Promise};
  vm.runInNewContext(code, context);
  return context.window.KineticBridge;
}
test('browser preview cannot report a successful AE mutation', async () => {
  const b = bridge();
  assert.equal(b.isHost, false);
  assert.equal((await b.call('status')).data.preview, true);
  assert.equal((await b.call('layers.create', {kind:'null'})).ok, false);
});
test('bridge serializes payloads as data, escaping line separators and quotes', async () => {
  let seen;
  const b = bridge((script, done) => {
    const context = {Kinetic:{dispatch(request) { seen = request; return JSON.stringify({ok:true,message:'Created'}); }}};
    done(vm.runInNewContext(script, context));
    assert.ok(!script.includes('\u2028'));
  });
  const name = '\"); throw new Error("injected"); //\u2028test';
  assert.equal((await b.call('layers.create',{name})).ok, true);
  assert.equal(seen.payload.name, name);
});
test('bridge blocks unknown commands and reports host load/protocol errors', async () => {
  let count = 0;
  const b = bridge((script, done) => { count++; done('KINETIC_NOT_LOADED'); });
  assert.equal((await b.call('system.exec')).ok, false);
  assert.equal(count, 0);
  assert.match((await b.call('status')).message, /did not load/);
  assert.equal((await bridge((s,d) => d('{"ok":true}')).call('status')).ok, false);
});
test('concurrent commands never double-dispatch into AE', async () => {
  let finish, count = 0;
  const b = bridge((script, done) => { count++; finish = done; });
  const first = b.call('layers.create', {kind:'null'});
  assert.equal((await b.call('layers.create', {kind:'null'})).ok, false);
  assert.equal(count, 1);
  finish('{"ok":true,"message":"Created one layer"}');
  assert.equal((await first).ok, true);
});
