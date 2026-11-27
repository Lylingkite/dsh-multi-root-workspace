import assert from 'node:assert/strict';
import { apply } from '../index.js';
const primary='/work/main', extra='/work/api';
const workspace={id:'a',path:primary,sessionIds:['a-session']};
const other={id:'b',path:'/elsewhere',sessionIds:['b-session']};
const agent={id:'a-session',session:{header:{cwd:primary}}};
let config={}; let command, context, scans=0;
const ctx={
  fiber:{entry:{}}, subprocess:{}, workingDirectory:{}, agentPresets:{presetForSession:()=> 'standard'},
  fs:{resolve:async p=>p==='/work/alias'?extra:p,stat:async()=>({type:'directory'}),processPath:p=>p,
    listDir:async p=>{assert.equal(p,extra);scans++;return [{name:'package.json',target:p+'/package.json',type:'file'},{name:'README.md',target:p+'/README.md',type:'file'}];},lstat:async()=>({type:'file'})},
  workspaceRegistry:{get:()=>workspace,list:()=>[workspace,other]},
  configEditor:{edit:async(_,edit)=>{config=edit(config);}},
  systemPrompt:{getSectionOrder:()=>0,section(){},context(value){context=value;}},
  commands:{register(value){command=value;}},tools:{register(){}},
  on(){},effect:f=>f(),provide(){}
};
apply(ctx,config);
const call=async (action,args={})=>{
  const out=await command.handler({agent,rawInput:JSON.stringify({action,workspaceId:'a',...args})});
  assert.equal(out.kind,'success',out.text);return JSON.parse(out.text);
};
assert.match((await call('describe',{path:'/work/alias'})).text,/Node.js\/npm.*README/);
let row=await call('get');
row=await call('save',{primary,roots:['/work/alias'],revision:row.revision});
assert.match(row.descriptions[0].text,/Node.js/);assert.equal(scans,2);
assert.match(context.text({agent}),/Node.js/);
assert(!context.text({agent:{id:'b-session',session:{header:{cwd:other.path}}}}).includes(extra));
const before=row.revision;
row=await call('save',{primary,roots:['/work/alias'],revision:before,descriptions:[{path:'/work/alias',text:'支付接口 {{literal}}'}]});
assert.deepEqual(row.descriptions,[{path:extra,text:'支付接口 {{literal}}'}]);
assert.equal(context.interpolate,false);assert.match(context.text({agent}),/支付接口 \{\{literal\}\}/);assert(!context.text({agent}).includes('Node.js'));
const stale=await command.handler({agent,rawInput:JSON.stringify({action:'save',workspaceId:'a',primary,roots:[extra],revision:before})});
assert.equal(stale.kind,'error');
row=await call('save',{primary,roots:[extra],revision:row.revision});
assert.equal(row.descriptions[0].text,'支付接口 {{literal}}');assert.equal(scans,2);
row=await call('save',{primary,roots:[extra],revision:row.revision,descriptions:[{path:extra,text:''}]});
apply(ctx,config);
row=await call('get');assert.deepEqual(row.descriptions,[{path:extra,text:''}]);
assert(!context.text({agent}).includes(extra));
row=await call('save',{primary,roots:[],revision:row.revision});assert.deepEqual(row.descriptions,[]);
assert.equal(scans,2);
console.log('PASS: command preview, fallback generation, canonical paths, revisions, saved-only isolated prompt, overrides, reload, explicit clear and removal');
