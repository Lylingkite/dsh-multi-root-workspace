// Pure, I/O-free incremental patching of plugin-managed Markdown blocks.
//
// A managed block is delimited by paired HTML comments that carry the identity
// of the owner (project + section) and a sha256 of the block content:
//
//   <!-- dsh-managed:begin project="<id>" section="<key>" hash="<sha256>" -->
//   ...content...
//   <!-- dsh-managed:end project="<id>" section="<key>" -->
//
// The module only ever rewrites the byte range of the targeted block. Every
// other byte of the document -- manual prose, BOM, CRLF/LF, other projects'
// blocks -- is preserved verbatim. Malformed or duplicated anchors fail closed.

import { createHash } from 'node:crypto';

const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SECTION_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const HASH_RE = /^[0-9a-f]{64}$/i;
const MAX_ID = 128;
const MAX_SECTION = 64;
const MAX_CONTENT = 32000;
const FORGED = /<!--\s*dsh-managed:/i;
const BAD_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;
const BEGIN_LINE = /^<!-- dsh-managed:begin\s+([\s\S]*?)\s*-->$/;
const END_LINE = /^<!-- dsh-managed:end\s+([\s\S]*?)\s*-->$/;

const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function computeHash(content) {
  if (typeof content !== 'string') throw new TypeError('哈希内容必须是字符串。');
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

export function detectEol(text) {
  if (typeof text !== 'string') throw new TypeError('文档必须是字符串。');
  const match = /\r\n|\n|\r/.exec(text);
  return match ? match[0] : '\n';
}

// Managed content always ends with one EOL, so hashes round-trip when a block
// is read back from the document.
function normalizeContent(content, eol) {
  if (!content) return '';
  let out = content.replace(/\r\n|\r|\n/g, eol);
  if (!out.endsWith(eol)) out += eol;
  return out;
}

function requireId(value, label, regex, max, pattern) {
  if (typeof value !== 'string' || !value || value.length > max || !regex.test(value)) {
    throw new TypeError(label + ' 必须是匹配 ' + pattern + ' 的标识。');
  }
  return value;
}

/** Strict input validation. Returns a normalized patch; no document is touched. */
export function validateInput(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('补丁必须是对象。');
  const proto = Object.getPrototypeOf(patch);
  if (proto !== Object.prototype && proto !== null) throw new TypeError('补丁必须是普通对象。');
  const allowed = new Set(['projectId', 'sectionKey', 'content', 'expectedHash', 'insert']);
  for (const key of Object.keys(patch)) if (!allowed.has(key)) throw new TypeError('补丁含未知字段：' + key);

  const projectId = requireId(patch.projectId, 'projectId', ID_RE, MAX_ID, ID_RE.source);
  const sectionKey = requireId(patch.sectionKey, 'sectionKey', SECTION_RE, MAX_SECTION, SECTION_RE.source);
  if (typeof patch.content !== 'string') throw new TypeError('content 必须是字符串。');
  if (patch.content.length > MAX_CONTENT) throw new TypeError('content 超过 ' + MAX_CONTENT + ' 字符。');
  if (BAD_CONTROL.test(patch.content)) throw new TypeError('content 含非法控制字符。');
  if (FORGED.test(patch.content)) throw new TypeError('content 不得包含托管锚点标记。');

  let expectedHash = null;
  if (has(patch, 'expectedHash') && patch.expectedHash !== undefined && patch.expectedHash !== null) {
    if (typeof patch.expectedHash !== 'string' || !HASH_RE.test(patch.expectedHash)) throw new TypeError('expectedHash 必须是 sha256 十六进制字符串。');
    expectedHash = patch.expectedHash.toLowerCase();
  }
  let insert = false;
  if (has(patch, 'insert') && patch.insert !== undefined && patch.insert !== null) {
    if (typeof patch.insert !== 'boolean') throw new TypeError('insert 必须是布尔值。');
    insert = patch.insert;
  }
  return { projectId, sectionKey, content: patch.content, expectedHash, insert };
}

function parseAttrs(text) {
  const attrs = {};
  const re = /([A-Za-z][A-Za-z0-9]*)="([^"]*)"/g;
  let match, cursor = 0;
  while ((match = re.exec(text))) {
    if (match.index !== cursor) return null;
    if (has(attrs, match[1])) return null;
    attrs[match[1]] = match[2];
    cursor = re.lastIndex;
    if (cursor < text.length && text[cursor] !== ' ') return null;
    while (cursor < text.length && text[cursor] === ' ') cursor++;
    re.lastIndex = cursor;
  }
  return cursor === text.length ? attrs : null;
}

function identity(attrs, kind) {
  const expected = kind === 'begin' ? ['project', 'section', 'hash'] : ['project', 'section'];
  if (!attrs || Object.keys(attrs).length !== expected.length) return null;
  for (const key of expected) if (!has(attrs, key)) return null;
  if (!ID_RE.test(attrs.project) || attrs.project.length > MAX_ID) return null;
  if (!SECTION_RE.test(attrs.section) || attrs.section.length > MAX_SECTION) return null;
  if (kind === 'begin' && !HASH_RE.test(attrs.hash)) return null;
  return { projectId: attrs.project, sectionKey: attrs.section, hash: attrs.hash ? attrs.hash.toLowerCase() : null };
}

function splitLines(text) {
  const lines = [];
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '\r' || char === '\n') {
      const eol = char === '\r' && text[i + 1] === '\n' ? '\r\n' : char;
      if (eol === '\r\n') i++;
      lines.push({ text: text.slice(start, i + 1 - eol.length), start, textEnd: i + 1 - eol.length, end: i + 1, eol });
      start = i + 1;
    }
  }
  if (start < text.length) lines.push({ text: text.slice(start), start, textEnd: text.length, end: text.length, eol: '' });
  return lines;
}

const FATAL = new Set(['MALFORMED_BEGIN', 'MALFORMED_END', 'UNCLOSED_BLOCK', 'ORPHAN_END', 'MISMATCHED_END', 'DUPLICATE_ANCHOR']);

/**
 * Scan every managed anchor in a document. Returns blocks and issues; never
 * throws for document problems so callers can inspect them. Fatal issue codes
 * are collected in FATAL and are rejected by the mutation helpers.
 */
export function scanManagedBlocks(text) {
  if (typeof text !== 'string') throw new TypeError('文档必须是字符串。');
  const eol = detectEol(text);
  const lines = splitLines(text);
  const blocks = [];
  const issues = [];
  const begins = new Map();
  const seen = new Set();
  let open = null;

  const issue = (code, line, message, extra = {}) => issues.push({ code, line: line + 1, message, ...extra });

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const begin = BEGIN_LINE.exec(line.text);
    const end = !begin && END_LINE.exec(line.text);
    if (begin) {
      const info = identity(parseAttrs(begin[1]), 'begin');
      if (!info) { issue('MALFORMED_BEGIN', i, '托管块起始锚点格式错误。'); continue; }
      const key = info.projectId + '\u0000' + info.sectionKey;
      if (begins.has(key) || seen.has(key)) issue('DUPLICATE_ANCHOR', i, '同一项目与章节存在重复锚点。', { projectId: info.projectId, sectionKey: info.sectionKey });
      begins.set(key, i);
      if (open) issue('UNCLOSED_BLOCK', open.lineIndex, '托管块缺少结束锚点。', { projectId: open.projectId, sectionKey: open.sectionKey });
      open = { ...info, lineIndex: i, line };
      continue;
    }
    if (end) {
      const info = identity(parseAttrs(end[1]), 'end');
      if (!info) { issue('MALFORMED_END', i, '托管块结束锚点格式错误。'); continue; }
      if (!open) { issue('ORPHAN_END', i, '结束锚点没有对应的起始锚点。', { projectId: info.projectId, sectionKey: info.sectionKey }); continue; }
      if (open.projectId !== info.projectId || open.sectionKey !== info.sectionKey) {
        issue('MISMATCHED_END', i, '结束锚点与起始锚点的项目或章节不一致。', { projectId: info.projectId, sectionKey: info.sectionKey, expectedProjectId: open.projectId, expectedSectionKey: open.sectionKey });
        open = null;
        continue;
      }
      const content = text.slice(open.line.end, line.start);
      const hash = computeHash(content);
      const key = open.projectId + '\u0000' + open.sectionKey;
      seen.add(key);
      blocks.push({
        projectId: open.projectId, sectionKey: open.sectionKey,
        hash, declaredHash: open.hash, hashMatches: hash === open.hash,
        content, beginStart: open.line.start, beginEnd: open.line.textEnd,
        contentStart: open.line.end, contentEnd: line.start, endStart: line.start, endEnd: line.textEnd,
        eol: open.line.eol || eol, lineIndex: open.lineIndex,
      });
      open = null;
    }
  }
  if (open) issue('UNCLOSED_BLOCK', open.lineIndex, '托管块缺少结束锚点。', { projectId: open.projectId, sectionKey: open.sectionKey });
  // A duplicate that started a second block is only reported once by the begin
  // scan; this also catches pairs completed before a later duplicate appeared.
  const completed = new Set();
  for (const block of blocks) {
    const key = block.projectId + '\u0000' + block.sectionKey;
    if (completed.has(key) && !issues.some(issue => issue.code === 'DUPLICATE_ANCHOR' && issue.projectId === block.projectId && issue.sectionKey === block.sectionKey)) {
      issue('DUPLICATE_ANCHOR', block.lineIndex, '同一项目与章节存在重复锚点。', { projectId: block.projectId, sectionKey: block.sectionKey });
    }
    completed.add(key);
    if (!block.hashMatches) issue('HASH_MISMATCH', block.lineIndex, '托管块内容哈希与锚点声明不一致。', { projectId: block.projectId, sectionKey: block.sectionKey });
  }
  return { blocks, issues, eol, hash: computeHash(text) };
}

function assertNoFatal(scan) {
  const fatal = scan.issues.filter(issue => FATAL.has(issue.code));
  if (fatal.length) {
    const error = new Error('文档含重复或畸形托管锚点，拒绝修改：' + fatal.map(issue => issue.code).join('、'));
    error.code = 'BAD_ANCHORS';
    error.issues = fatal;
    throw error;
  }
}

/** Build one complete managed block (no trailing EOL after the end marker). */
export function makeBlock({ projectId, sectionKey, content, eol = '\n' } = {}) {
  const id = requireId(projectId, 'projectId', ID_RE, MAX_ID, ID_RE.source);
  const key = requireId(sectionKey, 'sectionKey', SECTION_RE, MAX_SECTION, SECTION_RE.source);
  if (typeof content !== 'string' || content.length > MAX_CONTENT || BAD_CONTROL.test(content) || FORGED.test(content)) throw new TypeError('content 无效。');
  if (eol !== '\n' && eol !== '\r\n') throw new TypeError('eol 必须是 LF 或 CRLF。');
  const body = normalizeContent(content, eol);
  const hash = computeHash(body);
  return `<!-- dsh-managed:begin project="${id}" section="${key}" hash="${hash}" -->${eol}${body}<!-- dsh-managed:end project="${id}" section="${key}" -->`;
}

/** Read-only lookup of a block by explicit project ID and section key. */
export function findBlock(text, projectId, sectionKey) {
  const id = requireId(projectId, 'projectId', ID_RE, MAX_ID, ID_RE.source);
  const key = requireId(sectionKey, 'sectionKey', SECTION_RE, MAX_SECTION, SECTION_RE.source);
  const scan = scanManagedBlocks(text);
  assertNoFatal(scan);
  return scan.blocks.find(block => block.projectId === id && block.sectionKey === key) ?? null;
}

function diffLines(before, after) {
  const a = before ? before.replace(/\r\n|\r|\n/g, '\n').split('\n') : [];
  const b = after ? after.replace(/\r\n|\r|\n/g, '\n').split('\n') : [];
  if (a.length && a[a.length - 1] === '') a.pop();
  if (b.length && b[b.length - 1] === '') b.pop();
  const n = a.length, m = b.length;
  if (n * m > 400000) return [{ type: '-', text: a[0] ?? '' }, { type: '+', text: b[0] ?? '' }];
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: ' ', text: a[i] }); i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: '-', text: a[i] }); i++; }
    else { ops.push({ type: '+', text: b[j] }); j++; }
  }
  while (i < n) ops.push({ type: '-', text: a[i++] });
  while (j < m) ops.push({ type: '+', text: b[j++] });
  return ops;
}

function buildPreview(patch, block, before, after, changed, reason, documentBefore, documentAfter, added) {
  const ops = diffLines(before ?? '', after ?? '');
  const removedLines = ops.filter(op => op.type === '-').length;
  const addedLines = ops.filter(op => op.type === '+').length;
  const label = patch.projectId + '/' + patch.sectionKey;
  const unified = [
    `--- managed/${label} (before)`,
    `+++ managed/${label} (after)`,
    `@@ -1,${before ? before.split(/\r\n|\r|\n/).filter(Boolean).length : 0} +1,${after ? after.split(/\r\n|\r|\n/).filter(Boolean).length : 0} @@`,
    ...ops.map(op => op.type + op.text),
  ].join('\n');
  return {
    changed, reason, added, removed: false,
    projectId: patch.projectId, sectionKey: patch.sectionKey,
    beforeHash: before == null ? null : computeHash(before),
    afterHash: after == null ? null : computeHash(after),
    documentBeforeHash: computeHash(documentBefore),
    documentAfterHash: computeHash(documentAfter),
    removedLines, addedLines, lineDelta: addedLines - removedLines,
    unified,
  };
}

const noChange = (patch, scan, text, reason, block = null) => ({
  text,
  changed: false,
  preview: buildPreview(patch, block, block?.content ?? null, null, false, reason, text, text, false),
});

/**
 * Preview an incremental patch without modifying the document. `expectedHash`
 * is an optimistic-lock check against the target block's computed content hash.
 * With `insert: true` a missing block is appended using the document's EOL.
 */
export function previewPatch(text, patch) {
  const normalized = validateInput(patch);
  if (typeof text !== 'string') throw new TypeError('文档必须是字符串。');
  const scan = scanManagedBlocks(text);
  assertNoFatal(scan);
  const block = scan.blocks.find(item => item.projectId === normalized.projectId && item.sectionKey === normalized.sectionKey) ?? null;

  if (!block) {
    // A caller that supplied a lock hash expects an existing block. An absent
    // one cannot satisfy it, so fail closed instead of silently no-op'ing.
    if (normalized.expectedHash) {
      const error = new Error('目标托管块不存在，expectedHash 无法校验。');
      error.code = 'NO_BLOCK';
      throw error;
    }
    if (!normalized.insert) return noChange(normalized, scan, text, 'absent');
    const body = normalizeContent(normalized.content, scan.eol);
    const added = makeBlock({ projectId: normalized.projectId, sectionKey: normalized.sectionKey, content: normalized.content, eol: scan.eol });
    const prefix = text && !/\r\n|\n|\r$/.test(text) ? scan.eol : '';
    const next = text + prefix + added + scan.eol;
    return { text: next, changed: true, preview: buildPreview(normalized, null, null, body, true, 'inserted', text, next, true), block: null, addedBlock: added };
  }

  if (!block.hashMatches) {
    const error = new Error('目标托管块内容已被改动（哈希不匹配），拒绝写入。');
    error.code = 'HASH_MISMATCH';
    throw error;
  }
  if (normalized.expectedHash && normalized.expectedHash !== block.hash) {
    const error = new Error('目标托管块已被其他修订更新，拒绝写入。');
    error.code = 'STALE_HASH';
    throw error;
  }
  const body = normalizeContent(normalized.content, block.eol);
  if (body === block.content) return noChange(normalized, scan, text, 'unchanged', block);
  const replacement = makeBlock({ projectId: normalized.projectId, sectionKey: normalized.sectionKey, content: normalized.content, eol: block.eol });
  const next = text.slice(0, block.beginStart) + replacement + text.slice(block.endEnd);
  return { text: next, changed: true, preview: buildPreview(normalized, block, block.content, body, true, 'updated', text, next, false), block, addedBlock: null };
}

/** Apply a patch. Delegates all decisions to previewPatch; pure, no I/O. */
export function applyPatch(text, patch) {
  const result = previewPatch(text, patch);
  return { text: result.text, changed: result.changed, preview: result.preview };
}

/**
 * Wrap generated prose in the same managed block the incremental patcher uses,
 * so a later regeneration can replace its own text and leave everything the
 * user added outside the block untouched.
 */
export function wrapManagedBlock(projectId, sectionKey, content) {
  return makeBlock({ projectId, sectionKey, content });
}

// Older versions prefixed the workspace file with this exact template and
// a contiguous run of generated index entries. Never remove a prefix with
// user edits, a changed hash, or other kinds of managed notes.
function stripLegacyWorkspaceIndex(text) {
  const header = /^(\uFEFF?)# 工作区总览(?:\r\n|\n|\r){2}## 项目索引与已确认关系(?:\r\n|\n|\r)/u.exec(text);
  if (!header) return text;
  const { blocks, issues } = scanManagedBlocks(text);
  if (issues.some(issue => FATAL.has(issue.code))) return text;
  let cursor = header[0].length;
  for (const row of blocks) {
    if (row.beginStart !== cursor || row.sectionKey !== 'project-index') break;
    if (!row.hashMatches || !/^- (?:[^\r\n]+（说明待确认）|\[[^\]\r\n]+\]\(<[^>\r\n]+>\))(?:\r\n|\n|\r)$/u.test(row.content)) return text;
    cursor = row.endEnd + (/^(?:\r\n|\n|\r)/u.exec(text.slice(row.endEnd))?.[0].length ?? 0);
  }
  if (cursor === header[0].length) return text;
  // Free-form prose immediately after the legacy entries could belong to the
  // old heading. Keep it in place rather than assuming the heading is ours.
  const remainder = text.slice(cursor);
  const separator = /^(?:\r\n|\n|\r)*/u.exec(remainder)[0];
  const next = remainder.slice(separator.length);
  if (next && !next.startsWith('<!-- dsh-managed:begin ')) return text;
  if (next && blocks.find(row => row.beginStart === cursor + separator.length)?.sectionKey === 'project-index') return text;
  return header[1] ? header[1] + (next ? detectEol(text) + next : '') : next;
}

/**
 * Merge freshly generated document text with an existing file: the generated
 * body becomes the managed block, and any text the user wrote outside it is
 * preserved. Returns the text to write.
 */
export function mergeGenerated(projectId, sectionKey, generated, existing) {
  const block = wrapManagedBlock(projectId, sectionKey, String(generated).replace(/\s+$/u, ''));
  if (sectionKey === 'workspace' && existing) existing = stripLegacyWorkspaceIndex(existing);
  if (!existing) return block + '\n';
  if (existing === '\uFEFF') return existing + '\n' + block + '\n';
  const scan = scanManagedBlocks(existing);
  const current = scan.blocks.find(row => row.projectId === projectId && row.sectionKey === sectionKey);
  if (!current) {
    // First regeneration over a hand-written file: append, never discard.
    return existing.replace(/\s+$/u, '') + '\n\n' + block + '\n';
  }
  return applyPatch(existing, { projectId, sectionKey, content: String(generated).replace(/\s+$/u, '') }).text;
}

// Only project-detail subsections with a body count. An index row, a
// relationship mention or a heading in a code sample is not a project note.
export function workspaceProjectSections(text, projectId) {
  const {blocks} = scanManagedBlocks(text);
  const managed = blocks.find(row => row.projectId === projectId && row.sectionKey === 'workspace');
  const source = managed?.content ?? text;
  const names = new Set();
  let inDetails = false, name = '', fence = null;
  for (const line of source.replace(/^\uFEFF/u,'').split(/\r\n|\n|\r/u)) {
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/u.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      continue;
    }
    if (marker) { fence = marker[1]; continue; }
    const heading = /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/u.exec(line);
    if (heading) {
      const label = heading[2].replace(/\s+#+$/u,'').replace(/^\d+[.、．)）]\s*/u,'').trim();
      if (heading[1].length <= 2) { inDetails = heading[1] === '##' && label === '项目详情'; name = ''; }
      if (heading[1] === '###') name = inDetails ? label.replace(/^(`|\*\*)(.+)\1$/u,'$2') : '';
      continue;
    }
    if (name && line.trim() && !/^\s*<!--/u.test(line)) names.add(name);
  }
  return names;
}
