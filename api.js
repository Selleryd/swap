// api.js
// SWAP frontend API wrapper (GitHub Pages friendly via JSONP)
// IMPORTANT: Paste your Apps Script /exec URL in exactly ONE place below.

const DEFAULT_EXEC_URL = "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec"; // <-- ONLY PLACE YOU PASTE

function getExecUrl() {
  // Optional override without editing code: localStorage.setItem("SWAP_EXEC_URL", "...exec");
  const ls = (typeof localStorage !== "undefined") ? localStorage.getItem("SWAP_EXEC_URL") : "";
  const w = (typeof window !== "undefined") ? window : {};
  const fromWindow = w.__SWAP_EXEC_URL || w.SWAP_EXEC_URL || "";
  const url = String(fromWindow || ls || DEFAULT_EXEC_URL).trim();

  if (!url || url === "PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE") {
    throw new Error("Missing Apps Script EXEC URL. Set DEFAULT_EXEC_URL in api.js or localStorage SWAP_EXEC_URL.");
  }
  return url.replace(/\/+$/, "");
}

function buildUrl(route, params = {}) {
  const base = getExecUrl();
  const usp = new URLSearchParams();
  usp.set("route", route);
  usp.set("_ts", String(Date.now())); // cache-bust

  Object.keys(params).forEach(k => {
    const v = params[k];
    if (v === undefined || v === null || v === "") return;
    usp.set(k, String(v));
  });

  return `${base}?${usp.toString()}`;
}

function jsonp(url, { timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const cb = `__swap_jsonp_${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const sep = url.includes("?") ? "&" : "?";
    const src = `${url}${sep}callback=${cb}`;

    let done = false;
    const script = document.createElement("script");
    script.async = true;
    script.src = src;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("Request timed out."));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cb]; } catch (_) { window[cb] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[cb] = (data) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("Network error loading JSONP script."));
    };

    document.head.appendChild(script);
  });
}

async function jsonpWithRetry(url, opts = {}, retries = 1) {
  try {
    return await jsonp(url, opts);
  } catch (e) {
    if (retries <= 0) throw e;
    return await jsonp(url, opts);
  }
}

function assertOk(res) {
  if (!res || res.ok !== true) {
    const msg = (res && res.error) ? res.error : "Request failed.";
    throw new Error(msg);
  }
  return res;
}

function pickPortionGrams(item) {
  // Prefer explicit grams
  if (item && typeof item.grams === "number" && isFinite(item.grams) && item.grams > 0) return item.grams;

  // Try to parse from "portion" string like "140 g"
  const s = String(item?.portion || "").toLowerCase();
  const m = s.match(/(\d+(\.\d+)?)/);
  if (m) {
    const n = parseFloat(m[1]);
    if (isFinite(n) && n > 0) return n;
  }
  return 0;
}

export const API = {
  // Optional setter without editing file
  setExecUrl(url) {
    localStorage.setItem("SWAP_EXEC_URL", String(url || "").trim());
  },

  async health() {
    const res = await jsonpWithRetry(buildUrl("health"), { timeoutMs: 15000 }, 1);
    return assertOk(res);
  },

  async searchFoods(q, { limit = 25, group = "" } = {}) {
    const res = await jsonpWithRetry(buildUrl("foods", { q, limit, group }), { timeoutMs: 20000 }, 1);
    return assertOk(res);
  },

  async getFood(id) {
    const res = await jsonpWithRetry(buildUrl("food", { id }), { timeoutMs: 20000 }, 1);
    return assertOk(res);
  },

  async swap({ id, portion_g, same_group = 1, limit = 12 }) {
    const res = await jsonpWithRetry(
      buildUrl("swap", {
        id,
        portion_g,
        same_group,
        limit,
        // keep tolerance internal; backend default is 0.05
      }),
      { timeoutMs: 25000 },
      1
    );
    return assertOk(res);
  },

  // === MAIN FIX: this now calls route=plan which we added to Code.gs ===
  async generatePlan(profile, computed) {
    const cal = Math.round(computed?.caloriesTarget || 0);
    const protein = Math.round(computed?.proteinGTarget || 0);

    const dietary = String(profile?.dietary || "");
    const allergens = String(profile?.allergens || "");

    const res = await jsonpWithRetry(
      buildUrl("plan", {
        cal,
        protein,
        dietary,
        allergens,
        ai: 1 // uses OPENAI_API_KEY if set; fallback if not
      }),
      { timeoutMs: 30000 },
      1
    );

    assertOk(res);

    // Sanity check: ensure there are actual items so the calendar fills
    const days = res?.plan?.days || [];
    const hasAnyItem = Array.isArray(days) && days.some(d =>
      (d.meals || []).some(m => Array.isArray(m.items) && m.items.length)
    );
    if (!hasAnyItem) throw new Error("Plan generated but contains no meal items. Check Apps Script logs for route=plan.");

    return res;
  },

  async suggestSwaps(context) {
    const item = context?.item || {};
    let id = String(item.id || "").trim();
    let portion_g = pickPortionGrams(item);

    // If item has no id, try to resolve via foods search
    if (!id) {
      const name = String(item.name || "").trim();
      if (!name) throw new Error("Missing item name/id for swaps.");
      const found = await this.searchFoods(name, { limit: 5 });
      const best = (found.results || [])[0];
      if (!best?.id) throw new Error("Could not match item to database for swaps.");
      id = best.id;
    }

    if (!portion_g || portion_g <= 0) {
      // If grams missing, default to 100g to avoid errors
      portion_g = 100;
    }

    const res = await this.swap({ id, portion_g, same_group: 1, limit: 12 });
    return res;
  },

  async generateRecipe({ day, profile }) {
    const date = String(day?.date || "").trim();
    if (!date) throw new Error("Missing day.date for recipe.");

    const dietary = String(profile?.dietary || "");
    const allergens = String(profile?.allergens || "");

    const res = await jsonpWithRetry(
      buildUrl("recipe", { date, dietary, allergens, ai: 1 }),
      { timeoutMs: 30000 },
      1
    );
    return assertOk(res);
  }
};
