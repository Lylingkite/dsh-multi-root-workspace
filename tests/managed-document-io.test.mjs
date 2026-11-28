import assert from 'node:assert/strict';
import { readManagedDocument, writeManagedDocument, WORKSPACE_DOCUMENT_FILENAME as name } from '../project-document.js';
const root = '/work/project';
const target = root+'/'+name;
let row, policy = {mode:'workspace-write',workspaceRoot:'/work'};
const fs = {
  sandboxMode:'workspace-write', resolve:async p=>p, processPath:p=>p,
  contains:(a,b)=>a===b || b.startsWith(a+'/'), listDir:async()=>[],
  lstat:async p=>p===root ? {type:'directory'} : p===target ? row : undefined,
  stat:async p=>p===root ? {type:'directory'} : p===target ? row : undefined,
  readBytes:async (p,_signal,max)=>{
    assert.equal(p,target); assert.ok(max>0); return Buffer.from(row.text);
  },
  writeText:async (p,text,intent,_signal,given)=>{
    assert.equal(p,target); assert.equal(given,policy);
    if (intent.kind==='createIfAbsent') assert.equal(row,undefined);
    else {
      assert.equal(intent.kind,'replaceIfVersion');
      if (intent.version!==row?.version) throw new Error('FS_STALE_VERSION');
    }
    row={type:'file',text,version:String(Number(row?.version ?? 0)+1)};
  }
};
const agent={ctx:{get:n=>n==='fs'?fs:{resolve:()=>policy}},session:{}};
assert.equal(await readManagedDocument(agent,root,name),null);
const manual='\uFEFF# 用户手工内容\r\n';
assert.equal(await writeManagedDocument(agent,root,name,manual,null),target);
const first=await readManagedDocument(agent,root,name);
assert.equal(first.text,manual);
await assert.rejects(writeManagedDocument(agent,root,name,'# Duplicate',null),/变化/);
await writeManagedDocument(agent,root,name,manual+'附录\r\n',first);
await assert.rejects(writeManagedDocument(agent,root,name,'# Stale',first),/FS_STALE_VERSION/);
assert.equal((await readManagedDocument(agent,root,name)).text,manual+'附录\r\n');
await assert.rejects(readManagedDocument(agent,root,'README.md'),/可管理/);
policy={mode:'workspace-write',workspaceRoot:'/unrelated'};
await assert.rejects(readManagedDocument(agent,root,name),/范围/);
policy={mode:'read-only',workspaceRoot:'/work'};
await assert.rejects(readManagedDocument(agent,root,name),/只读/);
policy={mode:'workspace-write',workspaceRoot:'/work'};
row={type:'symlink'};
await assert.rejects(readManagedDocument(agent,root,name),/普通文件/);
console.log('PASS: managed document path allowlist, policy checks, UTF-8/BOM/CRLF, create-only and stale-write rejection');
