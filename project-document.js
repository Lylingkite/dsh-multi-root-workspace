// Project document discovery and create-only storage.
//
// Evidence given to a model is bounded top-level filename text only: no file
// contents, no secrets, no symlinks, no hidden names. Host inspection goes
// through the agent-scoped ctx.fs seam; WSL inspection goes through the
// read-only wsl-runtime helper. Writes go exclusively through the confining
// ctx.fs sandbox backend with an explicit per-session policy and a create-only
// write intent. No shell is used for writes.

import { pathApi, wslParts } from './paths.js';

export const DOCUMENT_FILENAME = 'DSH-PROJECT.md';
export const WORKSPACE_DOCUMENT_FILENAME = 'DSH-WORKSPACE.md';
const MAX_NAMES = 200;
const MAX_SCAN = 1000;
const MAX_TEXT_CHARS = 32000;
const MAX_READ_BYTES = 128 * 1024;
const CONTROL = /[\u0000-\u001f\u007f-\u009f|\\]/;
const SENSITIVE = /(?:^|[._-])(?:env|npmrc|yarnrc|pypirc|netrc|htpasswd|git-credentials|gitconfig|id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials?|secrets?|tokens?|keystore)(?:[._-]|$)|(?:\.pem|\.key|\.p12|\.pfx|\.jks)$/i;

function safeName(value) {
  if (typeof value !== 'string') return '';
  // Reject rather than rewrite: a crafted filename must not become plausible
  // evidence text. Hidden, sensitive, control-char and separator names are out.
  if (CONTROL.test(value) || value.includes('/')) return '';
  const name = value.trim();
  if (!name || name === '.' || name === '..' || name.startsWith('.') || SENSITIVE.test(name)) return '';
  return name.length > 80 ? name.slice(0, 79) + '…' : name;
}

// Reading a folder needs only the read seam; requiring writeText here made a
// read-only inspection fail closed and look like "no document".
function requireFs(fs) {
  if (!fs || typeof fs.resolve !== 'function' || typeof fs.stat !== 'function'
    || typeof fs.listDir !== 'function' || typeof fs.lstat !== 'function'
    || typeof fs.processPath !== 'function' || typeof fs.contains !== 'function') throw new Error('文件系统接口无效。');
}

// Mutations additionally need the write seam and a confining backend.
function requireWritableFs(fs) {
  requireFs(fs);
  if (typeof fs.writeText !== 'function') throw new Error('当前文件系统不支持写入。');
}

function validDir(p) {
  if (typeof p !== 'string' || !p || /[\u0000\r\n]/.test(p)) throw new Error('请选择有效的项目目录。');
  return p;
}

// A POSIX path is a WSL project root only when the caller explicitly supplies
// a verified hostRoot, or when this host is Windows and the POSIX path is the
// Linux side of a WSL session. On a Linux/WSL host /work is an ordinary path.
function isWslRoot(root, options) {
  if (wslParts(root)) return true;
  if (options && options.wsl === true) return true;
  if (!root.startsWith('/') || root.startsWith('//') || root.includes('\\')) return false;
  return process.platform === 'win32' || !!(options && options.hostRoot);
}

function linuxDocument(root) {
  return pathApi(root).join(root, DOCUMENT_FILENAME);
}

function hostDocument(root) {
  return pathApi(root).join(root, DOCUMENT_FILENAME);
}

/** Check the fs sees a real directory, not a symlink. */
async function requireDirectory(fs, p, signal) {
  const linfo = await fs.lstat(p, {}, signal);
  if (linfo && linfo.type !== 'directory') throw new Error('项目目录不能是符号链接或文件。');
  const target = await fs.resolve(p, { signal });
  if ((await fs.stat(target, signal))?.type !== 'directory') throw new Error('项目目录不存在或不可访问。');
  return target;
}

/**
 * Inspect a host directory through the agent-scoped fs adapter.
 * Returns { document: string|null, names: string[] } where document is an
 * absolute process path to README.md (case-insensitive) first, otherwise
 * DSH-PROJECT.md, and names are bounded safe top-level filenames.
 */
export async function inspectHost(fs, dirPath, signal) {
  signal?.throwIfAborted();
  requireFs(fs);
  const dir = validDir(dirPath);
  const target = await requireDirectory(fs, dir, signal);
  const entries = await fs.listDir(target, signal);
  const names = [];
  const seen = new Set();
  const candidates = new Map();
  for (const entry of Array.isArray(entries) ? entries.slice(0, MAX_SCAN) : []) {
    signal?.throwIfAborted();
    if (!entry || !['file', 'directory'].includes(entry.type)) continue;
    const child = typeof fs.processPath === 'function' ? fs.processPath(entry.target) : entry.target;
    let info;
    try { info = await fs.lstat(child, {}, signal); } catch (error) { signal?.throwIfAborted(); continue; }
    if (!info || info.type === 'symlink' || !['file', 'directory'].includes(info.type)) continue;
    const name = safeName(entry.name);
    if (name && !seen.has(name) && names.length < MAX_NAMES) { seen.add(name); names.push(name); }
    if (info.type === 'file') {
      const folded = entry.name.toLowerCase();
      if ((folded === 'readme.md' || folded === 'dsh-project.md' || folded === 'dsh-workspace.md') && !candidates.has(folded)) candidates.set(folded, child);
    }
  }
  const readme=candidates.get('readme.md'), project=candidates.get('dsh-project.md'), overview=candidates.get('dsh-workspace.md');
  return {document:readme ?? project ?? null,names,...(readme && project ? {supplement:project} : {}),...(overview ? {overview} : {})};
}

/**
 * Resolve the exact policy for one mutation. Fail closed: require a confining
 * fs backend and the shared sandbox policy service; never rely on the backend
 * deployment fallback, and never escalate from here.
 */
export function resolvePolicy(agent, signal) {
  signal?.throwIfAborted();
  if (!agent || !agent.ctx) throw new Error('当前会话不可用，无法写入项目文档。');
  // Cordis guards property access on services this context did not inject, so
  // read the optional services through get() instead of destructuring ctx.fs.
  const scoped = name => (typeof agent.ctx.get === 'function' ? agent.ctx.get(name) : agent.ctx[name]);
  const fs = scoped('fs'), sandboxPolicy = scoped('sandboxPolicy');
  requireFs(fs);
  if (fs.sandboxMode === undefined) throw new Error('当前文件系统未启用沙箱，拒绝写入项目文档。');
  if (!sandboxPolicy || typeof sandboxPolicy.resolve !== 'function') throw new Error('当前会话缺少沙箱策略，拒绝写入项目文档。');
  const policy = sandboxPolicy.resolve({ session: agent.session });
  if (!policy || typeof policy.mode !== 'string' || typeof policy.workspaceRoot !== 'string') throw new Error('无法解析沙箱策略，拒绝写入项目文档。');
  if (policy.mode === 'read-only') throw new Error('当前文件策略为只读，拒绝写入项目文档。');
  return policy;
}

function writableRoots(policy) {
  return [policy.workspaceRoot, ...(Array.isArray(policy.additionalWritableRoots) ? policy.additionalWritableRoots : [])];
}

/**
 * Preflight before any LLM call. Returns { ok, path, reason } and never writes.
 * For WSL roots, an explicit verified hostRoot (the distro UNC mapping from the
 * read-only hostPath helper) must be supplied by the caller; the mapping is
 * checked with wslParts against the Linux root, so it cannot redirect elsewhere.
 */
export async function preflightProjectDocument(agent, root, signal, options = {}) {
  const fail = reason => ({ ok: false, path: null, reason });
  try {
    signal?.throwIfAborted();
    const folder = validDir(root);
    const policy = resolvePolicy(agent, signal);
    const fs = typeof agent.ctx.get === 'function' ? agent.ctx.get('fs') : agent.ctx.fs;
    const isWsl = isWslRoot(folder, options);
    let writeRoot = folder;
    if (isWsl) {
      if (!options || typeof options.hostRoot !== 'string' || !options.hostRoot) {
        return fail('WSL 项目目录需要已验证的 Windows 主机映射，才能通过沙箱文件系统写入。');
      }
      writeRoot = validDir(options.hostRoot);
      const mapped = wslParts(writeRoot);
      if (!mapped || (options.distro && mapped.distro.toLowerCase() !== options.distro.toLowerCase()) || pathApi(folder).normalize(mapped.linux) !== pathApi(folder).normalize(folder)) {
        return fail('WSL 主机映射与项目目录不一致，拒绝写入。');
      }
    }
    const destination = hostDocument(writeRoot);
    // Containment is checked against the exact session policy, including extra roots.
    const rootTarget = await fs.resolve(writeRoot, { signal });
    let contained = false;
    for (const candidate of writableRoots(policy)) {
      try {
        const base = await fs.resolve(candidate, { signal });
        if (fs.contains(base, rootTarget)) { contained = true; break; }
      } catch (error) { signal?.throwIfAborted(); }
    }
    if (!contained) return fail('项目目录不在当前会话的沙箱可写范围内。');
    const rootInfo = await fs.lstat(writeRoot, {}, signal);
    if (rootInfo && rootInfo.type !== 'directory') return fail('项目目录不能是符号链接或文件。');
    const info = await fs.lstat(destination, {}, signal);
    if (info) {
      if (info.type === 'symlink') return fail('目标文档是符号链接，拒绝写入。');
      if (info.type !== 'file') return fail('目标文档已存在但不是普通文件。');
      return fail('目标文档已存在，不会覆盖。');
    }
    return { ok: true, path: hostDocument(folder), reason: '' };
  } catch (error) {
    signal?.throwIfAborted();
    return fail(error?.message || '预检失败。');
  }
}

/**
 * Create DSH-PROJECT.md with the create-only intent and an explicit per-session
 * sandbox policy. Never overwrites, never follows a symlink destination, never
 * uses a shell. Returns the absolute document path (string). `options.hostRoot`
 * is the verified Windows host mapping for a WSL root; without it WSL writes
 * are refused.
 */
export async function createProjectDocument(agent, root, text, signal, options = {}) {
  const preflight = await preflightProjectDocument(agent, root, signal, options);
  if (!preflight.ok) throw new Error(preflight.reason);
  signal?.throwIfAborted();
  if (typeof text !== 'string' || !text || text.length > MAX_TEXT_CHARS || /[\u0000]/.test(text)) throw new Error('文档内容无效或超过 ' + MAX_TEXT_CHARS + ' 字符。');
  const policy = resolvePolicy(agent, signal);
  const fs = typeof agent.ctx.get === 'function' ? agent.ctx.get('fs') : agent.ctx.fs;
  requireWritableFs(fs);
  const folder = validDir(root);
  const isWsl = isWslRoot(folder, options);
  const writeRoot = isWsl ? validDir(options.hostRoot) : folder;
  const destination = hostDocument(writeRoot);
  // Re-check immediately before the write: a symlink or file appearing between
  // preflight and mutation must fail closed.
  const info = await fs.lstat(destination, {}, signal);
  if (info) throw new Error('目标文档已存在或不是普通文件，拒绝覆盖。');
  const target = await fs.resolve(destination, { signal });
  // The mutation target must be the intended direct child of the write root,
  // not a path that resolution redirected through a symlink or traversal.
  const rootTarget = await fs.resolve(writeRoot, { signal });
  const api = pathApi(writeRoot);
  const base = api.resolve(fs.processPath(rootTarget));
  const child = api.resolve(fs.processPath(target));
  if (api.dirname(child) !== base || api.basename(child) !== DOCUMENT_FILENAME) {
    throw new Error('目标文档路径被重定向，拒绝写入。');
  }
  await fs.writeText(target, text, { kind: 'createIfAbsent' }, signal, policy);
  return hostDocument(folder);
}

// Managed files are a finite set, not paths accepted from users or a model.
async function managedTarget(agent, root, filename, signal, options) {
  if (![DOCUMENT_FILENAME, WORKSPACE_DOCUMENT_FILENAME].includes(filename)) throw new Error('不是可管理的说明文档。');
  const policy = resolvePolicy(agent, signal);
  const fs = typeof agent.ctx.get === 'function' ? agent.ctx.get('fs') : agent.ctx.fs;
  const folder = validDir(root);
  let mappedRoot = folder;
  if (isWslRoot(folder, options)) {
    mappedRoot = validDir(options?.hostRoot);
    const mapped = wslParts(mappedRoot);
    if (!mapped || !options?.distro || mapped.distro.toLowerCase() !== options.distro.toLowerCase() ||
        pathApi(folder).normalize(mapped.linux) !== pathApi(folder).normalize(folder)) throw new Error('WSL 主机映射与项目目录不一致。');
  }
  const api = pathApi(mappedRoot);
  const base = await requireDirectory(fs,mappedRoot,signal);
  let inScope = false;
  for (const path of writableRoots(policy)) {
    if (fs.contains(await fs.resolve(path,{signal}),base)) { inScope=true; break; }
  }
  if (!inScope) throw new Error('项目目录不在当前会话的沙箱可写范围内。');
  const child = api.join(mappedRoot,filename);
  const info = await fs.lstat(child,{},signal);
  if (info && info.type !== 'file') throw new Error('说明文档不是普通文件。');
  const target = await fs.resolve(child,{signal});
  const resolved = api.resolve(fs.processPath(target));
  if (api.dirname(resolved) !== api.resolve(fs.processPath(base)) || api.basename(resolved) !== filename) {
    throw new Error('说明文档路径被重定向。');
  }
  return {fs,policy,target,present:!!info,path:pathApi(folder).join(folder,filename)};
}

export async function readManagedDocument(agent,root,filename,signal,options={}) {
  const {fs,target,present,path} = await managedTarget(agent,root,filename,signal,options);
  if (!present) return null;
  const before = await fs.stat(target,signal);
  if (before?.type !== 'file' || before.version === undefined) throw new Error('无法确认说明文档版本。');
  const bytes = await fs.readBytes(target,signal,MAX_READ_BYTES);
  const text = new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  const after = await fs.stat(target,signal);
  if (after?.version !== before.version) throw new Error('说明文档在读取期间变化，请重试。');
  if (text.includes('\0')) throw new Error('说明文档不是有效的文本。');
  return {text,version:before.version,path};
}

export async function writeManagedDocument(agent,root,filename,text,expected,signal,options={}) {
  if (typeof text !== 'string' || !text.trim() || text.includes('\0') || Buffer.byteLength(text) > MAX_READ_BYTES) {
    throw new Error('说明文档无效或超过大小限制。');
  }
  const {fs,policy,target,present,path} = await managedTarget(agent,root,filename,signal,options);
  if (expected === null ? present : (!present || expected?.path !== path || expected.version === undefined)) {
    throw new Error('说明文档已变化，请重新预览。');
  }
  await fs.writeText(target,text,expected === null ? {kind:'createIfAbsent'} : {kind:'replaceIfVersion',version:expected.version},signal,policy);
  return path;
}

/**
 * Whether a project's note was written into the primary folder's document
 * because the project folder itself is outside the writable scope. Reading the
 * primary document is the only way to know: the folder looks "missing" while its
 * note already exists.
 */
export function noteInPrimary(primaryText, projectPath) {
  if (typeof primaryText !== 'string' || !primaryText || typeof projectPath !== 'string') return false;
  const name = pathApi(projectPath).basename(projectPath.replace(/[\\/]+$/, ''));
  if (!name) return false;
  for (const match of primaryText.matchAll(/^###\s+(.+?)\s*$/gm)) {
    if (match[1].trim() !== name) continue;
    // The heading must be followed by the marker this plugin writes, so an
    // unrelated section that happens to share the name is not claimed.
    const after = primaryText.slice(match.index, match.index + 400);
    if (after.includes('该目录不在当前会话可写范围内') || after.includes('not writable in this session')) return true;
  }
  return false;
}

/**
 * A project's own note is always DSH-PROJECT.md in that folder. README is the
 * author's own file and never stands in for a generated note, so a folder with
 * only a README still counts as undocumented here.
 */
export async function inspectProjectNote(fs, dir, signal) {
  requireFs(fs);
  const folder = validDir(dir);
  const target = await requireDirectory(fs, folder, signal);
  const api = pathApi(folder);
  for (const entry of await fs.listDir(target, signal)) {
    if (String(entry?.name ?? '').toLowerCase() !== 'dsh-project.md') continue;
    if (entry.type !== 'file') return null;
    const child = typeof fs.processPath === 'function' ? fs.processPath(entry.target) : entry.target;
    if ((await fs.lstat(child, {}, signal))?.type !== 'file') return null;
    return api.join(folder, entry.name);
  }
  return null;
}

/** Whether the workspace overview exists beside a folder's own note. */
export async function inspectProjectOverviewMarker(fs, dir, signal) {
  requireFs(fs);
  const folder = validDir(dir);
  const target = await requireDirectory(fs, folder, signal);
  for (const entry of await fs.listDir(target, signal)) {
    if (String(entry?.name ?? '').toUpperCase() !== WORKSPACE_DOCUMENT_FILENAME.toUpperCase()) continue;
    if (entry.type !== 'file') return null;
    const child = typeof fs.processPath === 'function' ? fs.processPath(entry.target) : entry.target;
    if ((await fs.lstat(child, {}, signal))?.type !== 'file') return null;
    return pathApi(folder).join(folder, WORKSPACE_DOCUMENT_FILENAME);
  }
  return null;
}

/**
 * Remove one managed document from a folder. Only the two allowlisted names are
 * deletable, and only through the sandbox-constrained fs seam. A missing file is
 * not an error: cleanup must be idempotent.
 */
export async function removeManagedDocument(agent, root, filename, signal, options = {}) {
  if (![DOCUMENT_FILENAME, WORKSPACE_DOCUMENT_FILENAME].includes(filename)) throw new Error('不是可管理的说明文档。');
  const policy = resolvePolicy(agent, signal);
  const fs = typeof agent.ctx.get === 'function' ? agent.ctx.get('fs') : agent.ctx.fs;
  requireWritableFs(fs);
  const folder = validDir(root);
  const isWsl = isWslRoot(folder, options);
  if (isWsl && (!options?.hostRoot || !options?.distro)) throw new Error('WSL 清理需要已验证的主机映射。');
  const writeRoot = isWsl ? validDir(options.hostRoot) : folder;
  const api = pathApi(writeRoot);
  const destination = api.join(writeRoot, filename);
  const info = await fs.lstat(destination, {}, signal);
  if (!info) return false;
  if (info.type !== 'file') throw new Error('说明文档不是普通文件，拒绝删除。');
  const target = await fs.resolve(destination, { signal });
  const base = api.resolve(fs.processPath(await fs.resolve(writeRoot, { signal })));
  const child = api.resolve(fs.processPath(target));
  if (api.dirname(child) !== base || api.basename(child) !== filename) throw new Error('说明文档路径被重定向，拒绝删除。');
  await fs.deleteFile(target, undefined, signal, policy);
  return true;
}
