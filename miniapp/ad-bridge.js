/*
 * Toss rewarded-ad bridge (hardened).
 *
 * Generated-bridge contract: loadFullScreenAd / showFullScreenAd are lexical
 * globals imported from '@apps-in-toss/web-framework' by build.mjs.
 * Public API (unchanged): window.__TOSS_AD = { supported(), preload(done), show(onReward, onFail) }
 *   - preload(done) -> unregister fn (drops only this done callback)
 *   - show(onReward, onFail) -> unregister fn (drops callbacks; aborts if still waiting for load)
 *   - dispose() (non-enumerable extra) -> release every SDK subscription and reset state silently
 * No network calls of its own, no automatic show, no automatic retry.
 */
(function () {
  'use strict';

  // build.mjs replaces everything between the two markers with JSON.stringify(id).
  var AD_GROUP_ID = /*__AD_GROUP_ID_START__*/"ait-ad-test-rewarded-id"/*__AD_GROUP_ID_END__*/;
  var LOAD_TIMEOUT_MS = 15000;          // loaded event must arrive within 15s
  var SHOW_REQUEST_TIMEOUT_MS = 15000;  // some show event must arrive within 15s of showFullScreenAd
  var SHOW_MAX_MS = 600000;             // hard watchdog: bridge never stays busy longer than 10 min

  var load = null;     // current load record (loading / loaded / used)
  var loadSeq = 0;
  var showSeq = 0;
  var waiters = [];    // shared preload callbacks (also used internally by show)
  var cur = null;      // in-flight show attempt (at most one)
  var tail = null;     // rewarded attempt whose SDK subscription is kept until 'dismissed'

  function isFn(f) { return typeof f === 'function'; }
  function noop() {}
  function logError(e) {
    try { if (typeof console !== 'undefined' && console && isFn(console.error)) console.error('[toss-ad]', e); } catch (_) { /* ignore */ }
  }
  function safeCall(fn, arg) {
    if (!isFn(fn)) return;
    try { fn(arg); } catch (e) { logError(e); }
  }

  function apiSupported(fn) {
    try { return isFn(fn) && isFn(fn.isSupported) && fn.isSupported() === true; } catch (e) { return false; }
  }
  function supported() {
    try {
      var a = apiSupported(loadFullScreenAd);
      var b = apiSupported(showFullScreenAd);
      return a && b;
    } catch (e) { return false; } // e.g. ReferenceError when the SDK import is missing
  }

  // ---- subscription helpers (safe when the SDK calls back before returning its unsubscribe) ----
  function runUnsub(rec) {
    var u = rec.unsub;
    rec.unsub = null;
    if (u) { try { u(); } catch (e) { logError(e); } }
  }
  function release(rec) {
    if (!rec) return;
    rec.dead = true;
    if (rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
    runUnsub(rec);
  }
  function attach(rec, ret) {
    if (!isFn(ret)) return;
    rec.unsub = ret;
    if (rec.dead) runUnsub(rec);
  }

  // ---- loading ----
  function isLoading() { return !!(load && !load.settled); }
  function isReady() { return !!(load && load.settled && load.ok && !load.used && !load.dead); }

  function flush(ok) {
    var list = waiters;
    waiters = [];
    for (var i = 0; i < list.length; i++) {
      var w = list[i];
      if (w.active) { w.active = false; safeCall(w.fn, ok); }
    }
  }

  function failLoad(rec) {
    if (load !== rec || rec.settled) return;
    rec.settled = true;
    rec.ok = false;
    load = null;
    release(rec);
    flush(false);
  }

  function startLoad() {
    if (isLoading() || isReady()) return;
    if (load) { release(load); load = null; } // replacement of a used ad: release old subscription now
    var rec = { id: ++loadSeq, settled: false, ok: false, used: false, dead: false, unsub: null, timer: null };
    load = rec;
    rec.timer = setTimeout(function () {
      rec.timer = null;
      failLoad(rec);
    }, LOAD_TIMEOUT_MS);
    try {
      var ret = loadFullScreenAd({
        options: { adGroupId: AD_GROUP_ID },
        onEvent: function (e) {
          if (load !== rec || rec.dead || rec.settled) return;
          if (e && e.type === 'loaded') {
            rec.settled = true;
            rec.ok = true;
            if (rec.timer) { clearTimeout(rec.timer); rec.timer = null; }
            flush(true); // subscription is intentionally kept until replacement / dispose
          }
        },
        onError: function () { failLoad(rec); }
      });
      attach(rec, ret);
    } catch (e) {
      logError(e);
      if (load === rec && !rec.settled) failLoad(rec); else release(rec);
    }
  }

  function preload(done) {
    var w = { fn: isFn(done) ? done : null, active: true };
    if (!supported()) { safeCall(w.fn, false); return noop; }
    if (isReady()) { safeCall(w.fn, true); return noop; }
    waiters.push(w);
    if (!(cur && cur.phase === 'showing')) startLoad(); // while an ad is on screen, queue until it finishes
    return function () {
      w.active = false;
      var i = waiters.indexOf(w);
      if (i >= 0) waiters.splice(i, 1);
    };
  }

  function pump() {
    if (waiters.length && !isLoading() && !isReady() && !(cur && cur.phase === 'showing')) startLoad();
  }

  // ---- showing ----
  function clearShowTimers(s) {
    if (s.reqTimer) { clearTimeout(s.reqTimer); s.reqTimer = null; }
    if (s.maxTimer) { clearTimeout(s.maxTimer); s.maxTimer = null; }
  }

  function finishFail(s, why) {
    if (cur !== s || s.settled) return;
    s.settled = true;
    clearShowTimers(s);
    cur = null;
    release(s);
    var cb = s.onFail;
    s.onFail = null;
    s.onReward = null;
    pump();
    safeCall(cb, why);
  }

  function validReward(data) {
    return !!data && typeof data === 'object' &&
      typeof data.unitType === 'string' && data.unitType.trim().length > 0 &&
      typeof data.unitAmount === 'number' && isFinite(data.unitAmount) && data.unitAmount > 0;
  }

  function grant(s, data) {
    s.settled = true;
    s.rewarded = true;
    clearShowTimers(s);
    cur = null;
    tail = s; // keep SDK subscription until 'dismissed' (Android 5.255.0 may never send it; bridge is not busy)
    var cb = s.onReward;
    s.onReward = null;
    s.onFail = null;
    pump();
    safeCall(cb, { unitType: data.unitType, unitAmount: data.unitAmount });
  }

  function releaseTail() {
    if (tail) { var t = tail; tail = null; release(t); }
  }

  function onShowEvent(s, e) {
    var isCur = cur === s;
    var isTail = tail === s;
    if (!isCur && !isTail) return; // stale attempt
    if (!e || typeof e !== 'object' || typeof e.type !== 'string') return;
    var type = e.type;
    if (isTail) {
      if (type === 'dismissed' || type === 'failedToShow') {
        tail = null;
        release(s);
        if (type === 'dismissed') preload(); // load -> show -> next load; never shows
      }
      return;
    }
    if (s.reqTimer) { clearTimeout(s.reqTimer); s.reqTimer = null; }
    if (type === 'userEarnedReward') {
      if (validReward(e.data)) grant(s, e.data);
    } else if (type === 'dismissed') {
      finishFail(s, 'dismissed');
      preload();
    } else if (type === 'failedToShow') {
      finishFail(s, 'failedToShow');
    }
    // requested / show / impression / clicked: informational only, never a reward
  }

  function onShowError(s) {
    if (cur === s) { finishFail(s, 'error'); return; }
    if (tail === s) { tail = null; release(s); }
  }

  function go(s) {
    if (cur !== s || s.phase !== 'loading' || !isReady()) { finishFail(s, 'load'); return; }
    s.phase = 'showing';
    load.used = true; // an ad is shown at most once; a fresh load is required afterwards
    s.reqTimer = setTimeout(function () {
      s.reqTimer = null;
      if (cur === s) finishFail(s, 'timeout');
    }, SHOW_REQUEST_TIMEOUT_MS);
    s.maxTimer = setTimeout(function () {
      s.maxTimer = null;
      if (cur === s) finishFail(s, 'timeout');
    }, SHOW_MAX_MS);
    try {
      var ret = showFullScreenAd({
        options: { adGroupId: AD_GROUP_ID },
        onEvent: function (e) { onShowEvent(s, e); },
        onError: function () { onShowError(s); }
      });
      attach(s, ret);
    } catch (e) {
      logError(e);
      if (cur === s) finishFail(s, 'throw'); else release(s);
    }
  }

  function show(onReward, onFail) {
    var s = {
      id: ++showSeq, phase: 'loading', settled: false, rewarded: false, dead: false, unsub: null,
      onReward: isFn(onReward) ? onReward : null, onFail: isFn(onFail) ? onFail : null,
      reqTimer: null, maxTimer: null, timer: null, waiter: null
    };
    var cancel = function () {
      s.onReward = null;
      s.onFail = null;
      if (cur === s && s.phase === 'loading') { // not yet displayed: abort quietly
        s.settled = true;
        if (s.waiter) {
          s.waiter.active = false;
          var i = waiters.indexOf(s.waiter);
          if (i >= 0) waiters.splice(i, 1);
        }
        cur = null;
        release(s);
      }
    };
    if (cur) { var cb = s.onFail; s.onFail = null; s.onReward = null; safeCall(cb, 'busy'); return cancel; }
    if (!supported()) { var cb2 = s.onFail; s.onFail = null; s.onReward = null; safeCall(cb2, 'unsupported'); return cancel; }
    cur = s;
    releaseTail();
    if (isReady()) { go(s); return cancel; }
    s.waiter = {
      active: true,
      fn: function (ok) {
        if (cur !== s || s.phase !== 'loading') return;
        if (ok) go(s); else finishFail(s, 'load');
      }
    };
    waiters.push(s.waiter);
    startLoad();
    return cancel;
  }

  function dispose() {
    waiters = [];
    var s = cur, t = tail, l = load;
    cur = null; tail = null; load = null;
    if (s) { s.settled = true; s.onReward = null; s.onFail = null; clearShowTimers(s); release(s); }
    if (t) release(t);
    if (l) release(l);
  }

  var api = { supported: supported, preload: preload, show: show };
  Object.defineProperty(api, 'dispose', { value: dispose, enumerable: false });
  window.__TOSS_AD = api;
})();
