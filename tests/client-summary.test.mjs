import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';

const source = await fs.readFile(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('    function documentPaths(');
const end = source.indexOf('    class SettingsBoundary', start);
assert(start >= 0 && end > start, 'UI helpers not found');
const {documentPaths,documentCanGenerate,modelOptions,splitRoute,savedModelRoute,modelValue} = new Function(source.slice(start,end)+'\nreturn {documentPaths,documentCanGenerate,modelOptions,splitRoute,savedModelRoute,modelValue};')();
assert.doesNotMatch(source,/action:'describe'/);
assert.doesNotMatch(source,/className:'mr-description'/);
// Per-folder markdown paths: every saved root is listed, stale host rows are dropped,
// and document content is preserved from the host payload when present.
const rows = documentPaths({
  documents: [
    { path: '/work/api', document: null },
    { path: '/work/web', document: '# Web notes' },
    { path: '/work/attached', document: null, additional: true, included: true },
    { path: '/removed', document: 'stale' },
  ],
}, ['/work/api', '/work/web', '/work/attached', '/work/new']);
assert.deepEqual(rows, [
  { path: '/work/api', document: null },
  { path: '/work/web', document: '# Web notes' },
  { path: '/work/attached', document: null, additional: true, included: true },
  { path: '/work/new', document: null },
]);
assert.deepEqual(documentPaths(null, []), [], 'no roots means no document rows');
assert.deepEqual(documentPaths({documents:rows}, rows.map(row=>row.path)), rows, 'state and render normalization preserve the additional flag');
assert.doesNotMatch(source, /action:'document',/, 'refresh must use the workspace list, not overwrite its rows with old per-project lookup results');
assert.match(source, /row\.additional && h\('small'[^\n]+additionalTag/);
assert.match(source, /t\(row\.included\?'docIncluded':'docMissing'\)/);

// Generation is explicit: only available after the folder is saved and a
// provider/model ID is configured; blank model disables generation.
assert.equal(documentCanGenerate(true, 'workbuddy/hy4'), true);
assert.equal(documentCanGenerate(false, 'workbuddy/hy4'), false, 'unsaved workspace blocks generate');
assert.equal(documentCanGenerate(true, '  '), false, 'blank model blocks generate');
assert.equal(documentCanGenerate(true, null), false);

// Client wires the exact host protocol; generation is never triggered on attach
// or from folder description drafting, and the copy never mentions editing README.
// Generation is enqueued and polled so a slow model cannot freeze the dialog.
for (const action of ['documents','queue-document']) assert(source.includes(`action:'${action}'`), 'missing '+action);
assert.doesNotMatch(source, /action:'generate-document'/, 'the blocking generate path is gone');
assert.match(source, /waited < 120000/, 'polling is bounded');
assert.match(source, /setError\(t\('docTimeout'\)\)/, 'timeout is surfaced');
assert.match(source, /mr-tabs/, 'header exposes page tabs');
for (const tab of ['tabfolders','tabdocs','tabscan','tabrelations']) assert(source.includes(tab), 'missing '+tab);
assert.equal((source.match(/role:'tabpanel'/g)||[]).length,4,'exactly four tab panels');
assert.match(source, /hidden:tab!=='scan'[\s\S]{0,200}?baselinePanel[\s\S]{0,120}?proposalPanel/, 'scan progress and proposals share their own tab');
assert.match(source, /hidden:tab!=='docs'\},docPanel\)/, 'notes tab holds only the document panel');
assert(source.includes('README.md'));
assert.doesNotMatch(source,/action:'document-settings'|settingsPanel|setModelDraft/);
assert.match(source,/name:'settings.section'/);
assert.match(source,/modelCatalog\(\)/);
assert.deepEqual(modelOptions([{id:'p',name:'Provider',models:[{id:'org/m',name:'Model'},{id:'org/m'},null]}]),[{id:'p',label:'Provider',models:[{id:'org/m',label:'Model'}]}]);
assert.deepEqual(splitRoute('workbuddy/hy4flash-free'),{provider:'workbuddy',model:'hy4flash-free'});
assert.deepEqual(splitRoute(''),{provider:'',model:''});
const codex = modelOptions([{id:'openai-codex',models:[{id:'gpt-6.2-sol',name:'GPT-6.2 Sol'}]}, {id:'other',models:[{id:'org/model'}]}]);
const selected = codex[0].models[0];
const stored = modelValue(codex[0].id,selected.id);
assert.equal(stored,'openai-codex/gpt-6.2-sol');
assert.deepEqual(savedModelRoute(stored,codex),{provider:'openai-codex',model:selected.id});
assert.deepEqual(savedModelRoute('openai-codex/openai-codex/gpt-6.2-sol',codex),{provider:'openai-codex',model:selected.id});
assert.deepEqual(savedModelRoute('other/org/model',codex),{provider:'other',model:'org/model'});
assert.deepEqual(savedModelRoute('other/other/missing',codex),{provider:'other',model:'other/missing'});
assert.equal(modelValue('',''),'');
assert.equal(modelValue('other','org/model'),'other/org/model');
assert.match(source,/path:\['documentModel'\],value/);
assert.doesNotMatch(source,/t\('missing'\)\s*\+/);
assert.match(source, /grid-template-columns:minmax\(0,1fr\) minmax\(0,1fr\) auto/);
assert.match(source, /className:'mr-ms-card'/);
assert.match(source, /t\('discard'\)/);
assert.match(source, /text\[key\] \?\? key/);
assert.match(source, /settings\.section\.icon/);
// The relationships panel must actually be mounted in the dialog tree, not
// merely defined: a previous edit defined it and silently never rendered it.
assert.equal((source.match(/h\(WorkspaceRelations,\{/g) || []).length, 1);
assert.match(source, /hidden:tab!=='relations'\},[\s\S]{0,300}?h\(WorkspaceRelations,\{/, 'relationships panel lives in its own tab');

assert.match(source, /role:'tablist'/, 'header exposes a tab list');
for (const action of ['workspace-relations','save-workspace-relation','remove-workspace-relation']) assert(source.includes("'"+action+"'"), 'missing '+action);
assert.match(source, /data:image\/svg\+xml;base64,/);
assert.doesNotMatch(source, /sectionText/);
assert.match(source, /onClick:\(\)=>generateDocument\(activeDocPath\)/, 'generate is a separate explicit button');
assert.equal(/addManual\(\)[\s\S]{0,300}generate-document/.test(source), false, 'attach does not trigger generation');
assert.equal(/previewDescription\([^)]*\)[\s\S]{0,500}generate-document/.test(source), false, 'generation is not chained to description drafting');
assert.equal(/document\.(querySelector|getElementById|createElement)/.test(source), false, 'no global DOM lookups');
assert.equal(/window\.(document|location)\./.test(source), false, 'no DOM outside the component');

// Deletion coalescing still loads and behaves after the UI edit.
const installStart = source.indexOf('    function installDeleteCoalescing(');
const installEnd = source.indexOf('\n    return {\n      inject:', installStart);
assert(installStart >= 0 && installEnd > installStart);
const install = new Function(source.slice(installStart, installEnd) + '\nreturn installDeleteCoalescing;')();
let calls = [], dismissals = 0;
const controller = { track(...a) { calls.push(a); }, dismiss() { dismissals++; } };
const originalTrack = controller.track;
const service = { sessionOf() { return controller; } };
const sessionOf = service.sessionOf;
const dispose = install(service, 20);
service.sessionOf({});
let rev = 0;
const track = t => controller.track(t, t.length, {}, ++rev);
track('@/work/src/file'); calls = [];
for (const t of ['@/work/src/fil', '@/work/src/fi', '@/work/src/f']) track(t);
assert.equal(calls.length, 0);
assert.equal(dismissals, 1);
await wait(35);
assert.equal(calls.length, 1);
assert.equal(calls[0][0], '@/work/src/f');
track('@/work/s'); track(''); track('@/work/s');
dispose();
assert.equal(service.sessionOf, sessionOf);
assert.equal(controller.track, originalTrack);

console.log('PASS: document path UI, model setting, explicit generation, removed overlapping inline field');
