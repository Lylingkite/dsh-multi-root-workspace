import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PYTHON } from '../wsl-runtime.js';

// Real-fixture tests for the read-only chatDocument action. Every case builds
// a real Linux directory under /tmp and runs the REAL embedded PYTHON helper
// through python3 (no os shims, no fake filesystem). This mirrors the existing
// wsl-stat/wsl-write WSL lanes: pass python3 via DSH_TEST_PYTHON or argv[2].
const python = process.env.DSH_TEST_PYTHON || process.argv[2] || 'python3';
const MARKER = '__DSH_MULTI_ROOT_JSON__';
const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

const run = request => spawnSync(
  python,
  ['-c', PYTHON, Buffer.from(JSON.stringify(request)).toString('base64')],
  { encoding: 'utf8' },
);

function chat(dir) {
  const result = run({ action: 'chatDocument', path: dir });
  assert.equal(result.status, 0, `helper failed: ${result.stderr}`);
  const line = result.stdout.split(/\r?\n/).filter(l => l.startsWith(MARKER)).pop();
  assert.ok(line, 'helper must return the JSON marker');
  return JSON.parse(line.slice(MARKER.length));
}

function withTemp(prefix, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  try {
    return fn(dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Snapshot names, content and mtime so an accidental write is detectable.
function snapshot(dir) {
  const out = {};
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) out[entry.name] = 'link:' + fs.readlinkSync(full);
    else if (entry.isDirectory()) out[entry.name + '/'] = snapshot(full);
    else {
      const st = fs.statSync(full);
      out[entry.name] = fs.readFileSync(full).toString('base64') + '@' + st.mtimeMs;
    }
  }
  return out;
}

// 1. No documentation -> a plain empty array, no unavailable flag.
withTemp('dsh-chat-empty-', dir => {
  fs.writeFileSync(path.join(dir, 'notes.txt'), 'ARBITRARY-NOTES-MARKER');
  assert.deepEqual(chat(dir), { documents: [] });
});

// 2. README variants are case-insensitive and preferred over the supplement;
//    DSH-PROJECT is returned as an additional (supplementary) document.
withTemp('dsh-chat-preference-', dir => {
  fs.writeFileSync(path.join(dir, 'dsh-project.md'), '# supplement');
  fs.writeFileSync(path.join(dir, 'ReadMe.MD'), '# preferred');
  const result = chat(dir);
  assert.deepEqual(result.documents.map(d => d.name), ['ReadMe.MD', 'dsh-project.md']);
  assert.deepEqual(result.documents.map(d => d.text), ['# preferred', '# supplement']);
  assert.deepEqual(result.documents.map(d => d.truncated), [false, false]);
  assert.equal(result.unavailable, undefined);
});

// 3. Only one README is primary: README.md > README > README.rst.
withTemp('dsh-chat-readme-order-', dir => {
  const md = path.join(dir, 'readme.md');
  const noext = path.join(dir, 'ReadMe');
  const rst = path.join(dir, 'README.rst');
  fs.writeFileSync(rst, '# rst');
  fs.writeFileSync(noext, '# no-extension');
  fs.writeFileSync(md, '# markdown');
  assert.deepEqual(chat(dir).documents.map(d => d.name), ['readme.md']);
  fs.unlinkSync(md);
  assert.deepEqual(chat(dir).documents.map(d => d.name), ['ReadMe']);
  fs.unlinkSync(noext);
  assert.deepEqual(chat(dir).documents.map(d => d.name), ['README.rst']);
});

// 4. Root-only and allowlisted: nested documents and arbitrary files are never
//    read, and their contents never leak into the result.
withTemp('dsh-chat-root-only-', dir => {
  fs.writeFileSync(path.join(dir, 'ARBITRARY.txt'), 'ARBITRARY-FILE-MARKER');
  fs.writeFileSync(path.join(dir, 'package.json'), 'ARBITRARY-PKG-MARKER');
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'sub', 'README.md'), 'NESTED-README-MARKER');
  fs.writeFileSync(path.join(dir, 'README.md'), '# root only');
  const result = chat(dir);
  assert.deepEqual(result.documents.map(d => d.name), ['README.md']);
  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes('ARBITRARY-FILE-MARKER'));
  assert.ok(!serialized.includes('ARBITRARY-PKG-MARKER'));
  assert.ok(!serialized.includes('NESTED-README-MARKER'));
});

// 5. Fixed ~8 KiB cap per document, counted in bytes. ASCII: 8192 stays whole,
//    8193 truncates; multi-byte text is cut on a byte boundary.
withTemp('dsh-chat-limit-', dir => {
  const doc = path.join(dir, 'README.md');
  fs.writeFileSync(doc, 'A'.repeat(8192));
  let result = chat(dir);
  assert.equal(result.documents[0].truncated, false);
  assert.equal(result.documents[0].text.length, 8192);

  fs.writeFileSync(doc, 'B'.repeat(8193));
  result = chat(dir);
  assert.equal(result.documents[0].truncated, true);
  assert.equal(result.documents[0].text.length, 8192);
  assert.ok(!result.documents[0].text.includes('B'.repeat(8192) + 'B'));

  fs.writeFileSync(doc, 'C'.repeat(200000));
  result = chat(dir);
  assert.equal(result.documents[0].truncated, true);
  assert.equal(result.documents[0].text.length, 8192);

  fs.writeFileSync(doc, '中'.repeat(5000));
  result = chat(dir);
  assert.equal(result.documents[0].truncated, true);
  assert.ok(result.documents[0].text.length < 5000, 'cap is in bytes, not characters');
});

// 6. Binary candidates are treated as missing, not as errors, and do not hide a
//    valid fallback or supplement.
withTemp('dsh-chat-binary-', dir => {
  fs.writeFileSync(path.join(dir, 'README.md'), Buffer.from([0x23, 0x20, 0x00, 0x41]));
  fs.writeFileSync(path.join(dir, 'DSH-PROJECT.md'), '# valid supplement');
  let result = chat(dir);
  assert.deepEqual(result.documents.map(d => d.name), ['DSH-PROJECT.md']);
  assert.equal(result.unavailable, true);

  fs.writeFileSync(path.join(dir, 'README.rst'), '# valid rst fallback');
  result = chat(dir);
  assert.deepEqual(result.documents.map(d => d.name), ['README.rst', 'DSH-PROJECT.md']);
});

// 7. Unreadable candidates count as missing too (skipped when not running root).
withTemp('dsh-chat-permission-', dir => {
  const unreadable = path.join(dir, 'README.md');
  fs.writeFileSync(unreadable, '# unreadable');
  fs.writeFileSync(path.join(dir, 'README.rst'), '# readable fallback');
  fs.chmodSync(unreadable, 0);
  try {
    const result = chat(dir);
    if (!isRoot) {
      assert.deepEqual(result.documents.map(d => d.name), ['README.rst']);
      assert.ok(!JSON.stringify(result).includes('unreadable'));
    }
  } finally {
    fs.chmodSync(unreadable, 0o600);
  }
});

// 8. Symlink children are never followed: neither a README alias nor a
//    DSH-PROJECT alias may expose an outside file's content.
withTemp('dsh-chat-child-symlink-', dir => {
  const secret = path.join(dir, 'secret-target.txt');
  fs.writeFileSync(secret, 'CHILD-SYMLINK-SECRET');
  fs.symlinkSync(secret, path.join(dir, 'README.md'));
  fs.symlinkSync(secret, path.join(dir, 'DSH-PROJECT.md'));
  const result = chat(dir);
  assert.deepEqual(result.documents, []);
  assert.equal(result.unavailable, true);
  assert.ok(!JSON.stringify(result).includes('CHILD-SYMLINK-SECRET'));
});

// 9. A symlink in the parent chain (including the final component) is refused
//    outright: open via O_NOFOLLOW on every component, so no document is read.
withTemp('dsh-chat-parent-symlink-', dir => {
  const real = path.join(dir, 'real');
  fs.mkdirSync(path.join(real, 'sub'), { recursive: true });
  fs.writeFileSync(path.join(real, 'README.md'), 'PARENT-SYMLINK-SECRET-ROOT');
  fs.writeFileSync(path.join(real, 'sub', 'README.md'), 'PARENT-SYMLINK-SECRET-SUB');
  fs.symlinkSync(real, path.join(dir, 'alias'));
  const direct = chat(path.join(dir, 'alias'));
  assert.deepEqual(direct.documents, []);
  assert.equal(direct.unavailable, true);
  assert.ok(!JSON.stringify(direct).includes('PARENT-SYMLINK-SECRET'));

  const nested = chat(path.join(dir, 'alias', 'sub'));
  assert.deepEqual(nested.documents, []);
  assert.equal(nested.unavailable, true);
  assert.ok(!JSON.stringify(nested).includes('PARENT-SYMLINK-SECRET'));
});

// 10. A missing path, a regular file used as the root, and invalid paths are
//     rejected without exposing anything.
withTemp('dsh-chat-invalid-', dir => {
  const file = path.join(dir, 'plain.txt');
  fs.writeFileSync(file, 'x');
  assert.deepEqual(chat(path.join(dir, 'missing')).documents, []);
  assert.equal(chat(path.join(dir, 'missing')).unavailable, true);
  assert.deepEqual(chat(file).documents, []);
  assert.equal(chat(file).unavailable, true);
  assert.notEqual(run({ action: 'chatDocument', path: dir + '/../escape' }).status, 0);
  assert.notEqual(run({ action: 'chatDocument', path: 'relative/path' }).status, 0);
});

// 11. Strictly read-only: a full before/after snapshot is identical, and a
//     read-only root still returns documents (no write is ever attempted).
withTemp('dsh-chat-readonly-', dir => {
  fs.writeFileSync(path.join(dir, 'README.md'), '# unchanged readme');
  fs.writeFileSync(path.join(dir, 'DSH-PROJECT.md'), '# unchanged project');
  const before = snapshot(dir);
  const result = chat(dir);
  assert.equal(result.documents.length, 2);
  assert.deepEqual(snapshot(dir), before);

  if (!isRoot) {
    fs.chmodSync(dir, 0o555);
    try {
      const readOnly = chat(dir);
      assert.equal(readOnly.documents.length, 2);
      assert.deepEqual(snapshot(dir), before);
    } finally {
      fs.chmodSync(dir, 0o755);
    }
  }
});

console.log('PASS: WSL chatDocument real-Python fixtures — allowlisted root docs, README preference, 8 KiB cap, symlink/binary/permission fail-closed, no writes');
