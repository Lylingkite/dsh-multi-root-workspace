// End-to-end local fixture for the WSL scan baseline. There is no wsl.exe and
// no network here: `run` speaks exactly the request protocol createWslRuntime
// uses, but executes the same PYTHON helper with the local `python3`. This
// proves the scan action is one bounded read-only process per project root,
// that it adapts the browse protocol, and that only derived facts leave it.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PYTHON, createScanAdapter, browseToFsEntries } from '../wsl-runtime.js';
import { structurePrompt } from '../project-scan.js';

const python = process.env.DSH_TEST_PYTHON || process.argv[2] || 'python3';
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-scan-baseline-'));
let processes = 0;

// Mirrors createWslRuntime: base64 JSON request in, tagged JSON line out.
const run = async (distro, request, signal) => {
  signal?.throwIfAborted();
  processes += 1;
  const result = spawnSync(python, ['-c', PYTHON, Buffer.from(JSON.stringify(request)).toString('base64')], { encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  const line = result.stdout.split(/\r?\n/).findLast(l => l.startsWith('__DSH_MULTI_ROOT_JSON__'));
  assert.ok(line, 'helper returned a tagged JSON line');
  return JSON.parse(line.slice('__DSH_MULTI_ROOT_JSON__'.length));
};

try {
  // A realistic small project: manifest, entry with real imports, a nested
  // module, README title conventions, a skipped dependency folder, a hidden
  // secret file, and a symlink that must never be followed.
  fs.mkdirSync(path.join(root, 'src'));
  fs.mkdirSync(path.join(root, 'src', 'core'));
  fs.mkdirSync(path.join(root, 'node_modules'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({
    name: 'fixture-app',
    dependencies: { express: '^4' },
    devDependencies: { vitest: '^1' },
    scripts: { start: 'node src/index.js' },
  }));
  fs.writeFileSync(path.join(root, 'README.md'), '# 夹具项目\n\n## 概览\n\n## 使用方式\n');
  fs.writeFileSync(path.join(root, 'src', 'index.js'),
    '/** Entry point. */\nimport express from "express";\nimport { core } from "./core/index.js";\nimport fs from "node:fs";\nexport function main(){ return core; }\n');
  fs.writeFileSync(path.join(root, 'src', 'core', 'index.js'),
    '// Core module.\nexport const core = 1;\n');
  fs.writeFileSync(path.join(root, 'src', 'core', 'helper.js'), 'export const helper = 2;\n');
  fs.writeFileSync(path.join(root, 'node_modules', 'ignored.js'), 'export const ignored = 3;\n');
  fs.writeFileSync(path.join(root, '.env'), 'API_KEY=supersecretvalue123456');
  fs.writeFileSync(path.join(root, 'secret.key'), 'PRIVATE KEY DATA');
  fs.symlinkSync(path.join(root, 'src', 'index.js'), path.join(root, 'linked.js'));

  const scan = createScanAdapter(run);
  const facts = await scan('', root);
  assert.equal(processes, 1, 'one project scan costs exactly one helper process');
  const withSlash = await scan('', root + '/');
  assert.equal(withSlash.projectName, 'fixture-app', 'trailing slash root is normalized');

  // Real structure, parsed dependencies and scripts.
  assert.equal(facts.projectName, 'fixture-app');
  assert.equal(facts.ecosystem, 'Node.js');
  assert.deepEqual(facts.dependencies, ['express', 'vitest']);
  assert.deepEqual(facts.scripts, ['start']);
  assert.ok(facts.fileCount >= 5, 'real files counted');

  // No symlink, secret, hidden file or dependency folder escapes the root.
  const all = JSON.stringify(facts);
  for (const forbidden of ['ignored.js', 'linked.js', 'secret.key', '.env', 'supersecretvalue123456', 'PRIVATE KEY DATA']) {
    assert.ok(!all.includes(forbidden), `${forbidden} must not appear in facts`);
  }
  assert.ok(!facts.tree.some(row => row.dir.includes('node_modules')));
  assert.ok(!facts.modules.some(m => m.path.includes('node_modules') || m.path === 'linked.js'));

  // Real import edges: relative module + external package, no builtins.
  assert.ok(facts.importEdges.some(e => e.from === 'src/index.js' && e.to === 'src/core/index.js' && e.kind === 'internal'), 'relative import edge');
  assert.ok(facts.importEdges.some(e => e.from === 'src/index.js' && e.to === 'express' && e.kind === 'external'), 'package import edge');
  assert.ok(!facts.importedPackages.includes('fs'), 'builtin is not a dependency');

  // Doc title style comes from the project's own README.
  assert.ok(facts.titleStyles.some(s => s.path === 'README.md' && s.title === '夹具项目'));
  assert.ok(facts.titleStyles.find(s => s.path === 'README.md').headings.includes('使用方式'));

  // Only derived metadata leaves: no raw source lines in facts or prompt.
  for (const raw of ['import express from', 'return core', 'export const core = 1;']) {
    assert.ok(!all.includes(raw), `raw source must not appear: ${raw}`);
  }
  const prompt = structurePrompt(facts, []);
  assert.ok(!prompt.includes('supersecretvalue123456'));

  // Root containment and rejects: traversal and outside roots are refused.
  await assert.rejects(run('', { action: 'scan', path: root + '/../escape' }), /directory unavailable|absolute Linux path/);
  assert.equal(processes, 3, 'rejected scan still uses one process');
  await assert.rejects(scan('', 'relative/path'), /绝对 Linux 路径/);

  // The browse protocol helper keeps the old fs-based callers compatible.
  const entries = browseToFsEntries({ entries: [{ name: 'src', kind: 'directory', path: root + '/src' }, { name: 'f.txt', kind: 'file', path: root + '/f.txt' }] });
  assert.deepEqual(entries.map(e => e.type), ['directory', 'file']);
  assert.equal(entries[0].target.displayPath, root + '/src');

  // Existing write actions were not touched: writeDocument is still a
  // create-only write of DSH-PROJECT.md and refuses to overwrite it.
  const before = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const written = await run('', { action: 'writeDocument', path: root, text: '# Generated' });
  assert.equal(written.path, path.join(root, 'DSH-PROJECT.md'));
  assert.equal(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), before, 'existing README untouched');
  const again = await run('', { action: 'writeDocument', path: root, text: '# Nope' }).then(() => null, e => e);
  assert.ok(again, 'second writeDocument is refused');
  assert.equal(fs.readFileSync(path.join(root, 'DSH-PROJECT.md'), 'utf8'), '# Generated', 'document not overwritten');
  console.log('PASS: one-process WSL scan fixture, real edges, title styles, root/symlink/secret guards, no raw source or writes');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
