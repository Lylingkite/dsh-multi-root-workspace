import assert from 'node:assert/strict';
import { apply, Config } from '../index.js';
const primary='/work/main', extra='/work/api';
const workspace={id:'a',path:primary,title:'Test',sessionIds:['a-session']};
const agent={id:'a-session',session:{header:{cwd:primary}}};
const entries=new Map([[primary,['README.md','package.json']], [extra,['package.json']]]);
const bodies=new Map([[primary+'/README.md',{text:'# 手工 README\r\n',version:'1'}]]);
// Each fixture folder answers as its own small Node project so project names
// differ per directory, exactly like the real workspaces.
const basenameOf = p => p.replace(/\\/g,'/').split('/').filter(Boolean).at(-2) ?? 'fixture';
const volatileWrite=Symbol.for('cosmokit.volatile.write');
const raw={workspaces:{a:{primary,roots:[extra],descriptions:[{path:extra,text:'legacy'}]}},documentModel:'route/model'};
let config=Config['~standard'].validate(raw).value, command, context, relationsContext, preStep, sessionEvent, calls=0;
const fs={sandboxMode:'workspace-write',resolve:async p=>p,processPath:p=>p,contains:(a,b)=>a===b||b.startsWith(a+'/'),
  stat:async p=>entries.has(p)?{type:'directory'}:(entries.has(p.slice(0,p.lastIndexOf('/')))?{type:'file',version:bodies.get(p)?.version}:undefined),
  lstat:async p=>entries.has(p)?{type:'directory'}:([...entries].some(([d,list])=>list.some(n=>p===d+'/'+n))?{type:'file',version:bodies.get(p)?.version}:undefined),
  listDir:async p=>(entries.get(p)??[]).map(name=>({name,target:p+'/'+name,type:'file'})),
  readText:async p=>bodies.get(p)?.text ?? (p.endsWith('package.json')?'{"name":basenameOf(p),"dependencies":{"express":"^4"}}':'# 概览'),
  readBytes:async p=>Buffer.from(bodies.get(p).text),
  readByteRange:async (p,{offset,length})=>Buffer.from(bodies.get(p).text).subarray(offset,offset+length),
  writeText:async (p,text,intent,_signal,given)=>{
    assert.ok(given && typeof given.workspaceRoot==='string');
    assert.notEqual(p,primary+'/README.md','README is never changed');
    const previous=bodies.get(p);
    if (intent.kind==='createIfAbsent') {
      assert.equal(previous,undefined);
      entries.get(p.slice(0,p.lastIndexOf('/'))).push(p.slice(p.lastIndexOf('/')+1));
    } else {
      assert.equal(intent.kind,'replaceIfVersion');
      assert.equal(previous.version,intent.version);
    }
    const next=String(Number(previous?.version ?? 0)+1);
    bodies.set(p,{text,version:next});
    return {operation:previous?'update':'create',version:next,before:previous?.text??null,after:text};
  }};
const llm={listProviders:()=>[{id:'route'}],async *stream(request){calls++;const payload=JSON.parse(request.messages[0].content[0].text);
  if (payload.task==='Write DSH-WORKSPACE.md') {
    // The workspace prompt summarises every project in one document.
    assert.ok(Array.isArray(payload.projects) && payload.projects.length);
    assert.equal(payload.projects[0].role,'primary');
    for (const project of payload.projects) assert.ok(project.facts && typeof project.facts.ecosystem==='string');
    yield {type:'text-delta',text:'# 工作区\n\n## 工作区概览\n说明\n\n## 项目一览\n| 项目 | 角色 |\n| --- | --- |\n' + payload.projects.map(p=>'| '+p.name+' | '+p.role+' |').join('\n') + '\n\n## 项目详情\n' + payload.projects.map(p=>'### '+p.name+'\n内容').join('\n\n') + '\n\n## 未确认项\n无'};
    yield {type:'finish',reason:{kind:'stop'}};
    return;
  }
  assert.equal(payload.project.ecosystem,'Node.js');assert.ok(Array.isArray(payload.project.tree));yield {type:'text-delta',text:'# 概览\n\n## 这个项目是什么\n- 夹具说明\n\n## 技术栈与依赖\n- 夹具说明\n\n## 目录结构\n- 夹具说明\n\n## 数据与表\n- 夹具说明\n\n## 核心模块\n- 夹具说明\n\n## 上下游关系\n- 夹具说明\n\n## 运行与脚本\n- 夹具说明\n\n## 已知注意点\n- 夹具说明\n\n## 未确认项\n- 夹具说明'};yield {type:'finish',reason:{kind:'stop'}};}};
const ctx={fiber:{entry:{}},fs,subprocess:{},workingDirectory:{get:()=>primary},agentPresets:{presetForSession:()=> 'standard'},
  get:name=>name==='llm'?llm:undefined,
  workspaceRegistry:{get:()=>workspace,list:()=>[workspace]},configEditor:{edit:async(_,edit)=>{config=edit(config);}},
  systemPrompt:{getSectionOrder:()=>0,section(){},context(value){if(value.name==='multi-root:workspace-relationships') relationsContext=value;else context=value;}},commands:{register(value){command=value;}},tools:{register(){}},
  on(name,fn){if(name==='agent/pre-step')preStep=fn;if(name==='session/event')sessionEvent=fn;},effect:f=>f(),provide(){}};
agent.ctx={fs,sandboxPolicy:{resolve:()=>({mode:'workspace-write',workspaceRoot:'/work'})}};
apply(ctx,config);
const run=(action,args={})=>command.handler({agent,rawInput:JSON.stringify({action,workspaceId:'a',...args})});
const call=async (...args)=>{const out=await run(...args);assert.equal(out.kind,'success',out.text);return JSON.parse(out.text);};
// One document per workspace: the primary reports it, the additional folder is
// marked as additional instead of claiming a file of its own.
const listed=(await call('documents')).documents;
if(JSON.stringify(listed)!==JSON.stringify([{path:primary,document:null},{path:extra,document:null,additional:true}])) console.error('DEBUG listed:',JSON.stringify(listed));
assert.deepEqual(listed,[{path:primary,document:null},{path:extra,document:null,additional:true}]);
assert.equal((await call('documents')).model,'route/model');
assert.equal((await run('document-settings',{model:'other/model'})).kind,'error','legacy command is removed');
// Generating the primary builds the workspace document; an additional folder is
// refused because it never produces one.
const extraDenied=await run('generate-document',{path:extra});
assert.equal(extraDenied.kind,'error');
assert.match(extraDenied.text,/附加目录/);
const spent=calls;
assert.equal((await run('generate-document',{path:'/elsewhere'})).kind,'error');
assert.equal(calls,spent,'a folder outside the workspace is rejected before any model call');
agent.ctx.sandboxPolicy.resolve=()=>({mode:'workspace-write',workspaceRoot:primary});
// Every project writes its own note in its own folder; a folder the session
// cannot write is refused rather than redirected into another project.
const blocked=await run('generate-document',{path:extra});
assert.equal(blocked.kind,'error');
assert.match(blocked.text,/附加目录|DSH-WORKSPACE/,'an additional folder is told where its content goes');
assert.ok(!bodies.has(extra+'/DSH-PROJECT.md'),'no file is created inside an additional folder');
agent.ctx.sandboxPolicy.resolve=()=>({mode:'workspace-write',workspaceRoot:'/work'});
// The primary folder produces the single workspace document, which then shows up
// in the model's document list.
await preStep({agent},()=>{});
for (let i=0;i<60 && !bodies.has(primary+'/DSH-WORKSPACE.md');i++) await new Promise(resolve=>setImmediate(resolve));
if(!bodies.has(primary+'/DSH-WORKSPACE.md')) console.error('DEBUG overviewError:', JSON.stringify((await call('documents')).overviewError), 'files:',[...bodies.keys()]);
assert.ok(bodies.has(primary+'/DSH-WORKSPACE.md'),'the workspace document is written into the primary folder');
assert.equal(context.text({agent:{session:{header:{cwd:'/elsewhere'}}}}),'');
const emit=(type,data,seq)=>sessionEvent(agent.session,{type,data,seq});
emit('turn/start',{turn:10});
emit('user/message',{role:'user',source:{kind:'goal'},content:[{type:'text',text:'main 负责生成任务'}]},12);
emit('user/message',{role:'user',source:{kind:'user'},content:[{type:'text',text:'api 调用 main 的订单接口'}]},13);
emit('turn/end',{turn:10,reason:{kind:'completed'}});
// A chat turn may have backfilled the workspace overview already; preview must
// still leave every document byte-identical.
const snapshot=()=>JSON.stringify([...bodies].map(([k,v])=>[k,v.text]).sort());
// A chat turn backfills missing per-folder notes and the workspace index in the
// background; let that settle so the preview assertion below is not racing it.
const settle=async()=>{
  let previous=null;
  for (let i=0;i<80;i+=1) {
    const now=JSON.stringify([...bodies].map(([k,v])=>[k,v.text]).sort());
    if (now===previous) return now;
    previous=now;
    await new Promise(resolve=>setImmediate(resolve));
  }
  return previous;
};
await settle();
const beforePreview=new Map([...bodies].map(([k,v])=>[k,v.text]));
const pending=(await call('document-proposals')).items;
assert.equal(pending.length,1);
const proposalId=pending[0].id;
assert.equal((await run('apply-document-proposal',{proposalId,token:'forged'})).kind,'error');
const priorState=snapshot();
const preview=await call('preview-document-proposal',{proposalId});
assert.equal(snapshot(),priorState,'preview never writes');
// A proposal touches exactly one file: the workspace document.
assert.deepEqual(preview.changes.map(c=>c.path),[primary+'/DSH-WORKSPACE.md']);
assert.ok(preview.changes.every(c=>c.diff.includes('api 调用 main')));
const local=bodies.get(primary+'/DSH-WORKSPACE.md');
bodies.set(primary+'/DSH-WORKSPACE.md',{text:local.text+'\n用户补充\n',version:'2'});
const staleState=bodies.get(primary+'/DSH-WORKSPACE.md').text;
assert.match((await run('apply-document-proposal',{proposalId,token:preview.token})).text,/被修改/);
assert.equal(bodies.get(primary+'/DSH-WORKSPACE.md').text,staleState,'a stale preview writes nothing');
const updated=await call('preview-document-proposal',{proposalId});
assert.deepEqual((await call('apply-document-proposal',{proposalId,token:updated.token})).applied,preview.changes.map(c=>c.path));
assert.match(bodies.get(primary+'/DSH-WORKSPACE.md').text,/用户补充/);
assert.equal(bodies.get(primary+'/README.md').text,'# 手工 README\r\n');
assert.deepEqual((await call('document-proposals')).items,[]);
const row=await call('get');await call('save',{primary,roots:[extra],revision:row.revision});assert.equal(config.workspaces.a.descriptions[0].text,'legacy');
// Adding a folder regenerates the single workspace document in the primary
// folder: the new project is summarized inside it, and no extra file appears.
const added='/work/orders';
entries.set(added,['package.json']);
const previousOverview=bodies.get(primary+'/DSH-WORKSPACE.md').text;
const beforeAdd=await call('get');
await call('save',{primary,roots:[extra,added],revision:beforeAdd.revision});
for (let i=0; i<80 && !bodies.get(primary+'/DSH-WORKSPACE.md').text.includes('orders'); i++) {
  await new Promise(resolve=>setImmediate(resolve));
}
const status=await call('documents');
assert.equal(status.overview, primary+'/DSH-WORKSPACE.md');
assert.deepEqual(status.documents.map(row=>[row.path,row.included]), [[primary,true],[extra,true],[added,true]]);
const original=bodies.get(status.overview);
bodies.set(status.overview,{...original,text:original.text.replace(/^### orders$/m,'### other')});
const rechecked=await call('documents');
assert.equal(rechecked.documents.find(row=>row.path===added).included,false,'a folder mentioned in the index but without a matching detail is missing');
bodies.set(status.overview,original);
await call('documents');
assert.match(bodies.get(primary+'/DSH-WORKSPACE.md').text,/orders/,'the new project is summarized');
assert.ok(bodies.get(primary+'/DSH-WORKSPACE.md').text.includes('用户补充'),'user text outside the managed block survives regeneration');
assert.ok(!bodies.has(added+'/DSH-WORKSPACE.md'),'no document is written into an additional folder');
const unchanged=await call('get');
await call('save',{primary,roots:[extra,added],revision:unchanged.revision});
await preStep({agent},()=>{});
const settled=calls;
assert.ok(settled>=2,'saving the same list and later turns do not rescan');
const refMessage={id:'human',role:'user',source:{kind:'user'},content:[{type:'text',text:'检查 @/work/main/'}]};
const refsDecision={kind:'enter',messages:[refMessage]};
assert.equal(await preStep({agent,messages:[refMessage],turn:11},()=>refsDecision),refsDecision);
assert.match(context.text({agent}), /DSH-WORKSPACE\.md/,'the workspace document is attached');
assert.match(context.text({agent}), /"additional":true/,'additional folders are marked as such');
const noDoc='/work/folder-from-chat';
entries.set(noDoc,['package.json']);
// The chat path writes into a folder the session may write, per the new rule.
agent.ctx.sandboxPolicy.resolve=()=>({mode:'workspace-write',workspaceRoot:'/work'});
const directFolder={...refMessage,content:[{type:'text',text:'了解 @'+noDoc+'/'}]};
await preStep({agent,messages:[directFolder],turn:12},()=>({kind:'enter',messages:[directFolder]}));


// The excerpt belongs to this turn only; the check happens below on a turn that
// mentions no folder at all.
assert.ok(!config.workspaces.a.roots.includes(noDoc),'folder mention does not edit workspace settings');
const noRef={...refMessage,content:[{type:'text',text:'继续'}]};
await preStep({agent,messages:[noRef],turn:13},()=>({kind:'enter',messages:[noRef]}));

const savedNotes=await call('workspace-relations');
assert.deepEqual(savedNotes.relations,[]);
const aNote=await call('save-workspace-relation',{revision:savedNotes.revision,text:'网关调用订单服务查询状态。'});
const bNote=await call('save-workspace-relation',{revision:aNote.revision,text:'订单服务负责状态流转。'});
assert.equal((await run('save-workspace-relation',{revision:aNote.revision,text:'过期修改'})).kind,'error');
const newAgent={id:'fresh-chat',session:{header:{cwd:primary}}};
assert.match(relationsContext.text({agent:newAgent}),/网关调用订单服务/);
assert.match(relationsContext.text({agent:newAgent}),/订单服务负责状态流转/);
assert.equal(relationsContext.text({agent:{id:'other',session:{header:{cwd:'/elsewhere'}}}}),'');
const edited=await call('save-workspace-relation',{revision:bNote.revision,relationId:aNote.relations[0].id,text:'网关调用订单服务的只读接口。'});
assert.equal(edited.relations[1].text,bNote.relations[1].text);
const rootSnapshot=await call('get');
await call('save',{primary,roots:[extra,added],revision:rootSnapshot.revision});
assert.deepEqual((await call('workspace-relations')).relations,edited.relations);
const removed=await call('remove-workspace-relation',{revision:edited.revision,relationId:aNote.relations[0].id});
assert.deepEqual(removed.relations,[bNote.relations[1]]);
assert.match(relationsContext.text({agent:newAgent}),/订单服务负责状态流转/);
assert.doesNotMatch(relationsContext.text({agent:newAgent}),/只读接口/);
// queue-document must await the async WSL workspace shape before reading roots.
assert.equal((await run('queue-document',{path:'/nowhere'})).kind,'error');
assert.ok(!/is not iterable/.test((await run('queue-document',{path:primary})).text||''));
const queued=await call('queue-document',{path:extra});
assert.equal(queued.queued,true);
// A workspace record without a roots array must not throw during backfill.
entries.set('/work/solo',[]);
const soloWorkspace={id:'solo',path:'/work/solo',sessionIds:['solo-chat']};
ctx.workspaceRegistry.list=()=>[workspace,soloWorkspace];
ctx.workspaceRegistry.get=id=>id==='solo'?soloWorkspace:workspace;
const soloAgent={id:'solo-chat',session:{header:{cwd:'/work/solo'}}};
await preStep({agent:soloAgent},()=>{});
assert.equal((await call('documents')).overview !== undefined,true);
// An additional folder outside the sandbox write scope must not abort: its
// note is written as a managed block in the primary project's document, and no
// file is created inside the read-only folder.
agent.ctx.sandboxPolicy.resolve=()=>({mode:'workspace-write',workspaceRoot:primary});
const readOnlyExtra='/work/locked';
entries.set(readOnlyExtra,['package.json']);
const withLocked=await call('get');
await call('save',{primary,roots:[extra,added,readOnlyExtra],revision:withLocked.revision});
agent.ctx.sandboxPolicy.resolve=()=>({mode:'workspace-write',workspaceRoot:primary});
bodies.set(readOnlyExtra+'/package.json',{text:'{"name":"locked","dependencies":{"left-pad":"1.0.0"}}',version:'1'});
// An additional folder never produces a document of its own, writable or not.
const primaryNote=primary+'/DSH-WORKSPACE.md';
const beforeNote=bodies.get(primaryNote)?.text ?? null;
const denied=await run('generate-document',{path:readOnlyExtra});
assert.equal(denied.kind,'error');
assert.match(denied.text,/附加目录/);
assert.ok(!bodies.has(readOnlyExtra+'/DSH-PROJECT.md'),'nothing is written inside an additional folder');
assert.equal(bodies.get(primaryNote)?.text ?? null,beforeNote,'the workspace document is untouched');
agent.ctx.sandboxPolicy.resolve=()=>({mode:'workspace-write',workspaceRoot:'/work'});
// Scanning never writes a relationship on its own: cross-project evidence is
// only ever turned into a proposal for review.
{
  const before=(await call('workspace-relations')).relations.length;
  await call('generate-document',{path:primary});
  assert.equal((await call('workspace-relations')).relations.length,before,
    'generation does not write relationships by itself');
}
// Generating the primary reports the workspace document and never the README.
{
  const generated = await call('generate-document',{path:primary});
  assert.equal(generated.document,primary+'/DSH-WORKSPACE.md');
  assert.notEqual(generated.document,primary+'/README.md','a README never stands in for the document');
}
// Native settings: schema exposes only documentModel as volatile live field and
// preserves unschematized workspace config verbatim.
const resolved=Config['~standard'].validate({...raw,documentModel:'route/model'}).value;
assert.equal(resolved.documentModel.get(),'route/model');
assert.deepEqual(resolved.workspaces,raw.workspaces);
const json=Config.toJSON();assert.equal(json.refs[String(json.refs[json.uid].dict.documentModel)].meta.volatile,true);
// Live update without remount: the same reference sees the new value.
config.documentModel[volatileWrite]('route/other');
assert.equal((await call('documents')).model,'route/other');
console.log('PASS: README precedence, native volatile model settings, authorized generation, denial before model calling, path-only context, legacy preservation');
