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

test('script action is allowed only through the host and never evaluated by browser preview', async () => {
  const preview = bridge();
  assert.equal((await preview.call('scripts.run', {code: 'throw new Error("must not execute here");'})).ok, false);
  let received;
  const b = bridge((script, done) => {
    done(vm.runInNewContext(script, {Kinetic:{dispatch(request) {
      received = request;
      return JSON.stringify({ok:true,message:'Script completed.',data:{output:'host output',result:'7'}});
    }}}));
  });
  const userCode = 'print("quoted \\\" text");\napp.project.numItems; // \u2028 separator';
  const result = await b.call('scripts.run', {code:userCode});
  assert.equal(received.action, 'scripts.run'); assert.equal(received.payload.code, userCode);
  assert.equal(result.data.output, 'host output');
});

test('script bridge permits the full code limit including expanded JSON and rejects invalid input', async () => {
  let count = 0;
  const b = bridge((script, done) => { count++; done('{"ok":true,"message":"Accepted","data":{"output":"","result":""}}'); });
  for (const payload of [{}, {code:7}, {code:'\n \t'}, {code:'x'.repeat(100001)}]) {
    assert.equal((await b.call('scripts.run', payload)).ok, false);
  }
  assert.equal(count, 0);
  assert.equal((await b.call('scripts.run', {code:'x'.repeat(100000)})).ok, true);
  assert.equal((await b.call('scripts.run', {code:'\u0000'.repeat(100000)})).ok, true);
  assert.equal(count, 2);
  assert.equal((await b.call('layers.create', {name:'x'.repeat(21000)})).ok, false);
  assert.equal(count, 2);
});
