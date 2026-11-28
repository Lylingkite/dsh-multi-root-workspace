import assert from 'node:assert/strict';
import { chatFolderReferences, collectChatDocuments, readHostChatDocuments } from '../chat-document.js';
const message=(text,kind='user')=>({role:'user',source:{kind},content:[{type:'text',text}]});
assert.deepEqual(chatFolderReferences([message('email@folder/ @api/ @api/file.js @../outside/ @"data warehouse/"')],'/work'),['/work/api','/work/data warehouse']);
assert.deepEqual(chatFolderReferences([message('@"C:/My Repo/  帮我看看')],'C:\\work'),['C:\\My Repo']);
assert.deepEqual(chatFolderReferences([message('@api/')],'/work','Ubuntu'),['/work/api']);
assert.deepEqual(chatFolderReferences([message('@hidden/','goal'),message('```txt\n@hidden/\n```')],'/work'),[]);
assert.deepEqual(chatFolderReferences([message('@\\\\wsl.localhost\\Other\\work/')],'/work','Ubuntu'),[]);
const data=new Map([['/work/project/README.md',Buffer.from('# Existing\napi_key=very-private\n')],['/work/project/DSH-PROJECT.md',Buffer.from('# Supplemental')]]);
const fs={lstat:async p=>({type:data.has(p)?'file':'directory'}),resolve:async p=>p,processPath:p=>p,contains:(a,b)=>b.startsWith(a+'/'),listDir:async()=>Array.from(data.keys(),p=>({name:p.split('/').at(-1),type:'file'})),readByteRange:async(p,{length})=>data.get(p).subarray(0,length)};
const found=await readHostChatDocuments(fs,'/work/project');
assert.deepEqual(found.documents.map(d=>d.name),['README.md','DSH-PROJECT.md']);
const calls=[];
const refs=await collectChatDocuments(['/work/project','/work/new','/work/denied'],{
 inspect:async p=>p.endsWith('/project')?found:p.endsWith('/denied')?{documents:[],unavailable:true}:{documents:[]},
 scan:async p=>{calls.push(['scan',p]);return {fileCount:3,tree:[{dir:'src',files:['index.js']}],dependencies:['express'],modules:[{path:'src/index.js',exports:['run']}]};},
 save:async(p,text)=>{calls.push(['save',p]);assert.match(text,/express/);return false;}
});
assert.doesNotMatch(JSON.stringify(refs),/very-private/);
assert.match(refs[0].documents[0].text, /Existing/);
assert.match(refs[1].documents[0].text, /index\.js/);
assert.match(refs[1].status, /未写入/);
assert.match(refs[2].status, /不可读/);
assert.deepEqual(calls,[['scan','/work/new'],['save','/work/new']]);
console.log('PASS: native @folder parsing, existing README excerpt, redaction, automatic structural fallback, no overwrite');
