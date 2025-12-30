// api.js
// SWAP Frontend API (GitHub Pages-safe via JSONP)
// Paste your Apps Script Web App /exec URL below.

const SWAP_EXEC_URL =
  (globalThis.__SWAP_CONFIG__ && globalThis.__SWAP_CONFIG__.EXEC_URL) ||
  globalThis.localStorage?.getItem("SWAP_EXEC_URL") ||
  "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec";

function setExecUrl(url) {
  const u = String(url || "").trim();
  if (!u) throw new Error("Missing URL");
  globalThis.localStorage?.setItem("SWAP_EXEC_URL", u);
}

// JSONP with better error detection (prevents silent timeouts on HTML/login responses)
function jsonp(params = {}, { timeoutMs = 30000 } = {}) {
  const execUrl = String(SWAP_EXEC_URL || "").trim();
  if (!execUrl || execUrl.includes("PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE")) {
    return Promise.reject(
      new Error("SWAP_EXEC_URL not set. Paste your Apps Script /exec URL into api.js.")
    );
  }

  return new Promise((resolve, reject) => {
    const cbName = `__swap_jsonp_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    let script, timer;

    const onWindowError = (ev) => {
      // If Apps Script returns HTML/login page, browser often throws:
      // "Unexpected token '<'" with filename pointing to script.googleusercontent.com...
      const msg = String(ev?.message || "");
      const file = String(ev?.filename || "");
      const looksLikeOurScript =
        file.includes("script.googleusercontent.com") ||
        file.includes("script.google.com") ||
        file.includes(execUrl);

      if (looksLikeOurScript && (msg.includes("Unexpected token") || msg.includes("<"))) {
        cleanup();
        reject(
          new Error(
            "Apps Script did NOT return JSONP JavaScript (it returned HTML/login/permission page). " +
              "Fix: Deploy web app as 'Anyone' and use the /exec URL (not /dev)."
          )
        );
      }
    };

    const cleanup = () => {
      try {
        window.removeEventListener("error", onWindowError);
      } catch (e) {}
      try {
        delete window[cbName];
      } catch (e) {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    };

    window.addEventListener("error", onWindowError);

    window[cbName] = (data) => {
      cleanup();
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

    script = document.createElement("script");
    script.src = src;
    script.async = true;

    script.onerror = () => {
      cleanup();
      reject(
        new Error(
          "JSONP request failed to load. Check SWAP_EXEC_URL, deployment access, and that you're using /exec."
        )
      );
    };

    timer = setTimeout(() => {
      cleanup();
      reject(new Error("Request timed out."));
    }, timeoutMs);

    document.head.appendChild(script);
  }).then((res) => {
    if (!res) throw new Error("Empty response");
    if (res.ok === false) throw new Error(res.error || "Request failed");
    return res;
  });
}

function safeStr(s, max = 200) {
  s = String(s || "").trim();
  return s.length > max ? s.slice(0, max) : s;
}
function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function firstNonEmpty(...vals) {
  for (const v of vals) {
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

export const API = {
  health: () => jsonp({ route: "health" }, { timeoutMs: 20000 }),
  meta: () => jsonp({ route: "meta" }, { timeoutMs: 20000 }),

  foods: (q, { limit = 25, group = "" } = {}) =>
    jsonp(
      { route: "foods", q: safeStr(q, 80), limit: String(limit), group: safeStr(group, 40) },
      { timeoutMs: 25000 }
    ),

  food: (id) => jsonp({ route: "food", id: String(id || "").trim() }, { timeoutMs: 25000 }),

  swap: ({ id, portion_g, tol = 0.05, flex = 0, limit = 12, same_group = 1 }) =>
    jsonp(
      {
        route: "swap",
        id: String(id || "").trim(),
        portion_g: String(num(portion_g, 0)),
        tol: String(num(tol, 0.05)),
        flex: String(flex ? 1 : 0),
        limit: String(limit),
        same_group: String(same_group ? 1 : 0),
      },
      { timeoutMs: 35000 }
    ),

  // Meal plan generation can take longer (cold start + OpenAI)
  generatePlan: async (profile, computed) => {
    const calories = Math.round(num(computed?.caloriesTarget, 0));
    const protein_g = Math.round(num(computed?.proteinGTarget, 0));
    const dietary = safeStr(profile?.dietary, 200);
    const allergens = safeStr(profile?.allergens, 200);
    const weekStart = startOfWeekISO(new Date());

    return jsonp(
      {
        route: "plan",
        calories: String(calories),
        protein_g: String(protein_g),
        dietary,
        allergens,
        week_start: weekStart,
      },
      { timeoutMs: 120000 }
    );
  },

  suggestSwaps: async (context) => {
    const item = context?.item || {};
    const id = firstNonEmpty(item.id, item.foodId, item.food_id);
    const name = safeStr(item.name, 120);

    const portion_g =
      num(item.portion_g, 0) ||
      num(item.portionG, 0) ||
      num(item.grams, 0) ||
      num(item.g, 0) ||
      100;

    return jsonp(
      {
        route: "suggestswaps",
        id: String(id || "").trim(),
        name,
        portion_g: String(portion_g),
        tol: "0.05",
        flex: "0",
        limit: "12",
        same_group: "1",
      },
      { timeoutMs: 45000 }
    );
  },

  generateRecipe: async ({ day, profile }) => {
    const names = [];
    const meals = day?.meals || [];
    for (const meal of meals) {
      const items = meal?.items || [];
      for (const it of items) if (it?.name) names.push(String(it.name).trim());
    }

    const foods = names.filter(Boolean).slice(0, 30).join("|");
    const dietary = safeStr(profile?.dietary, 200);
    const allergens = safeStr(profile?.allergens, 200);

    return jsonp({ route: "recipe", foods, dietary, allergens }, { timeoutMs: 120000 });
  },

  setExecUrl,
};

function startOfWeekISO(dt) {
  const d = new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  d.setDate(d.getDate() - d.getDay()); // Sunday start
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
}
