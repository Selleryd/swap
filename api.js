// api.js (SWAP) — JSONP client for Google Apps Script (NO iframe bridge)
// Paste as /swap/api.js
//
// REQUIRED:
// - Put your Apps Script Web App /exec URL into SWAP_EXEC_URL below.
// - Your Apps Script must support JSONP: respond as `${callback}(<json>);`
// - Your Apps Script must expose a "plan" route (or one of the fallbacks listed below)
//   that returns a real AI-generated week plan using OpenAI + your DB.
//
// This file exports:
//   export const API
//   export default API

const SWAP_EXEC_URL =
  (globalThis.__SWAP_CONFIG__ && globalThis.__SWAP_CONFIG__.EXEC_URL) ||
  globalThis.localStorage?.getItem("SWAP_EXEC_URL") ||
  "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec";

// ---------- JSONP core ----------
function jsonp(params = {}, { timeoutMs = 25000 } = {}) {
  const execUrl = String(SWAP_EXEC_URL || "").trim();
  if (!execUrl || execUrl.includes("PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE")) {
    return Promise.reject(
      new Error("SWAP_EXEC_URL not set. Paste your Apps Script /exec URL into api.js.")
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

    function cleanup(script) {
      if (timer) clearTimeout(timer);
      try {
        delete globalThis[cbName];
      } catch {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    globalThis[cbName] = (data) => {
      if (done) return;
      done = true;
      cleanup(script);
      resolve(data);
    };

    const script = document.createElement("script");
    script.async = true;
    script.src = src;

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup(script);
      reject(new Error("JSONP load failed. Check Apps Script deployment access + URL."));
    };

    timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup(script);
      reject(new Error("JSONP timeout. Check Apps Script deployment + callback support."));
    }, timeoutMs);

    document.head.appendChild(script);
  });
}

async function callRoute(route, p = {}) {
  const out = await jsonp({ route, ...p });
  if (out && typeof out === "object") return out;
  return { ok: false, error: "Invalid response from backend", raw: out };
}

// ---------- date helpers ----------
function toISODate(d) {
  const dt = new Date(d);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const day = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfWeekDate(date = new Date(), weekStartsOn = 0) {
  // 0=Sunday (matches your screenshot week starting Sunday 12/28/2025)
  const d = new Date(date);
  const dow = d.getDay();
  const diff = (dow - weekStartsOn + 7) % 7;
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

// ---------- normalization (make app.js happy no matter what backend returns) ----------
const SLOT_KEYS = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"];
const SLOT_UPPER = ["BREAKFAST", "SNACK_AM", "LUNCH", "SNACK_PM", "DINNER"];
const SLOT_LABEL = {
  breakfast: "Breakfast",
  snack_am: "Snack (AM)",
  lunch: "Lunch",
  snack_pm: "Snack (PM)",
  dinner: "Dinner",
};

function normalizeItem(it) {
  if (!it || typeof it !== "object") return null;

  const id =
    it.id ??
    it.food_id ??
    it.foodId ??
    it.FoodID ??
    it["Food ID"] ??
    it.usda_id ??
    it.usdaId ??
    null;

  const name =
    it.name ??
    it.food_name ??
    it.foodName ??
    it.FoodName ??
    it["Food Name"] ??
    it.label ??
    "Food";

  const portion_g =
    safeNum(it.portion_g, NaN) ??
    safeNum(it.grams, NaN) ??
    safeNum(it.g, NaN) ??
    safeNum(it.amount_g, NaN);

  const calories =
    safeNum(it.calories, NaN) ??
    safeNum(it.kcal, NaN) ??
    safeNum(it.energy_kcal, NaN);

  const protein_g =
    safeNum(it.protein_g, NaN) ??
    safeNum(it.protein, NaN) ??
    safeNum(it.proteinGrams, NaN);

  const carbs_g =
    safeNum(it.carbs_g, NaN) ??
    safeNum(it.carbs, NaN) ??
    safeNum(it.carbohydrates_g, NaN);

  const fat_g =
    safeNum(it.fat_g, NaN) ??
    safeNum(it.fat, NaN) ??
    safeNum(it.fatGrams, NaN);

  // Keep original fields and add aliases your UI might check
  const out = {
    ...it,
    id,
    food_id: id,
    foodId: id,

    name,
    label: name,

    portion_g: Number.isFinite(portion_g) ? Math.round(portion_g) : null,
    grams: Number.isFinite(portion_g) ? Math.round(portion_g) : null,

    calories: Number.isFinite(calories) ? Math.round(calories) : null,
    kcal: Number.isFinite(calories) ? Math.round(calories) : null,

    protein_g: Number.isFinite(protein_g) ? +protein_g.toFixed(1) : null,
    carbs_g: Number.isFinite(carbs_g) ? +carbs_g.toFixed(1) : null,
    fat_g: Number.isFinite(fat_g) ? +fat_g.toFixed(1) : null,

    protein: Number.isFinite(protein_g) ? +protein_g.toFixed(1) : null,
    carbs: Number.isFinite(carbs_g) ? +carbs_g.toFixed(1) : null,
    fat: Number.isFinite(fat_g) ? +fat_g.toFixed(1) : null,
  };

  return out;
}

function normalizeSlot(slotVal) {
  // Accept:
  // - array of items
  // - object with items/foods/list
  // - null
  if (!slotVal) return { items: [], foods: [], list: [] };

  if (Array.isArray(slotVal)) {
    const items = slotVal.map(normalizeItem).filter(Boolean);
    return { items, foods: items, list: items };
  }

  if (typeof slotVal === "object") {
    const raw =
      slotVal.items ??
      slotVal.foods ??
      slotVal.list ??
      slotVal.mealItems ??
      slotVal.entries ??
      [];
    const arr = Array.isArray(raw) ? raw : [];
    const items = arr.map(normalizeItem).filter(Boolean);

    // preserve metadata like title/type if present
    return {
      ...slotVal,
      items,
      foods: slotVal.foods ? items : items,
      list: slotVal.list ? items : items,
    };
  }

  return { items: [], foods: [], list: [] };
}

function normalizeDay(day, idx, weekStartISO) {
  const base = (day && typeof day === "object") ? { ...day } : {};

  // date
  let date =
    base.date ??
    base.day ??
    base.iso ??
    base.dayISO ??
    base["date"] ??
    null;

  if (!date || isNaN(Date.parse(date))) {
    // derive from week_start
    const w = new Date(weekStartISO);
    date = toISODate(addDays(w, idx));
  } else {
    date = toISODate(new Date(date));
  }

  // collect slots from many possible schemas
  const mealsObj = base.meals && typeof base.meals === "object" ? base.meals : {};

  const slots = {};
  for (let i = 0; i < SLOT_KEYS.length; i++) {
    const k = SLOT_KEYS[i];
    const up = SLOT_UPPER[i];

    const candidate =
      base[k] ??
      base[up] ??
      mealsObj[k] ??
      mealsObj[up] ??
      mealsObj[SLOT_LABEL[k]] ??
      null;

    slots[k] = normalizeSlot(candidate);
  }

  // also accept schema where meals is an array [{slot:'breakfast', items:[...]}]
  if (Array.isArray(base.meals)) {
    for (const m of base.meals) {
      const slotKey =
        (m && (m.slot || m.key || m.type || m.name || ""))?.toString()?.toLowerCase() || "";
      const mapped =
        slotKey.includes("break") ? "breakfast" :
        slotKey.includes("am") ? "snack_am" :
        slotKey.includes("lunch") ? "lunch" :
        slotKey.includes("pm") ? "snack_pm" :
        slotKey.includes("dinner") ? "dinner" : "";

      if (mapped) slots[mapped] = normalizeSlot(m.items ?? m.foods ?? m.list ?? m);
    }
  }

  // build compatibility views
  const meals = {
    breakfast: slots.breakfast,
    snack_am: slots.snack_am,
    lunch: slots.lunch,
    snack_pm: slots.snack_pm,
    dinner: slots.dinner,
  };

  const mealsArray = SLOT_KEYS.map((k) => ({
    slot: k,
    key: k,
    name: SLOT_LABEL[k],
    title: SLOT_LABEL[k],
    items: meals[k].items,
    foods: meals[k].items,
    list: meals[k].items,
  }));

  // Top-level arrays (some UIs use day.breakfast as an array)
  const out = {
    ...base,
    date,

    // nested
    meals,
    mealsArray,
    slots: meals,           // alias
    schedule: meals,        // alias

    // direct arrays (compat)
    breakfast: meals.breakfast.items,
    snack_am: meals.snack_am.items,
    lunch: meals.lunch.items,
    snack_pm: meals.snack_pm.items,
    dinner: meals.dinner.items,

    // direct objects (compat)
    BREAKFAST: meals.breakfast,
    SNACK_AM: meals.snack_am,
    LUNCH: meals.lunch,
    SNACK_PM: meals.snack_pm,
    DINNER: meals.dinner,
  };

  return out;
}

function normalizePlan(planLike) {
  const p = (planLike && typeof planLike === "object") ? { ...planLike } : {};

  // find week_start
  let week_start =
    p.week_start ??
    p.weekStart ??
    p.startDate ??
    p.weekStartISO ??
    p.week_of ??
    p.weekOf ??
    null;

  if (!week_start || isNaN(Date.parse(week_start))) {
    // default: week starts Sunday to match your UI screenshot
    week_start = toISODate(startOfWeekDate(new Date(), 0));
  } else {
    week_start = toISODate(new Date(week_start));
  }

  // find days array
  const rawDays =
    p.days ??
    p.week ??
    p.plan_days ??
    p.weekDays ??
    p.calendar ??
    [];

  const daysArr = Array.isArray(rawDays) ? rawDays : [];
  const normalizedDays =
    daysArr.length
      ? daysArr.map((d, i) => normalizeDay(d, i, week_start))
      : Array.from({ length: 7 }, (_, i) => normalizeDay({}, i, week_start));

  // totals (optional)
  const totals = p.totals ?? p.macros ?? p.summary ?? {};

  return {
    ...p,

    week_start,
    weekStart: week_start,
    startDate: week_start,
    week_of: week_start,
    weekOf: week_start,

    days: normalizedDays,
    week: normalizedDays,

    totals,
  };
}

function wrapPlan(plan) {
  // Return plan in every common wrapper so app.js can't miss it
  const p = normalizePlan(plan);

  return {
    ok: true,

    // common wrappers
    plan: p,
    weekPlan: p,
    data: p,
    result: p,

    // top-level aliases
    ...p,

    // convenience
    week_start: p.week_start,
    days: p.days,
    week: p.week,
    totals: p.totals,
  };
}

// ---------- plan route discovery ----------
async function fetchPlanFromBackend(options = {}) {
  // We try multiple routes because I don't know what you named it in Code.gs.
  // Your Code.gs needs ONE of these to exist and return a plan-like object.
  const ROUTES = [
    "plan",
    "mealplan",
    "weekplan",
    "generatePlan",
    "generate_plan",
    "ai_plan",
    "aiMealPlan",
  ];

  // Always cache-bust so regenerate actually regenerates
  const baseParams = {
    ...options,
    t: Date.now(),
  };

  // If user didn't pass week_start, set it (Sunday-start)
  if (!baseParams.week_start && !baseParams.weekStart && !baseParams.startDate) {
    baseParams.week_start = toISODate(startOfWeekDate(new Date(), 0));
  }

  let lastErr = null;

  for (const r of ROUTES) {
    try {
      const res = await callRoute(r, baseParams);

      // A bunch of backends use {ok:true, plan:{...}} OR just return plan object.
      const maybePlan =
        res?.plan ??
        res?.weekPlan ??
        res?.data ??
        res?.result ??
        res;

      const ok =
        res?.ok === true ||
        (maybePlan && typeof maybePlan === "object" && (maybePlan.days || maybePlan.week || maybePlan.week_start));

      if (ok && maybePlan && typeof maybePlan === "object") {
        return wrapPlan(maybePlan);
      }

      lastErr = new Error(res?.error || `Route ${r} returned no plan`);
    } catch (e) {
      lastErr = e;
    }
  }

  // If we got here: backend doesn't have a plan route (or JSONP callback not implemented).
  throw lastErr || new Error("No plan route found on backend.");
}

// ---------- other routes ----------
async function routeFoods({ q = "", limit = 50, group = "" } = {}) {
  const res = await callRoute("foods", { q, limit, group, t: Date.now() });
  const arr = res?.foods || res?.items || res?.data || (Array.isArray(res) ? res : []);
  return { ...res, foods: Array.isArray(arr) ? arr : [] };
}

// ---------- exported API ----------
export const API = {
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

  // diagnostics
  health() {
    return callRoute("health", { t: Date.now() });
  },
  meta() {
    return callRoute("meta", { t: Date.now() });
  },

  // foods + swaps (DB-powered)
  foods({ q = "", limit = 50, group = "" } = {}) {
    return routeFoods({ q, limit, group });
  },
  food({ id } = {}) {
    return callRoute("food", { id, t: Date.now() });
  },
  swap({ id, portion_g = 100, tol = 0.05, flex = 0, limit = 12, same_group = 1 } = {}) {
    return callRoute("swap", { id, portion_g, tol, flex, limit, same_group, t: Date.now() });
  },

  // REAL AI WEEK PLAN (Apps Script must do OpenAI + DB mapping)
  async generatePlan(options = {}) {
    // options can include user profile fields your Code.gs expects:
    // height_cm, weight_kg, goal, activity, calories_target, protein_target, etc.
    return fetchPlanFromBackend(options);
  },

  async regeneratePlan(options = {}) {
    // Force a new plan each time (backend should not return cached)
    return fetchPlanFromBackend({ ...options, seed: Date.now(), t: Date.now() });
  },

  // extra aliases (some app.js versions call these)
  generateMealPlan(options = {}) {
    return this.generatePlan(options);
  },
  regenerateMealPlan(options = {}) {
    return this.regeneratePlan(options);
  },
};

export default API;
