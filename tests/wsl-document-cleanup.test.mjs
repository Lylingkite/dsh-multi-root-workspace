import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PYTHON } from '../wsl-runtime.js';

// A workspace keeps exactly one DSH-WORKSPACE.md. Moving the primary folder or
// dropping an additional one must delete the stale copy, so cleanup has to be
// idempotent, narrowly allowlisted, and never touch other files.
const python = process.env.DSH_TEST_PYTHON || 'python3';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cleanup-'));
const run = request => spawnSync(python, ['-c', PYTHON, Buffer.from(JSON.stringify(request)).toString('base64')], { encoding: 'utf8', input: '' });
const removed = result => JSON.parse(result.stdout.split('__DSH_MULTI_ROOT_JSON__')[1]).removed;

try {
  const doc = path.join(dir, 'DSH-WORKSPACE.md');
  const note = path.join(dir, 'DSH-PROJECT.md');
  const other = path.join(dir, 'keep.txt');
  fs.writeFileSync(doc, '# 旧的工作区说明\n');
  fs.writeFileSync(note, '# 旧的项目说明\n');
  fs.writeFileSync(other, 'keep');

  assert.equal(removed(run({ action: 'removeDocument', path: dir, filename: 'DSH-WORKSPACE.md' })), true);
  assert.ok(!fs.existsSync(doc), 'the stale workspace document is gone');

  // Cleanup runs on every folder change, so a second run must not fail.
  assert.equal(removed(run({ action: 'removeDocument', path: dir, filename: 'DSH-WORKSPACE.md' })), false);

  assert.equal(removed(run({ action: 'removeDocument', path: dir, filename: 'DSH-PROJECT.md' })), true);
  assert.ok(!fs.existsSync(note));

  assert.equal(fs.existsSync(other), true, 'an unrelated file is never removed');
  assert.notEqual(run({ action: 'removeDocument', path: dir, filename: 'keep.txt' }).status, 0, 'filename allowlist');
  assert.notEqual(run({ action: 'removeDocument', path: dir + '/../escape', filename: 'DSH-WORKSPACE.md' }).status, 0, 'traversal rejected');

  const target = path.join(dir, 'outside.md');
  fs.writeFileSync(target, 'outside');
  fs.symlinkSync(target, path.join(dir, 'DSH-WORKSPACE.md'));
  assert.notEqual(run({ action: 'removeDocument', path: dir, filename: 'DSH-WORKSPACE.md' }).status, 0, 'a symlinked document is refused');
  assert.equal(fs.readFileSync(target, 'utf8'), 'outside', 'the symlink target survives');

  console.log('PASS: WSL workspace document cleanup is idempotent, allowlisted, and never touches other files');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
