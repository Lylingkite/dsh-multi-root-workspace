import { absolutePath, samePath, wslParts } from './paths.js';
import { createWslRuntime, linuxPath, linuxFromHost } from './wsl-runtime.js';
import { searchRoots, indexRoots, rootCandidates, rankPaths, createSearchCache, createCompletionQueue, within } from './search.js';
const FILE_REFERENCE_PROMPT = 'Tokens prefixed with @ are paths explicitly referenced by the user. Absolute paths identify host files or directories; relative paths resolve from the workspace root. A trailing slash marks a directory: list it when its contents matter. Read files when their contents are needed; a reference alone does not mean its contents have been read. Quoted @ paths may contain spaces. Adding workspace folders does not grant write permissions.';
export const inject = ['fs', 'commands', 'tools', 'workingDirectory', 'workspaceRegistry', 'configEditor', 'systemPrompt', 'agentPresets', 'subprocess'];
export function apply(ctx, config = {}) {
  let records = config.workspaces ?? {};
  const entry = ctx.fiber.entry;
  const workspace = id => {
    const w = ctx.workspaceRegistry.get(id);
    if (!w) throw new Error('工作区不存在，请重新打开编辑窗口。');
    return w;
  };
  const lifecycle = new AbortController();
  ctx.effect(() => () => lifecycle.abort());
  const runWsl = createWslRuntime(ctx.subprocess, process.env.SystemRoot || 'C:\\Windows', lifecycle.signal);
  const searchCache = createSearchCache(lifecycle.signal);
  const connectionCache = createSearchCache(lifecycle.signal, { ttl: 30000 });
  ctx.effect(() => () => { searchCache.clear(); connectionCache.clear(); });
  ctx.on('session/event', (_session, event) => { if (event.type === 'tool/result') searchCache.clear(); });
  const isWslAgent = agent => ctx.agentPresets.presetForSession(agent.session) === 'wsl';
  const environmentOf = (w, agent) => (agent && isWslAgent(agent)) || records[w.id]?.environment === 'wsl' || wslParts(w.path) ? 'wsl' : 'windows';
  const wslModel = (w, resolvedDistro) => {
    const distro = resolvedDistro || wslParts(w.path)?.distro || records[w.id]?.wslDistro;
    if (!distro) throw new Error('WSL 连接尚未确认发行版。');
    const selected = records[w.id] || {};
    const toLinux = p => { if (/^[A-Za-z]:[\\/]/.test(p)) throw new Error('WSL 项目列表含 Windows 路径，请先移除旧的混合配置。'); return linuxFromHost(p, distro); };
    const primary = selected.primary ? toLinux(selected.primary) : linuxFromHost(w.path, distro);
    return { workspaceId: w.id, title: w.title, primary, roots: (selected.roots || []).map(toLinux).filter(p => p !== primary), environment: 'wsl', wslDistro: distro, needsMigration: primary !== linuxFromHost(w.path, distro), revision: JSON.stringify(selected) };
  };
  const bridgeDistro = () => {
    for (const row of ctx.configEditor.configuration()) {
      const cfg = { ...row.inherited, ...row.override };
      if (cfg.id !== 'wsl' || !Array.isArray(cfg.plugins)) continue;
      const world = cfg.plugins.find(p => p.name === 'dsh-wsl-bridge/wsl-world');
      if (world) return world.config?.distro || '';
    }
    return '';
  };
  const checkedWsl = async (w, agent, signal) => {
    if (agent && !isWslAgent(agent)) throw new Error('此工作区需要 WSL 会话模式，请新建 WSL 对话后再编辑。');
    const connectedDistro = bridgeDistro();
    const info = await connectionCache.get(connectedDistro, sharedSignal => runWsl(connectedDistro, { action: 'info' }, sharedSignal), signal);
    const m = wslModel(w, wslParts(w.path)?.distro || records[w.id]?.wslDistro || info.distro);
    if (info.distro.toLowerCase() !== m.wslDistro.toLowerCase()) throw new Error('WSL 会话发行版 ' + info.distro + ' 与工作区 ' + m.wslDistro + ' 不一致，请先调整 WSL 会话连接。');
    return m;
  };
  const model = w => environmentOf(w) === 'wsl' ? wslModel(w) : ({ environment: 'windows', needsMigration: !samePath(records[w.id]?.primary ?? w.path, w.path), workspaceId: w.id, title: w.title, primary: records[w.id]?.primary ?? w.path, roots: records[w.id]?.roots ?? [], wslDistro: records[w.id]?.wslDistro ?? '', revision: JSON.stringify(records[w.id] ?? {}) });
  const ownerOf = async agent => {
    const original = agent.session.header.cwd;
    // Registry membership survives a missing original directory; realpath lookup does not.
    const known = ctx.workspaceRegistry.list();
    const member = known.find(w => w.sessionIds.includes(agent.id));
    if (member) return member;
    const exact = known.find(w => w.path === original);
    if (exact) return exact;
    try { return original ? await ctx.workspaceRegistry.resolveByPath(original) : undefined; } catch { return undefined; }
  };
  const exists = async (p, signal) => {
    try { const target = await ctx.fs.resolve(p, { signal }); return (await ctx.fs.stat(target, signal))?.type === 'directory'; }
    catch (error) {
      signal?.throwIfAborted();
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR' || error?.code === 'FS_NOT_FOUND') return false;
      throw error;
    }
  };
  const recoverDirectory = async (agent, signal) => {
    const current = ctx.workingDirectory.get(agent.session);
    if (await exists(current, signal)) return current;
    const w = await ownerOf(agent);
    if (!w) return ctx.workingDirectory.ensure(agent, signal);
    const selected = records[w.id];
    const candidates = environmentOf(w) === 'wsl' ? [w.path] : [selected?.primary ?? w.path, ...(selected?.roots ?? [])];
    for (const candidate of candidates) {
      if (await exists(candidate, signal)) return ctx.workingDirectory.set(agent, candidate, signal);
    }
    // Never recreate removed folders or silently switch into an unrelated project.
    return ctx.workingDirectory.ensure(agent, signal);
  };
  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    await recoverDirectory(agent, signal);
    return next();
  }, { prepend: true });
  const persistWorkspace = async (w, next, revision, agent, signal) => {
    if (!entry) throw new Error('当前配置不支持持久化。');
    const current = records[w.id] || {};
    if (revision !== JSON.stringify(current)) throw new Error('配置已在其他窗口修改，请重新打开。');
    const hostPrimary = next.environment === 'wsl'
      ? (await runWsl(next.wslDistro, { action: 'hostPath', path: next.primary }, signal)).windows
      : next.primary;
    // Registry identities are path-bound. Never fabricate union directories or rewrite Session headers.
    const target = samePath(w.path, hostPrimary) ? w : await ctx.workspaceRegistry.create(hostPrimary, w.title);
    const targetBefore = JSON.stringify(records[target.id] || {});
    await ctx.configEditor.edit(entry, raw => {
      const old = raw.workspaces || {};
      if (revision !== JSON.stringify(old[w.id] || {})) throw new Error('配置已在其他窗口修改，请重新打开。');
      if (target.id !== w.id && targetBefore !== JSON.stringify(old[target.id] || {})) throw new Error('目标工作区配置已修改，请重试。');
      // Preserve old association and history; future chats are opened in the target record.
      return { ...raw, workspaces: { ...old, [w.id]: { ...next, redirectWorkspaceId: target.id }, [target.id]: next } };
    });
    records = { ...records, [w.id]: { ...next, redirectWorkspaceId: target.id }, [target.id]: next };
    searchCache.clear(); connectionCache.clear();
    const result = next.environment === 'wsl' ? wslModel(target) : model(target);
    return { ...result, previousWorkspaceId: w.id, migrated: target.id !== w.id };
  };
  const operations = {
    get(id, agent) { const w = workspace(id); return environmentOf(w, agent) === 'wsl' ? checkedWsl(w, agent) : model(w); },
    async browse(id, requested, agent, signal) {
      const w = workspace(id);
      if (environmentOf(w, agent) !== 'wsl') throw new Error('Linux 目录浏览仅用于 WSL 工作区。');
      const m = await checkedWsl(w, agent, signal);
      return runWsl(m.wslDistro, { action: 'browse', path: requested ? linuxPath(requested) : '' }, signal);
    },
    async save(id, roots, revision, primary, wslDistro, agent, signal) {
      const w = workspace(id);
      if (environmentOf(w, agent) === 'wsl') {
        const m = await checkedWsl(w, agent, signal);
        if (!Array.isArray(roots) || roots.length > 24) throw new Error('最多 24 个附加项目。');
        const validated = await runWsl(m.wslDistro, { action: 'validate', paths: [linuxPath(primary ?? m.primary), ...roots.map(linuxPath)] }, signal);
        const unique = [...new Set(validated.paths)];
        const next = { environment: 'wsl', primary: unique[0], roots: unique.slice(1), wslDistro: m.wslDistro };
        return persistWorkspace(w, next, revision, agent, signal);
      }
      if (!Array.isArray(roots) || roots.length > 24 || roots.some(p => typeof p !== 'string' || !absolutePath(p))) throw new Error('最多添加 24 个绝对路径文件夹。');
      primary = primary ?? records[id]?.primary ?? w.path;
      if (typeof primary !== 'string' || !absolutePath(primary)) throw new Error('主要项目必须是绝对文件夹路径。');
      wslDistro = wslDistro ?? records[id]?.wslDistro ?? '';
      if (typeof wslDistro !== 'string' || (wslDistro && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(wslDistro))) throw new Error('WSL 发行版名称无效。');
      const normalized = [];
      for (const p of [primary, ...roots]) {
        const t = await ctx.fs.resolve((() => { if (wslParts(p)) throw new Error('Windows 工作区不能混入 WSL 路径，请选择 WSL 工作区。'); if (process.platform === 'win32' && p.startsWith('/') && !p.startsWith('//')) throw new Error('Windows 工作区不能混入 Linux 路径，请使用 WSL 工作区。'); return p; })());
        if ((await ctx.fs.stat(t))?.type !== 'directory') throw new Error('文件夹不存在或不可访问：' + p);
        const value = ctx.fs.processPath(t);
        if (!normalized.some(p => samePath(p, value))) normalized.push(value);
      }
      const next = { primary: normalized[0], roots: normalized.slice(1), wslDistro };
      return persistWorkspace(w, next, revision, agent, signal);
    },
    async forAgent(agent, signal) {
      if (isWslAgent(agent)) {
        const w = await ownerOf(agent);
        if (!w || environmentOf(w, agent) !== 'wsl') throw new Error('WSL 会话需要先选择 WSL 工作区。');
        const m = await checkedWsl(w, agent, signal);
        return [m.primary, ...m.roots];
      }
      const cwd = await recoverDirectory(agent, signal);
      const w = await ownerOf(agent);
      if (!w) return [cwd];
      const selected = records[w.id];
      return [...new Set([selected?.primary ?? w.path, ...(selected?.roots ?? [])])];
    },
    async search(agent, query, signal) {
      signal?.throwIfAborted();
      if (typeof query !== 'string' || query.replaceAll('\\', '/').split('/').includes('..')) return [];
      const w = await ownerOf(agent);
      // Completion may be requested before a preset's agent context is composed.
      // Workspace identity, not only the active preset, selects the execution world.
      const useWsl = isWslAgent(agent) || (w && environmentOf(w) === 'wsl');
      let roots, distro;
      if (useWsl) {
        if (!w) throw new Error('WSL 会话需要先选择 WSL 工作区。');
        const knownDistro = wslParts(w.path)?.distro || records[w.id]?.wslDistro;
        const m = knownDistro ? wslModel(w, knownDistro) : await checkedWsl(w, undefined, signal);
        roots = [m.primary, ...m.roots]; distro = m.wslDistro;
      } else {
        roots = w ? [records[w.id]?.primary ?? w.path, ...(records[w.id]?.roots ?? [])] : [ctx.workingDirectory.get(agent.session) ?? agent.session.header.cwd];
        roots = roots.filter(Boolean);
      }
      if (!query) return rootCandidates(roots);
      const key = JSON.stringify([useWsl ? 'wsl' : 'host', distro, roots]);
      if (absolutePath(query)) {
        // Backspacing through /home/... or C:/... leaves paths outside every root.
        // Reject those before spawning WSL or touching the filesystem.
        if (!roots.some(root => within(root, query))) return [];
        if (useWsl) return (await runWsl(distro, { action: 'search', roots, query }, signal)).items;
        return searchRoots(ctx.fs, roots, query, signal);
      }
      const items = await searchCache.get(key, async sharedSignal => useWsl
        ? (await runWsl(distro, { action: 'index', roots }, sharedSignal)).items
        : indexRoots(ctx.fs, roots, sharedSignal), signal);
      return rankPaths(items, query);
    }
  };
  ctx.effect(() => ctx.systemPrompt.section({ name: 'context:file-reference', order: ctx.systemPrompt.getSectionOrder('FILE_REFERENCE'), text: FILE_REFERENCE_PROMPT }));
  ctx.provide('multiRootWorkspace', operations);
  ctx.provide('fileReferences', { list: createCompletionQueue(operations.search, lifecycle.signal) });
  ctx.effect(() => ctx.commands.register({
    name: 'workspace-folders', description: '查看或编辑工作区附加文件夹（不移动或删除原文件，不授予写权限）',
    input: { hint: '插件内部 JSON 请求' },
    handler: async ({ rawInput, agent, signal }) => {
      try {
        const args = JSON.parse(rawInput);
        if (!['get','save','browse'].includes(args.action)) throw new Error('未知工作区操作');
        const value = args.action === 'save' ? await operations.save(args.workspaceId, args.roots, args.revision, args.primary, args.wslDistro, agent, signal) : args.action === 'browse' ? await operations.browse(args.workspaceId, args.path, agent, signal) : await operations.get(args.workspaceId, agent);
        return { kind: 'success', text: JSON.stringify(value) };
      } catch (e) { return { kind: 'error', text: e.message }; }
    }
  }));
  ctx.effect(() => ctx.tools.register({
    name: 'workspace_folders',
    description: 'List the current workspace folders or search their file and directory paths for @ references. Returns paths only; use read to inspect contents. Does not grant write access.',
    parameters: { type: 'object', properties: { query: { type: 'string', description: 'Path substring to search. Omit to list workspace folders.' } }, additionalProperties: false },
    output: { schema: { type: 'object' }, render: (_, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    execute: async (args, exec) => {
      if (!exec.agent) throw new Error('需要当前会话');
      return args.query === undefined ? { roots: await operations.forAgent(exec.agent, exec.signal) } : { items: await operations.search(exec.agent, args.query, exec.signal) };
    }
  }));
}
