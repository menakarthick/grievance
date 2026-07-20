'use strict';
const fs = require('fs');
const path = require('path');

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, '_bundled-openapi.json'), 'utf8'));
const collection = JSON.parse(fs.readFileSync(path.join(__dirname, 'Grievance-Platform.postman_collection.json'), 'utf8'));

// 1. Enumerate every operationId the spec actually defines.
const specOps = new Set();
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
for (const p of Object.keys(spec.paths)) {
  for (const m of METHODS) {
    const op = spec.paths[p][m];
    if (op) specOps.add(op.operationId);
  }
}

// 2. Walk the generated collection recursively, collecting operationId from each
//    leaf request item's description ("operationId: X").
const collectionOps = [];
function walk(items) {
  for (const it of items) {
    if (it.item) { walk(it.item); continue; }
    const desc = (it.request && it.request.description) || '';
    const m = desc.match(/operationId:\s*(\S+)/);
    collectionOps.push(m ? m[1] : null);
  }
}
walk(collection.item);

const missing = [...specOps].filter(id => !collectionOps.includes(id));
const extra = collectionOps.filter(id => !id || !specOps.has(id));
const dupes = collectionOps.filter((id, i) => collectionOps.indexOf(id) !== i);

console.log('Spec operations:', specOps.size);
console.log('Collection request items:', collectionOps.length);
console.log('Missing from collection:', missing.length, missing);
console.log('Extra/unrecognized in collection:', extra.length, extra);
console.log('Duplicated operationIds in collection:', [...new Set(dupes)]);

const ok = missing.length === 0 && extra.length === 0 && dupes.length === 0 && specOps.size === collectionOps.length;
console.log(ok ? '\nPASS: every operation represented exactly once.' : '\nFAIL: coverage mismatch.');
process.exit(ok ? 0 : 1);
