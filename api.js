// api.js (ESM) — SWAP JSONP client for Google Apps Script (no bridge/iframe)
//
// ✅ Paste this entire file into: /swap/api.js
// ✅ Set GAS_EXEC_URL below to your Apps Script /exec URL
//
// Your Apps Script must support JSONP via: ?callback=cbName  (your Code.gs already does)

"use strict";

/** 1) SET THIS */
const GAS_EXEC_URL = https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec
  // prefer an explicit global if you set one elsewhere
  (typeof window !== "undefined" && (window.SWAP_GAS_EXEC_URL || window.GAS_EXEC_URL)) ||
  // or persisted setting
  (typeof localStorage !== "undefined" && localStorage.getItem("SWAP_GAS_EXEC_URL")) ||
  // fallback placeholder
  "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec";

/** JSONP defaults */
const JSONP_TIMEOUT_MS = 15000;
const JSONP_CB_PREFIX = "__swap_jsonp_cb__";

/** tiny utils */
function qs(obj = {}) {
  const u = new URLSearchParams();
  Object.entries(obj).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    u.set(k, String(v));
  });
  return u.toString();
}

function startOfWeekISO_(d) {
  // Monday as first day
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun..6 Sat
  const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function fmtWeekLabel_(weekStartISO) {
  const d = new Date(weekStartISO);
  if (Number.isNaN(d.getTime())) return "Week Plan";
  const s = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `Week of ${s}`;
}

function dayLabel_(dateObj) {
  return dateObj.toLocaleDateString(undefined, { weekday: "short" }); // Mon, Tue...
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

function randPick(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeFood_(f) {
  if (!f || typeof f !== "object") return null;
  // accept multiple shapes
  const id = f.id || f.food_id || f.fdcId || f.key || f.slug || f.name;
  const name = f.name || f.title || f.description || f.food_name || "Food";
  const serving_g = Number(f.serving_g ?? f.servingG ?? f.portion_g ?? f.portionG ?? f.grams ?? 100) || 100;

  // macros-per-serving if present (your sheet uses per_serving)
  const ps = f.per_serving || f.perServing || f.macros || {};
  const p = Number(ps.p ?? ps.protein ?? f.p ?? f.protein ?? 0) || 0;
  const c = Number(ps.c ?? ps.carbs ?? f.c ?? f.carbs ?? 0) || 0;
  const fat = Number(ps.f ?? ps.fat ?? f.f ?? f.fat ?? 0) || 0;

  // estimate kcal if not provided
  const kcal =
    Number(ps.kcal ?? ps.calories ?? f.kcal ?? f.calories) ||
    Math.round(p * 4 + c * 4 + fat * 9);

  const units = f.units || { serving: serving_g, g: 1, oz: 28.35 };
  return {
    ...f,
    id,
    name,
    serving_g,
    units,
    per_serving: {
      ...(typeof ps === "object" ? ps : {}),
      p,
      c,
      f: fat,
      kcal,
    },
  };
}

function mealItemFromFood_(food, portion_g) {
  const f = normalizeFood_(food);
  if (!f) return null;

  const baseG = Number(f.serving_g) || 100;
  const ratio = (Number(portion_g) || baseG) / baseG;

  const p = Math.round((f.per_serving?.p || 0) * ratio * 10) / 10;
  const c = Math.round((f.per_serving?.c || 0) * ratio * 10) / 10;
  const fat = Math.round((f.per_serving?.f || 0) * ratio * 10) / 10;
  const kcal = Math.round((f.per_serving?.kcal || 0) * ratio);

  return {
    id: f.id,
    name: f.name,
    portion_g: Math.round((Number(portion_g) || baseG) * 10) / 10,
    units: f.units || { g: 1, oz: 28.35, serving: baseG },
    macros: { kcal, p, c, f: fat },
    // keep original around for swaps UX if needed
    _food: f,
  };
}

function sumMeal_(items) {
  const totals = { kcal: 0, p: 0, c: 0, f: 0 };
  for (const it of items || []) {
    const m = it?.macros || {};
    totals.kcal += Number(m.kcal || 0);
    totals.p += Number(m.p || 0);
    totals.c += Number(m.c || 0);
    totals.f += Number(m.f || 0);
  }
  totals.kcal = Math.round(totals.kcal);
  totals.p = Math.round(totals.p * 10) / 10;
  totals.c = Math.round(totals.c * 10) / 10;
  totals.f = Math.round(totals.f * 10) / 10;
  return totals;
}

/** JSONP core */
function jsonp_(url, timeoutMs = JSONP_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const cbName = `${JSONP_CB_PREFIX}${Date.now()}_${Math.floor(Math.random() * 1e9)}`;

    const cleanup = () => {
      try {
        delete window[cbName];
      } catch {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };

    const glue = url.includes("?") ? "&" : "?";
    const script = document.createElement("script");
    script.src = `${url}${glue}callback=${encodeURIComponent(cbName)}`;
    script.async = true;
    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP load error"));
    };
    document.head.appendChild(script);
  });
}

async function gas_(params) {
  const base = GAS_EXEC_URL;
  if (!base || base.includes("PASTE_YOUR_DEPLOYMENT_ID")) {
    throw new Error("Missing GAS_EXEC_URL (paste your Apps Script /exec URL into api.js)");
  }
  const url = `${base}?${qs(params)}`;
  const out = await jsonp_(url);
  // normalize common response shapes
  if (out && typeof out === "object" && "ok" in out) {
    if (!out.ok) throw new Error(out.error || "Backend error");
    return out;
  }
  return out;
}

async function safeFoods_(group, limit = 200) {
  try {
    const out = await gas_({ route: "foods", q: "", group: group || "", limit });
    // your backend might return { ok:true, foods:[...] } or { ok:true, data:[...] } or { ok:true, items:[...] }
    const list =
      out.foods || out.data || out.items || out.results || (Array.isArray(out) ? out : []);
    return (list || []).map(normalizeFood_).filter(Boolean);
  } catch {
    return [];
  }
}

function safeGetStoredProfile_() {
  try {
    const raw = localStorage.getItem("SWAP_PROFILE");
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Public API expected by app.js */
export const API = {
  // Optional helper if you want to change URLs without editing code
  setExecUrl(url) {
    if (!url) return;
    try {
      localStorage.setItem("SWAP_GAS_EXEC_URL", String(url));
      window.SWAP_GAS_EXEC_URL = String(url);
    } catch {}
  },

  async health() {
    const out = await gas_({ route: "health" });
    return out;
  },

  async meta() {
    const out = await gas_({ route: "meta" });
    return out;
  },

  async searchFoods(q = "", { group = "", limit = 25 } = {}) {
    const out = await gas_({ route: "foods", q: q || "", group: group || "", limit: limit || 25 });
    const list = out.foods || out.data || out.items || out.results || [];
    return (list || []).map(normalizeFood_).filter(Boolean);
  },

  async getFood(id) {
    if (!id) throw new Error("Missing food id");
    const out = await gas_({ route: "food", id });
    const f = normalizeFood_(out.food || out.data || out.item || out);
    return f;
  },

  async getSwaps(id, { portion_g = null, tol = null, flex = null, limit = 12, same_group = 1 } = {}) {
    if (!id) throw new Error("Missing food id");
    const out = await gas_({
      route: "swap",
      id,
      portion_g: portion_g ?? undefined,
      tol: tol ?? undefined,
      flex: flex ?? undefined,
      limit: limit ?? 12,
      same_group: same_group ? 1 : 0,
    });

    const list = out.swaps || out.data || out.items || out.results || [];
    return (list || []).map(normalizeFood_).filter(Boolean);
  },

  /**
   * generatePlan(profile?)
   * Returns a shape that won't cause "Invalid Date" and matches typical UI expectations:
   * {
   *   ok:true,
   *   plan: {
   *     weekStart: ISO,
   *     weekLabel: "Week of ...",
   *     days: [
   *       { date: ISO, label:"Mon", meals:{ breakfast:[], snack_am:[], lunch:[], snack_pm:[], dinner:[] }, totals:{} }
   *     ],
   *     totals:{...}
   *   }
   * }
   */
  async generatePlan(profile = null) {
    const stored = safeGetStoredProfile_();
    const p = profile || stored || {};

    const targetKcal = Number(p?.targets?.kcal ?? p?.kcal ?? p?.calories ?? 2200) || 2200;
    const targetProtein = Number(p?.targets?.protein ?? p?.protein ?? 140) || 140;

    // Pull pools from your Foods sheet (group is optional in backend; falls back gracefully)
    const [proteins, carbs, fats, veg, general] = await Promise.all([
      safeFoods_("protein", 300),
      safeFoods_("carb", 300),
      safeFoods_("fat", 300),
      safeFoods_("vegetable", 300),
      safeFoods_("", 500),
    ]);

    const poolProtein = proteins.length ? proteins : general;
    const poolCarb = carbs.length ? carbs : general;
    const poolFat = fats.length ? fats : general;
    const poolVeg = veg.length ? veg : general;
    const poolAny = general.length ? general : poolProtein;

    const weekStart = startOfWeekISO_(new Date());
    const weekLabel = fmtWeekLabel_(weekStart);
    const weekStartDate = new Date(weekStart);

    const days = [];

    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStartDate);
      d.setDate(weekStartDate.getDate() + i);

      const dateISO = d.toISOString(); // ✅ never invalid for Date parsing
      const label = dayLabel_(d);

      // kcal split for 3 meals + 2 snacks
      const kcalBreakfast = targetKcal * 0.25;
      const kcalSnackAM = targetKcal * 0.10;
      const kcalLunch = targetKcal * 0.28;
      const kcalSnackPM = targetKcal * 0.10;
      const kcalDinner = targetKcal * 0.27;

      // Build meals (best-effort macro-balanced using your DB)
      const breakfast = buildMeal_(poolProtein, poolCarb, poolFat, poolAny, kcalBreakfast);
      const snack_am = buildSnack_(poolProtein, poolCarb, poolAny, kcalSnackAM);
      const lunch = buildMeal_(poolProtein, poolCarb, poolFat, poolVeg, kcalLunch);
      const snack_pm = buildSnack_(poolProtein, poolCarb, poolAny, kcalSnackPM);
      const dinner = buildMeal_(poolProtein, poolCarb, poolFat, poolVeg, kcalDinner);

      const meals = { breakfast, snack_am, lunch, snack_pm, dinner };
      const totals = sumMeal_([...(breakfast || []), ...(snack_am || []), ...(lunch || []), ...(snack_pm || []), ...(dinner || [])]);

      days.push({ date: dateISO, label, meals, totals });
    }

    const weekTotals = days.reduce(
      (acc, day) => {
        acc.kcal += Number(day?.totals?.kcal || 0);
        acc.p += Number(day?.totals?.p || 0);
        acc.c += Number(day?.totals?.c || 0);
        acc.f += Number(day?.totals?.f || 0);
        return acc;
      },
      { kcal: 0, p: 0, c: 0, f: 0 }
    );

    weekTotals.kcal = Math.round(weekTotals.kcal);
    weekTotals.p = Math.round(weekTotals.p * 10) / 10;
    weekTotals.c = Math.round(weekTotals.c * 10) / 10;
    weekTotals.f = Math.round(weekTotals.f * 10) / 10;

    const plan = {
      weekStart,
      weekLabel,
      targets: { kcal: targetKcal, protein: targetProtein },
      days,
      totals: weekTotals,
      generatedAt: new Date().toISOString(),
    };

    // return BOTH shapes so your UI won't miss it
    return { ok: true, plan, ...plan };
  },

  async refreshCache() {
    const out = await gas_({ route: "refreshcache" });
    return out;
  },
};

export default API;

/* ------------------------
   Meal builders (local)
------------------------- */

function buildMeal_(poolProtein, poolCarb, poolFat, poolSide, targetKcal) {
  // pick components
  const p = randPick(poolProtein) || randPick(poolSide);
  const c = randPick(poolCarb) || randPick(poolSide);
  const f = randPick(poolFat) || randPick(poolSide);
  const s = randPick(poolSide);

  // approximate portions (grams)
  const pG = clamp((targetKcal * 0.35) / ( (normalizeFood_(p)?.per_serving?.kcal || 200) / (normalizeFood_(p)?.serving_g || 100) ), 80, 260);
  const cG = clamp((targetKcal * 0.35) / ( (normalizeFood_(c)?.per_serving?.kcal || 180) / (normalizeFood_(c)?.serving_g || 100) ), 60, 260);
  const fG = clamp((targetKcal * 0.20) / ( (normalizeFood_(f)?.per_serving?.kcal || 120) / (normalizeFood_(f)?.serving_g || 100) ), 10, 80);
  const sG = clamp((targetKcal * 0.10) / ( (normalizeFood_(s)?.per_serving?.kcal || 60) / (normalizeFood_(s)?.serving_g || 100) ), 30, 250);

  const items = [
    mealItemFromFood_(p, pG),
    mealItemFromFood_(c, cG),
    mealItemFromFood_(f, fG),
    mealItemFromFood_(s, sG),
  ].filter(Boolean);

  return items;
}

function buildSnack_(poolProtein, poolCarb, poolAny, targetKcal) {
  const a = randPick(poolProtein) || randPick(poolAny);
  const b = randPick(poolCarb) || randPick(poolAny);

  const aG = clamp((targetKcal * 0.55) / ( (normalizeFood_(a)?.per_serving?.kcal || 180) / (normalizeFood_(a)?.serving_g || 100) ), 40, 200);
  const bG = clamp((targetKcal * 0.45) / ( (normalizeFood_(b)?.per_serving?.kcal || 140) / (normalizeFood_(b)?.serving_g || 100) ), 40, 200);

  const items = [mealItemFromFood_(a, aG), mealItemFromFood_(b, bG)].filter(Boolean);
  return items;
}
