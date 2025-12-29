// api.js (JSONP Bridge-less)
// Works on GitHub Pages with Google Apps Script doGet() that supports ?callback=...
// IMPORTANT: JSONP = GET-only. Your Apps Script routes must accept GET params.

"use strict";

// 1) PUT YOUR /exec URL HERE (must be a deployed Web App)
let EXEC_URL = "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec";

/** Optional: allow changing URL at runtime */
export function setExecUrl(url) {
  EXEC_URL = String(url || "").trim();
}

/** Build querystring from a params object */
function toQuery(params = {}) {
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    // Support arrays (repeat keys)
    if (Array.isArray(v)) {
      v.forEach((item) => sp.append(k, String(item)));
    } else {
      sp.set(k, String(v));
    }
  });
  return sp.toString();
}

/**
 * JSONP call to Apps Script
 * @param {string} route - e.g. "health", "meta", "foods", "food", "swap"
 * @param {object} params - route params
 * @param {object} opts - { timeoutMs }
 */
export function jsonp(route, params = {}, opts = {}) {
  const timeoutMs = Number(opts.timeoutMs ?? 15000);

  return new Promise((resolve, reject) => {
    if (!EXEC_URL || !EXEC_URL.includes("/exec")) {
      reject(new Error("EXEC_URL is not set to a valid Apps Script /exec URL."));
      return;
    }

    const cbName = `__swap_jsonp_cb_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const cleanup = (scriptEl) => {
      try { delete window[cbName]; } catch (_) { window[cbName] = undefined; }
      if (scriptEl && scriptEl.parentNode) scriptEl.parentNode.removeChild(scriptEl);
    };

    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup(script);
      reject(
        new Error(
          "JSONP timeout (no callback). Usually means: deployment not public, wrong EXEC_URL, or server threw an error before responding."
        )
      );
    }, timeoutMs);

    // Define the callback the server will call: callback(<object>)
    window[cbName] = (data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup(script);

      // Some backends may return stringified JSON inside JSONP
      if (typeof data === "string") {
        try { resolve(JSON.parse(data)); }
        catch { resolve({ ok: true, data }); }
        return;
      }
      resolve(data);
    };

    // Build URL: /exec?route=...&...&callback=cbName&t=...
    const qs = toQuery({
      route: (route || "health").toLowerCase(),
      ...params,
      callback: cbName,
      t: Date.now(), // bust caching
    });

    const url = `${EXEC_URL}${EXEC_URL.includes("?") ? "&" : "?"}${qs}`;

    const script = document.createElement("script");
    script.src = url;
    script.async = true;

    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup(script);
      reject(new Error("JSONP script load error. Check EXEC_URL / deployment access."));
    };

    document.head.appendChild(script);
  });
}

/** Generic route caller (recommended) */
export async function call(route, params = {}, opts = {}) {
  const res = await jsonp(route, params, opts);

  // Standardize: if server returns {ok:false,...} treat as error
  if (res && typeof res === "object" && res.ok === false) {
    const msg = res.error || "Server returned ok:false";
    const err = new Error(msg);
    err.response = res;
    throw err;
  }
  return res;
}

/* Convenience helpers matching your backend routes */
export const api = {
  setExecUrl,

  health: (opts) => call("health", {}, opts),
  meta: (opts) => call("meta", {}, opts),

  foods: (q, { limit = 25, group } = {}, opts) =>
    call("foods", { q, limit, group }, opts),

  food: (id, opts) => call("food", { id }, opts),

  swap: (id, { portion_g = 140, tol = 0.05, flex = 0, limit = 12, same_group = 1 } = {}, opts) =>
    call("swap", { id, portion_g, tol, flex, limit, same_group }, opts),

  refreshCache: (opts) => call("refreshcache", {}, opts),

  // Generic if your UI calls unknown routes
  call,
};

// Also expose a global for non-module code (safe/no conflicts)
window.SWAP_API = api;
