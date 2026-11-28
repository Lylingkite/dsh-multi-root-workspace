import assert from 'node:assert/strict';
import { detectCrossReferences } from '../project-scan.js';
const peer = (id, name) => ({ id, name, projectName: name });
const target = {
  id: 'a', name: 'gateway', projectName: 'etmsGateway',
  dependencies: ['express', 'etms-core'],
  modules: [{ path: 'src/client.js', imports: ['../etms/client', 'express', '@scope/etms-gateway'] }],
};
const peers = [peer('b', 'etms'), peer('c', 'unrelated'), peer('d', 'etms')];
const found = detectCrossReferences(target, peers);
assert.equal(found.length, 2, 'both peers named etms are reported');
assert.deepEqual(found.map(row => row.toId).sort(), ['b', 'd']);
assert.ok(found.every(row => row.fromId === 'a'));
assert.match(found[0].evidence.join(' '), /import 引用/);

// A short or shared name must never become a relationship.
assert.deepEqual(detectCrossReferences({ ...target, modules: [], dependencies: [] }, peers), []);
assert.deepEqual(detectCrossReferences({ id: 'a', name: 'app', modules: [{ imports: ['etms/x'] }] }, [peer('e', 'et')]), [], 'two-letter names are too weak');
assert.deepEqual(detectCrossReferences(target, []), []);
assert.deepEqual(detectCrossReferences(target, [{ id: 'a', name: 'etms' }]), [], 'never relates a project to itself');
// Self-name must not match its own import paths.
assert.deepEqual(detectCrossReferences({ id: 'x', name: 'etms', modules: [{ imports: ['etms/internal'] }] }, [peer('y', 'etms')]), []);
// A dependency entry counts only when it names the peer exactly.
const byDep = detectCrossReferences({ id: 'a', name: 'gw', dependencies: ['etms'], modules: [] }, [peer('b', 'etms')]);
assert.equal(byDep.length, 1);
assert.match(byDep[0].evidence.join(' '), /依赖清单/);
// Data lineage: a downstream query reading tables an upstream project defines.
import { detectDataLineage, definedTables, referencedTables } from '../project-scan.js';
const upstreamSql = [
  'CREATE TABLE `tr_registry` (id int);',
  'CREATE TABLE `as_inventory` (id int);',
  'CREATE TABLE `fm_pay_bill` (id int);',
];
const downstreamSql = [`
-- 库表依据：数据库DDL 下的 tr_registry、as_inventory
SELECT r.id, inv.id FROM tr_registry r JOIN as_inventory inv ON inv.id = r.id;
SELECT * FROM fm_pay_bill;
`];
assert.deepEqual([...definedTables(upstreamSql)], ['tr_registry', 'as_inventory', 'fm_pay_bill']);
const reads = referencedTables(downstreamSql);
assert.ok(['tr_registry', 'as_inventory', 'fm_pay_bill'].every(name => reads.has(name)));
const lineage = detectDataLineage(
  { id: 'down', name: '报告取数', sql: downstreamSql },
  [{ id: 'up', name: '数据库DDL', sql: upstreamSql }],
);
assert.equal(lineage.length, 1);
assert.equal(lineage[0].fromId, 'down');
assert.equal(lineage[0].toId, 'up');
assert.match(lineage[0].evidence[0], /读取表/);
assert.ok(lineage[0].tables.includes('tr_registry'));
// No lineage without a real shared table, and a project never becomes its own upstream.
assert.deepEqual(detectDataLineage({ id: 'd', name: 'x', sql: ['SELECT * FROM nothing_here;'] }, [{ id: 'up', name: 'y', sql: upstreamSql }]), []);
assert.deepEqual(detectDataLineage({ id: 'u', name: 'y', sql: upstreamSql }, [{ id: 'u', name: 'y', sql: upstreamSql }]), []);
// The prompt must carry table evidence so the data sections are grounded.
import { structurePrompt } from '../project-scan.js';
const prompt = JSON.parse(structurePrompt({
  projectName: 'demo', definedTables: ['own_table'], sql: [{ path: 'q.sql', text: 'SELECT * FROM own_table JOIN peer_table;' }],
}, []));
assert.deepEqual(prompt.dataEvidence.definesTables, ['own_table']);
assert.ok(prompt.dataEvidence.readsTables.includes('peer_table'));
assert.ok(!prompt.dataEvidence.readsTables.includes('own_table'), 'a defined table is not reported as external');
console.log('PASS: cross-project references need a real import segment or manifest dependency, ignore weak names');
