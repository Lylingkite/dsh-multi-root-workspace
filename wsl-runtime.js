import path from 'node:path';
import { wslParts } from './paths.js';

export const linuxPath = p => {
  if (typeof p !== 'string' || !p.startsWith('/') || p.startsWith('//') || /[\\\u0000-\u001f]/.test(p) || p.split('/').includes('..')) throw new Error('WSL 工作区仅接受绝对 Linux 路径，例如 /home/user/project。');
  return path.posix.normalize(p);
};
export function linuxFromHost(p, distro) {
  const w = wslParts(p);
  if (w) {
    if (distro && w.distro.toLowerCase() !== distro.toLowerCase()) throw new Error('工作区与 WSL 会话发行版不一致，不能混用不同发行版。');
    return linuxPath(w.linux);
  }
  if (/^([A-Za-z]):[\\/]/.test(p)) return '/mnt/' + p[0].toLowerCase() + '/' + p.slice(3).replaceAll('\\', '/');
  return linuxPath(p);
}
// A read-only JSON helper runs in the selected distribution. No command fragments come from paths.
export const PYTHON = String.raw`
import os, sys, json, base64, stat, subprocess
from collections import deque
from itertools import islice
r=json.loads(base64.b64decode(sys.argv[1])); action=r['action']
def valid(p):
 if not isinstance(p,str) or not p.startswith('/') or p.startswith('//') or '\\' in p or any(ord(c)<32 for c in p) or '..' in p.split('/'): raise ValueError('absolute Linux path required')
 return os.path.normpath(p)
def directory(p):
 p=os.path.realpath(valid(p))
 if not os.path.isdir(p): raise ValueError('directory unavailable: '+p)
 return p
def contained(root,p):
 return os.path.commonpath([root,os.path.realpath(p)])==root
if action=='info': out={'distro':os.environ.get('WSL_DISTRO_NAME',''),'home':os.path.expanduser('~')}
elif action=='validate': out={'paths':[directory(p) for p in r['paths']]}
elif action=='hostPath':
 p=directory(r['path']); out={'path':p,'windows':subprocess.check_output(['wslpath','-w',p],text=True).strip()}
elif action=='browse':
 p=directory(r.get('path') or os.path.expanduser('~')); entries=[]
 with os.scandir(p) as scan:
  for e in scan:
   if len(entries)>=1000: break
   if any(ord(c)<32 for c in e.name): continue
   try: kind='directory' if e.is_dir(follow_symlinks=False) else 'file' if e.is_file(follow_symlinks=False) else 'other'
   except OSError: continue
   if kind!='other': entries.append({'name':e.name,'path':os.path.join(p,e.name),'kind':kind})
 entries.sort(key=lambda e:(e['kind']!='directory',e['name']))
 out={'path':p,'parent':os.path.dirname(p) if p!='/' else None,'entries':entries,'truncated':len(entries)>=1000}
elif action in ('search','index'):
 indexing=action=='index'; q='' if indexing else r.get('query',''); results=[]; seen=set(); count=0
 if '..' in q.split('/') or '\\' in q or any(ord(c)<32 for c in q): raise ValueError('query rejected')
 roots=r['roots']; limit=30000 if indexing else 40; quota=max(1,limit//max(1,len(roots))); truncated=False
 absolute=q.startswith('/'); folded=q.casefold()
 if absolute: valid(q)
 def add(p,k):
  if p not in seen and len(results)<limit: seen.add(p); results.append({'path':p,'kind':k})
 def safe_start(root,p):
  # Check lexical containment before inspecting any user-selected directory.
  p=os.path.normpath(p)
  if os.path.commonpath([root,p])!=root: return False
  current=root
  for part in os.path.relpath(p,root).split(os.sep):
   if part=='.': continue
   current=os.path.join(current,part)
   if stat.S_ISLNK(os.lstat(current).st_mode): return False
  return contained(root,p)
 if indexing:
  canonical=[]
  for root in roots:
   try: root=directory(root)
   except (OSError,ValueError): continue
   if root not in canonical: canonical.append(root); add(root,'directory')
  roots=canonical
 for root in roots:
  if len(results)>=limit: break
  if not indexing:
   try: root=directory(root)
   except (OSError,ValueError): continue
  end=min(limit,len(results)+quota); scan_end=min(30000,count+quota) if indexing else 30000; needle=folded
  if absolute:
   start=q if q.endswith('/') else os.path.dirname(q); needle='' if q.endswith('/') else os.path.basename(q).casefold()
   try:
    if not safe_start(root,start): continue
   except (OSError,ValueError): continue
  else:
   start=root
   if indexing or not q or folded in os.path.basename(root).casefold(): add(root,'directory')
   # Empty mentions are a root picker, not a directory listing.
   if not indexing and not q: continue
  queue=deque([start])
  while queue and count<scan_end and len(results)<end:
   d=queue.popleft()
   try:
    with os.scandir(d) as scan: children=sorted(islice(scan,scan_end-count),key=lambda e:e.name)
   except OSError: continue
   for e in children:
    if count>=scan_end or len(results)>=end: break
    count+=1
    if e.name in ('.git','node_modules','.venv','venv','dist','.next') or any(ord(c)<32 for c in e.name): continue
    try:
     if e.is_symlink(): continue
     kind='directory' if e.is_dir(follow_symlinks=False) else 'file' if e.is_file(follow_symlinks=False) else 'other'
     if kind=='other': continue
     match=indexing or (e.name.casefold().startswith(needle) if absolute else folded in os.path.relpath(e.path,root).casefold())
     traverse=not absolute and kind=='directory'
     # Unmatched files need no realpath; only hits and traversal candidates do.
     if not (match or traverse) or not contained(root,e.path): continue
    except (OSError,ValueError): continue
    if match: add(e.path,kind)
    if traverse: queue.append(e.path)
   if absolute: break
  if indexing and (count>=scan_end or len(results)>=end): truncated=True
 out={'items':results,'truncated':truncated or count>=30000 or (indexing and len(results)>=limit)}
else: raise ValueError('unknown action')
print('__DSH_MULTI_ROOT_JSON__'+json.dumps(out,ensure_ascii=True))
`;
export function createWslRuntime(subprocess, hostCwd, lifecycle) {
  return async function run(distro, request, signal) {
    if (distro && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(distro)) throw new Error('WSL 发行版名称无效。');
    const timeout = AbortSignal.timeout(30000);
    const control = AbortSignal.any([lifecycle, timeout, ...(signal ? [signal] : [])]);
    const argv = ['wsl.exe', ...(distro ? ['--distribution', distro] : []), '--exec', 'python3', '-c', PYTHON, Buffer.from(JSON.stringify(request)).toString('base64')];
    const child = subprocess.spawn({ argv, cwd: hostCwd, graceMs: 1000, signal: control, stdio: { stdin: 'ignore', stdout: { maxBytes: 8388608 }, stderr: { maxBytes: 16384 } } });
    const result = await child.done;
    control.throwIfAborted();
    const output = child.collected.stdout.readFrom(0);
    const error = child.collected.stderr.readFrom(0).text;
    if (result.exitCode !== 0 || output.lossy) throw new Error('WSL 操作失败（请确认发行版已连接且装有 python3）：' + error.slice(-2000));
    const marker = output.text.split(/\r?\n/).findLast(line => line.startsWith('__DSH_MULTI_ROOT_JSON__'));
    if (!marker) throw new Error('WSL 返回了无效的目录数据。');
    return JSON.parse(marker.slice('__DSH_MULTI_ROOT_JSON__'.length));
  };
}
