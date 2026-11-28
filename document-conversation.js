// Only committed, direct human text from completed top-level turns is eligible.
// Entries in this transient buffer do not change files or session records.
export function createDocumentationTurnCapture() {
  const turns = new WeakMap();
  return function capture(session,event) {
    if (!session || session.header?.origin === 'subagent' || session.header?.meta?.origin === 'subagent') return null;
    if (event.type === 'turn/start') {
      turns.set(session,{turn:event.data.turn, messages:[], chars:0, overflow:false});
      return null;
    }
    const current = turns.get(session);
    if (!current) return null;
    if (event.type === 'user/message' && event.data?.role === 'user' && event.data.source?.kind === 'user') {
      for (const block of event.data.content ?? []) {
        if (block.type !== 'text' || typeof block.text !== 'string' || !block.text.trim()) continue;
        current.chars += block.text.length;
        if (current.chars > 12000 || current.messages.length >= 8) { current.overflow=true; break; }
        current.messages.push({seq:event.seq,text:block.text});
      }
    } else if (event.type === 'turn/end') {
      turns.delete(session);
      if (current.turn === event.data.turn && event.data.reason?.kind === 'completed' && !current.overflow && current.messages.length) {
        return {turn:current.turn,messages:current.messages};
      }
    }
    return null;
  };
}

// A model can suggest which text to present, but it cannot invent evidence or
// choose a write target. This validator only admits exact contiguous quotes.
export function validateConversationNotes(value, captured, projects) {
  if (!Array.isArray(value) || value.length > 8) throw new Error('对话增量格式无效。');
  const byId = new Map(projects.map(p=>[p.id,p]));
  const findName = name => projects.filter(project=>project.name.normalize('NFC').toLowerCase() === name.normalize('NFC').toLowerCase());
  const results = new Map();
  for (const row of value) {
    if (!row || !['role','relationship'].includes(row.kind) || typeof row.quote !== 'string' || row.quote.length < 4 || row.quote.length > 600 || /[\r\n\u0000-\u001f<>]/.test(row.quote)) continue;
    const source = captured.messages.find(m=>m.seq===row.seq && m.text.includes(row.quote));
    const first=byId.get(row.projectId), other=byId.get(row.relatedId);
    const quote=row.quote.normalize('NFC').toLowerCase();
    const mentions = project => {
      if (!project || findName(project.name).length !== 1) return false;
      const name = project.name.normalize('NFC').toLowerCase();
      const token = name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      return /^[a-zA-Z0-9_.-]+$/.test(name)
        ? new RegExp('(^|[^a-z0-9_.-])'+token+'($|[^a-z0-9_.-])','u').test(quote) : quote.includes(name);
    };
    if (!source || !mentions(first) || (row.kind==='relationship' && (!mentions(other) || other.id===first.id)) || (row.kind==='role' && row.relatedId != null)) continue;
    const key=JSON.stringify([row.kind,first.id,other?.id ?? null,row.quote]);
    results.set(key,{kind:row.kind,projectId:first.id,relatedId:other?.id ?? null,quote:row.quote,seq:source.seq});
  }
  return [...results.values()];
}

// Deliberately conservative: only explicit role/dependency statements whose
// subject and target resolve uniquely. No second model sees raw chat text.
export function proposeConversationNotes(captured, projects) {
  const candidates=[];
  const strip = name => name.normalize('NFC').toLowerCase();
  const aliases = projects.slice().sort((a,b)=>b.name.length-a.name.length);
  for (const {seq,text} of captured.messages) {
    for (const line of text.split(/[\r\n。；;]/u)) {
      const quote=line.trim().replace(/^[-*]\s+/,'');
      if (quote.length < 4 || quote.length > 400 || /[?？`<>{}]|(?:是否|可能|假设|假如|如果|能否|也许|密码|口令|凭证|私钥|access[_ -]?token|api[_ -]?key)/iu.test(quote)) continue;
      const first=aliases.find(p=>strip(quote).startsWith(strip(p.name)));
      if (!first) continue;
      const rest=quote.slice(first.name.length).trimStart();
      if (/^(?:负责|用于|提供|管理|主要处理|is responsible for\b|provides\b|manages\b)\s*\S/iu.test(rest)) {
        candidates.push({kind:'role',projectId:first.id,seq,quote});
        continue;
      }
      const relation=/^(?:调用|依赖于?|对接|读取|导入|转发(?:请求)?到|calls\b|depends on\b|imports\b|routes to\b)\s*(\S.*)$/iu.exec(rest);
      if (!relation) continue;
      const other=aliases.find(p=>p.id!==first.id && strip(relation[1]).startsWith(strip(p.name)));
      if (other) candidates.push({kind:'relationship',projectId:first.id,relatedId:other.id,seq,quote});
    }
  }
  return validateConversationNotes(candidates.slice(0,8),captured,projects);
}
