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
import os, sys, re, json, base64, stat, subprocess, hashlib
from collections import deque
from itertools import islice
r=json.loads(base64.b64decode(sys.stdin.buffer.read() if len(sys.argv)<2 else sys.argv[1])); action=r['action']
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
elif action in ('describe','projectDocument'):
 # Bounded top-level names only. No file contents, no child symlinks, no network.
 # projectDocument additionally resolves the preferred project document path:
 # README.md (case-insensitive) first, then DSH-PROJECT.md (case-insensitive).
 p=directory(r['path']); names=[]; seen=set(); candidates={}; sensitive=re.compile(r'(?:^|[._-])(?:env|npmrc|yarnrc|pypirc|netrc|htpasswd|git-credentials|gitconfig|id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials?|secrets?|tokens?|keystore)(?:[._-]|$)|(?:\.pem|\.key|\.p12|\.pfx|\.jks)$',re.I)
 with os.scandir(p) as scan:
  for e in islice(scan, 1000):
   if e.name.startswith('.') or sensitive.search(e.name) or any(ord(c)<32 for c in e.name) or '|' in e.name: continue
   try:
    if e.is_symlink(): continue
    if not (e.is_dir(follow_symlinks=False) or e.is_file(follow_symlinks=False)): continue
   except OSError: continue
   if action=='projectDocument' and e.is_file(follow_symlinks=False):
    folded=e.name.casefold()
    if folded in ('readme.md','dsh-project.md','dsh-workspace.md') and folded not in candidates: candidates[folded]=os.path.join(p,e.name)
   if len(names)<200 and e.name not in seen: seen.add(e.name); names.append(e.name)
 if action=='projectDocument':
  document=candidates.get('readme.md') or candidates.get('dsh-project.md')
  out={'document':document,'names':names}
  if candidates.get('readme.md') and candidates.get('dsh-project.md'): out['supplement']=candidates['dsh-project.md']
  if candidates.get('dsh-workspace.md'): out['overview']=candidates['dsh-workspace.md']
 else: out={'names':names}
elif action=='chatDocument':
 # Read-only, root-only documentation for the chat context. Only the four
 # allowlisted names below are considered: case-insensitive README.md /
 # README / README.rst (preferred) and DSH-PROJECT.md (supplement). No
 # symlink in the parent chain or on a child is ever followed, each document
 # is capped at 8192 bytes, unreadable/binary candidates prevent regeneration,
 # and nothing is ever written.
 limit=8192
 def open_dir(p):
  flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
  fd=os.open('/',flags)
  try:
   for part in p.split('/'):
    if not part: continue
    nxt=os.open(part,flags,dir_fd=fd)
    os.close(fd); fd=nxt
   return fd
  except BaseException:
   os.close(fd); raise
 folder=valid(r['path'])
 try: dfd=open_dir(folder)
 except OSError: out={'documents':[],'unavailable':True}
 else:
  out={'documents':[]}; found={}
  try:
   with os.scandir(dfd) as scan:
    for index,e in enumerate(scan):
     if index>=3000: out['unavailable']=True; break
     folded=e.name.casefold()
     if folded not in ('readme.md','readme','readme.rst','dsh-project.md'): continue
     try:
      if e.is_symlink(): out['unavailable']=True; continue
      if not stat.S_ISREG(e.stat(follow_symlinks=False).st_mode): out['unavailable']=True; continue
     except OSError: out['unavailable']=True; continue
     found.setdefault(folded,e.name)
  except OSError: out['unavailable']=True
  if found:
   def read_doc(name):
    try: fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=dfd)
    except OSError: return None
    try:
     if not stat.S_ISREG(os.fstat(fd).st_mode): return None
     chunks=[]; remaining=limit+1
     while remaining>0:
      chunk=os.read(fd,remaining)
      if not chunk: break
      chunks.append(chunk); remaining-=len(chunk)
     raw=b''.join(chunks)
     if b'\x00' in raw: return None
     truncated=len(raw)>limit
     text=raw[:limit].decode('utf-8','replace')
     if not text.strip(): return None
     return {'name':name,'text':text,'truncated':truncated}
    except OSError: return None
    finally: os.close(fd)
   documents=[]
   for folded in ('readme.md','readme','readme.rst'):
    if folded in found:
     doc=read_doc(found[folded])
     if doc: documents.append(doc); break
     out['unavailable']=True
   if 'dsh-project.md' in found:
    doc=read_doc(found['dsh-project.md'])
    if doc: documents.append(doc)
    else: out['unavailable']=True
   out['documents']=documents
  os.close(dfd)
elif action=='readDocument':
 # Read one allowlisted document with its content hash, for a versioned update.
 folder=valid(r['path']); name=r.get('filename','DSH-PROJECT.md')
 if name not in ('DSH-PROJECT.md','DSH-WORKSPACE.md'): raise ValueError('invalid document filename')
 def open_dir(p):
  flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
  fd=os.open('/',flags)
  try:
   for part in p.split('/'):
    if not part: continue
    nxt=os.open(part,flags,dir_fd=fd)
    os.close(fd); fd=nxt
   return fd
  except BaseException:
   os.close(fd); raise
 try: dfd=open_dir(folder)
 except OSError: out={'exists':False}
 else:
  try:
   try: fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=dfd)
   except FileNotFoundError: out={'exists':False}
   else:
    try:
     st=os.fstat(fd)
     if not stat.S_ISREG(st.st_mode): raise ValueError('not a regular file')
     raw=os.read(fd,262144)
     if b'\x00' in raw: raise ValueError('binary document')
     out={'exists':True,'text':raw.decode('utf-8','replace'),'sha256':hashlib.sha256(raw).hexdigest()}
    finally: os.close(fd)
  finally: os.close(dfd)
elif action=='replaceDocument':
 # Versioned update that stays inside Linux: the Windows UNC mapping cannot be
 # opened for an ACL check, so never route a WSL document write through it.
 folder=valid(r['path']); name=r.get('filename','DSH-PROJECT.md'); text=r.get('text'); expected=r.get('expectedSha256')
 if name not in ('DSH-PROJECT.md','DSH-WORKSPACE.md'): raise ValueError('invalid document filename')
 if not isinstance(text,str) or not text.strip() or len(text.encode('utf-8'))>131072 or '\x00' in text: raise ValueError('invalid document text')
 if not isinstance(expected,str) or not re.fullmatch('[0-9a-f]{64}',expected): raise ValueError('invalid version')
 flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
 parent=os.open('/',flags)
 try:
  for part in folder.split('/'):
   if not part: continue
   child=os.open(part,flags,dir_fd=parent)
   os.close(parent); parent=child
  try: fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW,dir_fd=parent)
  except FileNotFoundError: raise ValueError('document missing')
  try:
   current=os.read(fd,262144)
  finally: os.close(fd)
  if hashlib.sha256(current).hexdigest()!=expected: raise ValueError('document changed')
  fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_TRUNC|os.O_NOFOLLOW,0o600,dir_fd=parent)
  with os.fdopen(fd,'wb') as stream: stream.write(text.encode('utf-8'))
 finally: os.close(parent)
 out={'path':os.path.join(folder,name)}
elif action=='removeDocument':
 # Idempotent cleanup of one allowlisted document, staying inside Linux because
 # the Windows UNC mapping cannot be opened under the sandbox.
 folder=valid(r['path']); name=r.get('filename','DSH-PROJECT.md')
 if name not in ('DSH-PROJECT.md','DSH-WORKSPACE.md'): raise ValueError('invalid document filename')
 flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
 parent=os.open('/',flags)
 try:
  for part in folder.split('/'):
   if not part: continue
   child=os.open(part,flags,dir_fd=parent)
   os.close(parent); parent=child
  try:
   info=os.stat(name,dir_fd=parent,follow_symlinks=False)
  except FileNotFoundError:
   out={'removed':False}
  else:
   if not stat.S_ISREG(info.st_mode): raise ValueError('not a regular file')
   os.unlink(name,dir_fd=parent); out={'removed':True}
 finally: os.close(parent)
elif action=='statPath':
 # Real type for one already-listed path; never follows a symlink.
 p=os.path.normpath(valid(r['path']))
 if os.path.islink(p): out={'type':'symlink'}
 elif os.path.isdir(p): out={'type':'directory'}
 elif os.path.isfile(p): out={'type':'file','size':os.path.getsize(p)}
 elif os.path.lexists(p): out={'type':'other'}
 else: out={'type':None}
elif action=='readText':
 # Bounded read of one regular file for structure scanning. No symlinks, no
 # binaries, no oversized files; the caller supplies the path it already listed.
 p=os.path.realpath(valid(r['path']))
 if not os.path.isfile(p): raise ValueError('file unavailable')
 if os.path.islink(p): raise ValueError('symlink rejected')
 if os.path.getsize(p)>200000: raise ValueError('file too large')
 with open(p,'rb') as f: raw=f.read(200001)
 if b'\x00' in raw: raise ValueError('binary rejected')
 out={'text':raw.decode('utf-8','replace')}
elif action=='scan':
 # Root-bounded project scan in one process. Returns only derived metadata and
 # bounded excerpts: never raw credentials, binaries, symlink targets or files
 # outside the given root. Mirrors project-scan.js limits; JS normalizes it.
 root=directory(r['path'])
 max_files=min(800,max(1,int(r.get('maxFiles',800))))
 max_depth=min(4,max(0,int(r.get('maxDepth',4))))
 max_excerpt=min(8000,max(1,int(r.get('maxExcerpt',8000))))
 skip={'.git','node_modules','dist','build','out','target','.next','.venv','venv','__pycache__','.idea','.vscode','coverage','.cache','vendor'}
 sensitive=re.compile(r'(?:^|[._-])(?:env|npmrc|yarnrc|pypirc|netrc|htpasswd|git-credentials|gitconfig|id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials?|secrets?|tokens?|keystore|password)(?:[._-]|$)|\.(?:pem|key|p12|pfx|jks|keystore)$',re.I)
 manifests={'package.json','pyproject.toml','requirements.txt','cargo.toml','go.mod','pom.xml','build.gradle','build.gradle.kts','composer.json','gemfile','tsconfig.json','docker-compose.yml','compose.yaml','dockerfile','makefile','cmakelists.txt'}
 code_ext=re.compile(r'\.(?:js|mjs|cjs|jsx|ts|tsx|py|go|rs|java|kt|rb|php|c|h|cc|cpp|hpp|cs|swift|scala|sh|lua|vue|svelte)$',re.I)
 entry_pat=re.compile(r'^(?:index|main|app|server|cli|mod|lib|__init__)\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|rb|php|c|cs)$',re.I)
 doc_pat=re.compile(r'^(?:readme|dsh-project)\.md$',re.I)
 def readable(name):
  return bool(name) and not name.startswith('.') and not sensitive.search(name) and not any(ord(c)<32 for c in name)
 def bounded_text(path,limit):
  try:
   real=os.path.realpath(path)
   if not contained(root,real) or os.path.islink(path) or not os.path.isfile(real): return ''
   if os.path.getsize(real)>200000: return ''
   with open(real,'rb') as f: raw=f.read(min(limit,200000)+1)
   if b'\x00' in raw: return ''
   return raw[:limit].decode('utf-8','replace')
  except (OSError,ValueError): return ''
 queue=deque([(root,0)]); files=[]; dirs=[]; visited=0; truncated=False
 while queue and len(files)<max_files:
  folder,depth=queue.popleft()
  try:
   with os.scandir(folder) as scan: entries=list(islice(scan,400))
  except OSError: continue
  for e in entries:
   visited+=1
   if visited>max_files*4: truncated=True; break
   if not readable(e.name): continue
   try:
    if e.is_symlink(): continue
    kind='directory' if e.is_dir(follow_symlinks=False) else 'file' if e.is_file(follow_symlinks=False) else 'other'
    if kind=='directory' and e.name.lower() in skip: continue
    size=e.stat(follow_symlinks=False).st_size if kind=='file' else None
   except OSError: continue
   if kind=='other' or not contained(root,e.path): continue
   child=os.path.join(folder,e.name)
   rel=os.path.relpath(child,root).replace(os.sep,'/')
   if kind=='directory':
    dirs.append(rel)
    if depth+1<=max_depth: queue.append((child,depth+1))
   else:
    files.append({'relative':rel,'name':e.name,'dir':(rel.rsplit('/',1)[0] if '/' in rel else '.'),'path':child,'size':size})
  if visited>max_files*4: break
 if len(files)>=max_files: truncated=True
 manifests_payload=[]; modules_payload=[]; documents_payload=[]
 for f in [x for x in files if x['name'].lower() in manifests][:8]:
  text=bounded_text(f['path'],20000)
  if text: manifests_payload.append({'name':f['name'],'text':text})
 code=[x for x in files if code_ext.search(x['name'])]
 ranked=[x for x in code if entry_pat.match(x['name'])]+sorted([x for x in code if not entry_pat.match(x['name'])],key=lambda x:-(x['size'] or 0))
 counted={}
 for f in ranked:
  if len(modules_payload)>=24: break
  d=f['dir'] if f['dir']!='.' else ''
  if counted.get(d,0)>=2: continue
  text=bounded_text(f['path'],max_excerpt)
  if not text: continue
  counted[d]=counted.get(d,0)+1
  modules_payload.append({'relative':f['relative'],'dir':d,'text':text})
 for f in [x for x in files if doc_pat.match(x['name'])][:4]:
  text=bounded_text(f['path'],6000)
  if text: documents_payload.append({'path':f['relative'],'text':text})
 out={'root':root,'files':[{k:v for k,v in x.items() if k!='path'} for x in files],'dirs':dirs,'manifests':manifests_payload,'modules':modules_payload,'documents':documents_payload,'fileCount':len(files),'truncated':truncated}
elif action=='writeDocument':
 # Create one allowlisted Markdown file. Open every parent without following
 # symlinks so an alias swapped after the Host's policy preflight is rejected.
 folder=valid(r['path']); text=r.get('text'); name=r.get('filename','DSH-PROJECT.md')
 if name not in ('DSH-PROJECT.md','DSH-WORKSPACE.md'): raise ValueError('invalid document filename')
 if not isinstance(text,str) or not text.strip() or len(text.encode('utf-8'))>131072 or '\x00' in text: raise ValueError('invalid document text')
 if len(text)>32000 and name=='DSH-PROJECT.md': raise ValueError('invalid document text')
 flags=os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW
 parent=os.open('/',flags)
 try:
  for part in folder.split('/'):
   if not part: continue
   child=os.open(part,flags,dir_fd=parent)
   os.close(parent); parent=child
  fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600,dir_fd=parent)
  with os.fdopen(fd,'wb') as stream: stream.write(text.encode('utf-8'))
 finally: os.close(parent)
 out={'path':os.path.join(folder,name)}
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
    // The request travels on stdin, never in argv: a document body in argv hits
    // the Windows command-line limit and fails with ENAMETOOLONG.
    const payload = Buffer.from(JSON.stringify(request)).toString('base64');
    const argv = ['wsl.exe', ...(distro ? ['--distribution', distro] : []), '--exec', 'python3', '-c', PYTHON];
    const child = subprocess.spawn({ argv, cwd: hostCwd, graceMs: 1000, signal: control, stdio: { stdin: { data: payload }, stdout: { maxBytes: 8388608 }, stderr: { maxBytes: 16384 } } });
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

/**
 * Interface for the main agent: scan one WSL project with a SINGLE read-only
 * Python process per root, then normalize the bounded payload with the same
 * fact builder the host scanner uses. This fixes both the browse protocol
 * mismatch and the per-file-process explosion without touching any write path.
 *
 *   const run = createWslRuntime(ctx.subprocess, hostCwd, lifecycle.signal);
 *   const scan = createScanAdapter(run);
 *   const facts = await scan(distro, linuxPath(root), signal);
 *
 * @param run the function returned by createWslRuntime
 * @returns {(distro: string, root: string, signal?: AbortSignal) => Promise<object>}
 */
export function createScanAdapter(run) {
  if (typeof run !== 'function') throw new TypeError('createScanAdapter needs a WSL run function.');
  return async function scanWslProject(distro, root, signal) {
    if (typeof root !== 'string' || !root.startsWith('/') || root.startsWith('//') || /[\\\u0000-\u001f]/.test(root) || root.split('/').includes('..')) throw new Error('WSL 扫描仅接受绝对 Linux 路径。');
    const payload = await run(distro, { action: 'scan', path: root }, signal);
    const normalizedRoot = root.replace(/\/+$/, '') || '/';
    if (!payload || payload.root !== normalizedRoot || !Array.isArray(payload.files)) throw new Error('WSL 返回了无效的项目扫描数据。');
    const { normalizeScan } = await import('./project-scan.js');
    return normalizeScan(payload);
  };
}

/**
 * Normalize a WSL `browse` result to the scanner fs seam shape. Exposed so a
 * caller bridging existing `scanProject(fs, root)` code can fix the protocol
 * mismatch (`kind`/`path` vs `type`/`target`) without reimplementing it.
 * Prefer `createScanAdapter` for a one-process scan.
 */
export function browseToFsEntries(listing) {
  return (Array.isArray(listing?.entries) ? listing.entries : []).map(entry => ({
    name: entry.name,
    type: entry.kind === 'directory' ? 'directory' : 'file',
    kind: entry.kind,
    path: entry.path,
    target: { displayPath: entry.path },
  }));
}
