import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { createCompletionQueue } from '../search.js';
const life=new AbortController();const agent={};const calls=[];
const queue=createCompletionQueue(async(_a,q,signal)=>{calls.push(q);signal.throwIfAborted();return [q];},life.signal,15);
const pending=[];
for(const q of ['/home/me/work/src/file','/home/me/work/src/fil','/home/me/work/src/fi','/home/me/work/src/f'])pending.push(queue(agent,q));
const rows=await Promise.all(pending);assert.deepEqual(calls,['/home/me/work/src/f']);assert.deepEqual(rows.slice(0,-1),[[],[],[]]);
const before=calls.length;const deleting=queue(agent,'/home/me/work/');const bare=await queue(agent,'');assert.deepEqual(bare,['']);assert.deepEqual(await deleting,[]);assert.equal(calls.length,before+1);
let abortObserved=false,startedResolve;const started=new Promise(r=>startedResolve=r);
const running=createCompletionQueue(async(_a,q,signal)=>{if(!q)return ['roots'];startedResolve();return new Promise((_r,reject)=>signal.addEventListener('abort',()=>{abortObserved=true;reject(signal.reason);},{once:true}));},life.signal,1);
const old=running(agent,'/work/');await started;assert.deepEqual(await running(agent,''),['roots']);assert.deepEqual(await old,[]);assert(abortObserved);
// An uncancellable backend must never publish a stale result either.
let finish;const slow=createCompletionQueue(async(_a,q)=>q?new Promise(r=>finish=r):['roots'],life.signal,1);
const stale=slow(agent,'/work/');await wait(5);assert.deepEqual(await slow(agent,''),['roots']);finish(['old']);assert.deepEqual(await stale,[]);
const cancelled=new AbortController();const last=queue(agent,'needle',cancelled.signal);cancelled.abort();assert.deepEqual(await last,[]);
console.log('PASS: rapid backspace coalescing, immediate bare @, running lookup cancellation, stale result suppression, external cancellation');
