import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { PYTHON } from '../wsl-runtime.js';

// Run the actual embedded helper with a deterministic POSIX filesystem shim.
// This works with Windows Python too, without invoking WSL or needing symlink privileges.
const python = process.env.DSH_TEST_PYTHON || process.argv[2] || 'python';
const suite = String.raw`
import os, sys, json, base64, posixpath, stat, types, contextlib, io, subprocess
# Load subprocess before replacing os with the test shim (needed on Linux).
source=base64.b64decode(sys.argv[1]).decode()
real_os=sys.modules['os']
class Entry:
 def __init__(self,p): self.path=p; self.name=posixpath.basename(p)
 def is_symlink(self): return nodes[self.path]=='link'
 def is_dir(self,follow_symlinks=False): return nodes[self.path]=='directory'
 def is_file(self,follow_symlinks=False): return nodes[self.path]=='file'
class Scan:
 def __init__(self,p):
  p=posixpath.normpath(p)
  if nodes.get(p)!='directory': raise OSError(p)
  scanned.append(p)
  self.entries=[Entry(n) for n in nodes if n!=p and posixpath.dirname(n)==p]
 def __enter__(self): return iter(self.entries)
 def __exit__(self,*args): pass
calls=[]; scanned=[]
def realpath(p):
 calls.append(p)
 for n,target in links.items():
  if p==n or p.startswith(n+'/'): return target+p[len(n):]
 return posixpath.normpath(p)
def lstat(p):
 if p not in nodes: raise OSError(p)
 return types.SimpleNamespace(st_mode=stat.S_IFLNK if nodes[p]=='link' else stat.S_IFDIR)
path=types.SimpleNamespace(**{n:getattr(posixpath,n) for n in ('normpath','commonpath','dirname','basename','join','relpath','expanduser')})
path.realpath=realpath; path.isdir=lambda p:nodes.get(p)=='directory'
fake=types.SimpleNamespace(path=path,sep='/',scandir=Scan,lstat=lstat,environ={})
def run(query='',roots=None,action='search'):
 calls.clear(); scanned.clear()
 request={'action':action,'query':query,'roots':roots or ['/roots/one','/roots/two']}
 sys.argv=['helper',base64.b64encode(json.dumps(request).encode()).decode()]
 output=io.StringIO(); sys.modules['os']=fake
 try:
  with contextlib.redirect_stdout(output): exec(source, {})
 finally: sys.modules['os']=real_os
 return json.loads(output.getvalue().split('__DSH_MULTI_ROOT_JSON__')[1])
def setup():
 global nodes,links
 nodes={'/roots/one':'directory','/roots/two':'directory','/outside':'directory',
 '/roots/one/a.txt':'file','/roots/one/zalpha.txt':'file','/roots/one/Alpha.txt':'file',
 '/roots/one/sub':'directory','/roots/one/sub/needle.txt':'file',
 '/roots/two/needle-two.txt':'file','/roots/one/link':'link','/outside/secret.txt':'file',
 '/roots/one/.git':'directory','/roots/one/.git/needle-secret':'file',
 '/roots/one/inside-link':'link','/roots/one/bad\nname':'file'}
 links={'/roots/one/link':'/outside','/roots/one/inside-link':'/roots/one/sub'}
setup()
assert [x['path'] for x in run()['items']]==['/roots/one','/roots/two']
assert scanned==[], 'empty query must not scan children'
items=run('/roots/one/')['items']
assert '/roots/one/sub' in [x['path'] for x in items]
assert all(posixpath.dirname(x['path'])=='/roots/one' for x in items)
assert [x['path'] for x in run('/roots/one/al')['items']]==['/roots/one/Alpha.txt']
assert [x['path'] for x in run('needle')['items']]==['/roots/one/sub/needle.txt','/roots/two/needle-two.txt']
assert '/roots/one/a.txt' not in calls and '/roots/one/zalpha.txt' not in calls
assert '/roots/one/sub' in calls
assert run('/roots/one/link/')['items']==[] and scanned==[]
assert run('/roots/one/inside-link/')['items']==[] and scanned==[]
assert run('/outside/')['items']==[] and scanned==[]
assert run('/roots/one-other/')['items']==[] and scanned==[]
for query in ('../secret','/roots/one/../outside/','//roots/one/','bad\\name','bad\x00name'):
 try: run(query)
 except ValueError: pass
 else: raise AssertionError('unsafe query accepted: '+repr(query))
items=run(action='index')['items']
assert len(items)>2 and all('link' not in x['path'] and '.git' not in x['path'] for x in items)
assert any(x['path']=='/roots/one/sub/needle.txt' for x in items)
setup()
for root in ('/roots/one','/roots/two'):
 for i in range(100): nodes[root+'/match-%03d'%i]='file'
items=run('match')['items']
assert len(items)==40
assert sum(x['path'].startswith('/roots/one/') for x in items)==20
assert sum(x['path'].startswith('/roots/two/') for x in items)==20
assert len(run(action='index')['items'])>40
nodes={'/roots/one':'directory','/roots/two':'directory'}; links={}
for i in range(30005): nodes['/roots/one/file-%05d'%i]='file'
result=run('absent')
assert result['items']==[] and result['truncated']
assert calls==['/roots/one','/roots/two'], 'unmatched files should never call realpath'
nodes['/roots/two/needle-last.txt']='file'
result=run(action='index')
assert len(result['items'])==15003 and result['truncated']
assert [x['path'] for x in result['items'][:2]]==['/roots/one','/roots/two']
assert any(x['path']=='/roots/two/needle-last.txt' for x in result['items']), 'large first root must not starve later roots'
result=run(action='index',roots=['/roots/one'])
assert len(result['items'])==30000 and result['truncated']
print('PASS: empty roots, shallow absolute/prefix, recursive multi-root, symlink and containment safety, realpath optimization, 40/30000 limits, index')
`;
assert.match(fs.readFileSync(new URL('../wsl-runtime.js', import.meta.url), 'utf8'), /queue\.popleft\(\)/);
const result = spawnSync(python, ['-c', suite, Buffer.from(PYTHON).toString('base64')], { stdio: 'inherit' });
if (result.error) throw result.error;
assert.equal(result.status, 0, 'Python helper regression suite failed');
