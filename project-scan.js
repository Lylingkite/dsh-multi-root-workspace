// Project structure scanner. Reads real files through the agent-scoped fs seam:
// manifests for dependencies, source file paths for the tree, and bounded
// excerpts for module notes. Only derived metadata leaves this module: no raw
// source text, no secret-bearing filenames, nothing outside the project root
// and no child symlinks. The same normalizer serves the in-process host seam
// and the one-process WSL `scan` action (see wsl-runtime.js).

const MAX_FILES = 800;
const MAX_DEPTH = 6;
const MAX_EXCERPT = 1200;
const MAX_MODULE_TEXT = 8000;
const MAX_MODULES = 24;
const MAX_EDGES = 240;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'out', 'target', '.next', '.venv', 'venv', '__pycache__', '.idea', '.vscode', 'coverage', '.cache', 'vendor']);
const SQL_EXT = /\.sql$/i;
const CODE_EXT = /\.(?:js|mjs|cjs|jsx|ts|tsx|py|go|rs|java|kt|rb|php|c|h|cc|cpp|hpp|cs|swift|scala|sh|lua|vue|svelte)$/i;
const MANIFESTS = ['package.json', 'pyproject.toml', 'requirements.txt', 'cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'composer.json', 'gemfile', 'tsconfig.json', 'docker-compose.yml', 'compose.yaml', 'dockerfile', 'makefile', 'cmakelists.txt'];
const ENTRY = /^(?:index|main|app|server|cli|mod|lib|__init__)\.(?:js|mjs|cjs|ts|tsx|jsx|py|go|rs|java|rb|php|c|cs)$/i;
const DOC_NAME = /^(?:readme|dsh-project)\.md$/i;

const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const SECRET_NAME = /(?:^|[._-])(?:env|npmrc|yarnrc|pypirc|netrc|htpasswd|git-credentials|gitconfig|id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials?|secrets?|tokens?|keystore|password)(?:[._-]|$)|\.(?:pem|key|p12|pfx|jks|keystore)$/i;
const SECRET_INLINE = /(?:api[_-]?key|secret|token|passwd|password|authorization|bearer|private[_-]?key|access[_-]?key)\s*[:=]\s*["']?[^\s"',;]{6,}/gi;
const LONG_TOKEN = /\b[A-Za-z0-9+/]{40,}={0,2}\b/g;
const BUILTIN = new Set(['fs', 'path', 'os', 'util', 'crypto', 'http', 'https', 'net', 'url', 'stream', 'events', 'assert', 'child_process', 'buffer', 'process', 'sys', 'math', 'json', 're', 'io', 'collections', 'itertools', 'functools', 'dataclasses', 'typing', 'time', 'datetime', 'random', 'logging', 'unittest', 'subprocess', 'asyncio', 'pathlib', 'hashlib', 'hmac', 'secrets', 'base64', 'struct', 'threading', 'multiprocessing', 'socket', 'sqlite3', 'csv', 'argparse', 'enum', 'abc', 'contextlib', 'copy', 'glob', 'shutil', 'tempfile', 'warnings', 'weakref', 'numbers', 'decimal', 'fractions', 'operator', 'string', 'textwrap', 'unicodedata', 'uuid', 'queue', 'heapq', 'bisect', 'array', 'binascii', 'codecs', 'errno', 'fnmatch', 'gettext', 'inspect', 'locale', 'marshal', 'pickle', 'platform', 'pprint', 'signal', 'site', 'stat', 'statistics', 'stringprep', 'tarfile', 'traceback', 'types', 'zipfile', 'zlib']);

const clean = value => typeof value === 'string' ? value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim() : '';

/** Mask obvious inline credentials in any text-derived field before it can reach a prompt. */
function redact(value) {
  const text = clean(value);
  if (!text) return '';
  return text
    .replace(SECRET_INLINE, match => match.replace(/\s*[:=]\s*["']?[^\s"',;]{6,}.*$/i, '=[REDACTED]'))
    .replace(LONG_TOKEN, '[REDACTED]')
    .slice(0, 300);
}

function safeReadable(name) {
  return !!name && !name.startsWith('.') && !SECRET_NAME.test(name);
}

/** Read a manifest as text, bounded and failure-tolerant. */
async function readBounded(fs, path, signal, limit = 20000) {
  try {
    const target = await fs.resolve(path, { signal });
    const info = await fs.stat(target, signal);
    if (!info || info.type !== 'file') return '';
    if (typeof info.size === 'number' && info.size > limit) return '';
    const text = await fs.readText(target, signal);
    return typeof text === 'string' ? text.slice(0, limit) : '';
  } catch (error) {
    signal?.throwIfAborted();
    return '';
  }
}

/**
 * Directories and files under one root, breadth-first and bounded.
 * Accepts both the agent fs seam (`type` + `target`) and a raw WSL `browse`
 * listing (`kind` + `path`), so a protocol mismatch cannot silently drop
 * every file. Child symlinks are never traversed or recorded.
 */
async function walk(fs, root, signal) {
  const target = await fs.resolve(root, { signal });
  if ((await fs.stat(target, signal))?.type !== 'directory') throw new Error('项目目录不存在或不可访问。');
  const queue = [{ path: root, target, depth: 0 }];
  const files = [];
  const dirs = [];
  let visited = 0;
  while (queue.length && files.length < MAX_FILES) {
    const current = queue.shift();
    signal?.throwIfAborted();
    let entries;
    try { entries = await fs.listDir(current.target, signal); } catch (error) { signal?.throwIfAborted(); continue; }
    for (const entry of Array.isArray(entries) ? entries.slice(0, 400) : []) {
      if (++visited > MAX_FILES * 4) break;
      signal?.throwIfAborted();
      if (!entry || !['directory', 'file'].includes(entry.type ?? entry.kind)) continue;
      const name = clean(entry.name);
      if (!safeReadable(name)) continue;
      if ((entry.type ?? entry.kind) === 'directory' && SKIP_DIRS.has(name.toLowerCase())) continue;
      const rawTarget = entry.target ?? entry.path;
      const child = typeof fs.processPath === 'function'
        ? fs.processPath(rawTarget)
        : (rawTarget?.displayPath ?? rawTarget);
      if (typeof child !== 'string' || !child) continue;
      let info;
      try { info = await fs.lstat(child, {}, signal); } catch (error) { signal?.throwIfAborted(); continue; }
      if (!info || info.type === 'symlink') continue;
      const relative = current.path === root ? name : current.path.slice(root.length).replace(/^[\\/]+/, '') + '/' + name;
      if ((info.type ?? entry.type ?? entry.kind) === 'directory') {
        dirs.push(relative);
        if (current.depth + 1 <= MAX_DEPTH) queue.push({ path: child, target: entry.target ?? { displayPath: child }, depth: current.depth + 1 });
      } else if ((info.type ?? entry.type ?? entry.kind) === 'file') {
        files.push({ relative, path: child, name, size: typeof info.size === 'number' ? info.size : undefined });
      }
    }
  }
  return { files, dirs };
}

const joinPath = (base, name) => (base === '/' ? '' : base) + '/' + name;
const dirnameOf = p => {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.slice(0, i);
};

/**
 * Walk a root using a simple absolute-path directory lister. Each entry must
 * carry `name`, `type` ('directory'|'file'|'symlink') and optional `size`.
 * Child symlinks are never followed; `MAX_DEPTH`/`MAX_FILES` still apply.
 */
export function walkPaths(listDir, root, signal) {
  const queue = [{ path: root, depth: 0 }];
  const files = [];
  const dirs = [];
  let visited = 0;
  while (queue.length && files.length < MAX_FILES) {
    const current = queue.shift();
    signal?.throwIfAborted();
    let entries;
    try { entries = listDir(current.path); } catch (error) { signal?.throwIfAborted(); continue; }
    for (const entry of Array.isArray(entries) ? entries.slice(0, 400) : []) {
      if (++visited > MAX_FILES * 4) break;
      signal?.throwIfAborted();
      if (!entry || !['directory', 'file'].includes(entry.type)) continue;
      const name = clean(entry.name);
      if (!safeReadable(name)) continue;
      if (entry.type === 'directory' && SKIP_DIRS.has(name.toLowerCase())) continue;
      const child = joinPath(current.path, name);
      const relative = current.path === root ? name : current.path.slice(root.length).replace(/^\/+/, '') + '/' + name;
      if (entry.type === 'directory') {
        dirs.push(relative);
        if (current.depth + 1 <= MAX_DEPTH) queue.push({ path: child, depth: current.depth + 1 });
      } else {
        files.push({ relative, path: child, name, size: typeof entry.size === 'number' ? entry.size : undefined });
      }
    }
  }
  return { files, dirs };
}

/**
 * Scan a root through two callables: `listDir(absolutePath)` and
 * `readText(absolutePath)`. Used by the WSL adapter with a single Python
 * process behind both, so scanning one project costs one process instead of
 * one per file. Only the bounded payload leaves here.
 */
export function scanPaths({ listDir, readText }, root, signal) {
  const { files, dirs } = walkPaths(listDir, root, signal);
  const payload = {
    root,
    files: files.map(file => ({ relative: file.relative, name: file.name, dir: dirnameOf(file.relative), size: file.size })),
    dirs,
    manifests: [],
    modules: [],
    documents: [],
    sql: [],
    fileCount: files.length,
    truncated: files.length >= MAX_FILES,
  };
  const boundedRead = (path, limit) => {
    try {
      const text = readText(path, limit);
      return typeof text === 'string' ? text.slice(0, limit) : '';
    } catch (error) {
      signal?.throwIfAborted();
      return '';
    }
  };
  for (const file of files.filter(f => MANIFESTS.includes(f.name.toLowerCase())).slice(0, 8)) {
    signal?.throwIfAborted();
    const text = boundedRead(file.path, 20000);
    if (text) payload.manifests.push({ name: file.name, text });
  }
  const code = files.filter(f => CODE_EXT.test(f.name));
  const ranked = [
    ...code.filter(f => ENTRY.test(f.name)),
    ...code.filter(f => !ENTRY.test(f.name)).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)),
  ];
  const counted = new Map();
  for (const file of ranked) {
    if (payload.modules.length >= MAX_MODULES) break;
    const dir = dirnameOf(file.relative);
    if ((counted.get(dir) ?? 0) >= 2) continue;
    signal?.throwIfAborted();
    const text = boundedRead(file.path, MAX_MODULE_TEXT);
    if (!text) continue;
    counted.set(dir, (counted.get(dir) ?? 0) + 1);
    payload.modules.push({ relative: file.relative, dir: dir === '.' ? '' : dir, text });
  }
  for (const file of files.filter(f => DOC_NAME.test(f.name)).slice(0, 4)) {
    signal?.throwIfAborted();
    const text = boundedRead(file.path, 6000);
    if (text) payload.documents.push({ path: file.relative, text });
  }
  return payload;
}

/**
 * Adapt a WSL `browse` result to the shape the scanner's fs seam expects.
 * The Python helper emits `kind`/`path`; the scanner uses `type`/`target`.
 */
export function normalizeBrowseEntries(listing) {
  return (Array.isArray(listing?.entries) ? listing.entries : []).map(entry => ({
    name: entry.name,
    type: entry.kind === 'directory' ? 'directory' : 'file',
    kind: entry.kind,
    path: entry.path,
    target: { displayPath: entry.path },
  }));
}

/** Parse dependency names and scripts from a manifest. */
function parseManifest(name, text) {
  const lower = name.toLowerCase();
  if (lower === 'package.json') {
    try {
      const json = JSON.parse(text);
      const deps = Object.keys({ ...json.dependencies, ...json.devDependencies, ...json.peerDependencies }).slice(0, 40);
      const scripts = Object.keys(json.scripts ?? {}).slice(0, 12);
      return { ecosystem: 'Node.js', deps, scripts, name: clean(json.name) };
    } catch { return { ecosystem: 'Node.js', deps: [], scripts: [] }; }
  }
  if (lower === 'pyproject.toml' || lower === 'requirements.txt') {
    const deps = [...text.matchAll(/^([A-Za-z0-9._-]+)\s*(?:[=<>!~\[]|$)/gm)].map(m => m[1]).slice(0, 40);
    return { ecosystem: 'Python', deps: [...new Set(deps)], scripts: [] };
  }
  if (lower === 'cargo.toml') {
    const deps = [...text.matchAll(/^([A-Za-z0-9_-]+)\s*=/gm)].map(m => m[1]).slice(0, 40);
    return { ecosystem: 'Rust', deps: [...new Set(deps)], scripts: [] };
  }
  if (lower === 'go.mod') {
    const deps = [...text.matchAll(/^\s+([\w./-]+)\s+v/gm)].map(m => m[1]).slice(0, 40);
    return { ecosystem: 'Go', deps: [...new Set(deps)], scripts: [] };
  }
  if (lower === 'pom.xml') {
    const deps = [...text.matchAll(/<artifactId>([^<]+)<\/artifactId>/g)].map(m => m[1]).slice(1, 41);
    return { ecosystem: 'Java/Maven', deps, scripts: [] };
  }
  if (lower.startsWith('build.gradle')) {
    const deps = [...text.matchAll(/["']([\w.-]+:[\w.-]+):[^"']+["']/g)].map(m => m[1]).slice(0, 40);
    return { ecosystem: 'Java/Gradle', deps, scripts: [] };
  }
  if (lower === 'composer.json') {
    try {
      const json = JSON.parse(text);
      return { ecosystem: 'PHP', deps: Object.keys({ ...json.require, ...json['require-dev'] }).slice(0, 40), scripts: [] };
    } catch { return { ecosystem: 'PHP', deps: [], scripts: [] }; }
  }
  if (lower === 'gemfile') {
    const deps = [...text.matchAll(/^\s*gem\s+['"]([^'"]+)['"]/gm)].map(m => m[1]).slice(0, 40);
    return { ecosystem: 'Ruby', deps, scripts: [] };
  }
  if (lower === 'tsconfig.json') return { ecosystem: '', deps: [], scripts: [], typescript: true };
  if (lower.startsWith('docker') || lower === 'compose.yaml') return { ecosystem: '', deps: [], scripts: [], container: true };
  if (lower === 'makefile' || lower === 'cmakelists.txt') return { ecosystem: 'C/C++ 构建', deps: [], scripts: [] };
  return { ecosystem: '', deps: [], scripts: [] };
}

/** Top-of-file docstring/comment block, so module notes quote the author's own words. */
function headComment(text) {
  const head = text.slice(0, MAX_EXCERPT);
  const block = /^(?:\s*\/\*[\s\S]*?\*\/|\s*(?:\/\/|#)[^\n]*(?:\n\s*(?:\/\/|#)[^\n]*)*)/.exec(head);
  if (!block) return '';
  return clean(block[0].replace(/\/\*+|\*+\/|^\s*(?:\/\/|#)\s?/gm, ' ').replace(/\s*\*\s*/g, ' ')).slice(0, 240);
}

/** Exported/public symbols, enough to name what a module offers. */
function exportsOf(text, name) {
  const found = new Set();
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|class|const|let|interface|type)\s+([A-Za-z_$][\w$]*)/g)) found.add(m[1]);
  for (const m of text.matchAll(/^(?:async\s+)?def\s+([A-Za-z_]\w*)/gm)) if (!m[1].startsWith('_')) found.add(m[1]);
  for (const m of text.matchAll(/^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm)) found.add(m[1]);
  if (!found.size) return [];
  return [...found].slice(0, 8);
}

const IMPORT_PATTERNS = [
  // ES import/export with a string specifier (covers `import x from '...'` and
  // `export ... from '...'`); the bare `import 'x'` form too.
  /(?:^|\n)\s*(?:import|export)\s+(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"]/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
  // Python `from pkg import ...` (the string-based form is already above).
  /(?:^|\n)\s*from\s+([A-Za-z_][\w.]*)\s+import\b/g,
  // PHP `use Namespace\Thing;`.
  /(?:^|\n)\s*use\s+([A-Za-z_][\w\\]*)\s*;/g,
];

/** Import/require specifiers actually present in a bounded excerpt. */
function specifiersOf(text) {
  const found = new Set();
  for (const pattern of IMPORT_PATTERNS) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      const spec = match[1];
      if (spec && !found.has(spec) && found.size < 32) found.add(spec);
    }
  }
  return [...found];
}

function packageOf(spec) {
  if (spec.startsWith('@')) return spec.split('/').slice(0, 2).join('/');
  return spec.split('/')[0];
}

function relativeBase(fromPath, spec) {
  const parts = fromPath.split('/');
  parts.pop();
  for (const part of spec.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

/** Resolve imported specifiers into real edges between scanned modules and packages. */
function dependencyEdges(modules) {
  const known = new Set();
  for (const module of modules) known.add(module.path);
  const edges = [];
  const seen = new Set();
  const packages = new Set();
  const add = (from, to, kind) => {
    const key = `${from}|${to}|${kind}`;
    if (seen.has(key) || edges.length >= MAX_EDGES) return;
    seen.add(key);
    edges.push({ from, to, kind });
  };
  for (const module of modules) {
    for (const spec of module.imports ?? []) {
      if (spec.startsWith('node:') || BUILTIN.has(spec) || BUILTIN.has(packageOf(spec))) continue;
      if (spec.startsWith('.')) {
        const base = relativeBase(module.path, spec);
        const candidates = [base];
        for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java']) candidates.push(base + ext);
        for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs']) candidates.push(base + '/index' + ext);
        const target = candidates.find(candidate => known.has(candidate));
        if (target && target !== module.path) add(module.path, target, 'internal');
        continue;
      }
      const pkg = packageOf(spec);
      if (known.has(spec) || known.has(spec.replace(/^\//, ''))) {
        const target = known.has(spec) ? spec : spec.replace(/^\//, '');
        if (target !== module.path) add(module.path, target, 'internal');
      } else if (/^[A-Za-z@][\w@./-]*$/.test(pkg)) {
        packages.add(pkg);
        add(module.path, pkg, 'external');
      }
    }
  }
  return { edges, importedPackages: [...packages].slice(0, 60) };
}

/** H1/H2 conventions from the project's own docs, used as writing-style evidence. */
function titleStylesOf(documents) {
  const styles = [];
  for (const document of documents ?? []) {
    const lines = String(document.text ?? '').split('\n');
    const h1 = lines.find(line => /^#\s+\S/.test(line));
    const headings = lines.filter(line => /^##\s+\S/.test(line)).slice(0, 8).map(line => redact(line.replace(/^##\s+/, '')));
    if (!h1 && !headings.length) continue;
    styles.push({
      path: document.path,
      title: h1 ? redact(h1.replace(/^#\s+/, '')) : '',
      headings,
      language: /[\u4e00-\u9fff]/.test(String(document.text ?? '').slice(0, 2000)) ? 'zh' : 'en',
    });
    if (styles.length >= 4) break;
  }
  return styles;
}

function buildTree(files) {
  const byDir = new Map();
  for (const file of files ?? []) {
    const dir = file.relative.includes('/') ? file.relative.slice(0, file.relative.lastIndexOf('/')) : '.';
    const bucket = byDir.get(dir) ?? [];
    if (bucket.length < 12) bucket.push(file.name);
    byDir.set(dir, bucket);
  }
  return [...byDir.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 40).map(([dir, names]) => ({ dir, files: names }));
}

/**
 * Collect a bounded, root-limited scan payload. Kept separate from fact
 * building so the WSL helper can return the same payload from one process.
 */
export async function collectScan(fs, root, signal, options = {}) {
  const { files, dirs } = await walk(fs, root, signal);
  const payload = {
    root,
    files: files.map(file => ({ relative: file.relative, name: file.name, dir: file.relative.includes('/') ? file.relative.slice(0, file.relative.lastIndexOf('/')) : '.', size: file.size })),
    dirs,
    manifests: [],
    modules: [],
    documents: [],
    sql: [],
    fileCount: files.length,
    truncated: files.length >= MAX_FILES,
  };
  for (const file of files.filter(f => MANIFESTS.includes(f.name.toLowerCase())).slice(0, 8)) {
    signal?.throwIfAborted();
    const text = await readBounded(fs, file.path, signal);
    if (text) payload.manifests.push({ name: file.name, text });
  }
  const code = files.filter(f => CODE_EXT.test(f.name));
  const ranked = [
    ...code.filter(f => ENTRY.test(f.name)),
    ...code.filter(f => !ENTRY.test(f.name)).sort((a, b) => (b.size ?? 0) - (a.size ?? 0)),
  ];
  const counted = new Map();
  for (const file of ranked) {
    if (payload.modules.length >= MAX_MODULES) break;
    const dir = file.relative.includes('/') ? file.relative.slice(0, file.relative.lastIndexOf('/')) : '';
    if ((counted.get(dir) ?? 0) >= 2) continue;
    signal?.throwIfAborted();
    const text = await readBounded(fs, file.path, signal, MAX_MODULE_TEXT);
    if (!text) continue;
    counted.set(dir, (counted.get(dir) ?? 0) + 1);
    payload.modules.push({ relative: file.relative, dir, text });
  }
  for (const file of files.filter(f => DOC_NAME.test(f.name)).slice(0, 4)) {
    signal?.throwIfAborted();
    const text = await readBounded(fs, file.path, signal, 6000);
    if (text) payload.documents.push({ path: file.relative, text });
  }
  // SQL carries the data lineage of these projects: table definitions and the
  // tables another project's queries read.
  for (const file of files.filter(f => SQL_EXT.test(f.name)).slice(0, 120)) {
    signal?.throwIfAborted();
    const text = await readBounded(fs, file.path, signal, 16000);
    if (text) payload.sql.push({ path: file.relative, text });
  }
  return payload;
}

/**
 * Turn a scan payload into a model-ready fact sheet. Only derived metadata is
 * emitted: no file text, no absolute paths, no secret-looking names.
 */
export function normalizeScan(payload, options = {}) {
  const manifests = (payload?.manifests ?? []).map(entry => ({ name: entry.name, ...parseManifest(entry.name, entry.text ?? '') }));
  const deps = [...new Set(manifests.flatMap(m => m.deps ?? []))].slice(0, 60);
  const scripts = [...new Set(manifests.flatMap(m => m.scripts ?? []))].slice(0, 15);
  const ecosystem = [...new Set(manifests.map(m => m.ecosystem).filter(Boolean))].join(' + ');
  const projectName = manifests.find(m => m.name)?.name || '';
  const modules = (payload?.modules ?? []).map(module => ({
    path: module.relative,
    dir: module.dir,
    comment: redact(headComment(module.text ?? '')),
    exports: exportsOf(module.text ?? '', String(module.relative).split('/').pop()),
    lines: String(module.text ?? '').split('\n').length,
    imports: specifiersOf(module.text ?? '').slice(0, 12),
  }));
  const { edges, importedPackages } = dependencyEdges(modules);
  const sql = Array.isArray(payload?.sql) ? payload.sql.map(row => ({ path: row.path, text: redact(String(row.text ?? '')) })) : [];
  return {
    projectName,
    ecosystem,
    sql,
    definedTables: [...definedTables(sql.map(row => row.text))].slice(0, 80),
    dependencies: deps,
    scripts,
    modules,
    importEdges: edges,
    importedPackages,
    titleStyles: titleStylesOf(payload?.documents ?? []),
    tree: buildTree(payload?.files ?? []),
    dirs: (payload?.dirs ?? []).slice(0, 60),
    fileCount: typeof payload?.fileCount === 'number' ? payload.fileCount : (payload?.files ?? []).length,
    truncated: !!payload?.truncated,
  };
}

/**
 * Scan one project into a structured, model-ready fact sheet.
 * @returns {{files, dirs, manifests, ecosystem, dependencies, scripts, modules, tree, truncated}}
 */
export async function scanProject(fs, root, signal, options = {}) {
  const payload = options.payload ?? await collectScan(fs, root, signal, options);
  return normalizeScan(payload, options);
}

/**
 * Build the request text for one model call: this project's real structure plus
 * sibling-project examples, so the writing follows conventions already in use.
 * No raw source or credential-bearing text is ever included.
 */
export function structurePrompt(facts, siblings = []) {
  const own = facts?.titleStyles ?? [];
  const peer = (Array.isArray(siblings) ? siblings : []).flatMap(sibling => {
    const styles = sibling?.titleStyles ?? (sibling?.document ? [{ path: sibling.document }] : []);
    return styles.map(style => ({ project: sibling?.projectName ?? '', path: style?.path ?? sibling?.document ?? '', title: style?.title ?? '', headings: style?.headings ?? [] }));
  }).slice(0, 12);
  // Tables are the data evidence behind two required sections, so summarize them
  // explicitly instead of expecting the model to mine raw SQL from `project`.
  const defined = Array.isArray(facts?.definedTables) ? facts.definedTables : [];
  const readTables = facts?.sql?.length ? [...referencedTables(facts.sql.map(row => row.text)).keys()].slice(0, 40) : [];
  const readOnly = readTables.filter(name => !defined.includes(name));
  return JSON.stringify({
    task: 'Write DSH-PROJECT.md',
    project: facts,
    dataEvidence: {
      definesTables: defined.slice(0, 40),
      readsTables: readOnly.slice(0, 40),
      note: 'definesTables come from CREATE TABLE statements in this project; readsTables appear in its queries and comments but are not defined here. Report only these.',
    },
    siblingProjects: siblings,
    titleStyleGuide: {
      own,
      peers: peer,
      note: 'Use only the heading naming and title style shown here; never copy another project’s name, files or facts. Keep the required outline.',
    },
  });
}

/**
 * Cross-project reference evidence between one scanned project and its peers.
 * Conservative on purpose: only a real import specifier segment or a manifest
 * dependency that names the peer counts. Short or ambiguous names are ignored
 * so a shared word never becomes a recorded relationship.
 * @returns {Array<{fromId: string, toId: string, toName: string, evidence: string[]}>}
 */
export function detectCrossReferences(target, others) {
  const key = value => String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const specs = (target?.modules ?? []).flatMap(row => Array.isArray(row.imports) ? row.imports : []);
  const targetKeys = new Set([target?.projectName, target?.name].map(key).filter(Boolean));
  const deps = new Set((target?.dependencies ?? []).map(key).filter(Boolean));
  const results = [];
  for (const other of Array.isArray(others) ? others : []) {
    if (!other || !other.id || other.id === target.id) continue;
    const cues = [other.projectName, other.name]
      .map(key)
      .filter(value => value && value.length >= 4 && !targetKeys.has(value));
    if (!cues.length) continue;
    const evidence = [];
    for (const spec of specs) {
      const segments = String(spec).split(/[\\/]/).map(key).filter(Boolean);
      if (cues.some(cue => segments.includes(cue))) {
        evidence.push('import 引用 ' + other.name + '（' + spec + '）');
        break;
      }
    }
    if (cues.some(cue => deps.has(cue))) evidence.push('依赖清单包含 ' + (other.projectName || other.name));
    if (evidence.length) results.push({ fromId: target.id, toId: other.id, toName: other.name, evidence: evidence.slice(0, 3) });
  }
  return results;
}

const TABLE_NAME = /^[a-z][a-z0-9_]{2,63}$/i;

/** Table names a project DEFINES, from `CREATE TABLE` statements in its SQL/DDL. */
export function definedTables(texts) {
  const found = new Set();
  for (const text of texts ?? []) {
    for (const match of String(text).slice(0, 200000).matchAll(/create\s+(?:temporary\s+)?table\s+(?:if\s+not\s+exists\s+)?[`"\[]?([\w.]+)[`"\]]?/gi)) {
      const name = match[1].split('.').pop().toLowerCase();
      if (TABLE_NAME.test(name)) found.add(name);
    }
  }
  return found;
}

/**
 * Table names a project READS: FROM/JOIN/UPDATE/INTO targets in its SQL, plus
 * table names mentioned inside comments, which is how these projects document
 * "库表依据：数据库DDL 下的 tr_registry、as_inventory".
 */
export function referencedTables(texts) {
  const found = new Map();
  for (const text of texts ?? []) {
    const body = String(text).slice(0, 200000);
    for (const match of body.matchAll(/\b(?:from|join|update|into)\s+[`"\[]?([a-z_][\w.]*)[`"\]]?/gi)) {
      const name = match[1].split('.').pop().toLowerCase();
      if (TABLE_NAME.test(name)) found.set(name, (found.get(name) ?? 0) + 1);
    }
    for (const match of body.matchAll(/--[^\n]*/g)) {
      for (const word of match[0].toLowerCase().matchAll(/\b([a-z][a-z0-9_]{3,63})\b/g)) {
        const name = word[1];
        if (TABLE_NAME.test(name)) found.set(name, (found.get(name) ?? 0) + 1);
      }
    }
  }
  return found;
}

const STOPWORDS = new Set('select insert update delete where group order by join from into table create alter drop index primary key not null default value values distinct having union left right inner outer limit offset and the for with'.split(' '));

/**
 * Data-lineage relations between projects: a downstream project's SQL reads a
 * table that only an upstream project defines. Direction follows the data, so
 * the upstream is the definer and the downstream is the consumer.
 * @returns {Array<{fromId,toId,toName,evidence:string[]}>}
 */
export function detectDataLineage(target, others, limit = 6) {
  const targetReads = referencedTables(target?.sql);
  const targetDefines = definedTables(target?.sql);
  if (!targetReads.size) return [];
  const results = [];
  for (const other of Array.isArray(others) ? others : []) {
    if (!other || !other.id || other.id === target.id || !Array.isArray(other.sql)) continue;
    const peerDefines = definedTables(other.sql);
    if (!peerDefines.size) continue;
    const shared = [...targetReads.keys()].filter(name => peerDefines.has(name) && !targetDefines.has(name) && !STOPWORDS.has(name));
    if (!shared.length) continue;
    const strongest = shared.sort((a, b) => targetReads.get(b) - targetReads.get(a)).slice(0, 4);
    results.push({ fromId: target.id, toId: other.id, toName: other.name, evidence: [`读取表 ${strongest.join('、')}（表由该项目定义）`], tables: strongest });
  }
  return results.slice(0, limit);
}
