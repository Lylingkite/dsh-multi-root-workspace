import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PYTHON } from '../wsl-runtime.js';

// Exercise the real create-only document action against a real directory: the
// helper must never overwrite, never escape the folder, and reject bad input.
const python = process.env.DSH_TEST_PYTHON || process.argv[2] || 'python3';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-doc-write-'));
const run = request => spawnSync(python, ['-c', PYTHON, Buffer.from(JSON.stringify(request)).toString('base64')], { encoding: 'utf8' });

try {
  const created = run({ action: 'writeDocument', path: dir, text: '# 项目说明\n' });
  assert.equal(created.status, 0, created.stderr);
  const target = path.join(dir, 'DSH-PROJECT.md');
  assert.equal(JSON.parse(created.stdout.split('__DSH_MULTI_ROOT_JSON__')[1]).path, target);
  assert.equal(fs.readFileSync(target, 'utf8'), '# 项目说明\n');

  const again = run({ action: 'writeDocument', path: dir, text: '# 覆盖' });
  assert.notEqual(again.status, 0, 'existing document must not be overwritten');
  assert.equal(fs.readFileSync(target, 'utf8'), '# 项目说明\n');

  for (const text of ['', 'x'.repeat(32001)]) {
    assert.notEqual(run({ action: 'writeDocument', path: dir, text }).status, 0, 'invalid text must be rejected');
  }
  assert.notEqual(run({ action: 'writeDocument', path: path.join(dir, 'missing'), text: '# x' }).status, 0, 'missing folder must be rejected');
  assert.notEqual(run({ action: 'writeDocument', path: dir + '/../escape', text: '# x' }).status, 0, 'traversal must be rejected');
  const workspaceDoc = path.join(dir,'DSH-WORKSPACE.md');
  const workspaceResult=run({action:'writeDocument',path:dir,filename:'DSH-WORKSPACE.md',text:'# 工作区总览\n'});
  assert.equal(workspaceResult.status,0,workspaceResult.stderr);
  assert.equal(fs.readFileSync(workspaceDoc,'utf8'),'# 工作区总览\n');
  assert.notEqual(run({action:'writeDocument',path:dir,filename:'README.md',text:'# forbidden'}).status,0);
  const inner=path.join(dir,'inner');
  fs.mkdirSync(inner);
  fs.symlinkSync(inner,path.join(dir,'alias'));
  assert.notEqual(run({action:'writeDocument',path:path.join(dir,'alias'),text:'# not here'}).status,0);
  assert.deepEqual(fs.readdirSync(inner),[]);
  // A full-size document must go through stdin, not argv: argv would exceed the
  // Windows command-line limit and fail with ENAMETOOLONG.
  const big='# 长文档\n'+'正文内容。'.repeat(6000);
  assert.ok(big.length>30000,'fixture is large enough to exceed a command line');
  const bigDir=path.join(dir,'big');
  fs.mkdirSync(bigDir);
  const bigResult=run({action:'writeDocument',path:bigDir,filename:'DSH-WORKSPACE.md',text:big});
  assert.equal(bigResult.status,0,bigResult.stderr);
  assert.equal(fs.readFileSync(path.join(bigDir,'DSH-WORKSPACE.md'),'utf8'),big);
  console.log('PASS: WSL create-only project and workspace documents, no overwrite, filename allowlist and symlink refusal');
} finally {
  assert.ok(path.dirname(dir) === fs.realpathSync(os.tmpdir()));
  fs.rmSync(dir, { recursive: true, force: true });
}
