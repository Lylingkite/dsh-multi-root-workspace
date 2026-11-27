import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { setTimeout as wait } from 'node:timers/promises';

const source = await fs.readFile(new URL('../client.js', import.meta.url), 'utf8');
const start = source.indexOf('    function Folder()');
const end = source.indexOf('    const css =', start);
assert(start >= 0 && end > start, 'summary UI helpers not found');
const helpers = new Function(source.slice(start, end) + '\nreturn {summarizeInitial,shouldDescribe,summaryDraft,summaryPrune,summarizeChanges};')();
const { summarizeInitial, shouldDescribe, summaryDraft, summaryPrune, summarizeChanges } = helpers;

// Existing descriptions are editable; missing folders still get a row, and
// rows not present in the workspace are never imported into the dialog.
let state = summarizeInitial({ descriptions: [
  { path: '/work/api', text: 'existing note' },
  { path: '/removed', text: 'stale note' },
] }, ['/work/api', '/work/web']);
assert.equal(state['/work/api'].text, 'existing note');
assert.equal(state['/work/api'].baseline, 'existing note');
assert.equal(state['/work/web'].text, '');
assert(!Object.hasOwn(state, '/removed'), 'stale host rows are ignored');
for (const path of ['/work/api', '/work/web']) {
  assert(Object.hasOwn(state, path), 'every folder gets an editable description row');
}

// Automatic drafts are only requested for folders without a description.
assert.equal(shouldDescribe(state, '/work/api', 'existing note'), false);
assert.equal(shouldDescribe(state, '/work/web', ''), true);
assert.equal(shouldDescribe(state, '/missing', ''), false, 'no request for a removed folder');
state = { ...state, '/work/web': { ...state['/work/web'], loading: true } };
assert.equal(shouldDescribe(state, '/work/web', ''), false, 'a single in-flight request is not repeated');

// A successful draft is stored as the new baseline, so it counts as saved
// data only if the user later edits it. An empty draft cannot mark a folder
// as described: it would be indistinguishable from "not yet generated".
const drafts = new Map([['/work/web', 'Web frontend with Vite and React']]);
state = summaryDraft(state, '/work/web', drafts.get('/work/web'), true);
assert.equal(state['/work/web'].text, drafts.get('/work/web'));
assert.equal(state['/work/web'].baseline, drafts.get('/work/web'));
assert.equal(state['/work/web'].loading, false);
assert.equal(shouldDescribe(state, '/work/web', drafts.get('/work/web')), false);
state = summaryDraft(state, '/work/web', 'delayed duplicate', true);
assert.equal(state['/work/web'].text, drafts.get('/work/web'), 'duplicate draft ignored after loading is cleared');

// A manual edit always wins over a late automatic draft, and a failed draft
// is nonblocking: the folder stays editable with a failure indication.
state = { ...state, '/work/web': { ...state['/work/web'], loading: true, touched: true, text: 'my note' } };
const manual = summaryDraft(state, '/work/web', 'auto draft that arrived too late', true);
assert.equal(manual, state, 'manual edit is never overwritten by a stale draft');
state = { ...state, '/work/api': { ...state['/work/api'], loading: true } };
state = summaryDraft(state, '/work/api', '', false);
assert.equal(state['/work/api'].failed, true);
assert.equal(state['/work/api'].loading, false);
assert.equal(state['/work/api'].text, 'existing note');

// Removing a folder drops its row and makes its in-flight draft harmless.
state = summaryPrune(state, ['/work/web']);
assert(!Object.hasOwn(state, '/work/api'), 'removed folder no longer has a row');
assert.equal(shouldDescribe(state, '/work/api', 'existing note'), false, 'no stale draft after removal');

// Save sends only changed/new rows; clearing a description explicitly is a
// real change and must be represented by an empty string, not by omission.
const original = { descriptions: [
  { path: '/work/web', text: 'Web frontend with Vite and React' },
  { path: '/work/old', text: 'untouched' },
] };
let changes = summarizeChanges({ '/work/web': { text: '' }, '/work/old': { text: 'untouched' } }, original);
assert.deepEqual(changes, [{ path: '/work/web', text: '' }], 'explicit empty text is saved');
changes = summarizeChanges({ '/work/new': { text: 'new folder' }, '/work/old': { text: 'untouched' } }, original);
assert.deepEqual(changes, [{ path: '/work/new', text: 'new folder' }], 'only changed/new rows are sent');
assert.deepEqual(summarizeChanges({}, original), []);

// The dialog asks for the exact host command contract and renders status in
// the component's own localized strings; no DOM outside the component.
assert.match(source, /action:'describe', workspaceId: request\.workspaceId, path/);
assert.match(source, /action:'save', workspaceId: request\.workspaceId, primary, roots, revision:data\.revision, descriptions/);
assert.match(source, /describePlaceholder: /);
assert.match(source, /describeFailed: /);
assert.match(source, /describeLoading: /);
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

console.log('PASS: folder description UI lifecycle — editable rows, async describe, no manual overwrite, no stale draft, nonblocking failure, pruning, dirty/save, localization, component-scoped DOM, deletion coalescing');
