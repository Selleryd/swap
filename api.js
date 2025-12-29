// api.js — ES Module + JSONP (GitHub Pages safe; no CORS)
"use strict";

// ✅ Put your Apps Script /exec URL here:
const EXEC_URL = "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec";

/* -----------------------
   JSONP core
------------------------ */
function toQuery(params = {}) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) v.forEach((item) => sp.append(k, String(item)));
    else sp.set(k, String(v));
  }
  return sp.toString();
}

function jsonp(route, params = {}, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!EXEC_URL || !EXEC_URL.includes("/exec")) {
      reject(new Error("EXEC_URL must be set to a valid Apps Script /exec URL"));
      return;
    }

    const cbName =
      "__swap_jsonp_cb_" + Date.now() + "_" + Math.random().toString(16).slice(2);

    let script;
    let done = false;

    const cleanup = () => {
      try {
        delete window[cbName];
      } catch {
        window[cbName] = undefined;
      }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(
        new Error(
          "JSONP timeout (no callback). Usually: wrong EXEC_URL, Web App not public, or server error before callback."
        )
      );
    }, timeoutMs);

    window[cbName] = (data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    const qs = toQuery({
      route: String(route || "health").toLowerCase(),
      callback: cbName,
      t: Date.now(),
      ...params,
    });

    const url = EXEC_URL + (EXEC_URL.includes("?") ? "&" : "?") + qs;

    script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error("JSONP script load error. Check EXEC_URL / deployment access."));
    };

    document.head.appendChild(script);
  });
}

/* -----------------------
   Helpers
------------------------ */
function looksLikeUnknownRoute(resp) {
  const msg =
    (resp && (resp.error || resp.message || resp.msg)) ? String(resp.error || resp.message || resp.msg) : "";
  return /unknown route|route/i.test(msg) && /unknown|invalid/i.test(msg);
}

async function tryRoutes(routes, params, opts) {
  let last;
  for (const r of routes) {
    try {
      const out = await jsonp(r, params, opts);
      last = out;

      // If backend uses { ok:false, error:"Unknown route" } or similar, try next
      if (out && out.ok === false && looksLikeUnknownRoute(out)) continue;

      return out;
    } catch (e) {
      last = { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }
  return (
    last || {
      ok: false,
      error:
        "All route fallbacks failed. Your Apps Script backend likely doesn’t have a plan route yet (or it uses different param names).",
    }
  );
}

/* -----------------------
   Public API (exported)
------------------------ */
export const API = {
  execUrl: EXEC_URL,
  jsonp,

  // Existing routes you already had
  health(opts) {
    return jsonp("health", {}, opts);
  },
  meta(opts) {
    return jsonp("meta", {}, opts);
  },
  foods(q, { limit = 25, group = "" } = {}, opts) {
    return jsonp("foods", { q, limit, group }, opts);
  },
  food(id, opts) {
    return jsonp("food", { id }, opts);
  },
  swap(
    id,
    { portion_g = 140, tol = 0.05, flex = 0, limit = 12, same_group = 1 } = {},
    opts
  ) {
    return jsonp("swap", { id, portion_g, tol, flex, limit, same_group }, opts);
  },
  refreshCache(opts) {
    return jsonp("refreshcache", {}, opts);
  },

  /* -----------------------
     ✅ Meal Plan methods your app expects
     (with route fallbacks)
  ------------------------ */

  /**
   * generatePlan(payload)
   * payload can be anything your UI currently passes (profile, targets, etc.)
   * We send it as payload=<json> so it works over JSONP GET.
   */
  async generatePlan(payload = {}, opts) {
    const routes = [
      "generateplan",
      "plan",
      "mealplan",
      "weekplan",
      "generate_plan",
    ];

    const params = {
      // common patterns in Apps Script backends:
      payload: JSON.stringify(payload),
      // also send flattened version in case backend expects direct params:
      ...payload,
    };

    return tryRoutes(routes, params, opts);
  },

  /**
   * regeneratePlan(payload)
   * Same as generatePlan but includes regen=1 as a hint.
   */
  async regeneratePlan(payload = {}, opts) {
    const routes = [
      "regenerateplan",
      "regenplan",
      "plan",
      "mealplan",
      "weekplan",
      "generateplan",
    ];

    const params = {
      regen: 1,
      payload: JSON.stringify(payload),
      ...payload,
    };

    return tryRoutes(routes, params, opts);
  },

  // Aliases some UIs use (prevents the next “is not a function” pop-up)
  getPlan(payload = {}, opts) {
    return this.generatePlan(payload, opts);
  },
  createPlan(payload = {}, opts) {
    return this.generatePlan(payload, opts);
  },
};

// Optional default export (safe)
export default API;
