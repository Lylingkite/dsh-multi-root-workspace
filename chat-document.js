import { absolutePath, pathApi, wslParts } from './paths.js';

// The native composer serializes directories as @path/ (or an open quoted
// path when continuing completion). Do not turn plain text or file references
// into directory reads. Only directly admitted human text is eligible.
export function chatFolderReferences(messages, cwd, distro) {
  const roots = new Set();
  for (const message of Array.isArray(messages) ? messages : []) {
    if (message?.role !== 'user' || message.source?.kind !== 'user') continue;
    for (const block of message.content ?? []) {
      if (block.type !== 'text' || typeof block.text !== 'string') continue;
      const text=block.text.slice(0,24000).replace(/^[ \t]*```[^\n]*\n[\s\S]*?(?:^[ \t]*```[^\n]*$|$)/gm, '');
      for (const match of text.matchAll(/(?:^|\s)@(?:"([^"\r\n]{1,1024})"|"([^"\r\n]{1,1024}?[\\/])(?=\s|$)|([^"\s]{1,1024}))(?=\s|$)/gu)) {
        let raw=match[1] ?? match[2] ?? match[3];
        if (!/[\\/]$/.test(raw) || /[\x00-\x1f\x7f*?`]/.test(raw) || raw.split(/[\\/]/).includes('..') || /^\\(?!\\)/.test(raw)) continue;
        const unc=wslParts(raw);
        if (unc) {
          if (!distro || unc.distro.toLowerCase()!==distro.toLowerCase()) continue;
          raw=unc.linux;
        }
        if (!absolutePath(raw) && (!cwd || !absolutePath(cwd) || /^[A-Za-z]:/.test(raw))) continue;
        const api=pathApi(absolutePath(raw)?raw:cwd);
        const root=absolutePath(raw)?api.resolve(raw):api.resolve(cwd,raw);
        if (api.parse(root).root===root || (distro && (!root.startsWith('/') || root.startsWith('//')))) continue;
        roots.add(root);
        if (roots.size>=3) return [...roots];
      }
    }
  }
  return [...roots];
}

export const CHAT_DOC_BYTES = 8192;
const ORDER = ['readme.md','readme','readme.rst','dsh-project.md'];

export async function readHostChatDocuments(fs, root, signal) {
  const api = pathApi(root);
  const info = await fs.lstat(root,{},signal);
  if (info?.type !== 'directory') return {documents:[],unavailable:true};
  const folder=await fs.resolve(root,{signal});
  const canonical=api.normalize(fs.processPath(folder));
  if (canonical!==api.normalize(root)) return {documents:[],unavailable:true};
  const entries=await fs.listDir(folder,signal);
  let unavailable=false;
  const documents=[];
  for (const name of ORDER) {
    if (name!=='dsh-project.md' && documents.length) continue;
    const row=entries.find(e=>e.name.toLowerCase()===name);
    if (!row) continue;
    try {
      const path=api.join(root,row.name);
      if (row.type!=='file' || (await fs.lstat(path,{},signal))?.type!=='file') { unavailable=true; continue; }
      const target=await fs.resolve(path,{signal});
      if (!fs.contains(folder,target) || api.normalize(fs.processPath(target))!==api.normalize(path)) { unavailable=true; continue; }
      const bytes=await fs.readByteRange(target,{offset:0,length:CHAT_DOC_BYTES+1},signal);
      const truncated=bytes.length>CHAT_DOC_BYTES;
      const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(0,CHAT_DOC_BYTES),{stream:truncated});
      if (!text.trim() || text.includes('\0')) { unavailable=true; continue; }
      documents.push({name:row.name,text,truncated});
    } catch { signal?.throwIfAborted(); unavailable=true; }
  }
  return {documents,...(unavailable?{unavailable}: {})};
}

const inline = value => String(value).replace(/[\u0000-\u001f\u007f`<>]/g,' ').trim().slice(0,180);
const code = value => '`'+inline(value)+'`';
const secretBlock = /-----BEGIN [^\r\n]{0,100}PRIVATE KEY-----[\s\S]*?(?:-----END [^\r\n]{0,100}PRIVATE KEY-----|$)/gu;
const secretLine = /^(.*(?:password|passwd|secret|private[_ -]?key|access[_ -]?token|api[_ -]?key)[\w .-]*[:=]).*$/gimu;
const redactDoc = text=>text.replace(secretBlock,'[REDACTED PRIVATE KEY]').replace(secretLine,'$1 [REDACTED]');
const NO_FACTS = '未读到可用的项目结构。';
export function renderChatBaseline(facts, name) {
  if (!facts?.fileCount && !facts?.dirs?.length) throw new Error(NO_FACTS);
  const lines=[`# ${inline(facts.projectName || name) || '项目说明'}`,
    '', '本底稿来自一次有界目录扫描，不推断未验证的业务职责。', '', '## 目录结构','', '```text', '.'];
  for (const row of (facts.tree ?? []).slice(0,18)) {
    const dir=inline(row.dir);
    if (dir && dir!=='.') lines.push('  '+dir+'/');
    for (const file of (row.files ?? []).slice(0,6)) lines.push((dir==='.'?'  ':'    ')+inline(file));
  }
  if (!facts.tree?.length) for (const dir of (facts.dirs ?? []).slice(0,18)) lines.push('  '+inline(dir)+'/');
  lines.push('```','','## 技术栈与依赖','',`- 技术栈：${inline(facts.ecosystem || '未识别')}`);
  if (facts.dependencies?.length) lines.push('- 清单依赖：'+facts.dependencies.slice(0,24).map(code).join('、'));
  if (facts.scripts?.length) lines.push('- 已声明脚本：'+facts.scripts.slice(0,12).map(code).join('、'));
  lines.push('','## 模块与引用','');
  for (const mod of (facts.modules ?? []).slice(0,16)) lines.push('- '+code(mod.path)+(mod.exports?.length?'：导出 '+mod.exports.slice(0,6).map(code).join('、'):''));
  for (const edge of (facts.importEdges ?? []).slice(0,18)) if (edge.from && edge.to) lines.push('- '+code(edge.from)+' → '+code(edge.to));
  if (!facts.modules?.length && !facts.importEdges?.length) lines.push('- 未观察到可确认的模块引用。');
  lines.push('','## 扫描范围','',`- 观察到 ${Number(facts.fileCount)||0} 个文件；${facts.truncated?'扫描已达到范围上限。':'隐藏目录、依赖缓存和符号链接未纳入。'}`);
  return lines.join('\n')+'\n';
}

export async function collectChatDocuments(roots, {inspect,scan,save}, signal) {
  const rows=[];
  let remaining=12000;
  for (const path of [...new Set(roots)].slice(0,3)) {
    signal?.throwIfAborted();
    if (remaining<=0) break;
    try {
      const found=await inspect(path,signal);
      if (found.documents.length) {
        const documents=[];
        for (const doc of found.documents) {
          if (remaining<=0) break;
          const redacted=redactDoc(doc.text);
          const text=redacted.slice(0,remaining);
          remaining-=text.length;
          documents.push({name:doc.name,text,truncated:!!doc.truncated||text.length<redacted.length});
        }
        rows.push({path,documents});
        continue;
      }
      if (found.unavailable) { rows.push({path,status:'说明不可读，未覆盖或生成。'}); continue; }
      const baseline=renderChatBaseline(await scan(path,signal),pathApi(path).basename(path));
      let status='仅作为聊天上下文；未写入项目。';
      if (save) try { if (await save(path,baseline,signal)) status='已新建项目说明。'; } catch { signal?.throwIfAborted(); }
      const text=baseline.slice(0,remaining);
      remaining-=text.length;
      rows.push({path,status,documents:[{name:'DSH-PROJECT.md',text,truncated:text.length<baseline.length}]});
    } catch { signal?.throwIfAborted(); rows.push({path,status:'目录不可访问或未读到项目结构。'}); }
  }
  return rows;
}
