import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { searchRoots, indexRoots, rankPaths, createSearchCache, within } from '../search.js';
const base=await fs.mkdtemp(path.join(os.tmpdir(),'multi-root-search-'));
const roots=[path.join(base,'work1'),path.join(base,'work2')];
const signal=new AbortController().signal;
let calls=0;
const target=p=>({displayPath:p});
const adapter={
 resolve:async p=>target(await fs.realpath(p)),
 stat:async t=>({type:(await fs.stat(t.displayPath)).isDirectory()?'directory':'file'}),
 contains:(r,c)=>within(r.displayPath,c.displayPath),processPath:t=>t.displayPath,
 lstat:async p=>({type:(await fs.lstat(p)).isSymbolicLink()?'symlink':'file'}),
 listDir:async t=>{calls++; return Promise.all((await fs.readdir(t.displayPath,{withFileTypes:true})).map(async d=>({name:d.name,type:d.isDirectory()?'directory':d.isFile()?'file':'symlink',target:target(path.join(t.displayPath,d.name))})));}
};
try {
 for(const root of roots){await fs.mkdir(path.join(root,'src'),{recursive:true});await fs.writeFile(path.join(root,'src','needle.txt'),'');await fs.writeFile(path.join(root,'top.txt'),'');}
 const empty=await searchRoots(adapter,roots,'',signal);
 assert.deepEqual(empty.map(x=>x.path),roots.map(x=>x.replaceAll('\\','/')));assert.equal(calls,0,'empty query must do no FS work');
 const nav=await searchRoots(adapter,roots,roots[0].replaceAll('\\','/')+'/',signal);
 assert.equal(nav.length,2);assert(nav.some(x=>x.path.endsWith('/src')));assert(!nav.some(x=>x.path.endsWith('needle.txt')));
 const all=await indexRoots(adapter,roots,signal);const hits=rankPaths(all,'needle');assert.equal(hits.length,2);
 assert.deepEqual(await searchRoots(adapter,roots,'../escape',signal),[]);
 const outside=path.join(base,'outside');await fs.mkdir(outside);await fs.writeFile(path.join(outside,'secret.txt'),'');
 try {await fs.symlink(outside,path.join(roots[0],'link'),'junction');const items=await indexRoots(adapter,roots,signal);assert(!items.some(x=>x.path.includes('secret')));assert.deepEqual(await searchRoots(adapter,roots,(roots[0]+'/link/').replaceAll('\\','/'),signal),[]);}catch(e){if(!['EPERM','EACCES'].includes(e.code))throw e;}
 let builds=0,finish;const cache=createSearchCache(signal);const load=()=>{builds++;return new Promise(r=>finish=r);};
 const c=new AbortController();const first=cache.get('roots',load,c.signal);const second=cache.get('roots',load,signal);await Promise.resolve();c.abort();await assert.rejects(first);finish(all);assert.equal(await second,all);assert.equal(builds,1);assert.equal(await cache.get('roots',load,signal),all);
 cache.clear();assert.equal(await cache.get('roots',async()=>{builds++;return all;},signal),all);assert.equal(builds,2);
 console.log('PASS: roots-only zero-I/O, Tab directory listing, all-roots search, traversal/symlink boundaries, shared index/cancellation/invalidation');
} finally { assert.equal(path.dirname(base),os.tmpdir());await fs.rm(base,{recursive:true,force:true}); }
