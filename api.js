// api.js (JSONP-only) — paste this entire file
// IMPORTANT: set EXEC_URL to your Apps Script Web App /exec URL.

const EXEC_URL = "https://script.google.com/macros/s/AKfycbw_XJ2cfqwDckDu9bdHbCwpOkipeiPtRF_M60nD-QqTwGS2MxlU-wht5dmOjIBMGnj7eg/exec"; // <-- CHANGE THIS

// ---------- JSONP helper ----------
function jsonp(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const cbName = "__swap_jsonp_cb_" + Math.random().toString(36).slice(2);
    const sep = url.includes("?") ? "&" : "?";
    const full = `${url}${sep}callback=${encodeURIComponent(cbName)}`;

    let done = false;
    const script = document.createElement("script");

    const cleanup = () => {
      if (script && script.parentNode) script.parentNode.removeChild(script);
      try { delete window[cbName]; } catch (e) { window[cbName] = undefined; }
    };

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    window[cbName] = (data) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      cleanup();
      reject(new Error("JSONP script load error (blocked or bad URL)"));
    };

    script.src = full;
    document.head.appendChild(script);
  });
}

// ---------- Low-level route call (GET only) ----------
async function callRoute(route, params = {}, timeoutMs) {
  const u = new URL(EXEC_URL);
  u.searchParams.set("route", String(route || "").toLowerCase());

  // attach params (all GET)
  Object.entries(params || {}).forEach(([k, v]) => {
    if (v === undefined || v === null) return;
    u.searchParams.set(k, String(v));
  });

  const out = await jsonp(u.toString(), timeoutMs);
  return out;
}

// ---------- Utility ----------
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function extractPerServing(item) {
  // Supports both shapes:
  // item.per_serving = { kcal?, p,c,f,fiber,sugar,sodium,satfat,refined }
  // or item.macros = ...
  const ps = item?.per_serving || item?.macros || {};
  const p = Number(ps.p ?? ps.protein ?? 0) || 0;
  const c = Number(ps.c ?? ps.carbs ?? 0) || 0;
  const f = Number(ps.f ?? ps.fat ?? 0) || 0;
  const kcal = Number(ps.kcal ?? ps.calories ?? (p * 4 + c * 4 + f * 9)) || (p * 4 + c * 4 + f * 9);
  return { kcal, p, c, f };
}

function scaleItemPortion(item, targetKcal) {
  const baseG = Number(item?.serving_g ?? 0) || 100;
  const { kcal } = extractPerServing(item);
  const baseKcal = kcal || 1;
  const mult = clamp(targetKcal / baseKcal, 0.35, 3.0);
  const portionG = Math.round(baseG * mult);
  return { portion_g: portionG, mult };
}

function sumMeal(mealItems) {
  let kcal = 0, p = 0, c = 0, f = 0;
  for (const mi of mealItems) {
    const item = mi._item;
    const { kcal: k0, p: p0, c: c0, f: f0 } = extractPerServing(item);
    const baseG = Number(item?.serving_g ?? 0) || 100;
    const mult = (Number(mi.portion_g) || baseG) / baseG;
    kcal += k0 * mult;
    p += p0 * mult;
    c += c0 * mult;
    f += f0 * mult;
  }
  return { kcal: Math.round(kcal), p: Math.round(p), c: Math.round(c), f: Math.round(f) };
}

// ---------- Public API (must match app.js import) ----------
export const API = {
  // Basic checks
  health: () => callRoute("health"),
  meta: () => callRoute("meta"),

  // Food search
  searchFoods: (q, { limit = 25, group = "" } = {}) =>
    callRoute("foods", { q: q || "", limit, group }),

  // Single food
  getFood: (id) => callRoute("food", { id }),

  // Swap
  getSwaps: (id, { portion_g = 140, tol = 0.05, flex = 0, limit = 12, same_group = 1 } = {}) =>
    callRoute("swap", { id, portion_g, tol, flex, limit, same_group }),

  refreshCache: () => callRoute("refreshcache", {}),

  // -------------------------
  // Meal plan generation (client-side) using your Foods sheet via JSONP routes
  // -------------------------
  async generatePlan(profile = null) {
    // Pull targets from whatever the app stored, but don’t hard-depend on it
    // (If your app passes profile in, we’ll use it.)
    const stored = safeGetStoredProfile_();
    const p = profile || stored || {};

    // Try to derive targets; fall back to sane defaults
    const targetKcal = Number(p?.targets?.kcal ?? p?.kcal ?? p?.calories ?? 2200) || 2200;
    const targetProtein = Number(p?.targets?.protein ?? p?.protein ?? 140) || 140;

    // Fetch category pools from your DB (group param is supported by your backend routes list)
    // If your sheet uses different group names, this still works because we fall back to a general pool.
    const [proteins, carbs, fats, veg, general] = await Promise.all([
      safeFoods_("protein", 200),
      safeFoods_("carb", 200),
      safeFoods_("fat", 200),
      safeFoods_("vegetable", 200),
      safeFoods_("", 300),
    ]);

    const poolProtein = proteins.length ? proteins : general;
    const poolCarb = carbs.length ? carbs : general;
    const poolFat = fats.length ? fats : general;
    const poolVeg = veg.length ? veg : general;

    // Build 7-day plan, 3 meals/day
    const days = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((label) => ({ label, meals: [] }));

    for (const day of days) {
      const perMealKcal = targetKcal / 3;

      // Breakfast: protein + carb + (optional) fat
      day.meals.push(buildMeal_("Breakfast", perMealKcal, poolProtein, poolCarb, poolFat, poolVeg));

      // Lunch: protein + carb + veg
      day.meals.push(buildMeal_("Lunch", perMealKcal, poolProtein, poolCarb, poolFat, poolVeg, true));

      // Dinner: protein + carb + veg
      day.meals.push(buildMeal_("Dinner", perMealKcal, poolProtein, poolCarb, poolFat, poolVeg, true));
    }

    // Totals
    const dailyTotals = days.map((d) => {
      const mealsTotals = d.meals.map((m) => sumMeal(m.items));
      const tot = mealsTotals.reduce((a, b) => ({
        kcal: a.kcal + b.kcal,
        p: a.p + b.p,
        c: a.c + b.c,
        f: a.f + b.f,
      }), { kcal: 0, p: 0, c: 0, f: 0 });
      return { day: d.label, ...tot };
    });

    const week = dailyTotals.reduce((a, b) => ({
      kcal: a.kcal + b.kcal,
      p: a.p + b.p,
      c: a.c + b.c,
      f: a.f + b.f,
    }), { kcal: 0, p: 0, c: 0, f: 0 });

    // Return a shape that most frontends can render (covers many expectations)
    return {
      ok: true,
      plan: { days, dailyTotals, weekTotals: week, targets: { kcal: targetKcal, protein: targetProtein } },
      days,                 // <- duplicate for compatibility
      dailyTotals,          // <- duplicate for compatibility
      weekTotals: week,     // <- duplicate for compatibility
      targets: { kcal: targetKcal, protein: targetProtein },
    };
  },

  async regeneratePlan(profile = null) {
    return API.generatePlan(profile);
  },
};

// Default export (some bundlers import default)
export default API;

// ---------- Internals ----------
function safeGetStoredProfile_() {
  try {
    // common keys you might have used
    const keys = ["SWAP_PROFILE", "swap_profile", "profile", "SWAP_user"];
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const obj = JSON.parse(raw);
      if (obj && typeof obj === "object") return obj;
    }
  } catch (e) {}
  return null;
}

async function safeFoods_(group, limit) {
  try {
    const res = await callRoute("foods", { q: "", limit, group: group || "" }, 20000);
    const arr = Array.isArray(res?.foods) ? res.foods
             : Array.isArray(res?.items) ? res.items
             : Array.isArray(res) ? res
             : [];
    return arr.filter(Boolean);
  } catch (e) {
    return [];
  }
}

function buildMeal_(name, targetKcal, poolProtein, poolCarb, poolFat, poolVeg, includeVeg = false) {
  const items = [];

  const pItem = pick(poolProtein);
  const cItem = pick(poolCarb);
  const fItem = pick(poolFat);
  const vItem = includeVeg ? pick(poolVeg) : null;

  // Rough macro split
  const pK = targetKcal * 0.40;
  const cK = targetKcal * 0.40;
  const fK = targetKcal * 0.20;

  const pScaled = scaleItemPortion(pItem, pK);
  const cScaled = scaleItemPortion(cItem, cK);
  const fScaled = scaleItemPortion(fItem, fK);

  items.push(toMealItem_(pItem, pScaled.portion_g));
  items.push(toMealItem_(cItem, cScaled.portion_g));
  items.push(toMealItem_(fItem, fScaled.portion_g));

  if (vItem) {
    // veg: small add-on
    const vScaled = scaleItemPortion(vItem, targetKcal * 0.10);
    items.push(toMealItem_(vItem, vScaled.portion_g));
  }

  const totals = sumMeal(items);

  return {
    name,
    items: items.map(stripInternal_),
    totals,
  };

  function stripInternal_(mi) {
    // Keep a private pointer for totals calculations, but don’t leak it
    const { _item, ...clean } = mi;
    return clean;
  }

  function toMealItem_(item, portion_g) {
    return {
      id: item?.id,
      name: item?.name,
      portion_g,
      unit: "g",
      // include anything your UI might want
      serving_g: item?.serving_g,
      units: item?.units,
      per_serving: item?.per_serving,
      _item: item,
    };
  }
}
