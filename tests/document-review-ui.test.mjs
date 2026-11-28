import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// UI contract test for the document-review flow. The browser is unavailable in
// this environment, so this checks the pure state helpers and the exact host
// protocol/flow wiring in client.js by source inspection, not by rendering.
const source = await fs.readFile(new URL('../client.js', import.meta.url), 'utf8');

// --- pure helpers ------------------------------------------------------------
const start = source.indexOf('    function documentPaths(');
const end = source.indexOf('    const SETTINGS_ID', start);
assert(start >= 0 && end > start, 'UI state helpers not found');
const { documentPaths, documentCanGenerate, documentBaselines, proposalItems, proposalPreview } =
  new Function(source.slice(start, end) + '\nreturn {documentPaths,documentCanGenerate,documentBaselines,proposalItems,proposalPreview};')();

// Baseline rows: per-project state, bounded reason/document, fail-closed on
// unknown states. Only host-reported rows are shown; a missing row is never
// misreported as a successful scan.
const roots = ['/work/api', '/work/web', '/work/new'];
const baselines = documentBaselines({
  baselines: [
    { path: '/work/api', state: 'ready', document: '/work/api/DSH-PROJECT.md' },
    { path: '/work/web', state: 'failed', reason: 'x'.repeat(500) },
    { path: '/work/new', state: 'scanning' },
    { path: '/ghost', state: 'pending' },
    { path: '/bad', state: 'bogus' },
    null,
  ],
}, roots);
assert.deepEqual(baselines.map(row => [row.path, row.state]), [
  ['/work/api', 'ready'],
  ['/work/web', 'failed'],
  ['/work/new', 'scanning'],
], 'stale /ghost and invalid-state rows are excluded');
assert.equal(baselines.find(row => row.path === '/work/web').reason.length, 300, 'reason is bounded');
assert.equal(baselines.find(row => row.path === '/work/api').document, '/work/api/DSH-PROJECT.md');
assert.deepEqual(documentBaselines(null, ['/solo']), [], 'no rows reported means no invented ready state');
assert.deepEqual(documentBaselines({}, []), []);
assert.deepEqual(documentBaselines({ baselines: [{ path: '/solo', state: 'pending' }] }, []), [{ path: '/solo', state: 'pending' }], 'rows shown when no roots supplied');

// Proposals: only well-formed id/summary survive; notice is preserved verbatim
// when present and null otherwise.
const proposals = proposalItems({
  items: [
    { id: 'p1', summary: 'A 负责订单' },
    { id: '', summary: 'no id' },
    { id: 'p2', summary: '' },
    null,
    { id: 'p3', summary: 'y'.repeat(1000) },
  ],
  notice: '有新提议',
});
assert.deepEqual(proposals.items.map(item => item.id), ['p1', 'p3']);
assert.equal(proposals.items[1].summary.length, 600, 'summary is bounded');
assert.equal(proposals.notice, '有新提议');
assert.deepEqual(proposalItems({ items: [{ id: 'x' }] }), { items: [], notice: null });

// Preview: must echo the requested id, carry a non-empty token and bounded
// diffs. Anything else is rejected so apply can never run without a preview.
const preview = proposalPreview({
  id: 'p1', token: 'tok-1',
  changes: [
    { path: '/work/api/DSH-PROJECT.md', diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new' },
  ],
}, 'p1');
assert.deepEqual(preview, {
  id: 'p1', token: 'tok-1',
  changes: [{ path: '/work/api/DSH-PROJECT.md', diff: '--- a\n+++ b\n@@ -1 +1 @@\n-old\n+new' }],
});
assert.equal(proposalPreview({ id: 'p1', token: 'tok-1', changes: [] }, 'p1'), null);
assert.equal(proposalPreview({ id: 'p1', token: '', changes: [{ path: '/p', diff: 'd' }] }, 'p1'), null);
assert.equal(proposalPreview({ id: 'other', token: 'tok', changes: [{ path: '/p', diff: 'd' }] }, 'p1'), null, 'id mismatch rejected');
assert.equal(proposalPreview(undefined, 'p1'), null);
assert.equal(proposalPreview({ id: 'p1', token: 'tok', changes: [{ path: '/p', diff: 'z'.repeat(50000) }] }, 'p1'), null, 'reject rather than truncating');

// Existing document-path contract stays intact.
assert.deepEqual(documentPaths({
  documents: [
    { path: '/work/api', document: null },
    { path: '/work/web', document: '# Web' },
    { path: '/removed', document: 'stale' },
  ],
}, roots), [
  { path: '/work/api', document: null },
  { path: '/work/web', document: '# Web' },
  { path: '/work/new', document: null },
]);
assert.equal(documentCanGenerate(false, 'p/m'), false);
assert.equal(documentCanGenerate(true, ''), false);
assert.equal(documentCanGenerate(true, 'p/m'), true);

// --- host protocol wiring ----------------------------------------------------
// Exact command actions and argument names; the UI must not improvise new ones.
for (const action of ['documents', 'queue-document',
  'document-proposals', 'preview-document-proposal', 'apply-document-proposal',
  'dismiss-document-proposal']) {
  assert(source.includes("action:'" + action + "'"), 'missing action: ' + action);
}
assert.match(source, /action:'document-proposals', workspaceId/, 'proposal list uses workspaceId');
assert.match(source, /action:'preview-document-proposal', workspaceId: request\.workspaceId, proposalId: id/, 'preview uses proposalId');
assert.match(source, /action:'apply-document-proposal', workspaceId: request\.workspaceId, proposalId: preview\.id, token: preview\.token/, 'apply sends id + token');
assert.match(source, /action:'dismiss-document-proposal', workspaceId: request\.workspaceId, proposalId: id/, 'dismiss uses proposalId');

// Preview-before-apply: the apply button is gated on a preview whose id matches
// the item, and the confirm hint is shown with the diff.
const applyGate = source.match(/disabled:busy\|\|!!proposalBusy\|\|!previewFor\|\|previewFor\.id!==item\.id,onClick:\(\)=>applyProposal\(previewFor\)/);
assert(applyGate, 'apply button is enabled only after a matching preview exists');
assert.match(source, /previewFor && previewFor\.id===item\.id \?[\s\S]{0,200}t\('proposalConfirmHint'\)/, 'confirm hint shown inside preview');
assert.match(source, /previewFor\.changes\.map/, 'diff changes are rendered');
assert.match(source, /onClick:\(\)=>previewProposal\(item\.id\)/, 'preview action is available per item');

// Failure visibility: every command failure path surfaces an error; none hides
// or reports success. Success refreshes both documents and proposals.
assert.match(source, /catch\(e\) \{ if \(mounted\.current\) setError\(e\.message\); \}/, 'preview failure surfaces error');
assert.match(source, /setPreviewFor\(null\); return; \}\s*setPreviewFor\(preview\)/, 'invalid preview does not become a confirmable state');
assert.match(source, /error && h\('p',\{className:'mr-error',role:'alert'\},error\)/, 'errors rendered as alert');
const applyRefresh = source.match(/const applyProposal = async[\s\S]{0,820}?loadDocuments\(request\.sessionId, request\.workspaceId\);\s*loadProposals\(request\.sessionId, request\.workspaceId\)/);
assert(applyRefresh, 'apply success refreshes documents and proposals');
const dismissRefresh = source.match(/const dismissProposal = async[\s\S]{0,700}?loadProposals\(request\.sessionId, request\.workspaceId\)/);
assert(dismissRefresh, 'dismiss success refreshes proposals');

// Overview: displayed from the documents response, null-safe; top-level README
// and project documents remain in the same panel (not replaced).
assert.match(source, /setOverview\(typeof value\?\.overview === 'string' && value\.overview \? value\.overview : null\)/, 'overview read from documents response, null-safe');
assert.match(source, /setOverviewError\(typeof value\?\.overviewError === 'string' && value\.overviewError \? value\.overviewError\.slice\(0, 300\) : null\)/, 'overviewError is bounded and null-safe');
assert.match(source, /overviewError && h\('p',\{className:'mr-error',role:'alert'\}/, 'overview error is surfaced, not hidden');
assert.match(source, /t\('overviewMissing'\)/, 'missing overview has an explicit state');
// The dialog now separates folders, notes, scan/proposals and relationships.
assert.match(source, /hidden:tab!=='docs'\},docPanel\)/, 'notes tab shows the project documents');
assert.match(source, /hidden:tab!=='scan'\},[\s\S]{0,200}?baselinePanel[\s\S]{0,120}?proposalPanel/, 'scan tab shows progress and proposals');
assert.match(source, /t\('docPath'\)/, 'project document section retained');

// Generated copy describes a real bounded scan instead of invented markers.
assert.match(source, /generateHint: '[^']*DSH-WORKSPACE\.md[^']*附加目录[^']*不读取源码正文/, 'zh generate copy explains the single workspace document');
assert.match(source, /generateHint: '[^']*DSH-WORKSPACE\.md[^']*additional folders[^']*Only structure is sent/, 'en generate copy explains the single workspace document');

// No innerHTML injection anywhere in the client bundle.
assert.doesNotMatch(source, /innerHTML/, 'innerHTML is forbidden');
assert.doesNotMatch(source, /dangerouslySetInnerHTML/, 'dangerouslySetInnerHTML is forbidden');

console.log('PASS: document review UI contract (baselines, overview, preview-before-apply, refresh, bounded helpers, no innerHTML)');
