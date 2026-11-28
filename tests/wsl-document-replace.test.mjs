import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PYTHON } from '../wsl-runtime.js';

// WSL documents must be read and written entirely inside Linux. Routing a write
// through the Windows UNC mapping fails with ENOTSUP and then GetFileSecurityW,
// so these actions are the only supported path and must keep a version fence.
const python = process.env.DSH_TEST_PYTHON || 'python3';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doc-replace-'));
const file = path.join(dir, 'DSH-PROJECT.md');
const run = request => spawnSync(python, ['-c', PYTHON, Buffer.from(JSON.stringify(request)).toString('base64')], { encoding: 'utf8', input: '' });
const read = () => {
  const result = run({ action: 'readDocument', path: dir, filename: 'DSH-PROJECT.md' });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.split('__DSH_MULTI_ROOT_JSON__')[1]);
};

try {
  assert.equal(read().exists, false, 'a missing document reports absence, not an error');
  fs.writeFileSync(file, '# 初始\r\n');
  const first = read();
  assert.equal(first.exists, true);
  assert.match(first.sha256, /^[0-9a-f]{64}$/);
  assert.equal(first.text, '# 初始\r\n', 'content is returned verbatim');

  const replaced = run({ action: 'replaceDocument', path: dir, filename: 'DSH-PROJECT.md', text: '# 更新后\n', expectedSha256: first.sha256 });
  assert.equal(replaced.status, 0, replaced.stderr);
  assert.equal(fs.readFileSync(file, 'utf8'), '# 更新后\n');

  // A stale version must never overwrite: this is the concurrency fence.
  const stale = run({ action: 'replaceDocument', path: dir, filename: 'DSH-PROJECT.md', text: '# 过期\n', expectedSha256: first.sha256 });
  assert.notEqual(stale.status, 0);
  assert.equal(fs.readFileSync(file, 'utf8'), '# 更新后\n', 'a rejected write leaves the file untouched');

  assert.notEqual(run({ action: 'replaceDocument', path: dir, filename: 'README.md', text: 'x', expectedSha256: first.sha256 }).status, 0, 'filename allowlist');
  assert.notEqual(run({ action: 'replaceDocument', path: dir, filename: 'DSH-PROJECT.md', text: 'x', expectedSha256: 'nope' }).status, 0, 'version must be a sha256');
  assert.notEqual(run({ action: 'replaceDocument', path: dir + '/../escape', filename: 'DSH-PROJECT.md', text: 'x', expectedSha256: first.sha256 }).status, 0, 'traversal rejected');

  // A symlinked document must be refused, never followed.
  const target = path.join(dir, 'outside.md');
  fs.writeFileSync(target, '# outside');
  const linked = path.join(dir, 'DSH-WORKSPACE.md');
  fs.symlinkSync(target, linked);
  const viaLink = run({ action: 'readDocument', path: dir, filename: 'DSH-WORKSPACE.md' });
  assert.notEqual(viaLink.status, 0, 'symlinked document is refused');
  assert.equal(fs.readFileSync(target, 'utf8'), '# outside', 'link target untouched');

  console.log('PASS: WSL document read/replace stays in Linux, sha256 fence rejects stale writes, allowlist and symlink refusal');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
