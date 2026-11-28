import assert from 'node:assert/strict';
import {
  computeHash, detectEol, makeBlock, scanManagedBlocks, findBlock,
  validateInput, previewPatch, applyPatch, mergeGenerated, workspaceProjectSections,
} from '../documentation-patch.js';

const hash = value => computeHash(value);
const mock = (project, section, content = 'content', eol = '\n') =>
  makeBlock({ projectId: project, sectionKey: section, content, eol });
const patch = (project, section, content, extra = {}) =>
  ({ projectId: project, sectionKey: section, content, ...extra });

// --- hashing and block construction -----------------------------------------
assert.equal(computeHash(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
assert.match(computeHash('abc'), /^[0-9a-f]{64}$/);
assert.throws(() => computeHash(123), /字符串/);
assert.equal(detectEol('a\r\nb'), '\r\n');
assert.equal(detectEol('a\nb'), '\n');
assert.equal(detectEol('a\rb'), '\r');
assert.equal(detectEol('plain'), '\n');

const blockLF = mock('proj-a', 'overview', 'line 1\nline 2');
assert.match(blockLF, /^<!-- dsh-managed:begin project="proj-a" section="overview" hash="[0-9a-f]{64}" -->\nline 1\nline 2\n<!-- dsh-managed:end project="proj-a" section="overview" -->$/);
const blockCRLF = mock('proj-a', 'overview', 'line 1\nline 2', '\r\n');
assert.ok(blockCRLF.includes('\r\n'));
assert.equal((blockCRLF.match(/\n/g) || []).length, (blockCRLF.match(/\r\n/g) || []).length, 'every LF must be part of CRLF');
assert.throws(() => makeBlock({ projectId: 'bad id', sectionKey: 'overview', content: 'x' }), /projectId/);
assert.throws(() => makeBlock({ projectId: 'p', sectionKey: '', content: 'x' }), /sectionKey/);
assert.throws(() => makeBlock({ projectId: 'p', sectionKey: 's', content: '<!-- dsh-managed:begin' }), /content/);
assert.throws(() => makeBlock({ projectId: 'p', sectionKey: 's', content: 'x', eol: '\r' }), /eol/);

// --- strict input validation -------------------------------------------------
assert.deepEqual(validateInput(patch('p', 's', 'x')), { projectId: 'p', sectionKey: 's', content: 'x', expectedHash: null, insert: false });
assert.equal(validateInput(patch('p', 's', 'x', { expectedHash: 'A'.repeat(64), insert: true })).expectedHash, 'a'.repeat(64));
assert.throws(() => validateInput(null), /补丁必须是对象/);
assert.throws(() => validateInput([]), /补丁必须是对象/);
assert.throws(() => validateInput(Object.create({ projectId: 'p' })), /普通对象/);
assert.throws(() => validateInput(patch('p', 's', 'x', { surprise: 1 })), /未知字段/);
assert.throws(() => validateInput(patch('../etc', 's', 'x')), /projectId/);
assert.throws(() => validateInput(patch('', 's', 'x')), /projectId/);
assert.throws(() => validateInput(patch('p'.repeat(129), 's', 'x')), /projectId/);
assert.throws(() => validateInput(patch('p', 'bad/key', 'x')), /sectionKey/);
assert.throws(() => validateInput(patch('p', 's'.repeat(65), 'x')), /sectionKey/);
assert.throws(() => validateInput(patch('p', 's', 42)), /content/);
assert.throws(() => validateInput(patch('p', 's', 'x'.repeat(32001))), /32000/);
assert.throws(() => validateInput(patch('p', 's', 'x\u0000y')), /控制字符/);
assert.throws(() => validateInput(patch('p', 's', 'x\u000by')), /控制字符/, 'vertical tab is an illegal control character');
assert.doesNotThrow(() => validateInput(patch('p', 's', 'x\r\ny')), 'newlines are valid content and normalized by the module');
assert.throws(() => validateInput(patch('p', 's', '<!-- dsh-managed:end')) , /content 不得/);
assert.throws(() => validateInput(patch('p', 's', 'x', { expectedHash: 'nope' })), /expectedHash/);
assert.throws(() => validateInput(patch('p', 's', 'x', { insert: 'yes' })), /insert/);

// --- scanning ----------------------------------------------------------------
const document =
  '# Workspace overview\r\n\r\n' +
  mock('proj-a', 'overview', 'alpha\r\nbeta', '\r\n') + '\r\n\r\n' +
  'Manual notes: keep exactly as-is.\r\n\r\n' +
  mock('proj-b', 'api', 'other project', '\r\n') + '\r\n';
const scanned = scanManagedBlocks(document);
assert.equal(scanned.issues.length, 0);
assert.equal(scanned.blocks.length, 2);
assert.deepEqual(scanned.blocks.map(b => [b.projectId, b.sectionKey]), [['proj-a', 'overview'], ['proj-b', 'api']]);
assert.ok(scanned.blocks.every(b => b.hashMatches));
assert.equal(scanned.blocks[0].eol, '\r\n');
assert.equal(document.slice(scanned.blocks[0].contentStart, scanned.blocks[0].contentEnd), 'alpha\r\nbeta\r\n');
assert.equal(findBlock(document, 'proj-a', 'overview').sectionKey, 'overview');
assert.equal(findBlock(document, 'proj-z', 'overview'), null);
assert.throws(() => findBlock(document, 'bad id', 'overview'), /projectId/);

// Hash drift inside an existing block is a non-fatal issue but blocks writes.
const drifted = document.replace('alpha\r\nbeta', 'alpha\r\nBETA');
const driftScan = scanManagedBlocks(drifted);
assert.ok(driftScan.issues.some(i => i.code === 'HASH_MISMATCH'));
assert.equal(findBlock(drifted, 'proj-a', 'overview').hashMatches, false, 'read-only lookup still finds the drifted block');
assert.throws(() => previewPatch(drifted, patch('proj-a', 'overview', 'new')), /哈希不匹配/);
assert.throws(() => applyPatch(drifted, patch('proj-a', 'overview', 'new')), /哈希不匹配/);

// --- malformed / duplicate anchors fail closed -------------------------------
const cases = [
  ['missing end', document.replace(/<!-- dsh-managed:end project="proj-b" section="api" -->/, ''), /UNCLOSED_BLOCK/],
  ['orphan end', '<!-- dsh-managed:end project="p" section="s" -->\ntext', /ORPHAN_END/],
  ['malformed begin', '<!-- dsh-managed:begin project="p" section="s" -->\nx\n<!-- dsh-managed:end project="p" section="s" -->', /MALFORMED_BEGIN/],
  ['malformed end', mock('p', 's', 'x').replace(/section="s" -->\s*$/, 'section=s -->'), /MALFORMED_END/],
  ['mismatched end', mock('p', 's', 'x').replace('section="s" -->', 'section="other" -->'), /MISMATCHED_END/],
  ['duplicate target', document + '\r\n' + mock('proj-a', 'overview', 'duplicate'), /DUPLICATE_ANCHOR/],
];
for (const [name, text, pattern] of cases) {
  const scan = scanManagedBlocks(text);
  assert.ok(scan.issues.some(i => ['MALFORMED_BEGIN', 'MALFORMED_END', 'UNCLOSED_BLOCK', 'ORPHAN_END', 'MISMATCHED_END', 'DUPLICATE_ANCHOR'].includes(i.code)), name + ' must be detected');
  for (const call of [() => findBlock(text, 'proj-a', 'overview'), () => previewPatch(text, patch('proj-a', 'overview', 'new')), () => applyPatch(text, patch('proj-a', 'overview', 'new'))]) {
    assert.throws(call, pattern, name);
  }
}

// --- preview is read-only; apply preserves every non-target byte -------------
const before = document;
const preview = previewPatch(before, patch('proj-a', 'overview', 'gamma\r\ndelta'));
assert.equal(preview.changed, true);
assert.equal(preview.preview.reason, 'updated');
assert.equal(preview.preview.added, false);
assert.equal(preview.preview.removed, false);
assert.equal(before, document, 'preview must not mutate the input');
assert.equal(preview.preview.beforeHash, hash('alpha\r\nbeta\r\n'));
assert.equal(preview.preview.afterHash, hash('gamma\r\ndelta\r\n'));
assert.equal(preview.preview.documentBeforeHash, hash(document));
assert.equal(preview.preview.documentAfterHash, hash(preview.text));
assert.ok(preview.preview.unified.includes('-alpha') && preview.preview.unified.includes('+gamma'));

const applied = applyPatch(before, patch('proj-a', 'overview', 'gamma\r\ndelta'));
assert.equal(applied.text, preview.text);
assert.equal(applied.changed, true);
assert.equal(applied.text.startsWith('# Workspace overview\r\n\r\n'), true);
assert.ok(applied.text.includes('Manual notes: keep exactly as-is.\r\n\r\n'), 'manual bytes preserved');
assert.ok(applied.text.includes(mock('proj-b', 'api', 'other project', '\r\n')), 'other project block byte-identical');
assert.equal(applied.text.match(/dsh-managed:begin/g).length, 2);
const afterScan = scanManagedBlocks(applied.text);
assert.equal(afterScan.issues.length, 0);
assert.equal(afterScan.blocks[0].content, 'gamma\r\ndelta\r\n');
assert.equal(afterScan.blocks[1].hash, scanned.blocks[1].hash);

// Idempotence: applying the same content again is a no-op.
const again = applyPatch(applied.text, patch('proj-a', 'overview', 'gamma\r\ndelta'));
assert.equal(again.changed, false);
assert.equal(again.preview.reason, 'unchanged');
assert.equal(again.text, applied.text);

// LF document with mixed manual CRLF: only the target block is normalized.
const mixed = '# head\r\n' + mock('p', 's', 'a\nb') + '\r\nfoot\r\n';
const mixedApplied = applyPatch(mixed, patch('p', 's', 'c'));
assert.ok(mixedApplied.text.startsWith('# head\r\n'));
assert.ok(mixedApplied.text.endsWith('\r\nfoot\r\n'));
assert.ok(mixedApplied.text.includes('\nc\n'));

// BOM and leading/trailing bytes are kept verbatim.
const bomDoc = '\uFEFF# BOM\n' + mock('p', 's', 'old') + '\nTAIL\n';
const bomApplied = applyPatch(bomDoc, patch('p', 's', 'new'));
assert.ok(bomApplied.text.startsWith('\uFEFF# BOM\n'));
assert.ok(bomApplied.text.endsWith('\nTAIL\n'));

// --- optimistic locking ------------------------------------------------------
const locked = previewPatch(document, patch('proj-a', 'overview', 'gamma', { expectedHash: hash('alpha\r\nbeta\r\n') }));
assert.equal(locked.changed, true);
assert.throws(() => previewPatch(document, patch('proj-a', 'overview', 'gamma', { expectedHash: '0'.repeat(64) })), /其他修订/);
assert.throws(() => applyPatch(document, patch('proj-a', 'overview', 'gamma', { expectedHash: '0'.repeat(64) })), /其他修订/);

// --- absent blocks / multi-project scope ------------------------------------
const absent = previewPatch(document, patch('proj-z', 'overview', 'new'));
assert.equal(absent.changed, false);
assert.equal(absent.preview.reason, 'absent');
assert.equal(absent.text, document);
assert.equal(applyPatch(document, patch('proj-z', 'overview', 'new')).text, document);
assert.throws(() => previewPatch(document, patch('proj-z', 'overview', 'new', { expectedHash: '0'.repeat(64) })), /不存在/);

// Insert creates a block without touching existing bytes; document EOL is used.
const inserted = previewPatch(document, patch('proj-z', 'overview', 'new\r\nlines', { insert: true }));
assert.equal(inserted.changed, true);
assert.ok(inserted.text.startsWith(document));
assert.ok(inserted.addedBlock.includes('\r\n'));
assert.equal(findBlock(inserted.text, 'proj-z', 'overview').content, 'new\r\nlines\r\n');
assert.equal(scanManagedBlocks(inserted.text).blocks.length, 3);
assert.equal(scanManagedBlocks(inserted.text).issues.length, 0);
assert.equal(applyPatch(document, patch('proj-z', 'overview', 'new\r\nlines', { insert: true })).text, inserted.text);

// Blank document insertion needs a leading EOL decision but stays valid.
const blankInserted = applyPatch('', patch('p', 's', 'first', { insert: true }));
assert.equal(findBlock(blankInserted.text, 'p', 's').content, 'first\n');
assert.equal(scanManagedBlocks(blankInserted.text).issues.length, 0);

// --- preview never reports a non-existent deletion ---------------------------
assert.equal(preview.preview.added, false);
assert.equal(preview.preview.removed, false);
assert.equal(preview.preview.removedLines, 2);
assert.equal(preview.preview.addedLines, 2);

console.log('PASS: documentation patch pure functions (anchors, hashes, EOL/byte preservation, strict validation, fail-closed, preview, scope)');

// v1.11 used an exact generated index prefix; v1.12 appended its workspace
// block. Drop only that obsolete prefix, keeping approved notes and prose.
{
  const header = '# 工作区总览\r\n\r\n## 项目索引与已确认关系\r\n';
  const placeholder = mock('p-main','project-index','- 主目录（说明待确认）','\r\n');
  const link = mock('p-extra','project-index','- [附加](<../extra/README.md>)','\r\n');
  const prefix = header + placeholder + '\r\n' + link + '\r\n\r\n';
  const current = mock('p-main','workspace','# 旧内容','\r\n');
  const suffix = '\r\n\r\n' + mock('p-main','relations','已确认关系','\r\n') + '\r\n\r\n手写内容  \r\n';
  const generated = '# 新内容';
  const result = mergeGenerated('p-main','workspace',generated,prefix + current + suffix);
  assert.equal(result,mock('p-main','workspace',generated,'\r\n') + suffix);
  assert.equal(mergeGenerated('p-main','workspace',generated,result),result);
  const oldOnly = mergeGenerated('p-main','workspace',generated,prefix);
  assert.doesNotMatch(oldOnly,/项目索引与已确认关系/);
  assert.equal(findBlock(oldOnly,'p-main','workspace').content,generated+'\n');
  for (const legacy of [prefix.replace('主目录','人工修改'), prefix+'手写说明\r\n', header+mock('p-main','project-index','- 自定义备注','\r\n')+'\r\n']) {
    const preserved = mergeGenerated('p-main','workspace',generated,legacy + current + suffix);
    assert.ok(preserved.startsWith(legacy),'do not drop an edited or ambiguous index');
  }
}

{
  const scope = 'p-coverage';
  const note = '# Overview\n## 项目一览\n| Missing |\n## 3. 项目详情\n### Empty\n### `Real`\nDescription.\n~~~text\n### Fake\nFake body\n~~~\n## 跨项目关系\n### Outside\nNot a project note.';
  assert.deepEqual([...workspaceProjectSections(mock(scope,'workspace',note),scope)], ['Real']);
  assert.deepEqual([...workspaceProjectSections(note,scope)], ['Real']);
}
