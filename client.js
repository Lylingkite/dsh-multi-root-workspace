window.__ModuleLoader__.load({
  id: '@local/dsh-multi-root',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'local.multiRoot';
    const ICON = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI2NCIgaGVpZ2h0PSI2NCIgdmlld0JveD0iMCAwIDY0IDY0Ij48cmVjdCB3aWR0aD0iNjQiIGhlaWdodD0iNjQiIHJ4PSIxNSIgZmlsbD0iIzI3NTdhOCIvPjxwYXRoIGQ9Ik0xMCAxOGgxNmw1IDZoMjN2MjVIMTB6IiBmaWxsPSIjYzhkZWZmIi8+PHBhdGggZD0iTTEwIDI1aDQ0djI0SDEweiIgZmlsbD0iI2VkZjVmZiIvPjxwYXRoIGQ9Ik0yMSAzNWgxNG0tNy03djE0IiBzdHJva2U9IiMyNzU3YTgiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PGNpcmNsZSBjeD0iNDciIGN5PSI0NCIgcj0iMTIiIGZpbGw9IiM2M2M3YjQiLz48cGF0aCBkPSJNNDIgNDRoMTBtLTUtNXYxMCIgc3Ryb2tlPSIjMTIzYjU2IiBzdHJva2Utd2lkdGg9IjIuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+PC9zdmc+';
    const zh = { edit: '编辑工作区', folders: '源文件夹', primary: '主要', wsl: 'WSL 连接', go: '前往', up: '上一级', useFolder: '使用此文件夹', browse: '选择 WSL 文件夹', file: '文件（不可选择）', empty: '当前目录为空', truncated: '列表已截断，请进入子目录或输入路径', linuxOnly: 'WSL 模式只接受 / 开头的 Linux 绝对路径，不接受 Windows 或 UNC 路径', makePrimary: '设为主要', add: '添加文件夹', remove: '移除关联', save: '保存', cancel: '取消', close: '关闭', loading: '正在读取…', saving: '正在保存…', name: '工作区名称', note: '保存后以主要目录创建或使用原生工作区并打开，新聊天默认在主要目录运行；旧聊天保留在旧工作区，不搬动文件。移除只取消关联，不删除文件；移除主要项目会自动选择下一项，至少保留一个项目。', manual: '或输入绝对文件夹路径', attach: '添加路径', failure: '无法编辑工作区', pick: '请选择文件夹', changed: '未保存的更改', keepOne: '至少保留一个项目，请先添加其他项目' , docPath: '说明文档', docMissing: '缺失', additionalTag: '附加目录', additionalWhy: '附加目录不单独生成文件；它的内容会汇总进主目录的 DSH-WORKSPACE.md。', docFound: '已存在', docRetry: '重新检查' , docPreviewFailed: '无法检查目录', docLoading: '正在读取文档…', docFailed: '读取文档失败', generate: '生成说明文档', generating: '生成中…', generateHint: '每个工作区只有一份 DSH-WORKSPACE.md，写在主目录。生成时会扫描主目录和全部附加目录，把各项目分别汇总进去；附加目录不产出独立文件。只把结构交给模型，不读取源码正文。', generateBlocked: '请先保存工作区，并在「设置 → 多文件夹工作区」选择模型', settings: '项目文档设置', model: 'DSH 模型', modelPlaceholder: 'provider/model，留空则禁用生成', saveSettings: '保存设置', savingSettings: '正在保存…', modelHint: '留空禁用生成；填写 provider/model 标识。', baseline: '首次扫描', baselineEmpty: '暂无等待扫描的项目', baselinePending: '等待中', baselineScanning: '扫描中', baselineReady: '已生成', baselineReused: '已有 README，未新建', baselineFallback: '已写入主要文件夹', baselineFailed: '失败', overview: '工作区总览', overviewMissing: '暂无总览', overviewError: '总览读取失败', proposals: '待审核对话提议', proposalsEmpty: '暂无待审核提议', proposalsLoading: '正在读取提议…', proposalPreview: '预览差异', proposalApply: '确认应用', proposalDismiss: '忽略', proposalApplying: '确认中…', proposalDismissing: '忽略中…', proposalConfirmHint: '请先预览差异，再显式确认应用。', proposalInvalid: '提议响应无效，请重新预览。', proposalApplied: '已应用，文档与提议已刷新。', proposalDismissed: '已忽略，提议已刷新。', proposalDiff: '差异' };
    Object.assign(zh,{tabfolders:'文件夹',tabdocs:'项目说明',tabscan:'扫描与提议',tabrelations:'项目关系',tabHintfolders:'这里管理参与本工作区的文件夹；保存后新会话默认在主要文件夹运行。',tabHintscan:'自动扫描进度与工作区总览；扫描或对话发现的项目关系会先出现在这里，确认后才写入。',tabHintrelations:'这些关系会在本工作区的新会话中自动带上，无需 @。',tabHintdocs:'每个工作区只有一份汇总。以下状态表示汇总里是否已有对应文件夹的说明。',docTimeout:'生成超时，可稍后刷新查看结果。',docQueued:'已加入生成队列，正在后台处理…'});
    Object.assign(zh,{relations:'项目关系',relationHint:'保存后，本工作区的新会话会自动使用这些关系，不用 @。请勿填写密码或令牌。',relationEmpty:'尚未记录项目关系。',relationAdd:'新增项目关系',relationExample:'例如：网关调用订单服务查询订单状态。',relationEdit:'编辑这条',relationSave:'保存关系',relationSaved:'项目关系已更新。',relationRemove:'删除这条',relationConfirm:'确定删除这条关系？',relationLocked:'请先保存工作区文件夹。'});
    const en = { edit: 'Edit workspace', folders: 'Source folders', primary: 'Primary', wsl: 'WSL connection', go: 'Go', up: 'Parent', useFolder: 'Use this folder', browse: 'Choose a WSL folder', file: 'File (not selectable)', empty: 'This directory is empty', truncated: 'Listing truncated; enter a subdirectory or a path', linuxOnly: 'WSL mode requires an absolute Linux path beginning with /, not a Windows or UNC path', makePrimary: 'Set as primary', add: 'Add folder', remove: 'Remove association', save: 'Save', cancel: 'Cancel', close: 'Close', loading: 'Loading…', saving: 'Saving…', name: 'Workspace name', note: 'Saving opens a native workspace rooted at the primary folder. New chats use that directory; old chats remain in their old workspace. No files are moved. Removal only unlinks a folder; removing the primary promotes the next one. Keep at least one project.', manual: 'Or enter an absolute folder path', attach: 'Add path', failure: 'Could not edit workspace', pick: 'Choose a folder', changed: 'Unsaved changes', keepOne: 'Keep at least one project; add another folder first' , docPath: 'Project document path', docMissing: 'Missing', additionalTag: 'Additional folder', additionalWhy: 'Additional folders get no file of their own; their content is summarized in the primary folder DSH-WORKSPACE.md.', docFound: 'Present', docRetry: 'Check again', docPreviewFailed: 'Could not check folder', docLoading: 'Loading document…', docFailed: 'Could not load document', generate: 'Generate document', generating: 'Generating…', generateHint: 'Each workspace keeps one DSH-WORKSPACE.md in the primary folder. Generation scans the primary and every additional folder and summarizes each project separately; additional folders never get their own file. Only structure is sent to the model.', generateBlocked: 'Save the workspace and select a model in Settings → Multi-folder workspace', settings: 'Project document settings', model: 'DSH model', modelPlaceholder: 'provider/model, blank disables generation', saveSettings: 'Save settings', savingSettings: 'Saving settings…', modelHint: 'Leave blank to disable generation; use a provider/model ID.', baseline: 'First scan', baselineEmpty: 'No projects awaiting a scan', baselinePending: 'Pending', baselineScanning: 'Scanning', baselineReady: 'Generated', baselineReused: 'Existing README used, nothing created', baselineFallback: 'Written to the primary folder', baselineFailed: 'Failed', overview: 'Workspace overview', overviewMissing: 'No overview yet', overviewError: 'Overview could not be read', proposals: 'Conversation proposals for review', proposalsEmpty: 'No proposals awaiting review', proposalsLoading: 'Loading proposals…', proposalPreview: 'Preview diff', proposalApply: 'Confirm apply', proposalDismiss: 'Dismiss', proposalApplying: 'Applying…', proposalDismissing: 'Dismissing…', proposalConfirmHint: 'Preview the diff first, then confirm the apply explicitly.', proposalInvalid: 'Invalid proposal response; preview again.', proposalApplied: 'Applied; documents and proposals refreshed.', proposalDismissed: 'Dismissed; proposals refreshed.', proposalDiff: 'Diff' };
    function Folder() { return h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true}, h('path',{d:'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z'}),h('path',{d:'M3 10h18'})); }
    // Pure state helpers: kept free of DOM/React so the summary lifecycle can be
    // exercised in a plain Node test. A draft is only applied if its row still
    // exists and the user has not touched it since the request was issued.
    Object.assign(en,{tabfolders:'Folders',tabdocs:'Notes',tabscan:'Scan & proposals',tabrelations:'Relationships',tabHintfolders:'Folders in this workspace; after saving, new chats run in the primary folder.',tabHintscan:'Automatic scan progress and the workspace overview; relationships found by scanning or conversation appear here for review before anything is written.',tabHintrelations:'These relationships are sent automatically to new chats in this workspace; no @ needed.',tabHintdocs:'The workspace has one overview. Each status shows whether that folder has a section in it.',docTimeout:'Generation timed out; refresh later to check the result.',docQueued:'Queued for generation in the background…'});
    Object.assign(en,{relations:'Project relationships',relationHint:'New chats in this workspace automatically use saved relationships. No @ mention is needed. Do not enter passwords or tokens.',relationEmpty:'No project relationships yet.',relationAdd:'Add a relationship',relationExample:'Example: the gateway calls the order service to check status.',relationEdit:'Edit relationship',relationSave:'Save relationship',relationSaved:'Project relationships updated.',relationRemove:'Delete relationship',relationConfirm:'Delete this relationship?',relationLocked:'Save the workspace folders first.'});
    Object.assign(zh,{docIncluded:'已收录',docMissing:'缺失',docPreviewFailed:'无法确认收录状态'});
    Object.assign(en,{docIncluded:'Included',docPreviewFailed:'Could not verify coverage'});
    function documentPaths(value, roots) {
      const known = Array.isArray(value?.documents) ? value.documents : [];
      const paths = new Set(Array.isArray(roots) ? roots : []);
      const out = [];
      for (const row of known) {
        if (!row || typeof row.path !== 'string' || !paths.has(row.path)) continue;
        out.push({ path: row.path, document: typeof row.document === 'string' ? row.document : null, ...(row.unavailable ? {unavailable:true} : {}), ...(row.additional === true ? {additional:true} : {}), ...(typeof row.included === 'boolean' ? {included:row.included} : {}) });
      }
      for (const path of paths) {
        if (!out.some(row => row.path === path)) out.push({ path, document: null });
      }
      return out;
    }
    function documentCanGenerate(saved, model) {
      return !!saved && typeof model === 'string' && !!model.trim();
    }
    // Baseline rows come from the host documents response and are keyed by
    // path. Only known states are rendered; reason/document stay bounded strings.
    // A path with no reported row is not shown as "ready": that would invent a
    // successful first scan the host never confirmed.
    function documentBaselines(value, roots) {
      const known = Array.isArray(value?.baselines) ? value.baselines : [];
      const allowed = Array.isArray(roots) && roots.length ? new Set(roots) : null;
      const out = [];
      for (const row of known) {
        if (!row || typeof row.path !== 'string' || !['pending','scanning','ready','failed'].includes(row.state)) continue;
        if (allowed && !allowed.has(row.path)) continue;
        const entry = { path: row.path, state: row.state };
        if (typeof row.reason === 'string' && row.reason) entry.reason = row.reason.slice(0, 300);
        if (typeof row.document === 'string' && row.document) entry.document = row.document;
        out.push(entry);
      }
      return out;
    }
    // Proposals are transient host state; keep only well-formed ids/summaries
    // and carry notice verbatim. Preview requires a token and bounded diffs.
    function proposalItems(value) {
      const rows = Array.isArray(value?.items) ? value.items : [];
      const items = [];
      for (const row of rows) {
        if (!row || typeof row.id !== 'string' || !row.id || typeof row.summary !== 'string' || !row.summary) continue;
        items.push({ id: row.id, summary: row.summary.slice(0, 600) });
      }
      return { items, notice: typeof value?.notice === 'string' ? value.notice : null };
    }
    function proposalPreview(value, proposalId) {
      if (!value || typeof value.id !== 'string' || value.id !== proposalId || typeof value.token !== 'string' || !value.token || !Array.isArray(value.changes)) return null;
      const changes = [];
      for (const row of value.changes) {
        if (!row || typeof row.path !== 'string' || !row.path || typeof row.diff !== 'string' || !row.diff || row.diff.length > 40000) return null;
        changes.push({ path: row.path, diff: row.diff });
      }
      if (!changes.length) return null;
      return { id: value.id, token: value.token, changes };
    }
    const SETTINGS_ID = 'local-multi-root-workspace';
    const settingsText = {
      zh: {
        title:'多文件夹工作区', subtitle:'项目说明文档',
        intro:'为关联的项目目录准备可供模型阅读的说明文档。',
        uses:['已有 README.md 会优先作为说明文档，不会被修改。','没有文档时，可用下方模型生成 DSH-PROJECT.md，只依据常见项目标记。','每次提问只把文档路径告诉模型，按需读取，不塞满上下文。'],
        provider:'供应商', model:'模型', clear:'清除', off:'不使用模型',
        loading:'正在加载设置和模型…', unavailable:'当前无法读取插件设置或模型目录。',
        empty:'没有可选模型，请先在「设置 → 模型」启用供应商。',
        missing:'当前模型不可用，请重新选择。', choose:'请选择模型',
        save:'保存', discard:'放弃修改', saved:'已保存', failure:'保存失败，请重试。', reload:'重新加载模型'
      },
      en: {
        title:'Multi-folder workspace', subtitle:'Project documentation',
        intro:'Prepare a document each linked project folder can use as context.',
        uses:['An existing README.md is used first and is never modified.','When none exists, the model below can generate DSH-PROJECT.md from common project markers.','Each question only shares the document path; the model reads it when needed.'],
        provider:'Provider', model:'Model', clear:'Clear', off:'Disable generation',
        loading:'Loading settings and models…', unavailable:'Plugin settings or the model catalog are unavailable.',
        empty:'No models available. Enable a provider in Settings → Models.',
        missing:'The current model is unavailable. Choose another model.', choose:'Select a model',
        save:'Save', discard:'Discard', saved:'Saved', failure:'Could not save. Try again.', reload:'Reload models'
      }
    };
    function splitRoute(value) {
      if (typeof value !== 'string' || !value) return {provider:'',model:''};
      const i = value.indexOf('/');
      return i < 0 ? {provider:value,model:''} : {provider:value.slice(0,i),model:value.slice(i+1)};
    }
    function modelOptions(groups) {
      const seen = new Set();
      return (Array.isArray(groups) ? groups : []).flatMap(group => {
        if (typeof group?.id !== 'string' || !/^[\w.-]+$/.test(group.id) || !Array.isArray(group.models)) return [];
        const models = group.models.flatMap(row => {
          if (typeof row?.id !== 'string' || !/^[\w.:-]+(?:\/[\w.:-]+)*$/.test(row.id)) return [];
          const id = `${group.id}/${row.id}`;
          if (id.length > 200 || seen.has(id)) return [];
          seen.add(id);
          return [{id:row.id, label: typeof row.name === 'string' ? row.name : row.id}];
        });
        return models.length ? [{id:group.id,label:typeof group.name === 'string' ? group.name : group.id,models}] : [];
      });
    }
    function savedModelRoute(value, groups) {
      const route = splitRoute(value);
      const models = groups.find(g=>g.id===route.provider)?.models ?? [];
      const prefix = route.provider+'/';
      // A prior client prepended the provider twice. Only repair an exact
      // catalog match after stripping one prefix; keep valid nested ids intact.
      if (route.model.startsWith(prefix) && !models.some(m=>m.id===route.model)) {
        const model = route.model.slice(prefix.length);
        if (models.some(m=>m.id===model)) return {...route,model};
      }
      return route;
    }
    function modelValue(provider, model) {
      return provider && model ? provider+'/'+model : '';
    }

    class SettingsBoundary extends React.Component {
      constructor(props){ super(props); this.state={error:null}; }
      static getDerivedStateFromError(error){ return {error}; }
      render(){
        if (this.state.error) return h('div',{style:{padding:'20px',whiteSpace:'pre-wrap',color:'var(--dsw-alias-state-error-primary)'}},'设置页加载失败：'+(this.state.error?.message||'未知错误'));
        return this.props.children;
      }
    }
    function SafeModelSettings(props){ return h(SettingsBoundary,null,h(ModelSettings,props)); }
    function ModelSettings({forms, loadCatalog}) {
      const lang = (typeof navigator !== 'undefined' && (navigator.language||'').toLowerCase().startsWith('zh')) ? 'zh' : 'en';
      const text = settingsText[lang];
      const t = key => text[key] ?? key;
      const store = React.useMemo(()=>forms.get(SETTINGS_ID),[forms]);
      const subscribe = React.useCallback(fn=>store.subscribe(fn),[store]);
      const getSnapshot = React.useCallback(()=>store.getSnapshot(),[store]);
      const snap = React.useSyncExternalStore(subscribe,getSnapshot);
      const [catalog,setCatalog] = React.useState(null);
      const [edit,setEdit] = React.useState(null);
      const [status,setStatus] = React.useState('');
      const [saving,setSaving] = React.useState(false);
      const [revision,reload] = React.useReducer(n=>n+1,0);
      React.useEffect(() => {
        let live = true;
        setCatalog(null);
        Promise.resolve().then(loadCatalog).then(value=>{if(live)setCatalog(value);},()=>{if(live)setCatalog(false);});
        return ()=>{live=false;};
      }, [forms,loadCatalog,revision]);
      const groups = modelOptions(catalog);
      const saved = typeof snap.value?.documentModel === 'string' ? snap.value.documentModel : '';
      const savedRoute = savedModelRoute(saved,groups);
      const provider = edit ? edit.provider : savedRoute.provider;
      const model = edit ? edit.model : savedRoute.model;
      const models = groups.find(g=>g.id===provider)?.models ?? [];
      const value = modelValue(provider,model);
      const selectable = (!provider && !model) || models.some(row=>row.id===model);
      const dirty = (edit !== null || selectable) && value !== saved;
      const canWrite = snap.status === 'ready' && snap.writable;
      const busy = saving;
      const setProvider = id => setEdit({provider:id,model:(groups.find(g=>g.id===id)?.models[0]?.id ?? ''),revision:edit ? edit.revision : snap.revision});
      const setModel = id => setEdit({provider,model:id,revision:edit ? edit.revision : snap.revision});
      const clear = () => setEdit({provider:'',model:'',revision:edit ? edit.revision : snap.revision});
      const discard = () => { setEdit(null); setStatus(''); };
      const save = async () => {
        if (!canWrite || !selectable || !dirty || saving) return;
        setSaving(true); setStatus('');
        try {
          if (!await store.mutate([{op:'set',path:['documentModel'],value}],edit ? edit.revision : snap.revision)) throw new Error();
          setEdit(null); setStatus('saved');
        } catch { setStatus('failure'); }
        finally { setSaving(false); }
      };
      const css = '.mr-ms{display:grid;gap:14px;max-width:860px;color:var(--dsw-alias-label-primary)}.mr-ms h2,.mr-ms h3,.mr-ms p,.mr-ms ul{margin:0}.mr-ms h2{font-size:20px;font-weight:600}.mr-ms h3{font-size:14px;font-weight:600}.mr-ms .mr-ms-lead{color:var(--dsw-alias-label-secondary);font-size:13px}.mr-ms ul{padding-left:18px;color:var(--dsw-alias-label-secondary);font-size:13px;display:grid;gap:4px}.mr-ms-card{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto;gap:14px;align-items:end;padding:18px;border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}.mr-ms-field{display:grid;gap:8px;min-width:0;max-width:100%}.mr-ms-field>span{font-size:12px;color:var(--dsw-alias-label-secondary)}.mr-ms-field select,.mr-ms-field button{font:inherit;padding:9px 12px;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);width:100%;max-width:100%;box-sizing:border-box;text-overflow:ellipsis}.mr-ms-field button{width:40px}.mr-ms-note{color:var(--dsw-alias-label-secondary);font-size:12px}.mr-ms footer{display:flex;justify-content:flex-end;align-items:center;gap:10px;flex-wrap:wrap}.mr-ms footer button{font:inherit;padding:9px 16px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;color:inherit;background:var(--dsw-alias-bg-layer-2)}.mr-ms footer button:disabled{opacity:.45;cursor:default}.mr-ms footer .mr-ms-save{border-color:var(--dsw-alias-brand-primary);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}.mr-ms footer .mr-ms-save:disabled{border-color:var(--dsw-alias-border-l1)}.mr-ms select:focus-visible,.mr-ms button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}';
      return h('section',{className:'mr-ms','aria-labelledby':'mr-ms-title'},
        h('style',null,css),
        h('h2',{id:'mr-ms-title'},t('title')),
        h('h3',null,t('subtitle')),
        h('p',{className:'mr-ms-lead'},t('intro')),
        h('ul',null,...t('uses').map((line,i)=>h('li',{key:i},line))),
        h('div',{className:'mr-ms-card'},
          h('label',{className:'mr-ms-field'},h('span',null,t('provider')),
            h('select',{value:provider,disabled:busy,onChange:e=>{setProvider(e.target.value);setStatus('');}},
              h('option',{value:''},t('off')),
              provider && !groups.some(g=>g.id===provider) && h('option',{value:provider,disabled:true},provider),
              ...groups.map(g=>h('option',{key:g.id,value:g.id},g.label+' ('+g.id+')')))),
          h('label',{className:'mr-ms-field'},h('span',null,t('model')),
            h('select',{value:model,disabled:busy||!provider,onChange:e=>{setModel(e.target.value);setStatus('');}},
              !model && h('option',{value:'',disabled:true},provider?t('choose'):'—'),
              model && !models.some(m=>m.id===model) && h('option',{value:model,disabled:true},model),
              ...models.map(m=>h('option',{key:m.id,value:m.id},m.label)))),
          h('div',{className:'mr-ms-field'},h('span',null,'\u00a0'),
            h('button',{type:'button','aria-label':t('clear'),disabled:busy||(!provider&&!model),onClick:clear},'×'))),
        (catalog===null || snap.status==='loading') && h('p',{className:'mr-ms-note',role:'status'},t('loading')),
        ((catalog!==null && snap.status!=='ready') || (snap.status==='ready'&&!snap.writable) || catalog===false) && h('p',{className:'mr-ms-note',role:'status'},t('unavailable')),
        Array.isArray(catalog) && !groups.length && h('p',{className:'mr-ms-note',role:'status'},t('empty')),
        Array.isArray(catalog) && provider && model && !selectable && h('p',{className:'mr-ms-note',role:'status'},t('missing')),
        status && h('p',{className:'mr-ms-note',role:status==='failure'?'alert':'status'},t(status)),
        h('footer',null,
          h('button',{type:'button',disabled:saving||snap.status==='loading',onClick:reload},t('reload')),
          h('button',{type:'button',disabled:saving||!edit,onClick:discard},t('discard')),
          h('button',{className:'mr-ms-save',type:'button',disabled:busy||!canWrite||!selectable||!dirty,onClick:save},t('save'))));
    }
    function WorkspaceRelations({request,call,t,locked,onSaved}) {
      const [value,setValue]=React.useState(null);
      const [error,setError]=React.useState('');
      const [busy,setBusy]=React.useState(false);
      const [draft,setDraft]=React.useState('');
      const [editing,setEditing]=React.useState(null);
      const [removing,setRemoving]=React.useState(null);
      const [notice,setNotice]=React.useState('');
      const life=React.useRef(0);
      const run=async (action,args={})=>{
        const ticket=++life.current;
        setBusy(true); setError(''); setNotice('');
        try {
          const result=await call(request.sessionId,{action,workspaceId:request.workspaceId,...args});
          if (ticket!==life.current) return;
          if (!Array.isArray(result?.relations) || typeof result?.revision!=='string') throw new Error(t('failure'));
          setValue(result);
          if(action!=='workspace-relations') { setDraft(''); setEditing(null); setRemoving(null); setNotice(t('relationSaved')); onSaved?.(); }
        } catch (e) { if (ticket===life.current) setError(String(e?.message ?? e)); }
        finally { if (ticket===life.current) setBusy(false); }
      };
      React.useEffect(()=>{void run('workspace-relations');return ()=>{life.current++;};},[request.sessionId,request.workspaceId]);
      const disabled=locked||busy||!value;
      return h('section',{className:'mr-documents mr-relations','aria-label':t('relations')},
        h('h3',null,t('relations')),
        h('p',{className:'mr-note'},t('relationHint')),
        value?.relations.length ? h('ul',null,...value.relations.map(row=>h('li',{key:row.id},
          h('p',null,row.text),
          h('div',{className:'mr-doc-actions'},
            h('button',{type:'button',disabled,onClick:()=>{setRemoving(null);setEditing(row.id);setDraft(row.text);}},t('relationEdit')),
            h('button',{type:'button',disabled,onClick:()=>setRemoving(row.id)},t('relationRemove'))),
          removing===row.id && h('div',null,h('p',null,t('relationConfirm')),
            h('button',{type:'button',disabled,onClick:()=>run('remove-workspace-relation',{revision:value.revision,relationId:row.id})},t('relationRemove')),
            h('button',{type:'button',disabled:busy,onClick:()=>setRemoving(null)},t('cancel')))))) : value && h('p',{className:'mr-note'},t('relationEmpty')),
        h('label',null,editing?t('relationEdit'):t('relationAdd'),
          h('textarea',{rows:3,maxLength:1500,disabled,value:draft,placeholder:t('relationExample'),onChange:event=>setDraft(event.target.value)})),
        h('div',{className:'mr-doc-actions'},
          h('button',{type:'button',disabled:disabled||!draft.trim(),onClick:()=>run('save-workspace-relation',{revision:value.revision,text:draft,...(editing?{relationId:editing}:{})})},t('relationSave')),
          h('button',{type:'button',disabled:busy,onClick:()=>run('workspace-relations')},t('docRetry')),
          editing && h('button',{type:'button',disabled:busy,onClick:()=>{setEditing(null);setDraft('');}},t('cancel'))),
        locked && h('p',{className:'mr-note'},t('relationLocked')),
        busy && h('p',{role:'status'},t('loading')),
        notice && h('p',{role:'status'},notice),
        error && h('p',{className:'mr-error',role:'alert'},error));
    }
    function Dialog({ request, t, onClose, call, pick, openWorkspace }) {
      const [data, setData] = React.useState(null);
      const [roots, setRoots] = React.useState([]);
      const [primary, setPrimary] = React.useState('');
      const [error, setError] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [manual, setManual] = React.useState('');
      const [browser, setBrowser] = React.useState(null);
      const [browsePath, setBrowsePath] = React.useState('');
      const [documents, setDocuments] = React.useState([]);
      const [docModel, setDocModel] = React.useState('');
      const [docPath, setDocPath] = React.useState('');
      const [generatingPath, setGeneratingPath] = React.useState('');
      const [baselines, setBaselines] = React.useState([]);
      const [documentsState,setDocumentsState] = React.useState('loading');
      const [tab,setTab] = React.useState('folders');
      const [proposalStatus,setProposalStatus] = React.useState('');
      const [overview, setOverview] = React.useState(null);
      const [overviewError, setOverviewError] = React.useState(null);
      const [proposals, setProposals] = React.useState({ items: [], notice: null });
      const [proposalsLoading, setProposalsLoading] = React.useState(false);
      const [previewFor, setPreviewFor] = React.useState(null);
      const [proposalBusy, setProposalBusy] = React.useState('');
      const docTickets = React.useRef(new Map());
      const ref = React.useRef(null);
      const mounted = React.useRef(true);
      const browseTicket = React.useRef(0);
      const isWsl = data?.environment === 'wsl';
      const saved = !!(data && !data.needsMigration && primary === data.primary && JSON.stringify(roots) === JSON.stringify(data.roots));
      const dirty = data && !saved;
      const linuxPath = p => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') && !/[\u0000\r\n]/.test(p);
      const loadDocuments = (sessionId, workspaceId) => {
        const ticket = Symbol();
        docTickets.current.set('documents', ticket);
        setDocumentsState('loading');
        return call(sessionId, { action:'documents', workspaceId }).then(value => {
          if (!mounted.current || docTickets.current.get('documents') !== ticket) return;
          docTickets.current.delete('documents');
          const roots = (Array.isArray(value?.documents) ? value.documents : []).map(row=>row?.path).filter(path=>typeof path==='string' && path);
          setDocuments(documentPaths(value, roots));
          setDocumentsState('ready');
          setDocModel(typeof value?.model === 'string' ? value.model : '');
          setDocPath(path => (path && (value?.documents ?? []).some(row => row.path === path) ? path : '') || (Array.isArray(value?.documents) && value.documents[0]?.path) || '');
          setBaselines(documentBaselines(value, roots));
          setOverview(typeof value?.overview === 'string' && value.overview ? value.overview : null);
          setOverviewError(typeof value?.overviewError === 'string' && value.overviewError ? value.overviewError.slice(0, 300) : null);
        }, e => {
          if (!mounted.current || docTickets.current.get('documents') !== ticket) return;
          docTickets.current.delete('documents');
          setDocumentsState('failed');
          setOverviewError(String(e?.message ?? e).slice(0,300));
        });
      };
      const loadProposals = (sessionId, workspaceId) => {
        const ticket = Symbol();
        docTickets.current.set('proposals', ticket);
        setProposalsLoading(true);
        return call(sessionId, { action:'document-proposals', workspaceId }).then(value => {
          if (!mounted.current || docTickets.current.get('proposals') !== ticket) return;
          docTickets.current.delete('proposals');
          setProposals(proposalItems(value));
          setProposalsLoading(false);
        }, e => {
          if (mounted.current && docTickets.current.get('proposals') === ticket) {
            docTickets.current.delete('proposals');
            setProposalsLoading(false);
            setError(e.message);
          }
        });
      };
      React.useEffect(() => {
        let live = true;
        call(request.sessionId, { action:'get', workspaceId: request.workspaceId }).then(value => { if(live) {setData(value);setPrimary(value.primary);setRoots(value.roots);loadDocuments(request.sessionId, request.workspaceId);loadProposals(request.sessionId, request.workspaceId);} }).catch(e => live && setError(e.message));
        return () => { live = false; };
      }, [request]);
      React.useEffect(() => {
        mounted.current = true;
        const previous = document.activeElement;
        ref.current?.focus();
        return () => { mounted.current = false; browseTicket.current++; docTickets.current.clear(); if(previous?.isConnected) previous.focus(); };
      }, []);
      const closeBrowser = () => { browseTicket.current++; setBrowser(null); };
      const append = p => {
        if (!p) return false;
        if (isWsl && !linuxPath(p)) { setError(t('linuxOnly')); return false; }
        if (!roots.includes(p) && p !== primary) {
          if (roots.length >= 24) return false;
          setRoots([...roots,p]);
        }
        setError(''); return true;
      };
      const loadDirectory = async path => {
        const ticket = ++browseTicket.current;
        if (path && !linuxPath(path)) { setBrowser({listing:null,loading:false,error:t('linuxOnly')}); return; }
        setBrowsePath(path || '');
        setBrowser({loading:true,listing:null,error:''});
        try {
          const listing = await call(request.sessionId,{action:'browse',workspaceId:request.workspaceId,path:path || ''});
          if (!mounted.current || ticket !== browseTicket.current) return;
          if (!linuxPath(listing.path) || !Array.isArray(listing.entries)) throw new Error(t('failure'));
          setBrowsePath(listing.path);
          setBrowser({loading:false,listing,error:''});
        } catch(e) {
          if (mounted.current && ticket === browseTicket.current) setBrowser({loading:false,listing:null,error:e.message});
        }
      };
      const addFolder = async () => {
        if (isWsl) { await loadDirectory(linuxPath(primary)?primary:''); return; }
        setError('');
        try { const p = await pick(); if(mounted.current) append(p); }
        catch(e) { if(mounted.current) setError(e.message); }
      };
      const addManual = () => { if (append(manual.trim())) setManual(''); };
      const save = async () => {
        setBusy(true); setError('');
        try {
          const value = await call(request.sessionId, { action:'save', workspaceId: request.workspaceId, primary, roots, revision:data.revision });
          if(value.migrated) await openWorkspace(value.workspaceId,value.environment);
          if(mounted.current) onClose();
        }
        catch(e) { if(mounted.current) {setError(e.message);setBusy(false);} }
      };
      const generateDocument = async path => {
        setGeneratingPath(path); setError('');
        try {
          // Enqueue and return immediately: a long model call must not freeze
          // the dialog. Progress comes back through the baseline list polls.
          await call(request.sessionId, { action:'queue-document', workspaceId: request.workspaceId, path });
          if (!mounted.current) return;
          let waited = 0;
          while (waited < 120000 && mounted.current) {
            await new Promise(resolve => setTimeout(resolve, 2500));
            waited += 2500;
            const rows = await buckets(request.sessionId, request.workspaceId);
            if (!mounted.current) return;
            if (rows) {
              const mine = rows.find(row => row.path === path);
              if (mine?.state === 'ready') {
                loadDocuments(request.sessionId, request.workspaceId);
                setGeneratingPath('');
                return;
              }
              if (mine?.state === 'failed') {
                setError(mine.reason || t('docFailed'));
                setGeneratingPath('');
                return;
              }
            }
          }
          if (mounted.current) { setError(t('docTimeout')); setGeneratingPath(''); }
        } catch(e) { if (mounted.current) { setError(e.message); setGeneratingPath(''); } }
      };
      const buckets = async (sessionId, workspaceId) => {
        try {
          const value = await call(sessionId, { action:'documents', workspaceId });
          if (!mounted.current) return null;
          setBaselines(documentBaselines(value, [primary, ...roots].filter(Boolean)));
          return documentBaselines(value, [primary, ...roots].filter(Boolean));
        } catch { return null; }
      };
      const previewProposal = async id => {
        if (!id || proposalBusy) return;
        setError(''); setPreviewFor(null); setProposalStatus(''); setProposalBusy('preview:'+id);
        try {
          const result = await call(request.sessionId, { action:'preview-document-proposal', workspaceId: request.workspaceId, proposalId: id });
          if (!mounted.current) return;
          const preview = proposalPreview(result, id);
          if (!preview) { setError(t('proposalInvalid')); setPreviewFor(null); return; }
          setPreviewFor(preview);
        } catch(e) { if (mounted.current) setError(e.message); }
        finally { if (mounted.current) setProposalBusy(''); }
      };
      const applyProposal = async preview => {
        if (!preview || proposalBusy) return;
        setError(''); setProposalStatus(''); setProposalBusy('apply:'+preview.id);
        try {
          const result = await call(request.sessionId, { action:'apply-document-proposal', workspaceId: request.workspaceId, proposalId: preview.id, token: preview.token });
          if (!mounted.current) return;
          if (!result || !Array.isArray(result.applied)) throw new Error(t('proposalInvalid'));
          setPreviewFor(null);
          setProposalStatus('proposalApplied');
          setProposalBusy('');
          loadDocuments(request.sessionId, request.workspaceId);
          loadProposals(request.sessionId, request.workspaceId);
        } catch(e) { if (mounted.current) { setError(e.message); setProposalBusy(''); } }
      };
      const dismissProposal = async id => {
        if (!id || proposalBusy) return;
        setError(''); setProposalStatus(''); setProposalBusy('dismiss:'+id);
        try {
          await call(request.sessionId, { action:'dismiss-document-proposal', workspaceId: request.workspaceId, proposalId: id });
          if (!mounted.current) return;
          setProposalStatus('proposalDismissed');
          setPreviewFor(previous => previous && previous.id === id ? null : previous);
          setProposalBusy('');
          loadProposals(request.sessionId, request.workspaceId);
        } catch(e) { if (mounted.current) { setError(e.message); setProposalBusy(''); } }
      };
      const makePrimary = p => { setRoots([primary,...roots.filter(r=>r!==p)]); setPrimary(p); };
      const remove = p => {
        if(p===primary) { if(roots.length) {setPrimary(roots[0]);setRoots(roots.slice(1));} }
        else setRoots(roots.filter(r=>r!==p));
      };
      const row = (p, main) => h('div',{className:'mr-row',key:p},h(Folder),h('div',{className:'mr-path',title:p},h('span',null,p.replace(/[\\/]$/,'').split(/[\\/]/).pop() || p),h('small',null,p)),
        main ? h('span',{className:'mr-badge'},t('primary')) : h('button',{type:'button',disabled:busy||!!browser,onClick:()=>makePrimary(p)},t('makePrimary')),h('button',{type:'button',className:'mr-icon','aria-label':t('remove')+': '+p,disabled:busy||!!browser||(main&&!roots.length),title:main&&!roots.length?t('keepOne'):t('remove'),onClick:()=>remove(p)},'×'));
      const docRows = documentPaths({documents}, [primary,...roots].filter(Boolean)).map(row => saved ? row : {
        ...row, additional: row.path !== primary, document: row.path === data?.primary && row.path === primary ? row.document : null,
      });
      const selectedDoc = docRows.find(row => row.path === docPath) || docRows[0];
      const activeDocPath = selectedDoc?.path ?? '';
      const docStatus = row => {
        if (documentsState === 'loading') return h('small',{className:'mr-note',role:'status'},t('docLoading'));
        if (!saved) return h('small',{className:'mr-note'},t('changed'));
        if (documentsState === 'failed' || row.unavailable) return h('small',{className:'mr-error',role:'status'},t('docPreviewFailed'));
        return h('small',{className:'mr-doc-status '+(row.included?'present':'missing')},t(row.included?'docIncluded':'docMissing'));
      };
      const baselineState = row => {
        // "ready" alone was misleading: it also covered "an existing README was
        // used, nothing was written". Say which happened.
        const key = row.state === 'ready'
          ? (row.reused ? 'baselineReused' : row.fallback ? 'baselineFallback' : 'baselineReady')
          : { pending: 'baselinePending', scanning: 'baselineScanning', failed: 'baselineFailed' }[row.state] || 'baselinePending';
        return h('span',{className:'mr-baseline-state mr-baseline-'+row.state,title:row.reason||row.document||''},t(key)+(row.reason?'：'+row.reason:''));
      };
      const baselinePanel = h('section',{className:'mr-documents','aria-label':t('baseline')},
        h('h3',null,t('baseline')),
        h('div',{className:'mr-doc-actions'},h('button',{type:'button',disabled:busy||documentsState==='loading',onClick:()=>{loadDocuments(request.sessionId,request.workspaceId);loadProposals(request.sessionId,request.workspaceId);}},t('docRetry'))),
        baselines.length ? h('div',{className:'mr-doc-options'},...baselines.map(row =>
          h('div',{className:'mr-doc-option',key:row.path},
            h('span',{title:row.path},row.path.replace(/[\\/]$/,'').split(/[\\/]/).pop() || row.path),
            baselineState(row)))) : documentsState !== 'failed' && h('p',{className:'mr-note'},t(documentsState==='loading'?'loading':'baselineEmpty')),
        h('div',{className:'mr-overview'},h('h4',null,t('overview')),
          overview ? h('pre',{className:'mr-doc-preview','aria-label':t('overview')},overview) : documentsState==='ready' && !overviewError && h('p',{className:'mr-note'},t('overviewMissing')),
          overviewError && h('p',{className:'mr-error',role:'alert'},t('overviewError')+'：'+overviewError))
      );
      const proposalPanel = h('section',{className:'mr-documents','aria-label':t('proposals')},
        h('h3',null,t('proposals') + (proposals.items.length ? ' ('+proposals.items.length+')' : '')),
        proposalStatus && h('p',{className:'mr-note',role:'status'},t(proposalStatus)),
        proposals.notice ? h('p',{className:'mr-note',role:'status'},proposals.notice) : null,
        proposalsLoading ? h('p',{className:'mr-note',role:'status'},t('proposalsLoading')) : null,
        proposals.items.length ? h('div',{className:'mr-proposal-list'},...proposals.items.map(item =>
          h('div',{className:'mr-proposal',key:item.id},
            h('p',{className:'mr-proposal-summary'},item.summary),
            h('div',{className:'mr-doc-actions'},
              h('button',{type:'button',disabled:busy||!!proposalBusy,onClick:()=>previewProposal(item.id)},t('proposalPreview')),
              h('button',{type:'button',disabled:busy||!!proposalBusy||!previewFor||previewFor.id!==item.id,onClick:()=>applyProposal(previewFor)},t(proposalBusy==='apply:'+item.id?'proposalApplying':'proposalApply')),
              h('button',{type:'button',disabled:busy||!!proposalBusy,onClick:()=>dismissProposal(item.id)},t(proposalBusy==='dismiss:'+item.id?'proposalDismissing':'proposalDismiss'))),
            previewFor && previewFor.id===item.id ? h('div',{className:'mr-proposal-preview'},
              h('p',{className:'mr-note'},t('proposalConfirmHint')),
              ...previewFor.changes.map((change,i)=>h('div',{className:'mr-proposal-change',key:i},
                h('strong',null,change.path),h('pre',{className:'mr-doc-preview','aria-label':t('proposalDiff')},change.diff)))
            ) : null
          )
        )) : (!proposalsLoading ? h('p',{className:'mr-note'},t('proposalsEmpty')) : null)
      );
      const docPanel = h('section',{className:'mr-documents','aria-label':t('docPath')},
        h('h3',null,t('docPath')),
        docRows.length ? h('div',{className:'mr-doc-options'},...docRows.map(row =>
          h('label',{className:'mr-doc-option',key:row.path},
            h('input',{type:'radio',name:'mr-document-path',value:row.path,checked:activeDocPath===row.path,disabled:busy,onChange:()=>setDocPath(row.path)}),
            h('span',{title:row.path},row.path.replace(/[\\/]$/,'').split(/[\\/]/).pop() || row.path),
            row.additional && h('small',{className:'mr-doc-status additional',title:t('additionalWhy')},t('additionalTag')),docStatus(row)))) : h('p',{className:'mr-note'},t('loading')),
        activeDocPath && h('div',{className:'mr-doc-actions'},h('button',{type:'button',disabled:busy||!!generatingPath||documentsState==='loading',onClick:()=>loadDocuments(request.sessionId,request.workspaceId)},t('docRetry'))),
        overview
          ? h('pre',{className:'mr-doc-preview','aria-label':t('docPath')},overview)
          : null,
        h('p',{className:'mr-note'},t('generateHint')),
        selectedDoc?.additional && h('p',{className:'mr-note',role:'status'},t('additionalWhy')),
        activeDocPath && !selectedDoc?.document && !selectedDoc?.additional && (!saved || !docModel.trim()) && h('p',{className:'mr-note',role:'status'},t('generateBlocked')),
        h('div',{className:'mr-doc-actions'},h('button',{className:'mr-primary',type:'button',disabled:busy||documentsState!=='ready'||!!selectedDoc?.additional||!documentCanGenerate(saved,docModel)||!activeDocPath||!!selectedDoc?.document||!!generatingPath||!!browser,onClick:()=>generateDocument(activeDocPath),'aria-label':t(generatingPath?'generating':'generate')},h('span',{className:'mr-save-label'},t(generatingPath?'generating':'generate'))))
      );
      const listing = browser?.listing;
      const browserView = browser && h('section',{className:'mr-browser','aria-label':t('browse')},
        h('h3',null,t('browse')),
        h('div',{className:'mr-manual'},h('input',{value:browsePath,placeholder:'/home/...','aria-label':t('manual'),onChange:e=>setBrowsePath(e.target.value),onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();loadDirectory(browsePath.trim());}}}),h('button',{type:'button',onClick:()=>loadDirectory(browsePath.trim())},t('go'))),
        h('div',{className:'mr-browser-list','aria-busy':browser.loading},
          browser.loading ? h('p',{role:'status'},t('loading')) : null,
          browser.error ? h('p',{className:'mr-error',role:'alert'},browser.error) : null,
          listing?.parent ? h('button',{type:'button',className:'mr-browser-entry',onClick:()=>loadDirectory(listing.parent)},'↑ '+t('up')) : null,
          ...(listing?.entries || []).map(entry=>h('button',{type:'button',className:'mr-browser-entry',key:entry.path,disabled:entry.kind!=='directory',title:entry.kind==='directory'?entry.path:t('file'),onClick:()=>loadDirectory(entry.path)},entry.kind==='directory'?h(Folder):h('span',{'aria-hidden':true},'·'),entry.name+(entry.kind==='directory'?'/':''))),
          listing && !listing.entries.length ? h('p',{className:'mr-note'},t('empty')) : null,
          listing?.truncated ? h('p',{className:'mr-note'},t('truncated')) : null),
        h('div',{className:'mr-browser-actions'},h('button',{type:'button',onClick:closeBrowser},t('cancel')),h('button',{type:'button',disabled:browser.loading||!listing,onClick:()=>{if(append(listing.path))closeBrowser();}},t('useFolder'))));
      return h('div',{className:'mr-backdrop',onMouseDown:e=>{if(e.target===e.currentTarget&&!busy){if(browser)closeBrowser();else onClose();}}},
        h('section',{className:'mr-dialog',role:'dialog','aria-modal':true,'aria-labelledby':'mr-title',tabIndex:-1,ref,
          onKeyDown:e=>{
            if(e.key==='Escape'){e.preventDefault();e.stopPropagation();if(!busy){if(browser)closeBrowser();else onClose();}}
            if(e.key==='Tab') { const nodes=[...ref.current.querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]')];const first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();} }
          }},
          h('header',null,h('h2',{id:'mr-title'},t('edit')),h('button',{className:'mr-icon',type:'button','aria-label':t('close'),disabled:busy,onClick:onClose},'×')),
          h('label',{className:'mr-label'},t('name'),h('div',{className:'mr-name'},h(Folder),data?.title ?? request.displayTitle)),
          isWsl && h('p',{className:'mr-note'},t('wsl')+': '+(data.wslDistro || 'WSL')),
          h('div',{className:'mr-tabs',role:'tablist'},
            ...['folders','docs','scan','relations'].map(id=>h('button',{key:id,type:'button',role:'tab','aria-selected':tab===id,className:'mr-tab'+(tab===id?' active':''),onClick:()=>setTab(id)},t('tab'+id)))),
          h('p',{className:'mr-note'},t('tabHint'+tab)),
          h('div',{className:'mr-tabpanel',role:'tabpanel',hidden:tab!=='folders'},
          h('div',{className:'mr-label'},t('folders')),
          data ? h('div',{className:'mr-list'},row(primary,true),...roots.map(p=>row(p,false)),h('button',{type:'button',className:'mr-add',disabled:busy||!!browser,onClick:addFolder},h(Folder),t('add'))) : h('p',null,t('loading')),
          browserView,
          h('div',{className:'mr-manual'},h('input',{value:manual,disabled:busy||!data||!!browser,placeholder:isWsl?'/home/...':t('manual'),'aria-label':t('manual'),onChange:e=>setManual(e.target.value),onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();addManual();}}}),h('button',{type:'button',disabled:busy||!data||!manual.trim()||!!browser,onClick:addManual},t('attach'))),
          ),
          h('div',{className:'mr-tabpanel',role:'tabpanel',hidden:tab!=='relations'},
            h(WorkspaceRelations,{request,call,t,locked:!saved||busy,onSaved:()=>{
              void call(request.sessionId,{action:'get',workspaceId:request.workspaceId}).then(latest=>{
                if (!mounted.current) return;
                setData(previous=>previous && latest.primary===previous.primary && JSON.stringify(latest.roots)===JSON.stringify(previous.roots) ? latest : previous);
              },()=>{});
            }})),
          h('div',{className:'mr-tabpanel',role:'tabpanel',hidden:tab!=='docs'},docPanel),
          h('div',{className:'mr-tabpanel',role:'tabpanel',hidden:tab!=='scan'},
            baselinePanel,
            proposalPanel),
          h('p',{className:'mr-note'},t('note')),
          error && h('p',{className:'mr-error',role:'alert'},error),
          h('footer',null,dirty&&h('small',null,t('changed')),h('span',{style:{flex:1}}),h('button',{type:'button',disabled:busy,onClick:onClose},t('cancel')),h('button',{className:'mr-primary',type:'button',disabled:busy||!data||!dirty||!!browser,onClick:save,'aria-label':t(busy?'saving':'save')},h('span',{className:'mr-save-label'},t(busy?'saving':'save'))))
        ));
    }
    function Overlay({ source, t, call, pick, openWorkspace }) {
      const request = React.useSyncExternalStore(source.subscribe,source.getSnapshot);
      return h(React.Fragment,null,h('style',null,css+browserCss),request&&h(Dialog,{key:request.key,request,t,call,pick,openWorkspace,onClose:()=>source.set(null)}));
    }
    const css = `.mr-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 64%,transparent);pointer-events:auto}.mr-dialog{width:620px;max-width:100%;max-height:90vh;overflow:auto;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:20px;padding:24px;font-size:14px;outline:none}.mr-dialog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.mr-dialog h2{font-size:21px;margin:0;font-weight:600}.mr-dialog button,.mr-dialog input{font:inherit;color:inherit}.mr-dialog button{cursor:pointer;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px 15px;background:var(--dsw-alias-bg-layer-2)}.mr-dialog button:hover{background:var(--dsw-alias-bg-layer-1)}.mr-dialog button:focus-visible,.mr-dialog input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.mr-dialog button:disabled{opacity:.45;cursor:default}.mr-label{display:block;font-weight:500;margin:16px 0 8px}.mr-name{display:flex;gap:10px;align-items:center;padding:13px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;margin-top:8px;font-weight:400}.mr-list{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden}.mr-row{display:flex;gap:12px;align-items:center;padding:12px 15px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mr-path{flex:1;min-width:0}.mr-path span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mr-path small{display:block;color:var(--dsw-alias-label-secondary);font-size:11px;overflow-wrap:anywhere;margin-top:4px}.mr-badge{padding:3px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}.mr-dialog .mr-icon{border:0;background:none;font-size:23px;padding:2px 7px}.mr-dialog .mr-add{display:flex;gap:10px;align-items:center;width:100%;border:0;border-radius:0;padding:14px 15px;background:transparent;text-align:left}.mr-manual{display:flex;gap:8px;margin-top:12px}.mr-manual input{min-width:0;flex:1;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:9px;padding:9px}.mr-note{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary);margin:14px 0}.mr-error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}.mr-dialog footer{display:flex;gap:12px;align-items:center;margin-top:24px}.mr-dialog footer small{color:var(--dsw-alias-label-secondary)}.mr-dialog button.mr-primary{background:var(--dsw-alias-bg-layer-2)!important;color:var(--dsw-alias-label-primary)!important;border:2px solid var(--dsw-alias-brand-primary)!important;font-weight:600;min-width:76px;opacity:1;-webkit-text-fill-color:var(--dsw-alias-label-primary)!important}.mr-dialog button.mr-primary>.mr-save-label{display:inline!important;visibility:visible!important;opacity:1!important;color:var(--dsw-alias-label-primary)!important;-webkit-text-fill-color:var(--dsw-alias-label-primary)!important;background:none!important;font-size:14px!important;line-height:20px!important}.mr-dialog button.mr-primary:disabled>.mr-save-label{color:var(--dsw-alias-label-secondary)!important;-webkit-text-fill-color:var(--dsw-alias-label-secondary)!important}.mr-dialog button.mr-primary:hover:not(:disabled){background:var(--dsw-alias-bg-layer-1)!important}.mr-dialog button.mr-primary:disabled{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2);-webkit-text-fill-color:var(--dsw-alias-label-secondary);opacity:1;cursor:not-allowed}`;
    const browserCss = `.mr-tabs{display:flex;gap:6px;margin:18px 0 4px;border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:6px}.mr-dialog .mr-tab{border:0;background:none;padding:7px 12px;border-radius:8px;color:var(--dsw-alias-label-secondary);font-weight:500}.mr-dialog .mr-tab:hover{background:var(--dsw-alias-bg-layer-1)}.mr-dialog .mr-tab.active{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font-weight:600}.mr-tabpanel[hidden]{display:none}.mr-tabpanel{padding-top:4px}.mr-relations textarea{display:block;width:100%;box-sizing:border-box;margin-top:6px;padding:8px;font:inherit;color:inherit;background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:8px;resize:vertical}.mr-relations ul{margin:0;padding-inline-start:20px}.mr-relations li p{white-space:pre-wrap;overflow-wrap:anywhere}.mr-relations textarea:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.mr-browser{margin-top:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px;background:var(--dsw-alias-bg-layer-1)}.mr-browser h3{margin:0 0 10px;font-size:15px}.mr-browser-list{max-height:240px;overflow:auto;margin-top:12px}.mr-dialog .mr-browser-entry{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;border-radius:6px;padding:9px;overflow-wrap:anywhere}.mr-browser-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}.mr-documents{margin-top:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px;background:var(--dsw-alias-bg-layer-1)}.mr-documents h3{margin:0 0 10px;font-size:15px}.mr-doc-options{display:grid;gap:6px}.mr-doc-option{display:flex;align-items:center;gap:8px;font-size:12px;overflow-wrap:anywhere}.mr-doc-option>span{flex:1;min-width:0}.mr-doc-status{font-size:11px}.mr-doc-status.missing{color:var(--dsw-alias-label-secondary)}.mr-doc-status.additional{color:var(--dsw-alias-label-secondary);font-style:italic}.mr-doc-status.present{color:var(--dsw-alias-label-secondary)}.mr-doc-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}.mr-doc-preview{max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;padding:10px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;background:var(--dsw-alias-bg-base);font-size:12px;line-height:1.5}.mr-baseline-state{font-size:11px;white-space:nowrap}.mr-baseline-pending,.mr-baseline-scanning{color:var(--dsw-alias-label-secondary)}.mr-baseline-ready{color:var(--dsw-alias-state-success-primary, var(--dsw-alias-label-secondary))}.mr-baseline-failed{color:var(--dsw-alias-state-error-primary)}.mr-overview{margin-top:12px}.mr-overview h4{margin:0 0 8px;font-size:13px}.mr-proposal-list{display:grid;gap:12px}.mr-proposal{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px}.mr-proposal-summary{margin:0 0 8px;font-size:13px;overflow-wrap:anywhere}.mr-proposal-preview{margin-top:10px;border-top:1px solid var(--dsw-alias-border-l1);padding-top:8px}.mr-proposal-change{margin-top:8px}.mr-proposal-change strong{font-size:12px;overflow-wrap:anywhere}.mr-proposal-change .mr-doc-preview{max-height:180px}`;
    // Coalesce shrinking @ drafts BEFORE the native controller opens its menu,
    // builds breadcrumbs, queries sessions, or dispatches remote file lookups.
    // No DOM/key interception: Lexical continues deleting at native speed.
    function installDeleteCoalescing(service, delay = 160) {
      const original = service.sessionOf;
      const states = new Map();
      function decorate(controller) {
        if (!controller || states.has(controller) || typeof controller.track !== 'function' || typeof controller.dismiss !== 'function') return controller;
        const track = controller.track;
        const state = { previous: null, timer: null, pending: null, track, wrapped: null };
        const cancel = () => { clearTimeout(state.timer); state.timer = null; state.pending = null; };
        state.wrapped = function(...args) {
          const [draft, caret] = args;
          const previous = state.previous;
          state.previous = { draft, caret };
          const shrinking = previous && typeof draft === 'string' && draft.length < previous.draft.length
            && caret <= previous.caret
            && previous.draft.slice(0, caret) === draft.slice(0, caret)
            && previous.draft.slice(previous.caret) === draft.slice(caret);
          const prefix = typeof draft === 'string' ? draft.slice(0, caret) : '';
          const inReference = /(?:^|\s)@(?:"[^"\n]*|[^\s]*)$/.test(prefix);
          if (shrinking && inReference) {
            if (state.pending === null) controller.dismiss();
            clearTimeout(state.timer); state.pending = args;
            state.timer = setTimeout(() => {
              const pending = state.pending; state.pending = null; state.timer = null;
              if (pending) track.apply(controller, pending);
            }, delay);
            return;
          }
          // Selection-only notifications must not flush the queue between key repeats.
          if (state.pending && previous?.draft === draft && previous?.caret === caret) { state.pending = args; return; }
          cancel(); return track.apply(controller, args);
        };
        controller.track = state.wrapped;
        state.cancel = cancel; states.set(controller, state); return controller;
      }
      function sessionOf(...args) { return decorate(original.apply(this, args)); }
      service.sessionOf = sessionOf;
      return () => {
        if (service.sessionOf === sessionOf) service.sessionOf = original;
        for (const [controller, state] of states) { state.cancel(); if (controller.track === state.wrapped) controller.track = state.track; }
        states.clear();
      };
    }
    return {
      inject:['slots','locale','contextMenus','uiWorkspace','remote','remote.commands','inputTriggers'],
      apply(ctx) {
        ctx.effect(() => installDeleteCoalescing(ctx.inputTriggers));
        const localeEntries = lang => {
          const rows = {settingsSection:settingsText[lang].sectionTitle};
          for (const [key,value] of Object.entries(settingsText[lang])) rows['modelPage.'+key] = value;
          return {...(lang === 'en' ? en : zh), ...rows};
        };
        ctx.effect(()=>ctx.locale.register(NS,{en:localeEntries('en'),zh:localeEntries('zh')}));
        const pickText = () => (typeof navigator !== 'undefined' && (navigator.language||'').toLowerCase().startsWith('zh') ? settingsText.zh : settingsText.en);
        ctx.inject(['configForms','remote.session'], child => {
          const loadCatalog = async () => {
            const remote = child.get('remote.session') ?? child.get('remote')?.session;
            if (!remote || typeof remote.modelCatalog !== 'function') throw new Error('Model catalog unavailable');
            const response = await remote.modelCatalog();
            if (!response?.ok) throw new Error('Model catalog unavailable');
            return response.value?.groups ?? [];
          };
          return child.slots.inject('settings.section',()=>{
            const iconOff = child.slots.inject('settings.section.icon',()=>child.slots.register({
              name:'settings.section.icon', id:SETTINGS_ID, locale:NS
            },props=>{
              const size = typeof props?.size === 'number' ? props.size : 16;
              return h('img',{src:ICON,alt:'',width:size,height:size,style:{width:size+'px',height:size+'px',display:'block',objectFit:'contain',opacity:props?.active===false?0.75:1}});
            }));
            const page = child.slots.register({
              name:'settings.section', id:SETTINGS_ID, order:31, label:()=>pickText().title,
              inject:()=>({forms:child.configForms,loadCatalog})
            },SafeModelSettings);
            return ()=>{page();iconOff();};
          });
        });
        const t = ctx.locale.bind(NS);
        let value=null;const listeners=new Set();
        const source={getSnapshot:()=>value,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},set:v=>{value=v;for(const fn of listeners)fn();}};
        const call = async(sessionId,args)=>{
          const result=await ctx.remote.commands.execute(sessionId,'/workspace-folders '+JSON.stringify(args),[]);
          if(!result.ok)throw new Error(result.error.message);
          const outcome=result.value?.result;
          if(outcome?.kind!=='success')throw new Error(outcome?.text||t('failure'));
          return JSON.parse(outcome.text);
        };
        ctx.effect(()=>ctx.contextMenus.register({id:'local.multi-root.edit',target:'workspace',order:150,
          resolve:target=>[{id:'edit-folders',label:t('edit'),icon:{key:'workspace.rename'},failureLabel:t('failure'),run:async()=>{
            const isWslWorkspace = /^(?:\\\\|\/\/)wsl(?:\.localhost|\$)[\\/]/i.test(target.path || '');
            const sessionId=await ctx.uiWorkspace.connectWorkspace(target.workspaceId,isWslWorkspace?{agentPreset:'wsl'}:undefined);
            source.set({...target,sessionId,key:Date.now()});
          }}]
        }));
        ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'local.multi-root.editor',locale:NS,inject:()=>({source,call,pick:()=>ctx.uiWorkspace.pickDirectory(),openWorkspace:(id,env)=>ctx.uiWorkspace.openWorkspace(id,undefined,env==='wsl'?{agentPreset:'wsl'}:undefined)})},Overlay));
        ctx.effect(()=>()=>{source.set(null);listeners.clear();});
      }
    };
  }
});
