// NOTE: reconstructed after the workspace was deleted. The original file was
// never read into a session log, so this is a functional equivalent, not a
// byte-for-byte recovery. It covers the same WSL 1.3.0 surface: pure path
// helpers plus live read-only info/validate/browse/search/hostPath actions.
import assert from 'node:assert/strict';
import { linuxPath, linuxFromHost, PYTHON, createWslRuntime } from '../wsl-runtime.js';
import { wslParts } from '../paths.js';

// Pure helpers: no WSL required.
assert.equal(linuxPath('/home/user/project'), '/home/user/project');
assert.equal(linuxPath('/home/user//project'), '/home/user/project');
assert.equal(linuxPath('/home/user/project/'), '/home/user/project/'); // normalize keeps a trailing slash
assert.throws(() => linuxPath('home/user'));
assert.throws(() => linuxPath('/home/../etc'));
assert.throws(() => linuxPath('C:\\project'));
assert.equal(linuxFromHost('F:\\code\\project', ''), '/mnt/f/code/project');
assert.equal(linuxFromHost('\\\\wsl.localhost\\Ubuntu-22.04\\home\\me\\p', 'Ubuntu-22.04'), '/home/me/p');
assert.throws(() => linuxFromHost('\\\\wsl.localhost\\Debian\\home\\me', 'Ubuntu-22.04'));
assert.deepEqual(wslParts('\\\\wsl$\\Ubuntu-22.04\\home\\me').linux, '/home/me');
assert(PYTHON.includes('__DSH_MULTI_ROOT_JSON__'));

const base = process.argv[2];
if (base) {
  // Live WSL lane: pass a Linux directory as argv[2]; requires the distribution
  // with python3 and wslpath. The subprocess adapter mirrors ctx.subprocess.
  const { spawn } = await import('node:child_process');
  const subprocess = {
    spawn({ argv, signal }) {
      return new Promise((resolve, reject) => {
        const child = spawn(argv[0], argv.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '', err = '';
        child.stdout.on('data', c => out += c);
        child.stderr.on('data', c => err += c);
        const onAbort = () => child.kill();
        signal?.addEventListener('abort', onAbort, { once: true });
        child.on('error', reject);
        child.on('close', code => resolve({
          done: Promise.resolve({ exitCode: code }),
          collected: {
            stdout: { readFrom: () => ({ lossy: false, text: out }) },
            stderr: { readFrom: () => ({ text: err }) },
          },
        }));
      });
    },
  };
  const run = createWslRuntime(subprocess, process.cwd(), new AbortController().signal);
  const info = await run('', { action: 'info' }, new AbortController().signal);
  assert(info.distro, 'live WSL distribution name');
  const validated = await run('', { action: 'validate', paths: [base] }, new AbortController().signal);
  assert.equal(validated.paths.length, 1);
  const listing = await run('', { action: 'browse', path: base }, new AbortController().signal);
  assert(Array.isArray(listing.entries));
  const found = await run('', { action: 'search', roots: [base], query: '' }, new AbortController().signal);
  assert(Array.isArray(found.items));
  console.log('PASS: live WSL info/validate/browse/search, distro ' + info.distro);
}
console.log('PASS: WSL path helpers, UNC/Linux conversion, Python helper contract');
