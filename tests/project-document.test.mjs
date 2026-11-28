import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { noteInPrimary, inspectHost, createProjectDocument, preflightProjectDocument } from '../project-document.js';
import { PYTHON } from '../wsl-runtime.js';

// --- host inspection through the agent-scoped ctx.fs seam ------------------
const node = type => ({ type });
function fakeFs(files, extra = {}) {
  const targets = new Map();
  for (const [name, type] of Object.entries(files)) {
    const key = '/p/' + name;
    targets.set(key, { targetKey: key, displayPath: key });
  }
  const target = p => ({ targetKey: p, displayPath: p });
  return {
    resolve: async p => target(p),
    processPath: t => t.displayPath,
    stat: async t => t.displayPath === '/p' || t.displayPath.startsWith('/p/') && files[t.displayPath.split('/').pop()]
      ? node(t.displayPath === '/p' ? 'directory' : files[t.displayPath.split('/').pop()]) : undefined,
    lstat: async p => {
      const name = String(p).split('/').pop();
      return files[name] ? node(files[name]) : undefined;
    },
    listDir: async () => Object.entries(files).map(([name, type]) => ({ name, type, target: target('/p/' + name) })),
    readText: async () => '# doc\n',
    writeText: async () => { throw new Error('unexpected write'); },
    contains: (parent, child) => child.displayPath.startsWith(parent.displayPath + '/') || child.displayPath === parent.displayPath,
    sandboxMode: 'workspace-write',
    ...extra,
  };
}

let result = await inspectHost(fakeFs({
  'readme.markdown': 'file', 'README.MD': 'file', 'dsh-project.md': 'file', 'src': 'directory', '.env': 'file', 'secret.key': 'file', 'link': 'symlink', 'bad|name': 'file', 'ok.txt': 'file',
}), '/p');
assert.equal(result.document, '/p/README.MD');
assert.deepEqual(result.names, ['readme.markdown', 'README.MD', 'dsh-project.md', 'src', 'ok.txt']);
result = await inspectHost(fakeFs({ 'dsh-project.md': 'file', 'package.json': 'file' }), '/p');
assert.equal(result.document, '/p/dsh-project.md');
result = await inspectHost(fakeFs({ 'src': 'directory' }), '/p');
assert.equal(result.document, null);
// --- create-only write with explicit per-session sandbox policy ------------
const policy = { mode: 'workspace-write', workspaceRoot: '/p', sessionId: 's' };
function writable(existing = {}, overrides = {}) {
  const calls = [];
  const fs = {
    resolve: async p => ({ targetKey: p, displayPath: p }),
    processPath: t => t.displayPath,
    stat: async () => ({ type: 'directory', version: 'v' }),
    lstat: async p => existing[String(p).split('/').pop()] ? node(existing[String(p).split('/').pop()]) : undefined,
    listDir: async () => [],
    contains: (parent, child) => child.displayPath === parent.displayPath || child.displayPath.startsWith(parent.displayPath + '/') || child.displayPath.startsWith(parent.displayPath + '\\'),
    writeText: async (...args) => { calls.push(args); return { operation: 'create' }; },
    sandboxMode: 'workspace-write',
    ...overrides,
  };
  return { fs, calls };
}
const agent = (fs, session = {}) => ({ session, ctx: { fs, sandboxPolicy: { resolve: request => { assert.deepEqual(request, { session }); return policy; } } } });

let { fs, calls } = writable();
let written = await createProjectDocument(agent(fs, { id: 's' }), '/p', '# Project\n', undefined);
assert.equal(written, '/p/DSH-PROJECT.md');
assert.equal(calls.length, 1);
assert.deepEqual(calls[0][2], { kind: 'createIfAbsent' });
assert.deepEqual(calls[0][4], policy);

// existing file: preflight refuses, no write
({ fs, calls } = writable({ 'DSH-PROJECT.md': 'file' }));
await assert.rejects(() => createProjectDocument(agent(fs), '/p', '# Project\n'), /已存在/);
assert.equal(calls.length, 0);

// symlink destination: refuse, no write
({ fs, calls } = writable({ 'DSH-PROJECT.md': 'symlink' }));
await assert.rejects(() => createProjectDocument(agent(fs), '/p', '# Project\n'), /符号链接/);
assert.equal(calls.length, 0);

// no sandbox backend marker: fail closed
({ fs, calls } = writable({}, { sandboxMode: undefined }));
await assert.rejects(() => createProjectDocument(agent(fs), '/p', '# Project\n'), /未启用沙箱/);
assert.equal(calls.length, 0);

// read-only policy: fail closed
({ fs, calls } = writable());
const readOnlyAgent = { session: {}, ctx: { fs, sandboxPolicy: { resolve: () => ({ mode: 'read-only', workspaceRoot: '/p' }) } } };
await assert.rejects(() => createProjectDocument(readOnlyAgent, '/p', '# Project\n'), /只读/);
assert.equal(calls.length, 0);

// outside workspace: fail closed
({ fs, calls } = writable());
const outsideAgent = { session: {}, ctx: { fs, sandboxPolicy: { resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/elsewhere' }) } } };
await assert.rejects(() => createProjectDocument(outsideAgent, '/p', '# Project\n'), /沙箱可写范围/);
assert.equal(calls.length, 0);

// WSL root without verified hostRoot: explicit refusal
({ fs, calls } = writable());
await assert.rejects(() => createProjectDocument(agent(fs), '/home/me/project', '# Project\n', undefined, { wsl: true }), /WSL.*主机映射/);
assert.equal(calls.length, 0);
let pre = await preflightProjectDocument(agent(fs), '/home/me/project', undefined, { wsl: true });
assert.equal(pre.ok, false);

// WSL with verified hostRoot maps to UNC but returns the Linux document path.
({ fs, calls } = writable());
const unc = '\\\\wsl.localhost\\Ubuntu-22.04\\home\\me\\project';
const uncPolicy = { mode: 'workspace-write', workspaceRoot: '/home/me/project', additionalWritableRoots: [unc], sessionId: 's' };
const uncAgent = { session: {}, ctx: { fs, sandboxPolicy: { resolve: () => uncPolicy } } };
written = await createProjectDocument(uncAgent, '/home/me/project', '# Project\n', undefined, { hostRoot: unc });
assert.equal(written, '/home/me/project/DSH-PROJECT.md');
assert.equal(calls[0][0].displayPath, unc + '\\DSH-PROJECT.md');
assert.deepEqual(calls[0][4], uncPolicy);

// A mismatched hostRoot cannot redirect the write to another project.
({ fs, calls } = writable());
await assert.rejects(() => createProjectDocument(agent(fs), '/home/me/project', '# Project\n', undefined, { hostRoot: '\\\\wsl.localhost\\Ubuntu-22.04\\home\\other' }), /映射与项目目录不一致/);
assert.equal(calls.length, 0);

// --- WSL projectDocument helper (same PYTHON, deterministic shim) ----------
const python = process.env.DSH_TEST_PYTHON || process.argv[2] || 'python3';
const suite = String.raw`
import os, sys, json, base64, posixpath, stat, types, contextlib, io
source=base64.b64decode(sys.argv[1]).decode()
real_os=sys.modules['os']
real_subprocess=sys.modules.get('subprocess')
fake_subprocess=types.SimpleNamespace(check_output=lambda *a, **k: '')
class Entry:
 def __init__(self,p): self.path=p; self.name=posixpath.basename(p)
 def is_symlink(self): return nodes.get(self.path)=='link'
 def is_dir(self,follow_symlinks=False): return nodes.get(self.path)=='directory'
 def is_file(self,follow_symlinks=False): return nodes.get(self.path)=='file'
class Scan:
 def __init__(self,p):
  if nodes.get(p)!='directory': raise OSError(p)
  self.entries=[Entry(n) for n in nodes if n!=p and posixpath.dirname(n)==p]
 def __enter__(self): return iter(self.entries)
 def __exit__(self,*args): pass
path=types.SimpleNamespace(**{n:getattr(posixpath,n) for n in ('normpath','commonpath','dirname','basename','join','relpath','expanduser')})
path.isdir=lambda p:nodes.get(p)=='directory'
path.realpath=lambda p:posixpath.normpath(p)
fake=types.SimpleNamespace(path=path,sep='/',scandir=Scan,lstat=lambda p:types.SimpleNamespace(st_mode=stat.S_IFLNK if nodes.get(p)=='link' else stat.S_IFDIR),environ={})
def run(p):
 request={'action':'projectDocument','path':p}
 sys.argv=['helper',base64.b64encode(json.dumps(request).encode()).decode()]
 output=io.StringIO(); sys.modules['os']=fake; sys.modules['subprocess']=fake_subprocess
 try:
  with contextlib.redirect_stdout(output): exec(source, {})
 finally:
  sys.modules['os']=real_os
  if real_subprocess is not None: sys.modules['subprocess']=real_subprocess
 return json.loads(output.getvalue().split('__DSH_MULTI_ROOT_JSON__')[1])
nodes={'/p':'directory','/p/README.md':'file','/p/dsh-project.md':'file','/p/.env':'file','/p/link.md':'link','/p/src':'directory','/p/ok.txt':'file'}
r=run('/p')
assert r['document']=='/p/README.md', r
assert r['names']==['README.md','dsh-project.md','src','ok.txt'], r
nodes={'/p':'directory','/p/readme.md':'file','/p/DSH-PROJECT.MD':'file'}
r=run('/p')
assert r['document']=='/p/readme.md', r
nodes={'/p':'directory','/p/DSH-PROJECT.md':'file'}
assert run('/p')['document']=='/p/DSH-PROJECT.md'
assert run('/p')['names']==['DSH-PROJECT.md']
print('PASS: WSL projectDocument README preference, case insensitivity, bounded safe names')
`;
const spawned = spawnSync(python, ['-c', suite, Buffer.from(PYTHON).toString('base64')], { stdio: 'inherit' });
if (spawned.error) throw spawned.error;
assert.equal(spawned.status, 0, 'WSL projectDocument helper regression failed');
// A note written into the primary document must be recognised, so a folder
// outside the write scope stops looking "missing" after it was documented.
const primaryDoc = [
  '# 主项目',
  '',
  '### etmsGateway',
  '',
  '> 位于 /w/etmsGateway（该目录不在当前会话可写范围内，说明保存在主要目录）',
  '',
  '- 内容',
  '',
  '### 金正大',
  '',
  '- 一个同名但不是回退写法的普通小节',
].join('\n');
assert.equal(noteInPrimary(primaryDoc, '/w/etmsGateway'), true);
assert.equal(noteInPrimary(primaryDoc, '/w/etmsGateway/'), true, 'trailing slash is tolerated');
assert.equal(noteInPrimary(primaryDoc, '/w/金正大'), false, 'a same-named normal section is not claimed');
assert.equal(noteInPrimary(primaryDoc, '/w/absent'), false);
assert.equal(noteInPrimary('', '/w/etmsGateway'), false);
assert.equal(noteInPrimary(null, '/w/etmsGateway'), false);
console.log('PASS: host inspection, create-only sandbox write, preflight, WSL helper');
