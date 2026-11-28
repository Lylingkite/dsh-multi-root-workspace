import { structurePrompt } from './project-scan.js';

export function modelRoute(value) {
  if (typeof value !== 'string' || value.length > 200) throw new Error('模型格式应为 provider/model。');
  const text = value.trim();
  if (!text) return null;
  const match = /^([\w.-]+)\/([\w.:-]+(?:\/[\w.:-]+)*)$/u.exec(text);
  if (!match) throw new Error('模型格式应为 provider/model。');
  return { provider: match[1], model: match[2] };
}

const MAX_OUTPUT = 16000;

/**
 * Ask the configured model for a structured project document built from the
 * scanned structure: directory tree, module notes, dependencies. Sibling
 * projects are passed as style examples only, never as content to copy.
 */
export async function generateMarkdown(llm, selection, facts, siblings, signal) {
  const route = modelRoute(selection);
  if (!route) throw new Error('请先在插件设置中配置默认模型。');
  if (!llm?.stream || !llm.listProviders().some(p => p.id === route.provider)) throw new Error('默认模型的提供方未启用。');
  const bounded = AbortSignal.any([AbortSignal.timeout(120000), ...(signal ? [signal] : [])]);
  // Writing rules distilled from the technical-writing and
  // documenting-legacy-codebases skill sets: conclusion first, every claim tied
  // to scanned evidence, one fact in one place, unknowns stated rather than
  // guessed. No external skill is required at runtime.
  const system = [
    'You document an existing system in Simplified Chinese, as Markdown.',
    'Kind: descriptive. Audience: the engineer who inherits this project. Purpose: let them work without re-reading everything.',
    'Output MUST follow this outline exactly, in this order, nothing else:',
    '# <项目名>',
    '## 这个项目是什么  (3-5 sentences, conclusion first: what it does and who uses it)',
    '## 技术栈与依赖  (ecosystem and the role each observed dependency plays)',
    '## 目录结构  (one fenced text tree, each top-level entry annotated with its purpose)',
    '## 数据与表  (tables this project defines, and tables it reads from elsewhere; omit the section only if no SQL evidence exists)',
    '## 核心模块  (one item per important module: path, responsibility, what it exposes)',
    '## 上下游关系  (how data or calls flow to and from other projects, only when the evidence shows it)',
    '## 运行与脚本  (only commands or scripts actually observed in the scanned files)',
    '## 已知注意点  (surprising but real behavior worth knowing before changing it)',
    '## 未确认项  (what the evidence does not settle, and what was checked before giving up)',
    'Truth rules: every statement must follow from the supplied scan facts. Never invent files, tables, dependencies, commands, relationships or architecture. If you did not see it, put it under 未确认项 instead of asserting it.',
    'One fact lives in one place: do not repeat the same claim in two sections.',
    'State current behavior only. Do not describe how the document or the project evolved.',
    'Use no em dashes and no double hyphens as dashes; use commas, colons or parentheses.',
    'Headings stay in sentence case; do not translate technical identifiers.',
    'The siblingProjects entries are writing-convention examples only; never copy their names or facts.',
    'Stay under 7000 Chinese characters. No text before the first heading and no enclosing code fence.',
  ].join(' ');
  let text = '', finished = false;
  for await (const chunk of llm.stream({ ...route, signal: bounded, maxTokens: 4000,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: structurePrompt(facts, siblings) }] }] })) {
    bounded.throwIfAborted();
    if (chunk.type === 'text-delta') {
      text += chunk.text;
      if (text.length > MAX_OUTPUT) throw new Error('生成的说明过长，未写入文件。');
    }
    if (chunk.type === 'finish') {
      if (chunk.reason.kind !== 'stop') {
        const code = chunk.reason.failure?.code ?? chunk.reason.kind;
        // Name the model and the fix: a quota/credit stop is a configuration
        // problem, not a plugin failure, and must not read as a silent retry.
        const hint = /QUOTA|RATE|LIMIT|BALANCE|INSUFFICIENT/i.test(String(code))
          ? `当前模型 ${route.provider}/${route.model} 的额度或频率受限（${code}）。请在「设置 → 多文件夹工作区」改用其他可用模型后重试。`
          : /AUTH|UNAUTHOR|FORBIDDEN/i.test(String(code))
            ? `当前模型 ${route.provider}/${route.model} 认证失败（${code}）。请检查该供应商的配置。`
            : `模型 ${route.provider}/${route.model} 未完成说明生成（${code}）。`;
        throw new Error(hint);
      }
      finished = true;
    }
  }
  bounded.throwIfAborted();
  text = text.trim();
  if (!finished || !text || text.includes('\0')) throw new Error('模型未返回有效说明，未写入文件。');
  // Structure is checked for substance, not for literal spelling: models add
  // numbering, punctuation and close synonyms, and rejecting those threw away
  // usable documents. Accept when the outline is recognisably present.
  const required = ['这个项目是什么','技术栈与依赖','目录结构','数据与表','核心模块','上下游关系','运行与脚本','已知注意点','未确认项'];
  const normalize = value => String(value)
    .replace(/^[\s#>*\-\d.\u3001\uff08\uff09()\u3010\u3011:\uff1a]+/u, '')
    .replace(/[\s\u3001\uff0c\uff1a:\-\u2013\u2014]/gu, '')
    .toLowerCase();
  const actual = Array.from(text.matchAll(/^#{1,3}[ \t]+(.+?)\s*$/gm), match => normalize(match[1]));
  if (!/^#[ \t]+\S/m.test(text)) throw new Error('模型未输出 Markdown 标题，未写入文件。');
  const hit = required.filter(name => actual.some(line => line.includes(normalize(name))));
  const missing = required.filter(name => !hit.includes(name));
  // Allow a couple of renamed or merged sections; refuse only a document that
  // is clearly not the requested outline.
  if (hit.length < 7) {
    throw new Error('模型输出缺少关键章节（' + missing.slice(0, 4).join('、') + '），未写入文件。可在「项目说明」重试。');
  }
  return text + '\n';
}

/**
 * Let the model judge whether a human turn actually states a relationship
 * between projects. Keyword matching alone produced almost nothing usable, and
 * only the model can tell "A 把数据发给 B" from a question about A and B.
 * The model may only quote text that the user really wrote; anything else is
 * dropped, so a hallucinated quote can never become a written fact.
 */
export async function detectRelationshipMentions(llm, selection, projects, messages, signal) {
  const route = modelRoute(selection);
  if (!route || !messages?.length || projects.length < 2) return [];
  if (!llm?.stream || !llm.listProviders().some(p => p.id === route.provider)) return [];
  const allowed = new Map(messages.map(row => [row.seq, row.text]));
  const bounded = AbortSignal.any([AbortSignal.timeout(45000), ...(signal ? [signal] : [])]);
  const system = [
    'You decide whether the human text below states a real working relationship between projects.',
    'Projects:', JSON.stringify(projects.map(p => ({ id: p.id, name: p.name }))),
    'Return JSON only: {"relations":[{"from":"<project id>","to":"<project id>","quote":"<exact substring of the human text>","kind":"call|data|dependency"}]}',
    'Include an entry only when the text itself asserts how one project relates to another (calls it, reads its data, feeds it, depends on it, owns a shared table).',
    'Exclude questions, plans, possibilities, negations, and anything the human did not actually state.',
    'The quote MUST be copied verbatim from the human text, never paraphrased, and must not invent secrets.',
    'Return {"relations":[]} when nothing qualifies. No prose outside the JSON.',
  ].join(' ');
  const content = messages.map(row => `#${row.seq}\n${row.text}`).join('\n\n').slice(0, 12000);
  let text = '';
  for await (const chunk of llm.stream({ ...route, signal: bounded, maxTokens: 900, system, messages: [{ role: 'user', content: [{ type: 'text', text: content }] }] })) {
    bounded.throwIfAborted();
    if (chunk.type === 'text-delta') text += chunk.text;
    if (chunk.type === 'finish' && chunk.reason.kind !== 'stop') return [];
  }
  const json = /\{[\s\S]*\}/.exec(text);
  if (!json) return [];
  let parsed;
  try { parsed = JSON.parse(json[0]); } catch { return []; }
  const byId = new Map(projects.map(p => [p.id, p]));
  const results = [];
  for (const row of Array.isArray(parsed?.relations) ? parsed.relations.slice(0, 8) : []) {
    const from = byId.get(row?.from), to = byId.get(row?.to);
    if (!from || !to || from.id === to.id) continue;
    const quote = typeof row?.quote === 'string' ? row.quote.trim() : '';
    if (quote.length < 4 || quote.length > 400) continue;
    // The quote must exist in a human message, or the model made it up.
    if (![...allowed.values()].some(body => body.includes(quote))) continue;
    results.push({ kind: 'relationship', projectId: from.id, relatedId: to.id, quote, model: true });
  }
  return results;
}

/**
 * One document per workspace: the primary project plus every additional folder,
 * each as its own section. Additional folders have no note of their own, so this
 * is the only place their information is recorded.
 */
export async function generateWorkspaceMarkdown(llm, selection, projects, signal) {
  const route = modelRoute(selection);
  if (!route) throw new Error('请先在插件设置中配置默认模型。');
  if (!llm?.stream || !llm.listProviders().some(p => p.id === route.provider)) throw new Error('默认模型的提供方未启用。');
  if (!Array.isArray(projects) || !projects.length) throw new Error('没有可汇总的项目。');
  const bounded = AbortSignal.any([AbortSignal.timeout(150000), ...(signal ? [signal] : [])]);
  const system = [
    'You document a workspace that holds several related projects, in Simplified Chinese, as Markdown.',
    'Kind: descriptive. Audience: the engineer who inherits these projects. Purpose: understand each project and how they relate, without re-reading everything.',
    'Output MUST follow this outline exactly:',
    '# <工作区名>',
    '## 工作区概览  (what this group of projects is for, and how they fit together)',
    '## 项目一览  (a Markdown table: 项目名 | 角色 | 主要技术 | 本机路径)',
    '## 项目详情  (one ### subsection per project named exactly as given; inside each: 职责, 目录与关键文件, 数据与表, 与其他项目的关系)',
    '## 跨项目关系  (only relationships the evidence supports: shared tables, imports, upstream/downstream data flow)',
    '## 未确认项  (what the evidence does not settle, and what was checked)',
    'Truth rules: every statement must follow from the supplied scan facts. Never invent files, tables, dependencies or relationships. If you did not see it, put it under 未确认项.',
    'The primary project is the one marked primary; additional projects are attached folders without their own documents, so describe them here.',
    'Use no em dashes and no double hyphens as dashes. Headings stay in sentence case; do not translate technical identifiers.',
    'Stay under 9000 Chinese characters. No text before the first heading and no enclosing code fence.',
  ].join(' ');
  const payload = JSON.stringify({
    task: 'Write DSH-WORKSPACE.md',
    projects: projects.map(project => ({
      name: project.name,
      role: project.primary ? 'primary' : 'additional',
      path: project.path,
      facts: {
        projectName: project.facts?.projectName ?? '',
        ecosystem: project.facts?.ecosystem ?? '',
        dependencies: project.facts?.dependencies ?? [],
        scripts: project.facts?.scripts ?? [],
        definedTables: project.facts?.definedTables ?? [],
        tree: project.facts?.tree ?? [],
        dirs: project.facts?.dirs ?? [],
        modules: (project.facts?.modules ?? []).map(row => ({ path: row.path, dir: row.dir, exports: row.exports, comment: row.comment })),
        importEdges: project.facts?.importEdges ?? [],
        fileCount: project.facts?.fileCount ?? 0,
      },
    })),
  });
  let text = '', finished = false;
  for await (const chunk of llm.stream({ ...route, signal: bounded, maxTokens: 5000, system, messages: [{ role: 'user', content: [{ type: 'text', text: payload }] }] })) {
    bounded.throwIfAborted();
    if (chunk.type === 'text-delta') {
      text += chunk.text;
      if (text.length > 20000) throw new Error('生成的工作区说明过长，未写入文件。');
    }
    if (chunk.type === 'finish') {
      if (chunk.reason.kind !== 'stop') {
        const code = chunk.reason.failure?.code ?? chunk.reason.kind;
        const hint = /QUOTA|RATE|LIMIT|BALANCE|INSUFFICIENT/i.test(String(code))
          ? `当前模型 ${route.provider}/${route.model} 的额度或频率受限（${code}）。请在「设置 → 多文件夹工作区」改用其他可用模型后重试。`
          : /AUTH|UNAUTHOR|FORBIDDEN/i.test(String(code))
            ? `当前模型 ${route.provider}/${route.model} 认证失败（${code}）。请检查该供应商的配置。`
            : `模型 ${route.provider}/${route.model} 未完成工作区说明生成（${code}）。`;
        throw new Error(hint);
      }
      finished = true;
    }
  }
  bounded.throwIfAborted();
  text = text.trim();
  if (!finished || !text || text.includes('\0')) throw new Error('模型未返回有效说明，未写入文件。');
  if (!/^#[ \t]+\S/m.test(text)) throw new Error('模型未输出 Markdown 标题，未写入文件。');
  const required = ['工作区概览', '项目一览', '项目详情', '未确认项'];
  const normalize = value => String(value).replace(/^[\s#>*\-\d.、（）()【】:：]+/u, '').replace(/[\s、，：:\-–—]/gu, '').toLowerCase();
  const headings = Array.from(text.matchAll(/^#{1,3}[ \t]+(.+?)\s*$/gm), match => normalize(match[1]));
  const missing = required.filter(name => !headings.some(line => line.includes(normalize(name))));
  if (missing.length > 1) throw new Error('模型输出缺少关键章节（' + missing.join('、') + '），未写入文件。');
  return text + '\n';
}
