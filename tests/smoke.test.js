const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('AE smoke test still displays its failure report if layer creation fails', () => {
  const source = fs.readFileSync(path.join(__dirname,'ae-smoke.jsx'),'utf8').replace(/^\s*#include.*$/gm,'');
  let report;
  const comp = {name:'Test',numLayers:0,openInViewer(){},layer(){return null;}};
  const context = {
    app:{version:'25.0 mock',project:{items:{addComp(){return comp;}}}},
    Kinetic:{dispatch(){return JSON.stringify({ok:false,message:'Simulated host rejection'});}},
    $:{writeln(){}}, alert(text){report = text;}
  };
  assert.doesNotThrow(() => vm.runInNewContext(source, context));
  assert.match(report,/Simulated host rejection/);
  assert.match(report,/Text creation failed/);
  assert.match(report,/Failures:/);
});
