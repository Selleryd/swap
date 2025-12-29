// api.js
// SWAP Frontend API (GitHub Pages-safe via JSONP)
//
// Paste your Apps Script Web App /exec URL ONCE below.
// Example: https://script.google.com/macros/s/XXXXXXX/exec
//
// Optional: you can set it at runtime:
// window.__SWAP_CONFIG__ = { EXEC_URL: "https://script.google.com/macros/s/XXXX/exec" };

const SWAP_EXEC_URL =
  (globalThis.__SWAP_CONFIG__ && globalThis.__SWAP_CONFIG__.EXEC_URL) ||
  globalThis.localStorage?.getItem("SWAP_EXEC_URL") ||
  "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec";

function setExecUrl(url){
  const u = String(url || "").trim();
  if (!u) throw new Error("Missing URL");
  globalThis.localStorage?.setItem("SWAP_EXEC_URL", u);
}

// -------- JSONP core --------
function jsonp(params = {}, { timeoutMs = 25000 } = {}) {
  const execUrl = String(SWAP_EXEC_URL || "").trim();
  if (!execUrl || execUrl.includes("PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE")) {
    return Promise.reject(new Error("SWAP_EXEC_URL not set. Paste your Apps Script /exec URL into api.js."));
  }

  return new Promise((resolve, reject) => {
    const cbName = `__swap_jsonp_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const cleanUp = () => {
      try { delete window[cbName]; } catch (e) {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    };

    window[cbName] = (data) => {
      cleanUp();
      resolve(data);
    };

    const qs = new URLSearchParams();
    Object.keys(params).forEach((k) => {
      const v = params[k];
      if (v === undefined || v === null) return;
      qs.set(k, String(v));
    });
    qs.set("callback", cbName);

    const src = execUrl + (execUrl.includes("?") ? "&" : "?") + qs.toString();

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onerror = () => {
      cleanUp();
      reject(new Error("JSONP request failed. Check SWAP_EXEC_URL deployment/access."));
    };

    const timer = setTimeout(() => {
      cleanUp();
      reject(new Error("Request timed out."));
    }, timeoutMs);

    document.head.appendChild(script);
  }).then((res) => {
    if (!res) throw new Error("Empty response");
    if (res.ok === false) throw new Error(res.error || "Request failed");
    return res;
  });
}

// -------- Helpers to keep GET params small (avoid URL too long) --------
function safeStr(s, max = 200){
  s = String(s || "").trim();
  return s.length > max ? s.slice(0, max) : s;
}
function num(v, fallback = 0){
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function firstNonEmpty(...vals){
  for (const v of vals){
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

export const API = {
  // basic
  health: () => jsonp({ route: "health" }),
  meta: () => jsonp({ route: "meta" }),

  foods: (q, { limit = 25, group = "" } = {}) =>
    jsonp({ route: "foods", q: safeStr(q, 80), limit: String(limit), group: safeStr(group, 40) }),

  food: (id) => jsonp({ route: "food", id: String(id || "").trim() }),

  swap: ({ id, portion_g, tol = 0.05, flex = 0, limit = 12, same_group = 1 }) =>
    jsonp({
      route: "swap",
      id: String(id || "").trim(),
      portion_g: String(num(portion_g, 0)),
      tol: String(num(tol, 0.05)),
      flex: String(flex ? 1 : 0),
      limit: String(limit),
      same_group: String(same_group ? 1 : 0)
    }),

  // what your app.js calls
  generatePlan: async (profile, computed) => {
    // IMPORTANT: do NOT send huge JSON. Keep params tiny (JSONP = GET).
    const calories = Math.round(num(computed?.caloriesTarget, 0));
    const protein_g = Math.round(num(computed?.proteinGTarget, 0));
    const dietary = safeStr(profile?.dietary, 200);
    const allergens = safeStr(profile?.allergens, 200);

    // Week start (Sunday) derived client-side to keep deterministic weeks
    const weekStart = startOfWeekISO(new Date());

    return jsonp({
      route: "plan",
      calories: String(calories),
      protein_g: String(protein_g),
      dietary,
      allergens,
      week_start: weekStart
    }, { timeoutMs: 45000 });
  },

  suggestSwaps: async (context) => {
    const item = context?.item || {};
    const id = firstNonEmpty(item.id, item.foodId, item.food_id);
    const name = safeStr(item.name, 120);

    // portion grams
    const portion_g =
      num(item.portion_g, 0) ||
      num(item.portionG, 0) ||
      num(item.grams, 0) ||
      num(item.g, 0) ||
      100;

    return jsonp({
      route: "suggestswaps",
      id: String(id || "").trim(),
      name,
      portion_g: String(portion_g),
      tol: "0.05",
      flex: "0",
      limit: "12",
      same_group: "1"
    }, { timeoutMs: 30000 });
  },

  generateRecipe: async ({ day, profile }) => {
    // Extract just names so the URL stays small
    const names = [];
    const meals = day?.meals || [];
    for (const meal of meals) {
      const items = meal?.items || [];
      for (const it of items) {
        if (it?.name) names.push(String(it.name).trim());
      }
    }

    const foods = names.filter(Boolean).slice(0, 30).join("|");
    const dietary = safeStr(profile?.dietary, 200);
    const allergens = safeStr(profile?.allergens, 200);

    return jsonp({
      route: "recipe",
      foods,
      dietary,
      allergens
    }, { timeoutMs: 45000 });
  },

  setExecUrl
};

function startOfWeekISO(dt){
  const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const day = d.getDay(); // 0 sunday
  d.setDate(d.getDate() - day);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
