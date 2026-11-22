import assert from 'node:assert/strict';
import path from 'node:path';
import * as fs from 'node:fs/promises';
import {hostPath,samePath,pathApi} from '../paths.js';
import {within,searchRoots} from '../search.js';
assert.equal(hostPath('/home/test/a b','Ubuntu-22.04','win32'),'\\\\wsl.localhost\\Ubuntu-22.04\\home\\test\\a b');
assert.equal(hostPath('\\\\wsl$\\Ubuntu-22.04\\home\\test','', 'win32'),'\\\\wsl.localhost\\Ubuntu-22.04\\home\\test');
assert.throws(()=>hostPath('/home/test','','win32'));
assert.throws(()=>hostPath('/home/../etc','Ubuntu-22.04','win32'));
assert.throws(()=>hostPath('/home/test','Ubuntu;whoami','win32'));
assert.equal(hostPath('/home/test','','linux'),'/home/test');
assert.equal(pathApi('C:/project'),path.win32);
assert(within('/home/test','/home/test/sub'));
assert(!within('/home/test','/home/testing'));
assert(!within('\\\\wsl.localhost\\Ubuntu-22.04\\home\\Case','//wsl.localhost/Ubuntu-22.04/home/case/a'));
assert(samePath('\\\\wsl$\\Ubuntu-22.04\\home\\test','//wsl.localhost/Ubuntu-22.04/home/test'));
assert(!samePath('\\\\wsl$\\Ubuntu-22.04\\home\\A','//wsl.localhost/Ubuntu-22.04/home/a'));
const base=process.argv[2];
if(base){
 const root=hostPath(base,'Ubuntu-22.04');
 const target=p=>({displayPath:p});
 const adapter={resolve:async p=>target(await fs.realpath(p)),processPath:t=>t.displayPath,
 stat:async t=>{try{const s=await fs.stat(t.displayPath);return{type:s.isDirectory()?'directory':'file'};}catch(e){if(e.code==='ENOENT')return;throw e;}},
 contains:(r,c)=>within(r.displayPath,c.displayPath),
 lstat:async p=>{const s=await fs.lstat(p);return{type:s.isSymbolicLink()?'symlink':s.isDirectory()?'directory':'file'};},
 listDir:async t=>(await fs.readdir(t.displayPath,{withFileTypes:true})).map(d=>({name:d.name,type:d.isDirectory()?'directory':d.isFile()?'file':'other',target:target(path.join(t.displayPath,d.name))}))};
 const roots=[path.join(root,'first'),path.join(root,'second space')];
 const items=await searchRoots(adapter,roots,'中文文件',new AbortController().signal);
 assert.equal(items.length,1);assert(items[0].path.startsWith('//wsl.localhost/'));
 const drill=await searchRoots(adapter,roots,roots[1].replaceAll('\\','/')+'/',new AbortController().signal);
 assert(drill.some(x=>x.path.endsWith('/中文文件.txt')));
 const empty=await searchRoots(adapter,roots,'',new AbortController().signal);
 assert(empty.some(x=>x.path.endsWith('/first')));assert(empty.some(x=>x.path.endsWith('/second space')));
 console.log('PASS: live WSL multi-root search, Chinese/spaces, UNC directory drill, both roots visible');
}
console.log('PASS: Windows/POSIX paths, WSL aliases, distribution validation, case-sensitive containment');
