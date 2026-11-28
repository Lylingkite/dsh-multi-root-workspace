// One first-scan job per workspace/project. Keep failures visible and retry only
// by explicit request; avoid charging the configured model on each chat turn.
export function createBaselineQueue({signal, generate, keyOf, afterBatch, maxWorkspaces = 32}) {
  const states = new Map();
  let active = 0;
  const ensure = id => {
    if (states.has(id)) return states.get(id);
    if (states.size >= maxWorkspaces) {
      const old = [...states].find(([,item])=>!item.running && ![...item.rows.values()].some(row=>row.state==='pending'));
      if (!old) return null;
      states.delete(old[0]);
    }
    const current={rows:new Map(),running:false};
    states.set(id,current);
    return current;
  };
  return {
    enqueue(id,roots) {
      if (!roots.length || signal?.aborted) return;
      const current=ensure(id);
      if (!current) return;
      for (const path of roots) {
        const key=keyOf(path);
        if (!current.rows.has(key) && current.rows.size < 25) current.rows.set(key,{path,state:'pending'});
      }
    },
    retain(id,roots) {
      const current=states.get(id);
      if (!current) return;
      const keys=new Set(roots.map(keyOf));
      for (const key of current.rows.keys()) if (!keys.has(key)) current.rows.delete(key);
    },
    list(id) { return Array.from(states.get(id)?.rows.values() ?? [],row=>({...row})); },
    start(id,agent) {
      const current=states.get(id);
      if (signal?.aborted || !current || current.running || active >= 2 || ![...current.rows.values()].some(row=>row.state==='pending')) return;
      current.running=true; active++;
      return (async()=>{
        try {
          for (const row of current.rows.values()) {
            if (signal?.aborted) break;
            if (row.state!=='pending') continue;
            row.state='scanning';
            try {
              const result=await generate(id,row.path,agent,signal);
              row.state='ready'; row.document=result.document;
              // `reused` means a pre-existing README answered this folder; no
              // file was created, so the UI must not imply one was.
              if (result?.reused) row.reused=true; else delete row.reused;
              if (result?.fallback) row.fallback=true; else delete row.fallback;
            } catch (error) {
              row.state='failed'; row.reason=String(error?.message ?? error).slice(0,300);
            }
          }
          if (!signal?.aborted) await afterBatch?.(id,agent,signal);
        } finally { current.running=false; active--; }
      })();
    },
    finished(id,path,document) {
      const row=states.get(id)?.rows.get(keyOf(path));
      if (row) { row.state='ready'; row.document=document; delete row.reason; }
    }
  };
}
