// Run with the desktop Electron executable in ELECTRON_RUN_AS_NODE mode.
// Arg 1 is the desktop installation's resources/app.asar/dsh directory;
// Arg 2 may point at an extracted candidate bundle's index.js (default: checkout).
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const installed = process.argv[2];
assert.ok(installed,'pass the desktop ASAR DSH directory');
const native = name=>import(pathToFileURL(path.join(installed,'node_modules','@deepseek-ai',name,'lib/index.js')).href);
const [{Context},{SystemPrompt},{apply}]=await Promise.all([
  native('cordis'),native('dsh-system-prompt'),
  import(process.argv[3] ? pathToFileURL(process.argv[3]).href : new URL('../index.js',import.meta.url).href),
]);
const primary='C:\\isolated-workspace';
const first={id:'one',path:primary,sessionIds:['current-chat']};
const second={id:'two',path:'C:\\isolated-other',sessionIds:['other-chat']};
const agent={id:'current-chat',session:{header:{cwd:primary}}};
let config={workspaces:{one:{primary,roots:[]},two:{relations:[{id:'other',text:'Other workspace sentinel'}]}}};
let command, provider;
const root=new Context();
const fiber=root.plugin(SystemPrompt,{});
await fiber;
const host=root.get('systemPrompt');
const disposers=[];
try {
  apply({
    fiber:{entry:{}},subprocess:{},agentPresets:{presetForSession:()=> 'standard'},
    workspaceRegistry:{list:()=>[first,second],get:id=>id==='one'?first:second},
    configEditor:{edit:async (_,edit)=>{config=edit(config);}},
    systemPrompt:{section:()=>{},getSectionOrder:()=>0,context:value=>{
      if (value.name==='multi-root:workspace-relationships') provider=value;
      return host.context(value);
    }},
    effect:fn=>{const off=fn();if (typeof off==='function') disposers.push(off);},
    on(){},provide(){},commands:{register:def=>{command=def;}},tools:{register(){}},
  },config);
  const call=async (action,args={})=>{
    const result=await command.handler({agent,rawInput:JSON.stringify({workspaceId:'one',action,...args})});
    assert.equal(result.kind,'success',result.text);
    return JSON.parse(result.text);
  };
  const empty=await call('workspace-relations');
  const firstNote='Payments calls Orders through the read-only status endpoint.';
  const secondNote='Orders owns lifecycle transitions.';
  const a=await call('save-workspace-relation',{revision:empty.revision,text:firstNote});
  await call('save-workspace-relation',{revision:a.revision,text:secondNote});
  const fresh={id:'fresh-chat',session:{header:{cwd:primary}}};
  const contextFor=async agent=>{
    const args={agent};
    const initial=await host.assemble(args);
    const assembled=host.refreshContext(initial,args);
    return assembled.contexts.find(entry=>entry.name===provider.name)?.text ?? '';
  };
  const assembled=await contextFor(fresh);
  assert.ok(assembled.includes(firstNote) && assembled.includes(secondNote),'native fresh assembly includes both workspace notes');
  assert.ok(!assembled.includes('Other workspace sentinel'));
  assert.equal(await contextFor({id:'unrelated',session:{header:{cwd:'C:\\outside'}}}),'');
  assert.equal(await contextFor({id:'child',session:{header:{cwd:primary,origin:'subagent'}}}),'');
  console.log('PASS: isolated actual desktop SystemPrompt/Cordis assembly; fresh same-workspace chat resolves saved text with no @; isolation holds');
} finally {
  for (const off of disposers.reverse()) await off();
  await fiber.dispose();
}
