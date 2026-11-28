import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PYTHON } from '../wsl-runtime.js';

// The WSL scanner adapter depends on statPath reporting real types; a fixed
// guess made every manifest unreadable and produced empty project facts.
const python = process.env.DSH_TEST_PYTHON || process.argv[2] || 'python3';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-stat-'));
const run = request => spawnSync(python, ['-c', PYTHON, Buffer.from(JSON.stringify(request)).toString('base64')], { encoding: 'utf8' });
const type = target => {
  const result = run({ action: 'statPath', path: target });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.split('__DSH_MULTI_ROOT_JSON__')[1]).type;
};

try {
  const file = path.join(dir, 'package.json');
  fs.writeFileSync(file, '{"name":"demo"}');
  fs.mkdirSync(path.join(dir, 'src'));
  fs.symlinkSync(file, path.join(dir, 'link.json'));
  assert.equal(type(dir), 'directory');
  assert.equal(type(file), 'file');
  assert.equal(type(path.join(dir, 'src')), 'directory');
  assert.equal(type(path.join(dir, 'link.json')), 'symlink', 'symlinks are reported, never followed');
  assert.equal(type(path.join(dir, 'absent')), null);
  assert.notEqual(run({ action: 'statPath', path: dir + '/../escape' }).status, 0, 'traversal is rejected');
  console.log('PASS: WSL statPath reports real file/dir/symlink/absent types and rejects traversal');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
