// Offline, bounded folder summaries derived from top-level names only.
// No file contents are read, no child symlinks are followed, and nothing is
// sent to any service. All output is short, neutral, and length-bounded.

const MAX_NAMES = 200;      // hard cap on names inspected
const MAX_SHOWN = 4;        // at most this many unclassified names are echoed
const MAX_NAME_CHARS = 40;  // per-name truncation
const MAX_TEXT = 200;       // final summary cap

// Control characters and the clause/list separators we emit ourselves are
// neutralised so an arbitrary filename cannot forge summary structure.
const CONTROL = /[\u0000-\u001f\u007f-\u009f|]/g;
// Credentials, keys, tokens and dot-env style names are never surfaced.
const SENSITIVE = /(?:^|[._-])(?:env|npmrc|yarnrc|pypirc|netrc|htpasswd|git-credentials|gitconfig|id_rsa|id_dsa|id_ecdsa|id_ed25519|credentials?|secrets?|tokens?|keystore)(?:[._-]|$)|(?:\.pem|\.key|\.p12|\.pfx|\.jks)$/i;
// Names that look like instructions to a model are counted but not quoted.
const PROMPTISH = /(?:ignore|disregard|forget)\s+(?:all\s+|the\s+|any\s+)?(?:previous|prior|above|earlier)|(?:system|developer)\s*(?:prompt|message|instruction)|you\s+are\s+now|act\s+as|<\s*\/?\s*(?:system|assistant|tool|user|script|img)\s*>|\[\[|\]\]/i;

export const isHiddenName = name => typeof name === 'string' && name.startsWith('.');
export const isSensitiveName = name => typeof name === 'string' && SENSITIVE.test(name.toLowerCase());

function safeName(value) {
  if (typeof value !== 'string') return '';
  const name = value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  if (!name || name === '.' || name === '..') return '';
  if (name.length > MAX_NAME_CHARS) return name.slice(0, MAX_NAME_CHARS - 1) + '…';
  return name;
}

// Canonical labels only: a recognised name is reported by its label, never by
// raw text, so a crafted filename cannot inject wording into the summary.
const TECH = [
  [/^(?:package\.json|package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml)$/, 'Node.js/npm'],
  [/^cargo\.(?:toml|lock)$/, 'Rust'],
  [/^go\.(?:mod|sum)$/, 'Go'],
  [/^(?:pom\.xml|build\.gradle(?:\.kts)?|gradlew|gradle\.properties)$/, 'Java/Gradle'],
  [/^(?:requirements[^/]*\.txt|pyproject\.toml|setup\.py|setup\.cfg|pipfile|poetry\.lock|tox\.ini)$/, 'Python'],
  [/^gemfile(?:\.lock)?$/, 'Ruby'],
  [/^composer\.(?:json|lock)$/, 'PHP'],
  [/^(?:cmakelists\.txt|makefile|meson\.build|configure(?:\.ac)?)$/, '原生构建'],
  [/^(?:dockerfile|docker-compose\.[^/]+|compose\.[^/]+)$/, 'Docker'],
  [/^(?:tsconfig\.json|vite\.config\.[^/]+|next\.config\.[^/]+|nuxt\.config\.[^/]+)$/, '前端项目'],
];
const NOTABLE = [
  [/^readme(?:\.[^/]*)?$/, 'README 文档'],
  [/^(?:license|licence|copying|notice)(?:\.[^/]*)?$/, '许可文件'],
  [/^(?:changelog|changes|history)(?:\.[^/]*)?$/, '变更记录'],
  [/^contributing(?:\.[^/]*)?$/, '贡献指南'],
  [/^(?:src|lib|app)$/, '源码目录'],
  [/^(?:test|tests|__tests__|spec)$/, '测试目录'],
  [/^(?:docs?|documentation)$/, '文档目录'],
  [/^(?:examples?|demo|samples?)$/, '示例目录'],
  [/^(?:dist|build|out|target)$/, '构建产物'],
  [/^(?:public|static|assets)$/, '静态资源'],
];
const labels = (name, rules) => {
  const found = rules.find(([pattern]) => pattern.test(name.toLowerCase()));
  return found ? found[1] : '';
};

/**
 * Build a short neutral description from an array of top-level names.
 * Accepts arbitrary strings; hidden, sensitive, unsafe and duplicate names
 * are dropped, and the result is always bounded in length.
 */
export function summarizeNames(names) {
  const seen = new Set();
  const clean = [];
  for (const item of Array.isArray(names) ? names.slice(0, MAX_NAMES) : []) {
    if (clean.length >= MAX_NAMES) break;
    const name = safeName(item);
    if (!name || isHiddenName(name) || isSensitiveName(name) || seen.has(name)) continue;
    seen.add(name);
    clean.push(name);
  }
  if (!clean.length) return '未发现可描述的顶层条目。';

  const tech = [], notable = [], other = [];
  for (const name of clean) {
    const techLabel = labels(name, TECH);
    if (techLabel) { if (!tech.includes(techLabel)) tech.push(techLabel); continue; }
    const notableLabel = labels(name, NOTABLE);
    if (notableLabel) { if (!notable.includes(notableLabel)) notable.push(notableLabel); continue; }
    other.push(name);
  }

  const parts = [];
  if (tech.length) parts.push(tech.join('、') + ' 项目');
  if (notable.length) parts.push('含 ' + notable.join('、'));
  if (other.length) {
    const quotable = other.filter(name => !PROMPTISH.test(name));
    const shown = quotable.slice(0, MAX_SHOWN);
    const detail = shown.length ? '：' + shown.join('、') + (quotable.length > shown.length ? ' 等' : '') : '';
    parts.push('另有 ' + other.length + ' 个条目' + detail);
  }
  let text = parts.join('；') + '。';
  if (text.length > MAX_TEXT) text = text.slice(0, MAX_TEXT - 1) + '…';
  return text;
}

/**
 * Summarise a directory through the same fs adapter used by search.js:
 * resolve -> stat -> listDir -> lstat. Only the direct children are read;
 * symlinks are rejected via both the listing type and lstat, and hidden or
 * sensitive names are filtered before they ever reach the text builder.
 */
export async function summarizeHost(fs, path, signal) {
  signal?.throwIfAborted();
  if (!fs || typeof fs.resolve !== 'function' || typeof fs.listDir !== 'function') throw new Error('文件系统接口无效。');
  const target = await fs.resolve(path, { signal });
  signal?.throwIfAborted();
  if ((await fs.stat(target, signal))?.type !== 'directory') throw new Error('目录不存在或不可访问。');

  const entries = await fs.listDir(target, signal);
  const names = [];
  for (const entry of Array.isArray(entries) ? entries.slice(0, 1000) : []) {
    if (names.length >= MAX_NAMES) break;
    signal?.throwIfAborted();
    if (!entry || !['directory', 'file'].includes(entry.type)) continue;
    const name = safeName(entry.name);
    if (!name || isHiddenName(name) || isSensitiveName(name)) continue;
    try {
      const child = entry.target != null && typeof fs.processPath === 'function' ? fs.processPath(entry.target) : entry.target;
      if (!['directory', 'file'].includes((await fs.lstat(child, {}, signal))?.type)) continue;
    } catch (error) {
      signal?.throwIfAborted();
      continue;
    }
    names.push(name);
  }
  return summarizeNames(names);
}
