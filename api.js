// api.js
// SWAP Frontend API client (JSONP) for Google Apps Script /exec
// Must be used as an ES module: import { API } from "./api.js";

"use strict";

/**
 * SET YOUR EXEC URL IN ONE PLACE ONLY:
 * - Option A (recommended): in index.html before modules load:
 *     <script>window.__SWAP_CONFIG__ = { EXEC_URL: "https://script.google.com/macros/s/XXXX/exec" };</script>
 * - Option B: set localStorage key "SWAP_EXEC_URL"
 * - Option C: edit DEFAULT_EXEC_URL below
 */
const DEFAULT_EXEC_URL = "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec";

const SWAP_EXEC_URL =
  (globalThis.__SWAP_CONFIG__ && globalThis.__SWAP_CONFIG__.EXEC_URL) ||
  globalThis.localStorage?.getItem("SWAP_EXEC_URL") ||
  DEFAULT_EXEC_URL;

// ---------- Base64URL encode helper (for sending JSON via querystring safely)
function base64UrlEncode(str) {
  const utf8 = new TextEncoder().encode(String(str));
  let bin = "";
  utf8.forEach((b) => (bin += String.fromCharCode(b)));
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

// ---------- JSONP core
function jsonp(params = {}, { timeoutMs = 25000 } = {}) {
  const execUrl = String(SWAP_EXEC_URL || "").trim();

  if (!execUrl || execUrl.includes("PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE")) {
    return Promise.reject(
      new Error('SWAP_EXEC_URL not set. Paste your Apps Script /exec URL into api.js (DEFAULT_EXEC_URL) or window.__SWAP_CONFIG__.EXEC_URL.')
    );
  }

  return new Promise((resolve, reject) => {
    const cbName = `__swap_jsonp_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const query = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === null) return;
      query.set(k, String(v));
    });
    query.set("callback", cbName);
    query.set("_ts", String(Date.now())); // cache-bust

    const src = `${execUrl}?${query.toString()}`;

    let done = false;
    const cleanup = () => {
      try { delete globalThis[cbName]; } catch (e) { globalThis[cbName] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
      clearTimeout(timer);
    };

    globalThis[cbName] = (data) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(data);
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("Request timed out (JSONP)"));
    }, timeoutMs);

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP network error (script load failed)"));
    };

    document.head.appendChild(script);
  });
}

// ---------- Convenience wrappers
async function callRoute(route, payloadObj = null, extraParams = {}) {
  const params = { route, ...extraParams };
  if (payloadObj !== null && payloadObj !== undefined) {
    const json = JSON.stringify(payloadObj);
    params.data = base64UrlEncode(json);
  }
  const res = await jsonp(params);
  if (res && res.ok === false) {
    throw new Error(res.error || `API error on route=${route}`);
  }
  return res;
}

// ---------- API object (named export required by your app.js)
export const API = {
  // Debug helpers
  async health() {
    return callRoute("health");
  },
  async meta() {
    return callRoute("meta");
  },

  // Food DB
  async foods({ q = "", limit = 25, group = "" } = {}) {
    return callRoute("foods", null, { q, limit, group });
  },
  async food(id) {
    return callRoute("food", null, { id });
  },
  async swap({ id, portion_g, tol = 0.05, flex = 0, limit = 12, same_group = 1 } = {}) {
    return callRoute("swap", null, { id, portion_g, tol, flex, limit, same_group });
  },

  // Meal Plan (AI-backed in Apps Script)
  async generatePlan(profile, computed, opts = {}) {
    const weekStart = getWeekStartISO();
    const payload = {
      profile: profile || {},
      computed: computed || {},
      weekStart,
      force: !!opts.force,
      seed: opts.seed || null
    };
    return callRoute("generateplan", payload);
  },

  // Swaps suggestion when user clicks an item on the calendar
  async suggestSwaps(context, opts = {}) {
    const payload = {
      context,
      tol: opts.tol ?? 0.05,
      flex: !!opts.flex,
      limit: opts.limit ?? 12,
      same_group: opts.same_group ?? true
    };
    return callRoute("suggestswaps", payload);
  },

  // Recipes per day
  async generateRecipe(payload) {
    return callRoute("generaterecipe", payload);
  },

  // Optional: allow setting URL at runtime
  setExecUrl(url) {
    const v = String(url || "").trim();
    if (!v) throw new Error("Empty exec url");
    localStorage.setItem("SWAP_EXEC_URL", v);
  }
};

export default API;

// ---------- Week start helper (Sunday)
function getWeekStartISO() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = d.getDay(); // 0=Sun
  d.setDate(d.getDate() - dow);

  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
