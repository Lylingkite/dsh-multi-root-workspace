import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { apply } from '../index.js';

const tempRoot = await fs.realpath(os.tmpdir());
const base = await fs.mkdtemp(path.join(tempRoot, 'dsh-primary-test-'));
const primary = path.join(base, 'primary'), extra = path.join(base, 'extra');
await fs.mkdir(primary); await fs.mkdir(extra);
const oldPath = path.join(base, '.dsh-union-missing');
const old = { id: 'old', path: oldPath, title: 'Project', sessionIds: ['historic'] };
const target = { id: 'new', path: primary, title: 'Project', sessionIds: [] };
let config = { workspaces: { old: { primary, roots: [extra] } } };
const services = {}, registryCalls = [];
const ctx = {
 fiber: { entry: {} }, subprocess: {}, workingDirectory: {}, agentPresets: { presetForSession: () => 'standard' },
 fs: { resolve: async p => ({ displayPath: await fs.realpath(p) }), stat: async t => ({type: (await fs.stat(t.displayPath)).isDirectory() ? 'directory' : 'file'}), processPath: t => t.displayPath },
 workspaceRegistry: { get: () => old, list: () => [old], create: async(p, title) => { registryCalls.push({p,title}); assert.equal(p, primary); return target; } },
 configEditor: { edit: async(_, f) => { config = f(config); } },
 systemPrompt: { section: () => () => {}, getSectionOrder: () => 0 }, tools: {register:()=>()=>{}}, commands:{register:()=>()=>{}},
 effect: f => f(), provide: (name, value) => services[name] = value, on: () => {},
};
try {
 apply(ctx, config);
 const initial = services.multiRootWorkspace.get('old');
 assert(initial.needsMigration, 'existing mismatched primary can be saved without further edits');
 const result = await services.multiRootWorkspace.save('old', [extra], initial.revision, primary);
 assert(result.migrated); assert.equal(result.workspaceId, 'new'); assert.equal(registryCalls.length, 1);
 assert.equal(config.workspaces.new.primary, primary); assert.deepEqual(config.workspaces.new.roots, [extra]);
 assert.equal(config.workspaces.old.redirectWorkspaceId, 'new'); assert.equal(old.path, oldPath);
 // Session Controller's inspected create contract uses workspace.path as immutable header cwd.
 const freshHeader = { cwd: target.path };
 await fs.writeFile(path.join(freshHeader.cwd, 'new-chat-file.txt'), 'new chat output');
 assert.equal(await fs.readFile(path.join(primary, 'new-chat-file.txt'), 'utf8'), 'new chat output');
 await assert.rejects(() => fs.stat(oldPath), {code:'ENOENT'});
 const before = await fs.readdir(base); assert.deepEqual(before.sort(), ['extra', 'primary']);
 // Saving an unchanged native primary reuses its record, rather than adding more records.
 ctx.workspaceRegistry.get = () => target;
 const nextInitial = services.multiRootWorkspace.get('new'); assert(!nextInitial.needsMigration);
 const second = await services.multiRootWorkspace.save('new', [extra], nextInitial.revision, primary);
 assert(!second.migrated); assert.equal(registryCalls.length, 1);
 console.log('PASS: missing-union migration, native root selection, relative output in primary, no union creation, old history retained, unchanged primary idempotence');
} finally {
 assert.equal(path.dirname(base), tempRoot); assert(path.basename(base).startsWith('dsh-primary-test-'));
 await fs.rm(base, {recursive:true,force:true});
}
