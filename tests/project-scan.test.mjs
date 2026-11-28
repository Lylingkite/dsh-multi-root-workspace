import assert from 'node:assert/strict';
import { scanProject, structurePrompt, normalizeBrowseEntries, scanPaths, normalizeScan } from '../project-scan.js';

// A tiny in-memory tree: enough to prove real structure, manifest parsing,
// module notes, breadth limits, symlink/secret refusal, import edges and title
// style extraction. No raw source from these excerpts appears in the result.
const tree = {
  '/p': ['package.json', 'README.md', 'src', 'node_modules', '.env', 'secret.key', 'link'],
  '/p/src': ['index.js', 'core.ts', 'core', 'README.md'],
  '/p/src/core': ['deep.js', 'deeper.js'],
  '/p/node_modules': ['ignored.js'],
  '/p/src/core/deeper': ['x.js', 'y.js', 'z.js'],
};
const files = {
  '/p/package.json': '{"name":"demo","dependencies":{"express":"^4"},"devDependencies":{"vitest":"^1"},"scripts":{"start":"node src/index.js"}}',
  '/p/README.md': '# 演示项目\n\n## 概览\n\n## 安装步骤\n',
  '/p/src/index.js': '/** Entry: boots the HTTP server. */\nimport express from "express";\nimport { helper } from "./core.ts";\nimport fs from "node:fs";\nexport async function main(){}\nexport const port = 3000;\n',
  '/p/src/core.ts': '// Shared core helpers.\nimport { deep } from "./core/deep.js";\nexport function helper(){}\n',
  '/p/src/core/deep.js': 'export const deep = 1;\n',
  '/p/src/core/deeper/x.js': 'export const x = 1;\n',
  '/p/src/core/deeper/y.js': 'export const y = 1;\n',
  '/p/src/core/deeper/z.js': 'export const z = 1;\n',
  '/p/node_modules/ignored.js': 'export const nope = 1;\n',
  '/p/src/README.md': '# 源码说明\n## 模块\n',
};
const fs = {
  resolve: async p => ({ displayPath: p }),
  processPath: t => t.displayPath,
  stat: async t => tree[t.displayPath] ? { type: 'directory' } : (files[t.displayPath] ? { type: 'file', size: files[t.displayPath].length } : undefined),
  lstat: async p => p.endsWith('/link') ? { type: 'symlink' } : tree[p] ? { type: 'directory' } : files[p] ? { type: 'file' } : undefined,
  listDir: async t => (tree[t.displayPath] ?? []).map(name => ({
    name,
    type: tree[t.displayPath + '/' + name] ? 'directory' : 'file',
    target: { displayPath: t.displayPath + '/' + name },
  })),
  readText: async t => files[t.displayPath] ?? '',
};

const facts = await scanProject(fs, '/p');
assert.equal(facts.ecosystem, 'Node.js');
assert.deepEqual(facts.dependencies, ['express', 'vitest'], 'manifest dependencies are parsed');
assert.deepEqual(facts.scripts, ['start']);
assert.equal(facts.projectName, 'demo');
assert.ok(facts.fileCount > 0);
assert.ok(!JSON.stringify(facts).includes('ignored.js'), 'node_modules must be skipped');
assert.ok(!JSON.stringify(facts).includes('secret.key'), 'secret-like names must be skipped');
assert.ok(!JSON.stringify(facts).includes('.env'), 'hidden files must be skipped');
assert.ok(!facts.tree.some(row => row.files.includes('link')), 'symlinks must be skipped');

const entry = facts.modules.find(m => m.path === 'src/index.js');
assert.ok(entry, 'entry point is described first');
assert.match(entry.comment, /Entry: boots the HTTP server/);
assert.deepEqual(entry.exports, ['main', 'port']);
assert.ok(facts.modules.length <= 24, 'module list is bounded');
const deepDir = facts.modules.filter(m => m.dir === 'src/core/deeper');
assert.ok(deepDir.length <= 2, 'one directory cannot dominate the module list');
assert.ok(facts.tree.length <= 40, 'tree is bounded');

// Real dependency edges come from import statements, not guesses. Builtins and
// local bindings are not reported as dependencies.
assert.ok(facts.importEdges.some(e => e.from === 'src/index.js' && e.to === 'src/core.ts' && e.kind === 'internal'), 'relative import becomes an internal edge');
assert.ok(facts.importEdges.some(e => e.from === 'src/core.ts' && e.to === 'src/core/deep.js'), 'nested relative import resolves');
assert.ok(facts.importEdges.some(e => e.from === 'src/index.js' && e.to === 'express' && e.kind === 'external'), 'package import becomes an external edge');
assert.ok(!facts.importedPackages.includes('fs'), 'node builtins are not dependencies');
assert.ok(!facts.importedPackages.some(p => p === 'main' || p === 'helper'), 'local bindings are not misread as packages');

// Title styles come from the project's own docs; raw source never reaches facts.
assert.ok(facts.titleStyles.some(s => s.path === 'README.md' && s.title === '演示项目'), 'H1 title style extracted');
assert.ok(facts.titleStyles.find(s => s.path === 'README.md').headings.includes('概览'), 'H2 heading style extracted');
assert.equal(facts.titleStyles[0].language, 'zh');
assert.ok(!JSON.stringify(facts).includes('import express from'), 'raw source lines never appear in facts');

const payload = JSON.parse(structurePrompt(facts, [{ ecosystem: 'Go', tree: [], titleStyles: [{ path: 'README.md', title: 'Go 项目', headings: ['构建'] }] }]));
assert.equal(payload.task, 'Write DSH-PROJECT.md');
assert.equal(payload.project.projectName, 'demo');
assert.equal(payload.siblingProjects.length, 1);
assert.equal(payload.titleStyleGuide.own[0].title, '演示项目');
assert.equal(payload.titleStyleGuide.peers[0].title, 'Go 项目');
assert.match(payload.titleStyleGuide.note, /never copy/);
assert.ok(!JSON.stringify(payload).includes('import express from'), 'prompt carries no raw source');

// The WSL browse protocol (kind/path) normalizes to the scanner fs seam
// (type/target), so entries are not silently dropped by a key mismatch.
const normalized = normalizeBrowseEntries({ entries: [{ name: 'a', kind: 'directory', path: '/p/a' }, { name: 'b.txt', kind: 'file', path: '/p/b.txt' }] });
assert.deepEqual(normalized.map(e => e.type), ['directory', 'file']);
assert.equal(normalized[0].target.displayPath, '/p/a');

// scanPaths drives the same fact builder from two plain callables (the shape
// the one-process WSL scan action uses).
const listing = p => (tree[p] ?? []).map(name => ({ name, type: tree[p + '/' + name] ? 'directory' : 'file', size: (files[p + '/' + name] ?? '').length }));
const readText = p => files[p] ?? '';
const viaPaths = normalizeScan(scanPaths({ listDir: listing, readText }, '/p'));
assert.equal(viaPaths.ecosystem, 'Node.js');
assert.equal(viaPaths.projectName, 'demo');
assert.ok(viaPaths.importEdges.some(e => e.to === 'src/core.ts'));
assert.ok(viaPaths.titleStyles.some(s => s.title === '演示项目'));

// Inline credentials in a comment are masked before reaching a prompt.
const redactedFs = { ...fs, readText: async t => t === '/p/src/index.js' ? '/** api_key=abcdefghijklmnop */\nexport const port = 1;\n' : files[t] ?? '' };
const redacted = await scanProject(redactedFs, '/p');
assert.ok(!JSON.stringify(redacted).includes('abcdefghijklmnop'), 'inline secret is redacted');

// Missing directory and aborting signal must fail rather than invent structure.
await assert.rejects(scanProject(fs, '/absent'), /不存在或不可访问/);
const aborted = new AbortController(); aborted.abort();
await assert.rejects(scanProject(fs, '/p', aborted.signal));
console.log('PASS: real structure scan, manifest dependencies, import edges, title styles, redaction, browse protocol, breadth bounds, secret/symlink/skip-dir refusal, abort');
