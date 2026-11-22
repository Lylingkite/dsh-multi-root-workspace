import { pathApi, absolutePath, wslParts } from './paths.js';
export const slash = p => p.replaceAll('\\', '/');
export function within(root, candidate) {
  const api = pathApi(root);
  if (api !== pathApi(candidate)) return false;
  const rw = wslParts(root), cw = wslParts(candidate);
  if (rw || cw) {
    if (!rw || !cw || rw.distro.toLowerCase() !== cw.distro.toLowerCase()) return false;
    return cw.linux === rw.linux || cw.linux.startsWith(rw.linux.replace(/\/$/, '') + '/');
  }
  const r = api.relative(root, candidate);
  return r === '' || (!r.startsWith('..' + api.sep) && r !== '..' && !api.isAbsolute(r));
}
const excluded = new Set(['.git','node_modules','.venv','venv','dist','.next','__pycache__']);
export const rootCandidates = roots => [...new Set(roots.map(slash))].map(path => ({ path, kind: 'directory' }));
export function rankPaths(items, query, limit = 40) {
  const q = slash(query).toLocaleLowerCase();
  return items.map((item, order) => {
    const p = slash(item.path).toLocaleLowerCase(), name = p.slice(p.lastIndexOf('/') + 1);
    const score = name === q ? 0 : name.startsWith(q) ? 1 : name.includes(q) ? 2 : p.includes(q) ? 3 : 9;
    return { item, score, order };
  }).filter(x => x.score < 9).sort((a,b) => a.score-b.score || a.order-b.order).slice(0,limit).map(x => x.item);
}
// Coalesce rapid caret/backspace updates. Only the newest UI query may publish.
export function createCompletionQueue(search, lifecycle, delay = 100) {
  const pending = new WeakMap();
  return async (agent, query, signal) => {
    pending.get(agent)?.abort();
    const control = new AbortController(); pending.set(agent, control);
    const combined = AbortSignal.any([lifecycle, control.signal, ...(signal ? [signal] : [])]);
    try {
      combined.throwIfAborted();
      // Bare @ must return immediately, including when a prior WSL lookup is running.
      if (query) await new Promise((resolve, reject) => {
        const abort = () => { clearTimeout(timer); cleanup(); reject(combined.reason); };
        const cleanup = () => combined.removeEventListener('abort', abort);
        const timer = setTimeout(() => { cleanup(); resolve(); }, delay);
        combined.addEventListener('abort', abort, { once: true });
        if (combined.aborted) abort();
      });
      const value = await search(agent, query, combined);
      combined.throwIfAborted(); return value;
    } catch (error) {
      if (combined.aborted) return [];
      throw error;
    } finally { if (pending.get(agent) === control) pending.delete(agent); }
  };
}
// One traversal shared by successive keystrokes. Directory navigation remains live.
export function createSearchCache(lifecycle, { ttl = 10000, maxKeys = 16 } = {}) {
  const cache = new Map();
  return {
    clear() { cache.clear(); },
    async get(key, load, signal) {
      signal?.throwIfAborted(); lifecycle.throwIfAborted();
      let entry = cache.get(key);
      if (!entry || (entry.value && Date.now()-entry.time >= ttl)) {
        if (cache.size >= maxKeys) cache.delete(cache.keys().next().value);
        entry = { time: Date.now() }; cache.set(key,entry);
        entry.promise = Promise.resolve().then(() => load(lifecycle)).then(value => {
          entry.value = value; entry.time = Date.now(); return value;
        }, error => { if (cache.get(key) === entry) cache.delete(key); throw error; });
      }
      // Caller cancellation must not abort the shared traversal needed by a newer query.
      if (!signal) return entry.promise;
      return new Promise((resolve,reject) => {
        const aborted = () => { cleanup(); reject(signal.reason ?? new Error('Search cancelled')); };
        const cleanup = () => signal.removeEventListener('abort',aborted);
        signal.addEventListener('abort',aborted,{once:true});
        entry.promise.then(value => { cleanup(); if(signal.aborted) aborted(); else resolve(value); },error => { cleanup(); reject(error); });
        if (signal.aborted) aborted();
      });
    }
  };
}
export async function indexRoots(fs, roots, signal, maxEntries = 30000) {
  const all = rootCandidates(roots), seen = new Set(all.map(x=>x.path));
  let visited = 0;
  // Each root has its own budget so an enormous first project cannot starve the others.
  const quota = Math.max(1,Math.floor(maxEntries/Math.max(1,roots.length)));
  for (const rootPath of roots) {
    signal?.throwIfAborted();
    let root;
    try { root=await fs.resolve(rootPath,{signal}); if((await fs.stat(root,signal))?.type!=='directory')continue; }
    catch(error){ signal?.throwIfAborted(); continue; }
    const queue=[root]; let count=0;
    for(let cursor=0;cursor<queue.length && count<quota && visited<maxEntries;cursor++) {
      signal?.throwIfAborted(); let entries;
      try { entries=await fs.listDir(queue[cursor],signal); } catch(error){ signal?.throwIfAborted(); continue; }
      for(const entry of entries) {
        if(++count>quota || ++visited>maxEntries)break;
        if(!['directory','file'].includes(entry.type) || (entry.type==='directory' && excluded.has(entry.name)))continue;
        if(!fs.contains(root,entry.target))continue;
        const p=fs.processPath(entry.target);
        let info; try{info=await fs.lstat(p,{},signal);}catch(error){signal?.throwIfAborted();continue;}
        if(info?.type==='symlink')continue;
        const normalized=slash(p);
        if(!seen.has(normalized)){seen.add(normalized);all.push({path:normalized,kind:entry.type});}
        if(entry.type==='directory')queue.push(entry.target);
      }
    }
  }
  return all;
}
export async function searchRoots(fs, roots, query, signal, limit = 40) {
  signal?.throwIfAborted();
  const q=slash(query);
  if(q.split('/').includes('..'))return [];
  if(!q)return rootCandidates(roots); // @ opens the project chooser, no filesystem I/O.
  if(!absolutePath(q))return rankPaths(await indexRoots(fs,roots,signal),q,limit);
  const candidates=[],seen=new Set();
  for(const rootPath of roots) {
    if(!within(rootPath,q))continue;
    const api=pathApi(rootPath); let root,dir;
    try {
      root=await fs.resolve(rootPath,{signal});
      dir=await fs.resolve(q.endsWith('/')?q:api.dirname(q),{signal});
      if(!fs.contains(root,dir))continue;
      const needle=q.endsWith('/')?'':api.basename(q).toLocaleLowerCase();
      for(const entry of await fs.listDir(dir,signal)) {
        signal?.throwIfAborted();
        if(!['directory','file'].includes(entry.type)||(entry.type==='directory'&&excluded.has(entry.name)))continue;
        if(!entry.name.toLocaleLowerCase().includes(needle)||!fs.contains(root,entry.target))continue;
        const p=fs.processPath(entry.target);
        if((await fs.lstat(p,{},signal))?.type==='symlink')continue;
        const normalized=slash(p);
        if(!seen.has(normalized)){seen.add(normalized);candidates.push({path:normalized,kind:entry.type});}
      }
    } catch(error){signal?.throwIfAborted();continue;}
  }
  return candidates.sort((a,b)=>(a.kind==='directory'?0:1)-(b.kind==='directory'?0:1)||a.path.localeCompare(b.path)).slice(0,limit);
}
