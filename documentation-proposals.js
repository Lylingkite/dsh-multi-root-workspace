import { computeHash, applyPatch } from './documentation-patch.js';
import { WORKSPACE_DOCUMENT_FILENAME } from './project-document.js';

export const documentationProjectId = path => 'p-'+computeHash(path).slice(0,32);
const escape = s=>s.replace(/[\\`*_{}\[\]()#+.!|<>]/g,'\\$&');
const compact = value=>String(value).replace(/[\x00-\x1f\x7f]/g,' ').trim();

// IDs and output filenames come from the host's saved project list, never from
// free-form paths in a user quote or in a model result.
export async function planDocumentationProposal({projects,primary,notes,read}) {
  const byId=new Map(projects.map(p=>[p.id,p]));
  const files=new Map();
  const slot = async (project,filename,initial) => {
    const key=JSON.stringify([project.id,filename]);
    if (files.has(key)) return files.get(key);
    const prior=await read(project,filename);
    const row={project,filename,prior,text:prior?.text ?? initial,patches:[]};
    files.set(key,row);
    return row;
  };
  const patch = (file,projectId,sectionKey,content) => {
    const change=applyPatch(file.text,{projectId,sectionKey,content,insert:true});
    if (change.changed) { file.text=change.text; file.patches.push(change.preview); }
  };
  const seen = new Map();
  for (const note of notes) {
    const sectionId=JSON.stringify([note.projectId,note.kind,note.relatedId]);
    if (seen.has(sectionId) && seen.get(sectionId) !== note.quote) throw new Error('同一条目有多条候选说明，请先澄清后再更新。');
    if (seen.has(sectionId)) continue;
    seen.set(sectionId,note.quote);
    const project=byId.get(note.projectId), peer=byId.get(note.relatedId);
    if (!project || (note.kind==='relationship' && !peer)) throw new Error('项目列表有变化，请重新生成提议。');
    // One document per workspace: every note lands in the primary folder's file.
    const overview = await slot(primary,WORKSPACE_DOCUMENT_FILENAME,'# 工作区\n\n## 已确认的项目职责与关系\n');
    const label=note.kind==='role'?'对话确认的项目职责':`与 ${escape(compact(peer.name))} 的关系`;
    const section=note.kind==='role'?'role':`relation-${peer.id}`;
    const content=`### ${label}\n\n- ${escape(compact(note.quote))}`;
    patch(overview,project.id,section,`### ${escape(compact(project.name))}：${label}\n\n- ${escape(compact(note.quote))}`);
  }
  return [...files.values()].filter(file=>file.patches.length);
}
