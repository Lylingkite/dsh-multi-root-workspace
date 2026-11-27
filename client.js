window.__ModuleLoader__.load({
  id: '@local/dsh-multi-root',
  factory(require) {
    const React = require('react');
    const h = React.createElement;
    const NS = 'local.multiRoot';
    const zh = { edit: '编辑工作区', folders: '源文件夹', primary: '主要', wsl: 'WSL 连接', go: '前往', up: '上一级', useFolder: '使用此文件夹', browse: '选择 WSL 文件夹', file: '文件（不可选择）', empty: '当前目录为空', truncated: '列表已截断，请进入子目录或输入路径', linuxOnly: 'WSL 模式只接受 / 开头的 Linux 绝对路径，不接受 Windows 或 UNC 路径', makePrimary: '设为主要', add: '添加文件夹', remove: '移除关联', save: '保存', cancel: '取消', close: '关闭', loading: '正在读取…', saving: '正在保存…', name: '工作区名称', note: '保存后以主要目录创建或使用原生工作区并打开，新聊天默认在主要目录运行；旧聊天保留在旧工作区，不搬动文件。移除只取消关联，不删除文件；移除主要项目会自动选择下一项，至少保留一个项目。', manual: '或输入绝对文件夹路径', attach: '添加路径', failure: '无法编辑工作区', pick: '请选择文件夹', changed: '未保存的更改', keepOne: '至少保留一个项目，请先添加其他项目' , description: '文件夹说明', describePlaceholder: '自动识别中…', describeFailed: '自动生成说明失败，请自行填写', describeLoading: '正在生成说明…' };
    const en = { edit: 'Edit workspace', folders: 'Source folders', primary: 'Primary', wsl: 'WSL connection', go: 'Go', up: 'Parent', useFolder: 'Use this folder', browse: 'Choose a WSL folder', file: 'File (not selectable)', empty: 'This directory is empty', truncated: 'Listing truncated; enter a subdirectory or a path', linuxOnly: 'WSL mode requires an absolute Linux path beginning with /, not a Windows or UNC path', makePrimary: 'Set as primary', add: 'Add folder', remove: 'Remove association', save: 'Save', cancel: 'Cancel', close: 'Close', loading: 'Loading…', saving: 'Saving…', name: 'Workspace name', note: 'Saving opens a native workspace rooted at the primary folder. New chats use that directory; old chats remain in their old workspace. No files are moved. Removal only unlinks a folder; removing the primary promotes the next one. Keep at least one project.', manual: 'Or enter an absolute folder path', attach: 'Add path', failure: 'Could not edit workspace', pick: 'Choose a folder', changed: 'Unsaved changes', keepOne: 'Keep at least one project; add another folder first' , description: 'Folder description', describePlaceholder: 'Describe automatically…', describeFailed: 'Could not generate a draft; please write one yourself', describeLoading: 'Generating description…' };
    function Folder() { return h('svg', {width:20,height:20,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:1.5,'aria-hidden':true}, h('path',{d:'M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v10H3Z'}),h('path',{d:'M3 10h18'})); }
    // Pure state helpers: kept free of DOM/React so the summary lifecycle can be
    // exercised in a plain Node test. A draft is only applied if its row still
    // exists and the user has not touched it since the request was issued.
    function summarizeInitial(get, roots) {
      const base = Array.isArray(get?.descriptions) ? get.descriptions : [];
      const paths = new Set(Array.isArray(roots) ? roots : []);
      const state = {};
      for (const row of base) {
        if (!row || typeof row.path !== 'string' || !paths.has(row.path)) continue;
        state[row.path] = { text: typeof row.text === 'string' ? row.text : '', baseline: typeof row.text === 'string' ? row.text : '', touched: false, loading: false, failed: false };
      }
      for (const path of paths) {
        if (!Object.hasOwn(state, path)) state[path] = { text: '', baseline: '', touched: false, loading: false, failed: false };
      }
      return state;
    }
    function summaryDraft(state, path, text, ok) {
      if (!Object.hasOwn(state, path) || state[path].touched || !state[path].loading) return state;
      if (!ok || typeof text !== 'string' || !text) return { ...state, [path]: { ...state[path], loading: false, failed: true } };
      return { ...state, [path]: { text, baseline: text, touched: false, loading: false, failed: false } };
    }
    function summaryPrune(state, roots) {
      const paths = new Set(Array.isArray(roots) ? roots : []);
      const next = {};
      let changed = false;
      for (const [path, row] of Object.entries(state)) {
        if (paths.has(path)) next[path] = row;
        else changed = true;
      }
      for (const path of paths) {
        if (!Object.hasOwn(next, path)) { next[path] = { text: '', baseline: '', touched: false, loading: false, failed: false }; changed = true; }
      }
      return changed ? next : state;
    }
    function summarizeChanges(state, get) {
      const base = new Map();
      for (const row of Array.isArray(get?.descriptions) ? get.descriptions : []) {
        if (row && typeof row.path === 'string') base.set(row.path, typeof row.text === 'string' ? row.text : '');
      }
      const changes = [];
      for (const [path, row] of Object.entries(state || {})) {
        if (base.has(path) ? row.text !== base.get(path) : row.touched || row.text) changes.push({ path, text: row.text });
      }
      return changes;
    }
    function shouldDescribe(state, path, baseline) {
      return Object.hasOwn(state, path) && !state[path].touched && !state[path].loading
        && state[path].text === baseline && !baseline;
    }
    function Dialog({ request, t, onClose, call, pick, openWorkspace }) {
      const [data, setData] = React.useState(null);
      const [roots, setRoots] = React.useState([]);
      const [primary, setPrimary] = React.useState('');
      const [descriptions, setDescriptions] = React.useState({});
      const [error, setError] = React.useState('');
      const [busy, setBusy] = React.useState(false);
      const [manual, setManual] = React.useState('');
      const [browser, setBrowser] = React.useState(null);
      const [browsePath, setBrowsePath] = React.useState('');
      const draftTickets = React.useRef(new Map());
      const ref = React.useRef(null);
      const mounted = React.useRef(true);
      const browseTicket = React.useRef(0);
      const isWsl = data?.environment === 'wsl';
      const dirty = data && (data.needsMigration || primary !== data.primary || JSON.stringify(roots) !== JSON.stringify(data.roots) || summarizeChanges(descriptions, data).length > 0);
      const linuxPath = p => typeof p === 'string' && p.startsWith('/') && !p.startsWith('//') && !p.includes('\\') && !/[\u0000\r\n]/.test(p);
      React.useEffect(() => {
        let live = true;
        call(request.sessionId, { action:'get', workspaceId: request.workspaceId }).then(value => { if(live) {setData(value);setPrimary(value.primary);setRoots(value.roots);setDescriptions(summarizeInitial(value, [value.primary, ...value.roots]));draftTickets.current.clear();} }).catch(e => live && setError(e.message));
        return () => { live = false; };
      }, [request]);
      React.useEffect(() => {
        mounted.current = true;
        const previous = document.activeElement;
        ref.current?.focus();
        return () => { mounted.current = false; browseTicket.current++; if(previous?.isConnected) previous.focus(); };
      }, []);
      const previewDescription = path => {
        const ticket = Symbol();
        draftTickets.current.set(path, ticket);
        setDescriptions(state => ({ ...state, [path]: { text: '', baseline: '', touched: false, loading: true, failed: false } }));
        const finish = (text, ok) => {
          if (!mounted.current || draftTickets.current.get(path) !== ticket) return;
          draftTickets.current.delete(path);
          setDescriptions(state => summaryDraft(state, path, text, ok));
        };
        call(request.sessionId, { action:'describe', workspaceId: request.workspaceId, path })
          .then(result => finish(result?.text, true), () => finish('', false));
      };
      const closeBrowser = () => { browseTicket.current++; setBrowser(null); };
      const append = p => {
        if (!p) return false;
        if (isWsl && !linuxPath(p)) { setError(t('linuxOnly')); return false; }
        if (!roots.includes(p) && p !== primary) {
          if (roots.length >= 24) return false;
          setRoots([...roots,p]); previewDescription(p);
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
          const descriptions = summarizeChanges(stateRef.current, data);
          const value = await call(request.sessionId, { action:'save', workspaceId: request.workspaceId, primary, roots, revision:data.revision, descriptions });
          if(value.migrated) await openWorkspace(value.workspaceId,value.environment);
          if(mounted.current) onClose();
        }
        catch(e) { if(mounted.current) {setError(e.message);setBusy(false);} }
      };
      const stateRef = React.useRef({});
      stateRef.current = descriptions;
      const makePrimary = p => { setRoots([primary,...roots.filter(r=>r!==p)]); setPrimary(p); };
      const remove = p => {
        draftTickets.current.delete(p);
        if(p===primary) { if(roots.length) {setPrimary(roots[0]);setRoots(roots.slice(1));} }
        else setRoots(roots.filter(r=>r!==p));
        setDescriptions(state => { const next = { ...state }; delete next[p]; return next; });
      };
      const editDescription = (path, text) => setDescriptions(state => ({
        ...state,
        [path]: { text, baseline: Object.hasOwn(state, path) ? state[path].baseline : '', touched: true, loading: false, failed: false }
      }));
      const row = (p, main) => h('div',{className:'mr-row',key:p},h(Folder),h('div',{className:'mr-path',title:p},h('span',null,p.replace(/[\\/]$/,'').split(/[\\/]/).pop() || p),h('small',null,p),
        h('input',{className:'mr-description','aria-label':t('description'),maxLength:320,placeholder:descriptions[p]?.loading ? t('describeLoading') : (descriptions[p]?.failed ? t('describeFailed') : t('describePlaceholder')),value:descriptions[p]?.text ?? '',disabled:busy,onChange:e=>editDescription(p,e.target.value)}),
        descriptions[p]?.loading ? h('small',{className:'mr-note',role:'status'},t('describeLoading')) : null,
        descriptions[p]?.failed ? h('small',{className:'mr-error',role:'status'},t('describeFailed')) : null),
        main ? h('span',{className:'mr-badge'},t('primary')) : h('button',{type:'button',disabled:busy||!!browser,onClick:()=>makePrimary(p)},t('makePrimary')),h('button',{type:'button',className:'mr-icon','aria-label':t('remove')+': '+p,disabled:busy||!!browser||(main&&!roots.length),title:main&&!roots.length?t('keepOne'):t('remove'),onClick:()=>remove(p)},'×'));
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
          h('div',{className:'mr-label'},t('folders')),
          data ? h('div',{className:'mr-list'},row(primary,true),...roots.map(p=>row(p,false)),h('button',{type:'button',className:'mr-add',disabled:busy||!!browser,onClick:addFolder},h(Folder),t('add'))) : h('p',null,t('loading')),
          browserView,
          h('div',{className:'mr-manual'},h('input',{value:manual,disabled:busy||!data||!!browser,placeholder:isWsl?'/home/...':t('manual'),'aria-label':t('manual'),onChange:e=>setManual(e.target.value),onKeyDown:e=>{if(e.key==='Enter'){e.preventDefault();addManual();}}}),h('button',{type:'button',disabled:busy||!data||!manual.trim()||!!browser,onClick:addManual},t('attach'))),
          h('p',{className:'mr-note'},t('note')),
          error && h('p',{className:'mr-error',role:'alert'},error),
          h('footer',null,dirty&&h('small',null,t('changed')),h('span',{style:{flex:1}}),h('button',{type:'button',disabled:busy,onClick:onClose},t('cancel')),h('button',{className:'mr-primary',type:'button',disabled:busy||!data||!dirty||!!browser,onClick:save,'aria-label':t(busy?'saving':'save')},h('span',{className:'mr-save-label'},t(busy?'saving':'save'))))
        ));
    }
    function Overlay({ source, t, call, pick, openWorkspace }) {
      const request = React.useSyncExternalStore(source.subscribe,source.getSnapshot);
      return h(React.Fragment,null,h('style',null,css+browserCss),request&&h(Dialog,{key:request.key,request,t,call,pick,openWorkspace,onClose:()=>source.set(null)}));
    }
    const css = `.mr-backdrop{position:fixed;inset:0;z-index:1000;display:flex;align-items:center;justify-content:center;padding:24px;background:color-mix(in srgb,var(--dsw-alias-bg-base) 64%,transparent);pointer-events:auto}.mr-dialog{width:620px;max-width:100%;max-height:90vh;overflow:auto;background:var(--dsw-alias-bg-overlay);color:var(--dsw-alias-label-primary);border:1px solid var(--dsw-alias-border-l1);border-radius:20px;padding:24px;font-size:14px;outline:none}.mr-dialog header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}.mr-dialog h2{font-size:21px;margin:0;font-weight:600}.mr-dialog button,.mr-dialog input{font:inherit;color:inherit}.mr-dialog button{cursor:pointer;border:1px solid var(--dsw-alias-border-l1);border-radius:9px;padding:8px 15px;background:var(--dsw-alias-bg-layer-2)}.mr-dialog button:hover{background:var(--dsw-alias-bg-layer-1)}.mr-dialog button:focus-visible,.mr-dialog input:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}.mr-dialog button:disabled{opacity:.45;cursor:default}.mr-label{display:block;font-weight:500;margin:16px 0 8px}.mr-name{display:flex;gap:10px;align-items:center;padding:13px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;margin-top:8px;font-weight:400}.mr-list{border:1px solid var(--dsw-alias-border-l1);border-radius:12px;overflow:hidden}.mr-row{display:flex;gap:12px;align-items:center;padding:12px 15px;border-bottom:1px solid var(--dsw-alias-border-l1)}.mr-path{flex:1;min-width:0}.mr-path span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.mr-path small{display:block;color:var(--dsw-alias-label-secondary);font-size:11px;overflow-wrap:anywhere;margin-top:4px}.mr-description{display:block;width:100%;margin-top:6px;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;background:var(--dsw-alias-bg-base);padding:6px 8px;font-size:12px;color:var(--dsw-alias-label-primary)}.mr-description::placeholder{color:var(--dsw-alias-label-secondary)}.mr-badge{padding:3px 9px;border:1px solid var(--dsw-alias-border-l1);border-radius:8px;font-size:12px;color:var(--dsw-alias-label-secondary)}.mr-dialog .mr-icon{border:0;background:none;font-size:23px;padding:2px 7px}.mr-dialog .mr-add{display:flex;gap:10px;align-items:center;width:100%;border:0;border-radius:0;padding:14px 15px;background:transparent;text-align:left}.mr-manual{display:flex;gap:8px;margin-top:12px}.mr-manual input{min-width:0;flex:1;border:1px solid var(--dsw-alias-border-l1);background:var(--dsw-alias-bg-base);border-radius:9px;padding:9px}.mr-note{font-size:12px;line-height:1.7;color:var(--dsw-alias-label-secondary);margin:14px 0}.mr-error{color:var(--dsw-alias-state-error-primary);overflow-wrap:anywhere}.mr-dialog footer{display:flex;gap:12px;align-items:center;margin-top:24px}.mr-dialog footer small{color:var(--dsw-alias-label-secondary)}.mr-dialog button.mr-primary{background:var(--dsw-alias-bg-layer-2)!important;color:var(--dsw-alias-label-primary)!important;border:2px solid var(--dsw-alias-brand-primary)!important;font-weight:600;min-width:76px;opacity:1;-webkit-text-fill-color:var(--dsw-alias-label-primary)!important}.mr-dialog button.mr-primary>.mr-save-label{display:inline!important;visibility:visible!important;opacity:1!important;color:var(--dsw-alias-label-primary)!important;-webkit-text-fill-color:var(--dsw-alias-label-primary)!important;background:none!important;font-size:14px!important;line-height:20px!important}.mr-dialog button.mr-primary:disabled>.mr-save-label{color:var(--dsw-alias-label-secondary)!important;-webkit-text-fill-color:var(--dsw-alias-label-secondary)!important}.mr-dialog button.mr-primary:hover:not(:disabled){background:color-mix(in srgb,var(--dsw-alias-label-primary) 88%,var(--dsw-alias-bg-base));color:var(--dsw-alias-bg-base)}.mr-dialog button.mr-primary:disabled{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);border-color:var(--dsw-alias-border-l2);-webkit-text-fill-color:var(--dsw-alias-label-secondary);opacity:1;cursor:not-allowed}`;
    const browserCss = `.mr-browser{margin-top:14px;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;padding:14px;background:var(--dsw-alias-bg-layer-1)}.mr-browser h3{margin:0 0 10px;font-size:15px}.mr-browser-list{max-height:240px;overflow:auto;margin-top:12px}.mr-dialog .mr-browser-entry{display:flex;align-items:center;gap:8px;width:100%;text-align:left;border:0;border-radius:6px;padding:9px;overflow-wrap:anywhere}.mr-browser-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:12px}`;
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
        ctx.effect(()=>ctx.locale.register(NS,{en,zh}));
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
