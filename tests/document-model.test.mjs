import assert from 'node:assert/strict';
import { modelRoute, generateMarkdown, detectRelationshipMentions } from '../document-model.js';
const facts = {projectName:'demo',ecosystem:'Node.js',dependencies:['express'],scripts:['start'],modules:[{path:'src/index.js',dir:'src',comment:'Entry point.',exports:['main'],lines:12}],tree:[{dir:'src',files:['index.js']}],dirs:['src'],fileCount:2,truncated:false};
const siblings = [{ecosystem:'Node.js',dependencies:['koa'],tree:[{dir:'lib',files:['a.js']}]}];
const llm = chunks => ({listProviders:()=>[{id:'test-route'}], async *stream(request) {
  assert.equal(request.model,'org/model'); assert.equal(request.provider,'test-route');
  assert.equal(request.tools,undefined); assert.equal(request.sessionId,undefined);
  const payload = JSON.parse(request.messages[0].content[0].text);
  assert.equal(payload.task,'Write DSH-PROJECT.md');
  assert.equal(payload.project.projectName,'demo');
  assert.deepEqual(payload.project.dependencies,['express']);
  assert.deepEqual(payload.siblingProjects,siblings);
  assert.match(request.system,/# <项目名>/);
  assert.match(request.system,/未确认项/);
  assert.match(request.system,/不要断言|Never invent/);
  assert.match(request.system,/目录结构/);
  assert.match(request.system,/上下游关系/);
  yield* chunks;
}});
const run = chunks => generateMarkdown(llm(chunks),'test-route/org/model',facts,siblings);
const delta = {type:'text-delta',text:'# 项目说明\n\n## 这个项目是什么\n- 夹具说明\n\n## 技术栈与依赖\n- 夹具说明\n\n## 目录结构\n- 夹具说明\n\n## 数据与表\n- 夹具说明\n\n## 核心模块\n- 夹具说明\n\n## 上下游关系\n- 夹具说明\n\n## 运行与脚本\n- 夹具说明\n\n## 已知注意点\n- 夹具说明\n\n## 未确认项\n- 夹具说明'};
assert.deepEqual(modelRoute(' test-route/org/model '),{provider:'test-route',model:'org/model'});
assert.equal(modelRoute(''),null);
assert.throws(()=>modelRoute('https://example.com/key'));
assert.equal(await run([delta,{type:'finish',reason:{kind:'stop'}}]),delta.text+'\n');
await assert.rejects(run([{type:'text-delta',text:'没有标题'},{type:'finish',reason:{kind:'stop'}}]),/未输出 Markdown 标题/);
// Numbered or lightly reworded headings must still be accepted: models rarely
// reproduce the outline verbatim, and rejecting that discarded real documents.
const numbered='# 项目\n\n'+['这个项目是什么','技术栈与依赖','目录结构','数据与表','核心模块','上下游关系','运行与脚本','已知注意点','未确认项']
  .map((h,i)=>`## ${i+1}. ${h}\n说明`).join('\n\n');
assert.equal(await run([{type:'text-delta',text:numbered},{type:'finish',reason:{kind:'stop'}}]), numbered+'\n');
// A document that clearly is not this outline is still refused.
const unrelated='# 别的\n\n## 安装\n## 使用\n';
await assert.rejects(run([{type:'text-delta',text:unrelated},{type:'finish',reason:{kind:'stop'}}]),/缺少关键章节/);
await assert.rejects(run([delta]),/未返回有效/);
await assert.rejects(run([delta,{type:'finish',reason:{kind:'error',failure:{code:'AUTH'}}}]),/认证失败/);
// A quota stop must name the configured model and point at the fix instead of
// reading like a transient plugin failure.
const quota=await run([delta,{type:'finish',reason:{kind:'error',failure:{code:'QUOTA'}}}]).then(()=>null,e=>e.message);
assert.match(quota,/额度|频率/);
assert.match(quota,/test-route\/org\/model/);
assert.match(quota,/设置/);
await assert.rejects(run([{type:'text-delta',text:'# '+ 'x'.repeat(16001)}]),/过长/);
// Relationship judgement belongs to the model, but a fabricated quote must be
// dropped: only text the human actually wrote can become a written fact.
const relationsLlm = reply => ({ listProviders: () => [{ id: 'r' }], async *stream() {
  yield { type: 'text-delta', text: reply };
  yield { type: 'finish', reason: { kind: 'stop' } };
} });
const projects = [{ id: 'a', name: 'etmsGateway' }, { id: 'b', name: 'etms' }];
const human = [{ seq: 7, text: '网关把订单数据发给订单系统，订单系统再落库。' }];
const good = await detectRelationshipMentions(relationsLlm('{"relations":[{"from":"a","to":"b","quote":"网关把订单数据发给订单系统","kind":"data"}]}'), 'r/x/y', projects, human);
assert.equal(good.length, 1);
assert.equal(good[0].relatedId, 'b');
const invented = await detectRelationshipMentions(relationsLlm('{"relations":[{"from":"a","to":"b","quote":"这句用户没说过","kind":"call"}]}'), 'r/x/y', projects, human);
assert.deepEqual(invented, [], 'a quote absent from the human text is rejected');
const sameProject = await detectRelationshipMentions(relationsLlm('{"relations":[{"from":"a","to":"a","quote":"网关把订单数据发给订单系统"}]}'), 'r/x/y', projects, human);
assert.deepEqual(sameProject, []);
const nonsense = await detectRelationshipMentions(relationsLlm('not json'), 'r/x/y', projects, human);
assert.deepEqual(nonsense, []);
console.log('PASS: structured prompt with real structure and sibling examples, outline enforced, incomplete and failed streams');
