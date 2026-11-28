import assert from 'node:assert/strict';
import { apply } from '../index.js';
const w={id:'w',path:'\\\\wsl.localhost\\Ubuntu-22.04\\home\\me\\work1',title:'WSL',sessionIds:['s']};
const agent={id:'s',session:{id:'s',header:{cwd:w.path}}};
const events={}, services={};let spawns=0;
const ctx={fiber:{entry:{}},effect:f=>f(),provide:(k,v)=>services[k]=v,on:(k,f)=>events[k]=f,
 fs:{resolve:()=>{throw new Error('Windows fs must not be used for WSL completion');}},
 workingDirectory:{get:()=>w.path},agentPresets:{presetForSession:()=> 'standard'}, // completion before WSL preset composition
 workspaceRegistry:{get:()=>w,list:()=>[w]},configEditor:{configuration:()=>[]},
 systemPrompt:{section:()=>()=>{},getSectionOrder:()=>0},commands:{register:()=>()=>{}},tools:{register:()=>()=>{}},
 subprocess:{spawn:spec=>{spawns++;const raw=spec.stdio?.stdin?.data ? Buffer.from(spec.stdio.stdin.data,'base64') : Buffer.from(spec.argv.at(-1),'base64');const req=JSON.parse(raw.toString());assert.equal(spec.argv[2],'Ubuntu-22.04');assert(['index','search'].includes(req.action),'known WSL root must not spawn repeated info');const items=req.action==='index'?[{path:'/home/me/work1/needle.txt',kind:'file'},{path:'/home/me/work2/needle.sql',kind:'file'}]:[{path:'/home/me/work2/child',kind:'directory'}];return {done:Promise.resolve({exitCode:0}),collected:{stdout:{readFrom:()=>({text:'__DSH_MULTI_ROOT_JSON__'+JSON.stringify({items}),lossy:false})},stderr:{readFrom:()=>({text:''})}}};}}
};
apply(ctx,{workspaces:{w:{environment:'wsl',wslDistro:'Ubuntu-22.04',primary:'/home/me/work1',roots:['/home/me/work2']}}});
const signal=new AbortController().signal;
assert.equal((await services.fileReferences.list(agent,'',signal)).length,2);assert.equal(spawns,0);
assert.equal((await services.fileReferences.list(agent,'needle',signal)).length,2);assert.equal(spawns,1);
assert.equal((await services.fileReferences.list(agent,'need',signal)).length,2);assert.equal(spawns,1,'typing reuses one WSL index');
assert.equal((await services.fileReferences.list(agent,'/home/me/work2/',signal)).length,1);assert.equal(spawns,2);
events['session/event'](agent.session,{type:'tool/result'});
await services.fileReferences.list(agent,'needle',signal);assert.equal(spawns,3,'tool result invalidates index');
assert.deepEqual(await services.fileReferences.list(agent,'../escape',signal),[]);
console.log('PASS: WSL context fallback, zero-spawn root chooser, one WSL index across keystrokes, live navigation, invalidation');
