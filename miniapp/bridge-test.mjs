// Deterministic vm-based tests for ad-bridge.js (fake timers + SDK stubs). Run: node bridge-test.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const here = path.dirname(new URL(import.meta.url).pathname);
const bridgeSrc = fs.readFileSync(path.join(here, 'ad-bridge.js'), 'utf8');
const buildSrc = fs.readFileSync(path.join(here, 'build.mjs'), 'utf8');
const J = (x) => JSON.parse(JSON.stringify(x));
const VALID = { unitType: 'coin', unitAmount: 1 };

// Extract the real render/validate helpers from build.mjs (no esbuild import needed).
const rb = buildSrc.match(/\/\/ BEGIN_BRIDGE_RENDER([\s\S]*?)\/\/ END_BRIDGE_RENDER/);
if (!rb) throw new Error('BEGIN_BRIDGE_RENDER block missing from build.mjs');
const helpers = vm.runInNewContext(rb[1] + '\n({DEFAULT_AD_GROUP_ID, validateAdGroupId, renderBridge});');

function makeEnv(opts = {}) {
  let now = 0, seq = 0;
  const timers = new Map();
  const setTimeoutF = (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id; };
  const clearTimeoutF = (id) => { timers.delete(id); };
  const advance = (ms) => {
    const target = now + ms;
    for (;;) {
      let best = null;
      for (const [id, t] of timers) if (t.at <= target && (!best || t.at < best.t.at || (t.at === best.t.at && id < best.id))) best = { id, t };
      if (!best) break;
      timers.delete(best.id); now = best.t.at; best.t.fn();
    }
    now = target;
  };
  const loads = [], shows = [];
  const env = { loads, shows, advance, timers, hooks: {}, errors: [] };
  const loadFn = (p) => {
    const c = { params: p, unsubbed: 0 };
    loads.push(c);
    c.unsub = () => { c.unsubbed++; };
    if (env.hooks.onLoad) env.hooks.onLoad(c);
    if (env.hooks.loadThrows) throw new Error('load boom');
    return env.hooks.loadReturnsNothing ? undefined : c.unsub;
  };
  const showFn = (p) => {
    const c = { params: p, unsubbed: 0 };
    shows.push(c);
    c.unsub = () => { c.unsubbed++; };
    if (env.hooks.onShow) env.hooks.onShow(c);
    if (env.hooks.showThrows) throw new Error('show boom');
    return c.unsub;
  };
  loadFn.isSupported = () => true;
  showFn.isSupported = () => true;
  env.loadFn = loadFn; env.showFn = showFn;
  const sandbox = { window: {}, setTimeout: setTimeoutF, clearTimeout: clearTimeoutF, console: { error: (...a) => env.errors.push(a) } };
  if (!opts.noLoad) sandbox.loadFullScreenAd = opts.loadFn || loadFn;
  if (!opts.noShow) sandbox.showFullScreenAd = opts.showFn || showFn;
  if (opts.customize) opts.customize(sandbox, env);
  env.ctx = vm.createContext(sandbox);
  vm.runInContext(opts.source || bridgeSrc, env.ctx, { filename: 'ad-bridge.js' });
  env.ad = sandbox.window.__TOSS_AD;
  env.loaded = (i = env.loads.length - 1) => env.loads[i].params.onEvent({ type: 'loaded' });
  env.loadErr = (i = env.loads.length - 1) => env.loads[i].params.onError(new Error('x'));
  env.ev = (e, i = env.shows.length - 1) => env.shows[i].params.onEvent(e);
  env.showErr = (i = env.shows.length - 1) => env.shows[i].params.onError(new Error('x'));
  env.pending = () => timers.size;
  return env;
}

// Records callback invocations.
function rec() {
  const r = { calls: [], reward: [], fail: [] };
  r.onReward = (d) => { r.reward.push(J(d)); r.calls.push('reward'); };
  r.onFail = (w) => { r.fail.push(w); r.calls.push('fail:' + w); };
  return r;
}
function startShown(env, r = rec()) { // preload -> loaded -> show; returns r
  env.ad.preload(); env.loaded();
  env.ad.show(r.onReward, r.onFail);
  return r;
}

const tests = [];
const T = (name, fn) => tests.push({ name, fn });

// ---------- API / support ----------
T('api shape: supported/preload/show functions, dispose non-enumerable', () => {
  const e = makeEnv();
  assert.deepEqual(Object.keys(e.ad).sort(), ['preload', 'show', 'supported']);
  assert.equal(typeof e.ad.dispose, 'function');
  assert.equal(e.ad.supported(), true);
  assert.equal(e.ctx.window.__TOSS_AD, e.ad);
});
T('supported false when loadFullScreenAd.isSupported() false', () => {
  const e = makeEnv({ customize: (sb, env) => { env.loadFn.isSupported = () => false; } });
  assert.equal(e.ad.supported(), false);
});
T('supported false when showFullScreenAd.isSupported() false', () => {
  const e = makeEnv({ customize: (sb, env) => { env.showFn.isSupported = () => false; } });
  assert.equal(e.ad.supported(), false);
});
T('supported false when loadFullScreenAd.isSupported method missing', () => {
  const e = makeEnv({ customize: (sb, env) => { delete env.loadFn.isSupported; } });
  assert.equal(e.ad.supported(), false);
});
T('supported false when showFullScreenAd.isSupported method missing', () => {
  const e = makeEnv({ customize: (sb, env) => { delete env.showFn.isSupported; } });
  assert.equal(e.ad.supported(), false);
});
T('supported false when either isSupported throws', () => {
  const a = makeEnv({ customize: (sb, env) => { env.loadFn.isSupported = () => { throw new Error('x'); }; } });
  const b = makeEnv({ customize: (sb, env) => { env.showFn.isSupported = () => { throw new Error('x'); }; } });
  assert.equal(a.ad.supported(), false);
  assert.equal(b.ad.supported(), false);
});
T('supported requires strict true (truthy 1 / "true" rejected)', () => {
  const a = makeEnv({ customize: (sb, env) => { env.loadFn.isSupported = () => 1; } });
  const b = makeEnv({ customize: (sb, env) => { env.showFn.isSupported = () => 'true'; } });
  assert.equal(a.ad.supported(), false);
  assert.equal(b.ad.supported(), false);
});
T('supported false when SDK globals are missing (no ReferenceError escapes)', () => {
  assert.equal(makeEnv({ noLoad: true }).ad.supported(), false);
  assert.equal(makeEnv({ noShow: true }).ad.supported(), false);
});
T('preload unsupported: done(false) synchronously, no SDK call', () => {
  const e = makeEnv({ customize: (sb, env) => { env.showFn.isSupported = () => false; } });
  const got = []; e.ad.preload((ok) => got.push(ok));
  assert.deepEqual(got, [false]); assert.equal(e.loads.length, 0);
});
T('show unsupported: onFail("unsupported"), no SDK call, not busy', () => {
  let sup = false;
  const e = makeEnv({ customize: (sb, env) => { env.loadFn.isSupported = () => sup; } });
  const r = rec(); e.ad.show(r.onReward, r.onFail);
  assert.deepEqual(r.calls, ['fail:unsupported']); assert.equal(e.loads.length + e.shows.length, 0);
  sup = true;
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail);
  assert.equal(e.loads.length, 1); assert.deepEqual(r2.calls, []);
});

// ---------- preload ----------
T('preload: one SDK load with fixed adGroupId; done(true) after loaded; never shows', () => {
  const e = makeEnv(); const got = [];
  const ret = e.ad.preload((ok) => got.push(ok));
  assert.equal(typeof ret, 'function');
  assert.equal(e.loads.length, 1); assert.deepEqual(J(e.loads[0].params.options), { adGroupId: 'ait-ad-test-rewarded-id' });
  assert.deepEqual(got, []);
  e.loaded();
  assert.deepEqual(got, [true]); assert.equal(e.shows.length, 0);
});
T('preload concurrent: callbacks queued in order, single SDK load, each called once', () => {
  const e = makeEnv(); const order = [];
  e.ad.preload((ok) => order.push('a' + ok));
  e.ad.preload((ok) => order.push('b' + ok));
  e.ad.preload((ok) => order.push('c' + ok));
  assert.equal(e.loads.length, 1); assert.deepEqual(order, []);
  e.loaded(); e.loaded(); // duplicate loaded ignored
  assert.deepEqual(order, ['atrue', 'btrue', 'ctrue']);
});
T('preload when already loaded: done(true) synchronously, no new SDK load', () => {
  const e = makeEnv(); e.ad.preload(); e.loaded();
  const got = []; e.ad.preload((ok) => got.push(ok));
  assert.deepEqual(got, [true]); assert.equal(e.loads.length, 1);
});
T('load error: all waiters get false once, subscription released, fresh preload possible', () => {
  const e = makeEnv(); const g = [];
  e.ad.preload((ok) => g.push('a' + ok)); e.ad.preload((ok) => g.push('b' + ok));
  e.loadErr(); e.loadErr();
  assert.deepEqual(g, ['afalse', 'bfalse']); assert.equal(e.loads[0].unsubbed, 1);
  e.ad.preload((ok) => g.push('c' + ok));
  assert.equal(e.loads.length, 2); e.loaded(); assert.equal(g.pop(), 'ctrue');
});
T('load timeout 15s: false at exactly 15000, not before; late loaded ignored', () => {
  const e = makeEnv(); const g = [];
  e.ad.preload((ok) => g.push(ok));
  e.advance(14999); assert.deepEqual(g, []);
  e.advance(1); assert.deepEqual(g, [false]); assert.equal(e.loads[0].unsubbed, 1);
  e.loaded(0); // late
  const g2 = []; e.ad.preload((ok) => g2.push(ok)); // must start a NEW load, old late loaded did not make it ready
  assert.equal(e.loads.length, 2); assert.deepEqual(g2, []);
  e.loaded(1); assert.deepEqual(g2, [true]); assert.deepEqual(g, [false]);
});
T('late callbacks from an earlier load attempt cannot resolve a newer attempt', () => {
  const e = makeEnv(); e.ad.preload(); e.advance(15000);
  const g = []; e.ad.preload((ok) => g.push(ok));
  e.loaded(0); e.loadErr(0); // old attempt events
  assert.deepEqual(g, []);
  e.loaded(1); assert.deepEqual(g, [true]);
});
T('late onError after loaded is ignored (ad stays ready)', () => {
  const e = makeEnv(); e.ad.preload(); e.loaded(); e.loadErr();
  const g = []; e.ad.preload((ok) => g.push(ok));
  assert.deepEqual(g, [true]); assert.equal(e.loads.length, 1);
});
T('loaded keeps load subscription (no immediate unsubscribe)', () => {
  const e = makeEnv(); e.ad.preload(); e.loaded();
  assert.equal(e.loads[0].unsubbed, 0);
});
T('sync loaded callback before unsubscribe is assigned: done(true), subscription kept', () => {
  const e = makeEnv(); e.hooks.onLoad = (c) => c.params.onEvent({ type: 'loaded' });
  const g = []; e.ad.preload((ok) => g.push(ok));
  assert.deepEqual(g, [true]); assert.equal(e.loads[0].unsubbed, 0);
});
T('sync error callback before unsubscribe is assigned: false, unsubscribed exactly once after return', () => {
  const e = makeEnv(); e.hooks.onLoad = (c) => c.params.onError(new Error('x'));
  const g = []; e.ad.preload((ok) => g.push(ok));
  assert.deepEqual(g, [false]); assert.equal(e.loads[0].unsubbed, 1);
});
T('SDK returning no unsubscribe function is tolerated', () => {
  const e = makeEnv(); e.hooks.loadReturnsNothing = true;
  const g = []; e.ad.preload((ok) => g.push(ok)); e.loaded();
  assert.deepEqual(g, [true]);
});
T('loadFullScreenAd throwing: done(false), state recovers', () => {
  const e = makeEnv(); e.hooks.loadThrows = true;
  const g = []; e.ad.preload((ok) => g.push(ok));
  assert.deepEqual(g, [false]);
  e.hooks.loadThrows = false; e.ad.preload((ok) => g.push(ok)); e.loaded();
  assert.deepEqual(g, [false, true]);
});
T('preload unregister drops only that callback; load continues for others', () => {
  const e = makeEnv(); const g = [];
  const off = e.ad.preload((ok) => g.push('a'));
  e.ad.preload((ok) => g.push('b'));
  off(); off();
  e.loaded();
  assert.deepEqual(g, ['b']);
});
T('throwing preload callback does not stop other waiters or corrupt state', () => {
  const e = makeEnv(); const g = [];
  e.ad.preload(() => { throw new Error('user'); });
  e.ad.preload((ok) => g.push(ok));
  e.loaded();
  assert.deepEqual(g, [true]);
  const r = rec(); e.ad.show(r.onReward, r.onFail); assert.equal(e.shows.length, 1);
});
T('non-function callbacks are tolerated', () => {
  const e = makeEnv(); e.ad.preload(42); e.loaded();
  e.ad.show('x', null); e.ev({ type: 'userEarnedReward', data: VALID });
  e.ad.preload(); // no throw
});

// ---------- show ordering ----------
T('show only after loaded: show() with nothing loaded loads first, SDK show after loaded event', () => {
  const e = makeEnv(); const r = rec();
  e.ad.show(r.onReward, r.onFail);
  assert.equal(e.loads.length, 1); assert.equal(e.shows.length, 0);
  e.advance(5000); assert.equal(e.shows.length, 0);
  e.loaded();
  assert.equal(e.shows.length, 1); assert.deepEqual(J(e.shows[0].params.options), { adGroupId: 'ait-ad-test-rewarded-id' });
});
T('preload alone never calls showFullScreenAd (even after loaded)', () => {
  const e = makeEnv(); e.ad.preload(); e.loaded(); e.advance(60000);
  assert.equal(e.shows.length, 0);
});
T('show with preloaded ad calls SDK show synchronously exactly once', () => {
  const e = makeEnv(); e.ad.preload(); e.loaded();
  const r = rec(); e.ad.show(r.onReward, r.onFail);
  assert.equal(e.shows.length, 1); assert.equal(e.loads.length, 1);
});
T('show joins an in-progress preload; callbacks keep registration order', () => {
  const e = makeEnv(); const order = [];
  e.ad.preload(() => order.push('p1'));
  e.ad.show(() => {}, () => {});
  e.ad.preload(() => order.push('p2'));
  assert.equal(e.loads.length, 1);
  e.loaded();
  assert.deepEqual(order, ['p1', 'p2']); assert.equal(e.shows.length, 1);
});
T('show during load: load error -> onFail("load"), not busy afterwards, no SDK show', () => {
  const e = makeEnv(); const r = rec();
  e.ad.show(r.onReward, r.onFail); e.loadErr();
  assert.deepEqual(r.calls, ['fail:load']); assert.equal(e.shows.length, 0);
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail); assert.equal(e.loads.length, 2);
});
T('show during load: 15s load timeout -> onFail("load"), late loaded never shows', () => {
  const e = makeEnv(); const r = rec();
  e.ad.show(r.onReward, r.onFail); e.advance(15000);
  assert.deepEqual(r.calls, ['fail:load']);
  e.loaded(0); assert.equal(e.shows.length, 0); assert.deepEqual(r.calls, ['fail:load']);
});
T('show cancel (returned fn) while waiting for load: no SDK show, no callbacks, not busy', () => {
  const e = makeEnv(); const r = rec();
  const off = e.ad.show(r.onReward, r.onFail); off();
  e.loaded();
  assert.equal(e.shows.length, 0); assert.deepEqual(r.calls, []);
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail); assert.equal(e.shows.length, 1);
});
T('show cancel while ad is displayed: callbacks suppressed, bridge stays busy until finish', () => {
  const e = makeEnv(); e.ad.preload(); e.loaded();
  const r = rec(); const off = e.ad.show(r.onReward, r.onFail);
  off();
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail);
  assert.deepEqual(r2.calls, ['fail:busy']); assert.equal(e.shows.length, 1);
  e.ev({ type: 'dismissed' });
  assert.deepEqual(r.calls, []);
  const r3 = rec(); e.ad.show(r3.onReward, r3.onFail); assert.deepEqual(r3.calls, []);
});
T('cancel after display started suppresses reward callback', () => {
  const e = makeEnv(); e.ad.preload(); e.loaded();
  const r = rec(); const off = e.ad.show(r.onReward, r.onFail);
  off(); e.ev({ type: 'userEarnedReward', data: VALID });
  assert.deepEqual(r.calls, []);
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail); // reward finished attempt -> not busy
  assert.equal(e.loads.length, 2);
});

// ---------- rewards ----------
T('valid userEarnedReward: onReward once with data, never onFail', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev({ type: 'requested' }); e.ev({ type: 'show' }); e.ev({ type: 'impression' }); e.ev({ type: 'clicked' });
  assert.deepEqual(r.calls, []);
  e.ev({ type: 'userEarnedReward', data: { unitType: 'coin', unitAmount: 3 } });
  e.ev({ type: 'dismissed' });
  assert.deepEqual(r.calls, ['reward']); assert.deepEqual(r.reward, [{ unitType: 'coin', unitAmount: 3 }]);
});
T('reward without dismissed (Android 5.255.0): bridge not busy, next show works', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev({ type: 'userEarnedReward', data: VALID });
  e.advance(700000); // nothing later may fail the rewarded attempt
  assert.deepEqual(r.calls, ['reward']);
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail);
  assert.deepEqual(r2.calls, []); assert.equal(e.loads.length, 2); // needs fresh load, not busy
  assert.equal(e.shows[0].unsubbed, 1); // rewarded attempt's subscription released
});
T('dismissed after reward: no onFail, subscription released, auto preload (not show)', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev({ type: 'userEarnedReward', data: VALID });
  assert.equal(e.shows[0].unsubbed, 0);
  e.ev({ type: 'dismissed' });
  assert.deepEqual(r.calls, ['reward']); assert.equal(e.shows[0].unsubbed, 1);
  assert.equal(e.loads.length, 2); assert.equal(e.shows.length, 1);
});
T('duplicate userEarnedReward ignored', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev({ type: 'userEarnedReward', data: VALID }); e.ev({ type: 'userEarnedReward', data: VALID });
  assert.deepEqual(r.calls, ['reward']);
});
T('invalid reward data never grants; later valid reward still can', () => {
  const bad = [undefined, null, 5, 'x', {}, { unitType: '', unitAmount: 1 }, { unitType: '  ', unitAmount: 1 }, { unitType: 3, unitAmount: 1 },
    { unitType: 'c' }, { unitType: 'c', unitAmount: 0 }, { unitType: 'c', unitAmount: -1 }, { unitType: 'c', unitAmount: NaN },
    { unitType: 'c', unitAmount: Infinity }, { unitType: 'c', unitAmount: '1' }, { unitType: 'c', unitAmount: null }];
  const e = makeEnv(); const r = startShown(e);
  for (const d of bad) e.ev({ type: 'userEarnedReward', data: d });
  e.ev({ type: 'userEarnedReward' });
  assert.deepEqual(r.calls, []);
  e.ev({ type: 'userEarnedReward', data: { unitType: 'c', unitAmount: 0.5 } });
  assert.deepEqual(r.calls, ['reward']);
});
T('invalid reward then dismissed -> onFail("dismissed") only, no reward', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev({ type: 'userEarnedReward', data: { unitType: '', unitAmount: 1 } }); e.ev({ type: 'dismissed' });
  assert.deepEqual(r.calls, ['fail:dismissed']);
});
T('dismissed without reward -> onFail("dismissed"); late reward ignored; auto preload does not show', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev({ type: 'dismissed' });
  assert.deepEqual(r.calls, ['fail:dismissed']); assert.equal(e.shows[0].unsubbed, 1);
  e.ev({ type: 'userEarnedReward', data: VALID });
  assert.deepEqual(r.calls, ['fail:dismissed']);
  assert.equal(e.loads.length, 2); assert.equal(e.shows.length, 1);
});
T('failedToShow -> onFail("failedToShow"); late reward ignored; no auto retry/show', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev({ type: 'failedToShow' }); e.ev({ type: 'userEarnedReward', data: VALID }); e.ev({ type: 'dismissed' });
  assert.deepEqual(r.calls, ['fail:failedToShow']); assert.equal(e.shows.length, 1); assert.equal(e.loads.length, 1);
});
T('late reward from earlier attempt cannot grant a newer attempt', () => {
  const e = makeEnv(); const r1 = startShown(e); e.ev({ type: 'dismissed' });
  e.loaded(1); // auto-preloaded
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail);
  e.ev({ type: 'userEarnedReward', data: VALID }, 0);
  assert.deepEqual(r1.calls, ['fail:dismissed']); assert.deepEqual(r2.calls, []);
  e.ev({ type: 'userEarnedReward', data: VALID }, 1);
  assert.deepEqual(r2.calls, ['reward']);
});

// ---------- concurrency ----------
T('concurrent show while loading is rejected with busy; original continues', () => {
  const e = makeEnv(); const r1 = rec(), r2 = rec();
  e.ad.show(r1.onReward, r1.onFail); e.ad.show(r2.onReward, r2.onFail);
  assert.deepEqual(r2.calls, ['fail:busy']); assert.equal(e.loads.length, 1);
  e.loaded(); assert.equal(e.shows.length, 1);
  e.ev({ type: 'userEarnedReward', data: VALID });
  assert.deepEqual(r1.calls, ['reward']); assert.deepEqual(r2.calls, ['fail:busy']);
});
T('concurrent show while ad displayed is rejected with busy (single inflight)', () => {
  const e = makeEnv(); const r1 = startShown(e); const r2 = rec();
  e.ad.show(r2.onReward, r2.onFail);
  assert.deepEqual(r2.calls, ['fail:busy']); assert.equal(e.shows.length, 1);
  e.ev({ type: 'dismissed' });
  assert.deepEqual(r1.calls, ['fail:dismissed']); assert.deepEqual(r2.calls, ['fail:busy']);
});
T('show called from inside a preload callback while show waiting is busy', () => {
  const e = makeEnv(); const r1 = rec(), r2 = rec();
  e.ad.show(r1.onReward, r1.onFail);
  // preload callback registered after show's internal waiter
  e.ad.preload(() => e.ad.show(r2.onReward, r2.onFail));
  e.loaded();
  assert.equal(e.shows.length, 1); assert.deepEqual(r2.calls, ['fail:busy']);
});
T('preload during displayed ad is queued (not loaded) until show settles, then resolves', () => {
  const e = makeEnv(); const r = startShown(e); const g = [];
  e.ad.preload((ok) => g.push(ok));
  assert.equal(e.loads.length, 1); assert.deepEqual(g, []);
  e.ev({ type: 'userEarnedReward', data: VALID });
  assert.equal(e.loads.length, 2); // pump started the queued load
  e.loaded(1); assert.deepEqual(g, [true]); assert.equal(e.shows.length, 1);
});

// ---------- show errors / timeouts ----------
T('show onError -> onFail("error"); released; late events ignored', () => {
  const e = makeEnv(); const r = startShown(e);
  e.showErr(); e.ev({ type: 'userEarnedReward', data: VALID });
  assert.deepEqual(r.calls, ['fail:error']); assert.equal(e.shows[0].unsubbed, 1);
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail); assert.equal(e.loads.length, 2);
});
T('showFullScreenAd throwing -> onFail("throw"), bridge recovers', () => {
  const e = makeEnv(); e.hooks.showThrows = true; const r = startShown(e);
  assert.deepEqual(r.calls, ['fail:throw']);
  e.hooks.showThrows = false;
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail); assert.equal(e.loads.length, 2);
});
T('sync show events before unsubscribe assigned: reward sync, subscription kept then released on dismissed', () => {
  const e = makeEnv(); e.hooks.onShow = (c) => c.params.onEvent({ type: 'userEarnedReward', data: VALID });
  const r = startShown(e);
  assert.deepEqual(r.calls, ['reward']); assert.equal(e.shows[0].unsubbed, 0);
  e.ev({ type: 'dismissed' }); assert.equal(e.shows[0].unsubbed, 1);
});
T('sync show error before unsubscribe assigned: onFail once, unsubscribed once', () => {
  const e = makeEnv(); e.hooks.onShow = (c) => c.params.onError(new Error('x'));
  const r = startShown(e);
  assert.deepEqual(r.calls, ['fail:error']); assert.equal(e.shows[0].unsubbed, 1);
});
T('no show event within 15s -> onFail("timeout"), busy cleared, late reward ignored', () => {
  const e = makeEnv(); const r = startShown(e);
  e.advance(14999); assert.deepEqual(r.calls, []);
  e.advance(1); assert.deepEqual(r.calls, ['fail:timeout']); assert.equal(e.shows[0].unsubbed, 1);
  e.ev({ type: 'userEarnedReward', data: VALID });
  assert.deepEqual(r.calls, ['fail:timeout']);
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail); assert.equal(e.loads.length, 2);
});
T('after "requested" event the 15s request timeout is cancelled; hard watchdog frees bridge at 10 min', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev({ type: 'requested' }); e.advance(599999);
  assert.deepEqual(r.calls, []);
  e.advance(1); assert.deepEqual(r.calls, ['fail:timeout']);
  e.ev({ type: 'userEarnedReward', data: VALID }); assert.deepEqual(r.calls, ['fail:timeout']);
});
T('timers are cleared after settle (no leaked pending timers)', () => {
  const e = makeEnv(); startShown(e);
  e.ev({ type: 'userEarnedReward', data: VALID });
  assert.equal(e.pending(), 0);
});

// ---------- callback robustness ----------
T('throwing onReward does not call onFail and does not corrupt bridge', () => {
  const e = makeEnv(); const fails = [];
  e.ad.preload(); e.loaded();
  e.ad.show(() => { throw new Error('user reward bug'); }, (w) => fails.push(w));
  e.ev({ type: 'userEarnedReward', data: VALID }); e.ev({ type: 'dismissed' });
  assert.deepEqual(fails, []);
  assert.ok(e.errors.length >= 1);
  e.loaded(1);
  const r = rec(); e.ad.show(r.onReward, r.onFail); assert.equal(e.shows.length, 2);
});
T('throwing onFail does not corrupt bridge', () => {
  const e = makeEnv(); e.ad.preload(); e.loaded();
  e.ad.show(() => {}, () => { throw new Error('user fail bug'); });
  e.ev({ type: 'dismissed' });
  e.loaded(1);
  const r = rec(); e.ad.show(r.onReward, r.onFail); assert.equal(e.shows.length, 2);
});
T('callbacks fire at most once even with repeated terminal events', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev({ type: 'failedToShow' }); e.ev({ type: 'dismissed' }); e.showErr(); e.advance(700000);
  assert.equal(r.calls.length, 1);
});
T('malformed events are ignored', () => {
  const e = makeEnv(); const r = startShown(e);
  e.ev(null); e.ev(undefined); e.ev('dismissed'); e.ev({}); e.ev({ type: 7 });
  assert.deepEqual(r.calls, []);
  e.ev({ type: 'userEarnedReward', data: VALID }); assert.deepEqual(r.calls, ['reward']);
});

// ---------- ad reuse ----------
T('preloaded ad is used once: second show needs a fresh load and fresh loaded event', () => {
  const e = makeEnv(); const r1 = startShown(e);
  e.ev({ type: 'userEarnedReward', data: VALID });
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail);
  assert.equal(e.shows.length, 1); assert.equal(e.loads.length, 2);
  e.loaded(1);
  assert.equal(e.shows.length, 2);
  e.ev({ type: 'userEarnedReward', data: VALID }, 1);
  assert.deepEqual(r2.calls, ['reward']);
});
T('used load subscription released on replacement; loading the next ad never shows', () => {
  const e = makeEnv(); startShown(e);
  e.ev({ type: 'dismissed' }); // auto-preload -> replaces used ad
  assert.equal(e.loads[0].unsubbed, 1); assert.equal(e.loads.length, 2);
  e.loaded(1); assert.equal(e.shows.length, 1);
});
T('preload() after a used ad starts a new load (does not report the consumed ad as ready)', () => {
  const e = makeEnv(); startShown(e); e.ev({ type: 'userEarnedReward', data: VALID });
  const g = []; e.ad.preload((ok) => g.push(ok));
  assert.equal(e.loads.length, 2); assert.deepEqual(g, []);
  e.loaded(1); assert.deepEqual(g, [true]);
});
T('failed next-load after use is not auto-retried', () => {
  const e = makeEnv(); startShown(e); e.ev({ type: 'dismissed' });
  e.loadErr(1); e.advance(120000);
  assert.equal(e.loads.length, 2); assert.equal(e.shows.length, 1);
});
T('dispose releases subscriptions, drops callbacks silently, and bridge is reusable', () => {
  const e = makeEnv(); const r = startShown(e); const g = [];
  e.ad.preload((ok) => g.push(ok));
  e.ad.dispose();
  assert.equal(e.loads[0].unsubbed, 1); assert.equal(e.shows[0].unsubbed, 1);
  e.ev({ type: 'userEarnedReward', data: VALID }); e.advance(700000);
  assert.deepEqual(r.calls, []); assert.deepEqual(g, []); assert.equal(e.pending(), 0);
  const r2 = rec(); e.ad.show(r2.onReward, r2.onFail); assert.equal(e.loads.length, 2);
});

// ---------- build integration ----------
T('ad-bridge.js: valid JS, default test id, no network/dynamic-code APIs, no old placeholder', () => {
  new vm.Script(bridgeSrc, { filename: 'ad-bridge.js' });
  assert.ok(bridgeSrc.includes('"ait-ad-test-rewarded-id"'));
  assert.ok(!/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|\beval\s*\(|new\s+Function|createElement|import\(|require\(/.test(bridgeSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
  assert.ok(!bridgeSrc.includes('__AD_ID__'));
});
T('build.mjs: syntax OK (node --check), SDK four exports imported, payment/link bans retained', () => {
  execFileSync(process.execPath, ['--check', path.join(here, 'build.mjs')]);
  assert.ok(buildSrc.includes("import { graniteEvent, closeView, loadFullScreenAd, showFullScreenAd } from '@apps-in-toss/web-framework'"));
  for (const t of ['kakaopay-vip-500', 'kakaopay-3000', '3333-35-5912880', 'sajulab-form', 'open\\.kakao\\.com', 'window.open=function']) assert.ok(buildSrc.includes(t), t);
  assert.ok(!buildSrc.includes(".replace('__AD_ID__'"));
  assert.ok(buildSrc.includes('isTestId:AD_IS_TEST'));
});
T('build helpers: default id is the official test id; empty/blank env falls back to it', () => {
  assert.equal(helpers.DEFAULT_AD_GROUP_ID, 'ait-ad-test-rewarded-id');
  assert.equal(helpers.validateAdGroupId(undefined), 'ait-ad-test-rewarded-id');
  assert.equal(helpers.validateAdGroupId('  '), 'ait-ad-test-rewarded-id');
  assert.equal(helpers.validateAdGroupId(' ait.v2.live.abc123 '), 'ait.v2.live.abc123');
});
T('build helpers: hostile AD_GROUP_ID values are rejected', () => {
  for (const bad of ['x";window.pwn=1;//', "a'b", 'a$&b', 'a b', 'a\nb', '</script>', 'a\\b', 'x'.repeat(129), '$`', '${1}'])
    assert.throws(() => helpers.validateAdGroupId(bad), /Invalid AD_GROUP_ID/, JSON.stringify(bad));
});
T('build helpers: renderBridge is injection-safe even if validation were bypassed ($&, quotes, U+2028)', () => {
  const nasty = 'a$&b$`c$\'d"; window.pwn = 1; //\u2028\\';
  const out = helpers.renderBridge(bridgeSrc, nasty);
  const e = makeEnv({ source: out });
  assert.equal(e.ctx.window.pwn, undefined);
  e.ad.preload();
  assert.equal(e.loads[0].params.options.adGroupId, nasty);
  assert.ok(!out.includes('__AD_GROUP_ID_START__'));
});
T('build helpers: live-style id is substituted and used for load and show', () => {
  const out = helpers.renderBridge(bridgeSrc, 'ait.v2.live.abc123');
  const e = makeEnv({ source: out });
  startShown(e);
  assert.equal(e.loads[0].params.options.adGroupId, 'ait.v2.live.abc123');
  assert.equal(e.shows[0].params.options.adGroupId, 'ait.v2.live.abc123');
});
T('build helpers: renderBridge throws if markers are missing', () => {
  assert.throws(() => helpers.renderBridge('var x=1;', 'abc'), /markers/);
});

// ---------- run ----------
const results = [];
for (const t of tests) {
  try { t.fn(); results.push({ name: t.name, ok: true }); }
  catch (err) { results.push({ name: t.name, ok: false, error: String(err && err.message || err).split('\n').slice(0, 6).join(' | ') }); }
}
const passed = results.filter((r) => r.ok).length;
const summary = {
  total: results.length, passed, failed: results.length - passed,
  node: process.version,
  bridgeSha256: crypto.createHash('sha256').update(bridgeSrc).digest('hex'),
  buildSha256: crypto.createHash('sha256').update(buildSrc).digest('hex'),
  tests: results
};
fs.writeFileSync(path.join(here, 'bridge-test-results.json'), JSON.stringify(summary, null, 2) + '\n');
for (const r of results) console.log((r.ok ? 'PASS ' : 'FAIL ') + r.name + (r.ok ? '' : '\n     ' + r.error));
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
