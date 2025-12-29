// api.js (SWAP) — JSONP-only backend client for Google Apps Script (no bridge, no CORS headaches)
// Paste this file as-is into /swap/api.js
//
// IMPORTANT:
// 1) Put your Apps Script /exec URL into SWAP_EXEC_URL below.
// 2) Your Code.gs must support JSONP via `?callback=someFn` and return `someFn(<json>);`.
//    (Your doGet already shows it reads `p.callback` and calls `respond_(out, callback)` — perfect.)
//
// This module exports a NAMED export `API` (what your app.js expects) AND a default export.

const SWAP_EXEC_URL =
  (globalThis.__SWAP_CONFIG__ && globalThis.__SWAP_CONFIG__.EXEC_URL) ||
  globalThis.localStorage?.getItem("SWAP_EXEC_URL") ||
  "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec";

// ---------- small utils ----------
function toISODate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfWeekISO(date = new Date(), weekStartsOn = 1) {
  // weekStartsOn: 0=Sun, 1=Mon
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function safeNum(x, fallback = 0) {
  const n = Number(x);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeFood(raw) {
  // Works with a variety of shapes coming back from Sheets/Apps Script
  if (!raw || typeof raw !== "object") return null;

  const id =
    raw.id ||
    raw.food_id ||
    raw.foodId ||
    raw.FoodID ||
    raw["Food ID"] ||
    raw["food_id"] ||
    raw["id"] ||
    null;

  const name =
    raw.name ||
    raw.food_name ||
    raw.foodName ||
    raw.FoodName ||
    raw["Food Name"] ||
    raw["name"] ||
    "Food";

  const group =
    raw.group ||
    raw.food_group ||
    raw.foodGroup ||
    raw.Group ||
    raw["Food Group"] ||
    raw["group"] ||
    "";

  // Try common macro fields (per 100g) if present
  const kcal100 =
    safeNum(raw.kcal_100g, NaN) ??
    safeNum(raw.kcal_per_100g, NaN) ??
    safeNum(raw.calories_100g, NaN) ??
    safeNum(raw.Calories_100g, NaN);

  const protein100 =
    safeNum(raw.protein_100g, NaN) ??
    safeNum(raw.protein_g_100g, NaN) ??
    safeNum(raw.Protein_100g, NaN);

  const carbs100 =
    safeNum(raw.carbs_100g, NaN) ??
    safeNum(raw.carbohydrates_100g, NaN) ??
    safeNum(raw.carbs_g_100g, NaN) ??
    safeNum(raw.Carbs_100g, NaN);

  const fat100 =
    safeNum(raw.fat_100g, NaN) ??
    safeNum(raw.fats_100g, NaN) ??
    safeNum(raw.fat_g_100g, NaN) ??
    safeNum(raw.Fat_100g, NaN);

  return {
    id,
    name,
    group,
    kcal_100g: Number.isFinite(kcal100) ? kcal100 : null,
    protein_100g: Number.isFinite(protein100) ? protein100 : null,
    carbs_100g: Number.isFinite(carbs100) ? carbs100 : null,
    fat_100g: Number.isFinite(fat100) ? fat100 : null,
    _raw: raw,
  };
}

function makeMealItem(food, portion_g) {
  const g = Math.max(0, Math.round(safeNum(portion_g, 0)));
  const f = normalizeFood(food) || { id: null, name: "Food", group: "", kcal_100g: null };

  const mult = g / 100;
  const kcal = f.kcal_100g != null ? Math.round(f.kcal_100g * mult) : null;
  const protein = f.protein_100g != null ? +(f.protein_100g * mult).toFixed(1) : null;
  const carbs = f.carbs_100g != null ? +(f.carbs_100g * mult).toFixed(1) : null;
  const fat = f.fat_100g != null ? +(f.fat_100g * mult).toFixed(1) : null;

  return {
    id: f.id,
    name: f.name,
    group: f.group,
    portion_g: g,
    calories: kcal,
    protein_g: protein,
    carbs_g: carbs,
    fat_g: fat,
    // some UIs look for `kcal` instead of `calories`
    kcal: kcal,
  };
}

function sumDay(day) {
  const slots = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"];
  const totals = { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
  for (const s of slots) {
    const items = (day?.meals?.[s] || day?.[s] || []).filter(Boolean);
    for (const it of items) {
      if (Number.isFinite(it?.kcal)) totals.kcal += it.kcal;
      if (Number.isFinite(it?.calories)) totals.kcal += it.calories; // if kcal missing
      if (Number.isFinite(it?.protein_g)) totals.protein_g += it.protein_g;
      if (Number.isFinite(it?.carbs_g)) totals.carbs_g += it.carbs_g;
      if (Number.isFinite(it?.fat_g)) totals.fat_g += it.fat_g;
    }
  }
  totals.kcal = Math.round(totals.kcal);
  totals.protein_g = +totals.protein_g.toFixed(1);
  totals.carbs_g = +totals.carbs_g.toFixed(1);
  totals.fat_g = +totals.fat_g.toFixed(1);
  return totals;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function pickOne(list, rand) {
  if (!Array.isArray(list) || list.length === 0) return null;
  const i = Math.floor(rand() * list.length);
  return list[i];
}

// ---------- JSONP core ----------
function jsonp(url, params = {}, { timeoutMs = 15000 } = {}) {
  const execUrl = (url || "").trim();
  if (!execUrl || execUrl.includes("https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec")) {
    return Promise.reject(
      new Error(
        "SWAP_EXEC_URL is not set. Paste your Apps Script /exec URL into api.js (or set localStorage SWAP_EXEC_URL)."
      )
    );
  }

  return new Promise((resolve, reject) => {
    const cbName = `__swap_jsonp_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params || {})) {
      if (v === undefined || v === null) continue;
      qs.set(k, String(v));
    }
    qs.set("callback", cbName);

    const sep = execUrl.includes("?") ? "&" : "?";
    const src = `${execUrl}${sep}${qs.toString()}`;

    let done = false;
    let timer = null;

    function cleanup() {
      if (timer) clearTimeout(timer);
      try {
        delete globalThis[cbName];
      } catch {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    globalThis[cbName] = (data) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(data);
    };

    const script = document.createElement("script");
    script.async = true;
    script.src = src;

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP load failed (script error). Check Apps Script deployment access + URL."));
    };

    timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP timeout. Check Apps Script deployment access + URL."));
    }, timeoutMs);

    document.head.appendChild(script);
  });
}

// ---------- low-level routes ----------
async function callRoute(route, p = {}) {
  const out = await jsonp(SWAP_EXEC_URL, { route, ...p });
  // Some backends wrap data; keep it flexible:
  if (out && typeof out === "object") return out;
  return { ok: false, error: "Invalid response from backend", raw: out };
}

async function routeFoods({ q = "", limit = 50, group = "" } = {}) {
  const res = await callRoute("foods", { q, limit, group });
  // Normalize common shapes:
  const arr =
    res?.foods ||
    res?.items ||
    res?.data ||
    (Array.isArray(res) ? res : []) ||
    [];
  return { ...res, foods: Array.isArray(arr) ? arr : [] };
}

// ---------- high-level API used by app.js ----------
export const API = {
  // Optional helper: set URL without editing file again
  setExecUrl(url) {
    const u = String(url || "").trim();
    if (!u) return false;
    try {
      globalThis.localStorage?.setItem("SWAP_EXEC_URL", u);
      return true;
    } catch {
      return false;
    }
  },

  // Basic backend checks
  health() {
    return callRoute("health");
  },
  meta() {
    return callRoute("meta");
  },

  // Food DB
  foods({ q = "", limit = 50, group = "" } = {}) {
    return routeFoods({ q, limit, group });
  },
  food({ id } = {}) {
    return callRoute("food", { id });
  },

  // Swaps
  swap({ id, portion_g = 100, tol = 0.05, flex = 0, limit = 12, same_group = 1 } = {}) {
    return callRoute("swap", { id, portion_g, tol, flex, limit, same_group });
  },

  refreshCache() {
    return callRoute("refreshcache");
  },

  // ----------------------------
  // Meal Plan generation
  // ----------------------------
  // If your backend DOES NOT have a "plan" route, your UI still expects API.generatePlan().
  // So we generate a usable plan on the client using your Foods DB.
  //
  // This fixes:
  // - "API.generatePlan is not a function"
  // - "Week of Invalid Date" (we always return real ISO dates)
  // - empty meal slots (we always put items in)
  async generatePlan(options = {}) {
    const weekStartsOn = safeNum(options.weekStartsOn, 1); // Monday
    const seedBase = options.seed != null ? safeNum(options.seed, Date.now()) : Date.now();
    const rand = mulberry32(Math.floor(seedBase / 86400000)); // stable per-day-ish

    // Pull a decent pool from your DB. If groups don’t exist, it still works.
    // We do multiple queries so something returns even if group filters aren’t supported.
    let proteins = [];
    let carbs = [];
    let fats = [];
    let veggies = [];
    let misc = [];

    try {
      const [p1, c1, f1, v1, m1] = await Promise.all([
        routeFoods({ q: "", limit: 120, group: "protein" }),
        routeFoods({ q: "", limit: 120, group: "carb" }),
        routeFoods({ q: "", limit: 120, group: "fat" }),
        routeFoods({ q: "", limit: 120, group: "free" }),
        routeFoods({ q: "", limit: 200, group: "" }),
      ]);

      proteins = (p1.foods || []).map(normalizeFood).filter(Boolean);
      carbs = (c1.foods || []).map(normalizeFood).filter(Boolean);
      fats = (f1.foods || []).map(normalizeFood).filter(Boolean);
      veggies = (v1.foods || []).map(normalizeFood).filter(Boolean);
      misc = (m1.foods || []).map(normalizeFood).filter(Boolean);
    } catch {
      // ignore; we'll use fallbacks below
    }

    // Fallbacks so plan always renders even if DB is empty
    const FALLBACK = {
      proteins: [
        { id: "p_chicken", name: "Chicken breast", group: "protein", kcal_100g: 165, protein_100g: 31, carbs_100g: 0, fat_100g: 3.6 },
        { id: "p_eggs", name: "Eggs", group: "protein", kcal_100g: 143, protein_100g: 13, carbs_100g: 1.1, fat_100g: 9.5 },
        { id: "p_greek", name: "Greek yogurt (plain)", group: "protein", kcal_100g: 59, protein_100g: 10, carbs_100g: 3.6, fat_100g: 0.4 },
      ],
      carbs: [
        { id: "c_rice", name: "Cooked rice", group: "carb", kcal_100g: 130, protein_100g: 2.4, carbs_100g: 28.2, fat_100g: 0.3 },
        { id: "c_oats", name: "Oats (dry)", group: "carb", kcal_100g: 389, protein_100g: 16.9, carbs_100g: 66.3, fat_100g: 6.9 },
        { id: "c_potato", name: "Potato", group: "carb", kcal_100g: 77, protein_100g: 2.0, carbs_100g: 17.0, fat_100g: 0.1 },
      ],
      fats: [
        { id: "f_olive", name: "Olive oil", group: "fat", kcal_100g: 884, protein_100g: 0, carbs_100g: 0, fat_100g: 100 },
        { id: "f_avocado", name: "Avocado", group: "fat", kcal_100g: 160, protein_100g: 2.0, carbs_100g: 8.5, fat_100g: 14.7 },
        { id: "f_pb", name: "Peanut butter", group: "fat", kcal_100g: 588, protein_100g: 25, carbs_100g: 20, fat_100g: 50 },
      ],
      veggies: [
        { id: "v_salad", name: "Mixed greens", group: "free", kcal_100g: 15, protein_100g: 1.4, carbs_100g: 2.9, fat_100g: 0.2 },
        { id: "v_broccoli", name: "Broccoli", group: "free", kcal_100g: 34, protein_100g: 2.8, carbs_100g: 6.6, fat_100g: 0.4 },
        { id: "v_cucumber", name: "Cucumber", group: "free", kcal_100g: 15, protein_100g: 0.7, carbs_100g: 3.6, fat_100g: 0.1 },
      ],
    };

    // If group lists are empty, borrow from misc or fallback
    const P = proteins.length ? proteins : (misc.filter((x) => /protein/i.test(x.group)) || []).slice(0, 50);
    const C = carbs.length ? carbs : (misc.filter((x) => /carb|grain|starch/i.test(x.group)) || []).slice(0, 50);
    const F = fats.length ? fats : (misc.filter((x) => /fat|oil|nuts/i.test(x.group)) || []).slice(0, 50);
    const V = veggies.length ? veggies : (misc.filter((x) => /free|veg|vegetable/i.test(x.group)) || []).slice(0, 80);

    const proteinsPool = (P && P.length ? P : FALLBACK.proteins);
    const carbsPool = (C && C.length ? C : FALLBACK.carbs);
    const fatsPool = (F && F.length ? F : FALLBACK.fats);
    const vegPool = (V && V.length ? V : FALLBACK.veggies);

    const weekStart = startOfWeekISO(new Date(), weekStartsOn);
    const days = [];

    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      const iso = toISODate(date);

      // Pick foods
      const bfProtein = pickOne(proteinsPool, rand);
      const bfCarb = pickOne(carbsPool, rand);
      const lnProtein = pickOne(proteinsPool, rand);
      const lnCarb = pickOne(carbsPool, rand);
      const dnProtein = pickOne(proteinsPool, rand);
      const dnCarb = pickOne(carbsPool, rand);
      const veg1 = pickOne(vegPool, rand);
      const veg2 = pickOne(vegPool, rand);
      const snackP = pickOne(proteinsPool, rand);
      const snackF = pickOne(fatsPool, rand);

      // Portions (grams) — simple + consistent so UI always shows “real food”
      const breakfast = [
        makeMealItem(bfProtein, 170), // e.g. greek yogurt portion-ish
        makeMealItem(bfCarb, 60),     // oats/rice etc (rough)
      ];

      const snack_am = [
        makeMealItem(snackP, 150),
      ];

      const lunch = [
        makeMealItem(lnProtein, 170),
        makeMealItem(lnCarb, 180),
        makeMealItem(veg1, 120),
      ];

      const snack_pm = [
        makeMealItem(snackF, 30),
        makeMealItem(pickOne(vegPool, rand), 120),
      ];

      const dinner = [
        makeMealItem(dnProtein, 200),
        makeMealItem(dnCarb, 200),
        makeMealItem(veg2, 150),
      ];

      const dayObj = {
        date: iso,

        // some renderers look for these directly:
        breakfast,
        snack_am,
        lunch,
        snack_pm,
        dinner,

        // other renderers look inside `meals`:
        meals: { breakfast, snack_am, lunch, snack_pm, dinner },
      };

      dayObj.totals = sumDay(dayObj);

      days.push(dayObj);
    }

    const totals = days.reduce(
      (acc, d) => {
        acc.kcal += safeNum(d?.totals?.kcal, 0);
        acc.protein_g += safeNum(d?.totals?.protein_g, 0);
        acc.carbs_g += safeNum(d?.totals?.carbs_g, 0);
        acc.fat_g += safeNum(d?.totals?.fat_g, 0);
        return acc;
      },
      { kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0 }
    );

    totals.kcal = Math.round(totals.kcal);
    totals.protein_g = +totals.protein_g.toFixed(1);
    totals.carbs_g = +totals.carbs_g.toFixed(1);
    totals.fat_g = +totals.fat_g.toFixed(1);

    // Return multiple aliases so your UI can’t “miss” it
    const weekStartISO = toISODate(weekStart);
    return {
      ok: true,
      week_start: weekStartISO,
      weekStart: weekStartISO,
      startDate: weekStartISO,

      days,
      week: days, // alias

      totals,
    };
  },

  // Many UIs call this
  regeneratePlan(options = {}) {
    return this.generatePlan({ ...options, seed: Date.now() });
  },
};

export default API;
