/* ui.js — SWAP UI (calendar + swaps + recipes)
   Paste-ready. No dependencies. Works with SWAP_API if present.

   Expected (but not required) globals:
   - window.SWAP_API.getSwaps({ id, portion_g, limit, same_group, tol, flex })
   - window.SWAP_API.getFood({ id })
   - window.SWAP_API.execUrl (optional) or window.SWAP_CONFIG.execUrl

   Expected routes in Apps Script:
   ?route=swap&id=...&portion_g=...&limit=12&same_group=1&tol=0.05&flex=0
   ?route=plan ... (already working in your backend)

   This UI module provides:
   - SWAP_UI.setPlan(planOrResponse)
   - SWAP_UI.setRecipes(recipesOrResponse)
   - SWAP_UI.renderSwaps(swapsOrResponse)
   - SWAP_UI.replaceSelectedWith(candidate)  // used by swap list
*/

(function () {
  "use strict";

  /* ---------------------------
     Small utilities
  --------------------------- */

  const LS = {
    PLAN: "swap_current_plan_v1",
    RECIPES_PREFIX: "swap_recipes_v1_", // + weekStart
    SELECTED: "swap_selected_item_v1",
  };

  function $(sel, root = document) {
    return root.querySelector(sel);
  }
  function $all(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
      else if (v === false || v === null || v === undefined) continue;
      else node.setAttribute(k, String(v));
    }
    for (const c of children || []) {
      if (c === null || c === undefined) continue;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
  }

  function escapeHtml(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function clamp(n, a, b) {
    n = Number(n);
    if (!Number.isFinite(n)) return a;
    return Math.max(a, Math.min(b, n));
  }

  function pad2(n) {
    n = String(n);
    return n.length === 1 ? "0" + n : n;
  }

  function toMMDDYYYY(iso) {
    // iso: YYYY-MM-DD
    if (!iso || typeof iso !== "string" || iso.length < 10) return iso || "";
    const y = iso.slice(0, 4);
    const m = iso.slice(5, 7);
    const d = iso.slice(8, 10);
    return `${m}/${d}/${y}`;
  }

  function dayNameFromISO(iso) {
    // Local timezone is fine for display. Use noon to avoid DST edge cases.
    try {
      const [y, m, d] = iso.split("-").map((x) => parseInt(x, 10));
      const dt = new Date(y, m - 1, d, 12, 0, 0);
      return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][dt.getDay()];
    } catch {
      return "";
    }
  }

  function shortDayNameFromISO(iso) {
    const n = dayNameFromISO(iso);
    return n ? n.slice(0, 3) : "";
  }

  function parseGrams(x) {
    // Accept number or "123 g"
    if (typeof x === "number" && Number.isFinite(x)) return x;
    const s = String(x || "");
    const m = s.match(/([0-9]+(\.[0-9]+)?)/);
    if (!m) return null;
    return Number(m[1]);
  }

  function withTimeout(promise, ms, msg = "Request timed out.") {
    let t;
    const timeout = new Promise((_, rej) => {
      t = setTimeout(() => rej(new Error(msg)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
  }

  /* ---------------------------
     State + container detection
  --------------------------- */

  const state = {
    plan: null,
    recipes: null,
    recipesDirty: false,
    selected: null, // { item, ctx }
    els: {
      weekGrid: null,
      weekLabel: null,
      swapsBox: null,
      swapsTitle: null,
      swapsList: null,
      swapsHint: null,
      recipesBox: null,
      recipesList: null,
      recipesBtn: null,
    },
    config: {
      swapsLimit: 12,
      tol: 0.05,
      flex: 0,
      same_group: 1,
      requestTimeoutMs: 25000,
    },
  };

  function detectContainers() {
    // Meal plan grid container (the calendar columns)
    const weekGrid =
      $("[data-swap-week-grid]") ||
      $("#swap-week-grid") ||
      $("#weekPlanDays") ||
      $("#weekPlanGrid") ||
      $("#mealPlanGrid") ||
      $(".week-plan-grid") ||
      $(".week-grid");

    // Week label ("Week of ...")
    const weekLabel =
      $("[data-swap-week-label]") ||
      $("#weekPlanLabel") ||
      $("#weekLabel") ||
      $(".week-plan-label");

    // Swaps panel container + title + list
    const swapsBox =
      $("[data-swap-swaps]") ||
      $("#swapsPanel") ||
      $("#swapSwaps") ||
      $(".swaps-panel") ||
      $(".swaps");

    const swapsTitle =
      (swapsBox && (swapsBox.querySelector("[data-swap-swaps-title]") || swapsBox.querySelector(".swaps-title"))) ||
      $("#swapsTitle");

    const swapsList =
      (swapsBox && (swapsBox.querySelector("[data-swap-swaps-list]") || swapsBox.querySelector(".swaps-list"))) ||
      $("#swapsList");

    const swapsHint =
      (swapsBox && (swapsBox.querySelector("[data-swap-swaps-hint]") || swapsBox.querySelector(".swaps-hint"))) ||
      $("#swapsHint");

    // Recipes container + list
    const recipesBox =
      $("[data-swap-recipes]") ||
      $("#recipesPanel") ||
      $("#recipesView") ||
      $(".recipes-panel") ||
      $(".recipes");

    const recipesList =
      (recipesBox && (recipesBox.querySelector("[data-swap-recipes-list]") || recipesBox.querySelector(".recipes-list"))) ||
      $("#recipesList") ||
      $("#recipesDays");

    state.els.weekGrid = weekGrid;
    state.els.weekLabel = weekLabel;
    state.els.swapsBox = swapsBox;
    state.els.swapsTitle = swapsTitle;
    state.els.swapsList = swapsList;
    state.els.swapsHint = swapsHint;
    state.els.recipesBox = recipesBox;
    state.els.recipesList = recipesList;
  }

  function ensureStyles() {
    if ($("#swapui-styles")) return;

    const css = `
/* -----------------------
   SWAP UI overhaul
------------------------ */
:root{
  --swapui-bg: rgba(255,255,255,0.72);
  --swapui-card: rgba(255,255,255,0.78);
  --swapui-border: rgba(15,23,42,0.10);
  --swapui-border2: rgba(15,23,42,0.14);
  --swapui-text: #0f172a;
  --swapui-muted: rgba(15,23,42,0.60);
  --swapui-soft: rgba(15,23,42,0.05);
  --swapui-accent: #6d28d9;
  --swapui-accent2: #10b981;
  --swapui-shadow: 0 18px 45px rgba(2,6,23,0.10);
  --swapui-radius: 18px;
  --swapui-radius2: 14px;
  --swapui-font: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
}

.swapui-weekGrid{
  display: grid;
  grid-template-columns: repeat(7, minmax(220px, 1fr));
  gap: 14px;
  align-items: start;
  width: 100%;
}
@media (max-width: 1100px){
  .swapui-weekGrid{
    grid-template-columns: repeat(7, 240px);
    overflow-x: auto;
    padding-bottom: 8px;
    scrollbar-width: thin;
  }
  .swapui-weekGrid::-webkit-scrollbar{ height: 10px; }
}

.swapui-dayCol{
  background: var(--swapui-card);
  border: 1px solid var(--swapui-border);
  border-radius: var(--swapui-radius);
  box-shadow: var(--swapui-shadow);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  min-height: 520px;
}
.swapui-dayHeader{
  padding: 14px 14px 10px 14px;
  border-bottom: 1px solid var(--swapui-border);
  background: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.70));
  position: sticky;
  top: 0;
  z-index: 2;
  backdrop-filter: blur(10px);
}
.swapui-dayTitleRow{
  display:flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
}
.swapui-dayTitle{
  font-family: var(--swapui-font);
  font-weight: 800;
  letter-spacing: -0.02em;
  color: var(--swapui-text);
  font-size: 14px;
  line-height: 1.1;
}
.swapui-dayDate{
  font-family: var(--swapui-font);
  font-weight: 600;
  color: var(--swapui-muted);
  font-size: 12px;
  white-space: nowrap;
}
.swapui-dayMetaRow{
  margin-top: 8px;
  display:flex;
  gap: 8px;
  flex-wrap: wrap;
}
.swapui-chip{
  font-family: var(--swapui-font);
  font-weight: 700;
  font-size: 11px;
  color: rgba(15,23,42,0.78);
  background: rgba(15,23,42,0.05);
  border: 1px solid rgba(15,23,42,0.07);
  border-radius: 999px;
  padding: 5px 8px;
}
.swapui-dayBody{
  padding: 12px 12px 14px 12px;
  overflow: auto;
  flex: 1;
}
.swapui-meal{
  margin-bottom: 12px;
  border-radius: var(--swapui-radius2);
  background: rgba(255,255,255,0.72);
  border: 1px solid rgba(15,23,42,0.07);
  overflow: hidden;
}
.swapui-mealHeader{
  padding: 10px 10px 8px 10px;
  display:flex;
  align-items:center;
  justify-content: space-between;
  gap: 10px;
  border-bottom: 1px solid rgba(15,23,42,0.06);
  background: rgba(255,255,255,0.72);
}
.swapui-mealLabel{
  font-family: var(--swapui-font);
  font-weight: 900;
  letter-spacing: -0.01em;
  color: var(--swapui-text);
  font-size: 12px;
}
.swapui-mealKcal{
  font-family: var(--swapui-font);
  font-weight: 800;
  color: rgba(15,23,42,0.55);
  font-size: 11px;
  white-space: nowrap;
}
.swapui-items{
  padding: 8px 8px 10px 8px;
  display:flex;
  flex-direction: column;
  gap: 8px;
}
.swapui-item{
  width: 100%;
  text-align: left;
  background: rgba(255,255,255,0.92);
  border: 1px solid rgba(15,23,42,0.10);
  border-radius: 14px;
  padding: 9px 10px;
  cursor: pointer;
  transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
  display:flex;
  gap: 10px;
  align-items: flex-start;
}
.swapui-item:hover{
  transform: translateY(-1px);
  box-shadow: 0 10px 22px rgba(2,6,23,0.10);
  border-color: rgba(109,40,217,0.28);
}
.swapui-item.is-selected{
  border-color: rgba(109,40,217,0.55);
  box-shadow: 0 12px 28px rgba(109,40,217,0.18);
}
.swapui-itemLeft{
  flex: 1;
  min-width: 0;
}
.swapui-itemName{
  font-family: var(--swapui-font);
  font-weight: 800;
  color: var(--swapui-text);
  font-size: 12px;
  line-height: 1.22;
  display:block;
  overflow:hidden;
  text-overflow: ellipsis;
}
.swapui-itemSub{
  margin-top: 4px;
  font-family: var(--swapui-font);
  font-weight: 700;
  color: rgba(15,23,42,0.58);
  font-size: 11px;
  line-height: 1.2;
  display:flex;
  gap: 8px;
  flex-wrap: wrap;
}
.swapui-pill{
  display:inline-flex;
  align-items:center;
  gap: 6px;
  padding: 4px 8px;
  border-radius: 999px;
  background: rgba(15,23,42,0.05);
  border: 1px solid rgba(15,23,42,0.07);
}
.swapui-dot{
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: rgba(15,23,42,0.28);
}
.swapui-dot.protein{ background: rgba(16,185,129,0.90); }
.swapui-dot.carb{ background: rgba(99,102,241,0.90); }
.swapui-dot.fat{ background: rgba(239,68,68,0.85); }
.swapui-dot.fruit{ background: rgba(59,130,246,0.85); }
.swapui-dot.veg{ background: rgba(34,197,94,0.85); }
.swapui-dot.other{ background: rgba(148,163,184,0.95); }

.swapui-itemRight{
  flex: 0 0 auto;
  text-align: right;
  min-width: 62px;
}
.swapui-kcal{
  font-family: var(--swapui-font);
  font-weight: 900;
  color: rgba(15,23,42,0.78);
  font-size: 11px;
}
.swapui-portion{
  margin-top: 4px;
  font-family: var(--swapui-font);
  font-weight: 800;
  color: rgba(15,23,42,0.52);
  font-size: 11px;
}

/* Swaps panel (right) */
.swapui-swapsWrap{
  display:flex;
  flex-direction: column;
  gap: 10px;
}
.swapui-swapsHead{
  display:flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.swapui-swapsTitle{
  font-family: var(--swapui-font);
  font-weight: 900;
  color: var(--swapui-text);
  font-size: 14px;
  letter-spacing: -0.02em;
}
.swapui-swapsSub{
  margin-top: 3px;
  font-family: var(--swapui-font);
  font-weight: 700;
  color: rgba(15,23,42,0.60);
  font-size: 12px;
}
.swapui-swapCard{
  background: rgba(255,255,255,0.90);
  border: 1px solid rgba(15,23,42,0.10);
  border-radius: 16px;
  padding: 10px;
  display:flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.swapui-swapName{
  font-family: var(--swapui-font);
  font-weight: 850;
  font-size: 12px;
  color: var(--swapui-text);
  line-height: 1.25;
}
.swapui-swapMeta{
  margin-top: 6px;
  display:flex;
  gap: 8px;
  flex-wrap: wrap;
}
.swapui-mini{
  font-family: var(--swapui-font);
  font-weight: 800;
  font-size: 11px;
  color: rgba(15,23,42,0.62);
  background: rgba(15,23,42,0.05);
  border: 1px solid rgba(15,23,42,0.07);
  border-radius: 999px;
  padding: 4px 8px;
}
.swapui-btn{
  appearance: none;
  border: none;
  cursor: pointer;
  border-radius: 999px;
  padding: 9px 12px;
  font-family: var(--swapui-font);
  font-weight: 900;
  font-size: 12px;
  color: white;
  background: linear-gradient(90deg, var(--swapui-accent), var(--swapui-accent2));
  box-shadow: 0 10px 22px rgba(16,185,129,0.18);
  white-space: nowrap;
}
.swapui-btn:disabled{
  opacity: 0.55;
  cursor: not-allowed;
}

/* Recipes page */
.swapui-recipesWrap{
  display:flex;
  flex-direction: column;
  gap: 12px;
}
.swapui-dayAccordion{
  background: rgba(255,255,255,0.78);
  border: 1px solid rgba(15,23,42,0.10);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 18px 45px rgba(2,6,23,0.08);
}
.swapui-dayAccordion summary{
  list-style: none;
  cursor: pointer;
  padding: 14px 14px;
  display:flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.swapui-dayAccordion summary::-webkit-details-marker{ display:none; }
.swapui-accTitle{
  font-family: var(--swapui-font);
  font-weight: 950;
  color: var(--swapui-text);
  font-size: 14px;
  letter-spacing: -0.02em;
}
.swapui-accSub{
  margin-top: 2px;
  font-family: var(--swapui-font);
  font-weight: 750;
  color: rgba(15,23,42,0.60);
  font-size: 12px;
}
.swapui-accChevron{
  font-family: var(--swapui-font);
  font-weight: 900;
  color: rgba(15,23,42,0.55);
  font-size: 12px;
}
.swapui-accBody{
  padding: 12px 14px 14px 14px;
  border-top: 1px solid rgba(15,23,42,0.08);
  background: rgba(255,255,255,0.72);
}
.swapui-recipeBlock{
  margin-bottom: 12px;
  padding: 12px;
  border-radius: 16px;
  border: 1px solid rgba(15,23,42,0.08);
  background: rgba(255,255,255,0.92);
}
.swapui-recipeHeader{
  display:flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.swapui-recipeMeal{
  font-family: var(--swapui-font);
  font-weight: 950;
  font-size: 12px;
  color: var(--swapui-text);
  letter-spacing: -0.01em;
}
.swapui-recipeNote{
  font-family: var(--swapui-font);
  font-weight: 800;
  font-size: 11px;
  color: rgba(15,23,42,0.55);
}
.swapui-recipeText{
  margin-top: 10px;
  font-family: var(--swapui-font);
  font-weight: 700;
  font-size: 12px;
  line-height: 1.45;
  color: rgba(15,23,42,0.82);
  white-space: pre-wrap;
}
.swapui-warn{
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(239,68,68,0.18);
  background: rgba(239,68,68,0.06);
  color: rgba(127,29,29,0.95);
  font-family: var(--swapui-font);
  font-weight: 900;
  font-size: 12px;
}

    `;

    const style = el("style", { id: "swapui-styles", text: css });
    document.head.appendChild(style);
  }

  /* ---------------------------
     Normalizers
  --------------------------- */

  function normalizePlan(input) {
    if (!input) return null;

    // If API response shape: {ok:true, plan:{...}}
    if (input.plan && typeof input.plan === "object") return input.plan;

    // If already plan object
    if (input.days && Array.isArray(input.days)) return input;

    // If nested differently
    if (input.data && input.data.plan) return input.data.plan;

    return null;
  }

  function normalizeSwaps(input) {
    if (!input) return { ok: false, error: "No swaps response." };
    if (Array.isArray(input)) return { ok: true, swaps: input };
    if (input.swaps && Array.isArray(input.swaps)) return input;
    if (input.items && Array.isArray(input.items)) return { ok: true, swaps: input.items };
    if (input.data && input.data.swaps) return { ok: true, swaps: input.data.swaps };
    return input;
  }

  // Recipes shapes can vary widely; we normalize into:
  // { weekStart, byDate: { 'YYYY-MM-DD': { breakfast: '...', lunch:'...', ... , __all?: '...' } } }
  function normalizeRecipes(input, plan) {
    if (!input) return null;

    const out = {
      weekStart: (plan && plan.weekStart) || null,
      byDate: {},
      raw: input,
    };

    // If API response: {ok:true, recipes: ...}
    const payload = input.recipes ? input.recipes : input;

    // If already normalized
    if (payload.byDate && typeof payload.byDate === "object") return payload;

    // If string => treat as one big block for week
    if (typeof payload === "string") {
      if (out.weekStart) {
        (plan.days || []).forEach((d) => {
          out.byDate[d.date] = { __all: payload };
        });
      } else {
        out.byDate["__week"] = { __all: payload };
      }
      return out;
    }

    // If array of entries: try to map
    if (Array.isArray(payload)) {
      for (const r of payload) {
        const date = r.date || r.day || r.iso || null;
        const meal = (r.meal || r.mealKey || r.key || "").toLowerCase();
        const text = r.text || r.recipe || r.content || r.body || "";
        if (!date) continue;
        out.byDate[date] = out.byDate[date] || {};
        if (meal) out.byDate[date][meal] = text;
        else out.byDate[date].__all = text;
      }
      return out;
    }

    // If object keyed by date
    if (payload && typeof payload === "object") {
      // Common shape: { 'YYYY-MM-DD': { breakfast:'...', ... } }
      const keys = Object.keys(payload);
      const looksDateKeyed = keys.some((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
      if (looksDateKeyed) {
        for (const k of keys) {
          if (!/^\d{4}-\d{2}-\d{2}$/.test(k)) continue;
          const v = payload[k];
          if (typeof v === "string") out.byDate[k] = { __all: v };
          else if (v && typeof v === "object") out.byDate[k] = { ...v };
        }
        return out;
      }

      // Another common shape: { days:[{date, meals:{breakfast:'...'}}] }
      if (Array.isArray(payload.days)) {
        for (const d of payload.days) {
          if (!d || !d.date) continue;
          if (typeof d === "string") {
            out.byDate[d] = { __all: "" };
          } else {
            const meals = d.meals || d.recipes || d.items || {};
            if (typeof meals === "string") out.byDate[d.date] = { __all: meals };
            else out.byDate[d.date] = { ...meals };
          }
        }
        return out;
      }

      // Fallback: store under week
      out.byDate["__week"] = { __all: JSON.stringify(payload, null, 2) };
      return out;
    }

    return null;
  }

  /* ---------------------------
     Persistence
  --------------------------- */

  function savePlan(plan) {
    try {
      localStorage.setItem(LS.PLAN, JSON.stringify(plan));
    } catch {}
  }

  function loadPlan() {
    try {
      const raw = localStorage.getItem(LS.PLAN);
      if (!raw) return null;
      return normalizePlan(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  function saveRecipes(recipesNorm) {
    try {
      const wk = recipesNorm.weekStart || (state.plan && state.plan.weekStart) || "unknown";
      localStorage.setItem(LS.RECIPES_PREFIX + wk, JSON.stringify(recipesNorm));
    } catch {}
  }

  function loadRecipesForWeek(weekStart) {
    try {
      const raw = localStorage.getItem(LS.RECIPES_PREFIX + weekStart);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /* ---------------------------
     Rendering: Meal plan calendar
  --------------------------- */

  function groupDotClass(group) {
    const g = String(group || "").toLowerCase();
    if (g.includes("protein")) return "protein";
    if (g.includes("carb") || g.includes("grain") || g.includes("starch")) return "carb";
    if (g.includes("fat") || g.includes("oil") || g.includes("nut")) return "fat";
    if (g.includes("fruit")) return "fruit";
    if (g.includes("veg")) return "veg";
    return "other";
  }

  function mealSortKey(mealKey) {
    const k = String(mealKey || "").toLowerCase();
    const order = {
      breakfast: 1,
      "snack_am": 2,
      snackam: 2,
      snack_am: 2,
      lunch: 3,
      "snack_pm": 4,
      snackpm: 4,
      snack_pm: 4,
      dinner: 5,
    };
    return order[k] || 99;
  }

  function prettyMealLabel(meal) {
    const k = String(meal.key || meal.mealKey || meal.name || meal.label || "").toLowerCase();
    const label = meal.label || meal.name || "";
    if (label) return label;
    if (k === "snack_am" || k === "snackam" || k === "snack_am") return "Snack (AM)";
    if (k === "snack_pm" || k === "snackpm" || k === "snack_pm") return "Snack (PM)";
    if (k) return k.charAt(0).toUpperCase() + k.slice(1);
    return "Meal";
  }

  function calcMealKcal(meal) {
    const items = Array.isArray(meal.items) ? meal.items : [];
    const sum = items.reduce((acc, it) => acc + (Number(it.calories) || 0), 0);
    return Math.round(sum);
  }

  function renderWeekLabel(plan) {
    if (!state.els.weekLabel) return;
    const ws = plan.weekStart || (plan.days && plan.days[0] && plan.days[0].date) || "";
    if (!ws) return;
    const txt = `Week of ${toMMDDYYYY(ws)}`;
    state.els.weekLabel.textContent = txt;
  }

  function clearSelectedHighlight() {
    $all(".swapui-item.is-selected").forEach((n) => n.classList.remove("is-selected"));
  }

  function setSelected(item, ctx, node) {
    state.selected = { item, ctx };
    try {
      localStorage.setItem(LS.SELECTED, JSON.stringify({ id: item.id, date: ctx.date, mealKey: ctx.mealKey, idx: ctx.itemIndex }));
    } catch {}
    clearSelectedHighlight();
    if (node) node.classList.add("is-selected");
  }

  function renderPlan(plan) {
    detectContainers();
    ensureStyles();

    const grid = state.els.weekGrid;
    if (!grid) return;

    grid.classList.add("swapui-weekGrid");
    grid.innerHTML = "";

    renderWeekLabel(plan);

    const frag = document.createDocumentFragment();
    const days = Array.isArray(plan.days) ? plan.days : [];

    for (const day of days) {
      frag.appendChild(renderDayColumn(day, plan));
    }

    grid.appendChild(frag);
  }

  function renderDayColumn(day, plan) {
    const iso = day.date || "";
    const dayName = dayNameFromISO(iso) || "Day";
    const dayShort = shortDayNameFromISO(iso);
    const dateStr = toMMDDYYYY(iso);

    const totals = day.totals || {};
    const kcal = Math.round(Number(totals.calories) || 0);
    const p = Math.round(Number(totals.protein_g) || 0);
    const c = Math.round(Number(totals.carbs_g) || 0);
    const f = Math.round(Number(totals.fat_g) || 0);

    const header = el("div", { class: "swapui-dayHeader" }, [
      el("div", { class: "swapui-dayTitleRow" }, [
        el("div", { class: "swapui-dayTitle", text: dayName }),
        el("div", { class: "swapui-dayDate", text: dateStr }),
      ]),
      el("div", { class: "swapui-dayMetaRow" }, [
        kcal ? el("span", { class: "swapui-chip", text: `${kcal} kcal` }) : null,
        p ? el("span", { class: "swapui-chip", text: `P ${p}g` }) : null,
        c ? el("span", { class: "swapui-chip", text: `C ${c}g` }) : null,
        f ? el("span", { class: "swapui-chip", text: `F ${f}g` }) : null,
      ]),
    ]);

    const body = el("div", { class: "swapui-dayBody" });

    let meals = Array.isArray(day.meals) ? day.meals : [];
    meals = meals.slice().sort((a, b) => mealSortKey(a.key || a.mealKey) - mealSortKey(b.key || b.mealKey));

    for (const meal of meals) {
      body.appendChild(renderMealBlock(meal, iso));
    }

    const col = el("section", { class: "swapui-dayCol", "data-date": iso }, [header, body]);
    return col;
  }

  function renderMealBlock(meal, isoDate) {
    const label = prettyMealLabel(meal);
    const kcal = calcMealKcal(meal);
    const items = Array.isArray(meal.items) ? meal.items : [];

    const head = el("div", { class: "swapui-mealHeader" }, [
      el("div", { class: "swapui-mealLabel", text: label }),
      el("div", { class: "swapui-mealKcal", text: kcal ? `${kcal} kcal` : "" }),
    ]);

    const list = el("div", { class: "swapui-items" });

    items.forEach((item, idx) => {
      list.appendChild(renderFoodItemButton(item, {
        date: isoDate,
        mealKey: (meal.key || meal.mealKey || label || "").toString(),
        mealLabel: label,
        itemIndex: idx,
      }));
    });

    return el("div", { class: "swapui-meal" }, [head, list]);
  }

  function renderFoodItemButton(item, ctx) {
    const group = item.group || item.food_group || item.category || "";
    const subgroup = item.subgroup || item.food_subgroup || "";
    const grams = Number(item.grams);
    const portion = item.portion || (Number.isFinite(grams) ? `${Math.round(grams)} g` : "");
    const kcal = Number(item.calories) || 0;

    const dot = groupDotClass(group);

    const btn = el("button", { class: "swapui-item", type: "button" }, [
      el("div", { class: "swapui-itemLeft" }, [
        el("span", { class: "swapui-itemName", text: item.name || item.title || "Food item" }),
        el("div", { class: "swapui-itemSub" }, [
          el("span", { class: "swapui-pill" }, [
            el("span", { class: `swapui-dot ${dot}` }),
            el("span", { text: String(group || "other").toUpperCase() }),
          ]),
          subgroup
            ? el("span", { class: "swapui-pill", text: subgroup })
            : null,
        ]),
      ]),
      el("div", { class: "swapui-itemRight" }, [
        el("div", { class: "swapui-kcal", text: kcal ? `${Math.round(kcal)} kcal` : "" }),
        el("div", { class: "swapui-portion", text: portion || "" }),
      ]),
    ]);

    btn.addEventListener("click", async () => {
      setSelected(item, ctx, btn);
      await loadAndRenderSwaps(item, ctx);
    });

    return btn;
  }

  /* ---------------------------
     Swaps panel
  --------------------------- */

  function renderSwapsEmpty() {
    detectContainers();
    ensureStyles();

    const box = state.els.swapsBox;
    const list = state.els.swapsList || (box ? box : null);
    if (!list) return;

    // Don’t destroy user’s existing panel structure, just populate list if found.
    if (state.els.swapsTitle) state.els.swapsTitle.textContent = "Select a food";
    if (state.els.swapsHint) state.els.swapsHint.textContent = "Click a food item in the calendar to see equivalent swaps.";

    list.innerHTML = el("div", { class: "swapui-swapsWrap" }, [
      el("div", { class: "swapui-swapsHead" }, [
        el("div", {}, [
          el("div", { class: "swapui-swapsTitle", text: "Select a food" }),
          el("div", { class: "swapui-swapsSub", text: "We’ll show equivalent swaps in the same group first, then allowed alternates." }),
        ]),
      ]),
    ]).outerHTML;
  }

  function renderSwapsLoading(item) {
    detectContainers();
    ensureStyles();

    const list = state.els.swapsList || state.els.swapsBox;
    if (!list) return;

    const title = item ? `Finding swaps…` : "Finding swaps…";
    list.innerHTML = el("div", { class: "swapui-swapsWrap" }, [
      el("div", { class: "swapui-swapsHead" }, [
        el("div", {}, [
          el("div", { class: "swapui-swapsTitle", text: title }),
          el("div", { class: "swapui-swapsSub", text: item ? (item.name || "") : "" }),
        ]),
      ]),
      el("div", { class: "swapui-swapCard" }, [
        el("div", {}, [
          el("div", { class: "swapui-swapName", text: "Loading…" }),
          el("div", { class: "swapui-swapMeta" }, [
            el("span", { class: "swapui-mini", text: "Please wait" }),
          ]),
        ]),
        el("button", { class: "swapui-btn", disabled: true, text: "Replace" }),
      ]),
    ]).outerHTML;
  }

  function renderSwapsError(errMsg) {
    detectContainers();
    ensureStyles();

    const list = state.els.swapsList || state.els.swapsBox;
    if (!list) return;

    list.innerHTML = el("div", { class: "swapui-swapsWrap" }, [
      el("div", { class: "swapui-swapsHead" }, [
        el("div", {}, [
          el("div", { class: "swapui-swapsTitle", text: "Swaps unavailable" }),
          el("div", { class: "swapui-swapsSub", text: errMsg || "Something went wrong." }),
        ]),
      ]),
    ]).outerHTML;
  }

  function renderSwapsList(swapsResp, item, ctx) {
    detectContainers();
    ensureStyles();

    const list = state.els.swapsList || state.els.swapsBox;
    if (!list) return;

    const swaps = swapsResp.swaps || [];
    const title = item ? `Swaps for: ${item.name || "Food"}` : "Swaps";
    const sub = item
      ? `${Math.round(Number(item.calories) || 0)} kcal • ${Math.round(Number(item.grams) || parseGrams(item.portion) || 0)} g`
      : "";

    const wrap = el("div", { class: "swapui-swapsWrap" }, [
      el("div", { class: "swapui-swapsHead" }, [
        el("div", {}, [
          el("div", { class: "swapui-swapsTitle", text: title }),
          el("div", { class: "swapui-swapsSub", text: sub }),
        ]),
      ]),
    ]);

    if (!swaps.length) {
      wrap.appendChild(
        el("div", { class: "swapui-swapCard" }, [
          el("div", {}, [
            el("div", { class: "swapui-swapName", text: "No swaps found for this item." }),
            el("div", { class: "swapui-swapMeta" }, [el("span", { class: "swapui-mini", text: "Try another item" })]),
          ]),
          el("button", { class: "swapui-btn", disabled: true, text: "Replace" }),
        ])
      );
      list.innerHTML = "";
      list.appendChild(wrap);
      return;
    }

    for (const cand of swaps) {
      const cName = cand.name || cand.title || "Swap option";
      const cKcal = Math.round(Number(cand.calories) || 0);
      const cG = Math.round(Number(cand.grams) || parseGrams(cand.portion) || 0);
      const g = String(cand.group || "").toLowerCase();

      const card = el("div", { class: "swapui-swapCard" }, [
        el("div", { style: "min-width:0;" }, [
          el("div", { class: "swapui-swapName", text: cName }),
          el("div", { class: "swapui-swapMeta" }, [
            el("span", { class: "swapui-mini", text: `${cKcal} kcal` }),
            cG ? el("span", { class: "swapui-mini", text: `${cG} g` }) : null,
            cand.group ? el("span", { class: "swapui-mini", text: String(cand.group).toUpperCase() }) : null,
            cand.subgroup ? el("span", { class: "swapui-mini", text: String(cand.subgroup) }) : null,
          ]),
        ]),
        el("button", {
          class: "swapui-btn",
          text: "Replace",
          onclick: () => {
            SWAP_UI.replaceSelectedWith(cand);
          },
        }),
      ]);

      wrap.appendChild(card);
    }

    list.innerHTML = "";
    list.appendChild(wrap);
  }

  async function loadAndRenderSwaps(item, ctx) {
    renderSwapsLoading(item);

    const grams = Number(item.grams) || parseGrams(item.portion) || null;
    const id = item.id || item.food_id || item.usda_id || null;

    if (!id) {
      renderSwapsError("This item has no ID. Swaps require a valid food id.");
      return;
    }
    if (!grams || !Number.isFinite(grams) || grams <= 0) {
      renderSwapsError("This item has no valid gram amount. Swaps require portion_g.");
      return;
    }

    // Prefer SWAP_API.getSwaps if available
    try {
      let resp = null;

      if (window.SWAP_API && typeof window.SWAP_API.getSwaps === "function") {
        resp = await withTimeout(
          window.SWAP_API.getSwaps({
            id,
            portion_g: grams,
            limit: state.config.swapsLimit,
            same_group: state.config.same_group,
            tol: state.config.tol,
            flex: state.config.flex,
          }),
          state.config.requestTimeoutMs
        );
      } else {
        // fallback fetch against execUrl
        const execUrl = (window.SWAP_API && window.SWAP_API.execUrl) || (window.SWAP_CONFIG && window.SWAP_CONFIG.execUrl) || window.execUrl;
        if (!execUrl) throw new Error("Missing SWAP_API.getSwaps and no execUrl configured.");
        const u = new URL(execUrl);
        u.searchParams.set("route", "swap");
        u.searchParams.set("id", id);
        u.searchParams.set("portion_g", String(grams));
        u.searchParams.set("limit", String(state.config.swapsLimit));
        u.searchParams.set("same_group", String(state.config.same_group));
        u.searchParams.set("tol", String(state.config.tol));
        u.searchParams.set("flex", String(state.config.flex));
        resp = await withTimeout(fetch(u.toString(), { method: "GET" }).then((r) => r.json()), state.config.requestTimeoutMs);
      }

      const norm = normalizeSwaps(resp);
      if (!norm.ok) {
        renderSwapsError(norm.error || "Unknown swaps error.");
        return;
      }
      renderSwapsList(norm, item, ctx);
    } catch (e) {
      renderSwapsError(e && e.message ? e.message : String(e));
    }
  }

  /* ---------------------------
     Replace flow (swap selection)
  --------------------------- */

  function findSelectedInPlan(plan, sel) {
    if (!plan || !sel || !sel.ctx) return null;
    const { date, mealKey, itemIndex } = sel.ctx;
    const day = (plan.days || []).find((d) => d.date === date);
    if (!day) return null;

    // mealKey might be label or key; match leniently
    const mk = String(mealKey || "").toLowerCase();
    const meal =
      (day.meals || []).find((m) => String(m.key || m.mealKey || m.label || m.name || "").toLowerCase() === mk) ||
      (day.meals || []).find((m) => String(m.label || "").toLowerCase() === mk);

    if (!meal || !Array.isArray(meal.items)) return null;
    const idx = clamp(itemIndex, 0, meal.items.length - 1);
    return { day, meal, idx };
  }

  function replaceItemInPlan(candidate) {
    const plan = state.plan;
    const sel = state.selected;
    if (!plan || !sel) return { ok: false, error: "No selected item." };

    const found = findSelectedInPlan(plan, sel);
    if (!found) return { ok: false, error: "Selected item not found in plan." };

    const { meal, idx } = found;

    // Keep context grams for portion matching if candidate provides different
    const old = meal.items[idx];
    const grams = Number(old.grams) || parseGrams(old.portion) || Number(candidate.grams) || parseGrams(candidate.portion) || null;

    const merged = {
      ...candidate,
      grams: grams || candidate.grams,
      portion: candidate.portion || (grams ? `${Math.round(grams)} g` : old.portion),
    };

    meal.items[idx] = merged;

    // Mark recipes dirty (because plan changed)
    state.recipesDirty = true;

    // Recompute day totals lightly (optional)
    // We’ll recompute totals across all meals for that day.
    try {
      const day = found.day;
      const totals = { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0 };
      for (const m of day.meals || []) {
        for (const it of m.items || []) {
          totals.calories += Number(it.calories) || 0;
          totals.protein_g += Number(it.protein_g) || 0;
          totals.carbs_g += Number(it.carbs_g) || 0;
          totals.fat_g += Number(it.fat_g) || 0;
        }
      }
      day.totals = totals;
    } catch {}

    savePlan(plan);
    return { ok: true, plan };
  }

  /* ---------------------------
     Recipes rendering
  --------------------------- */

  function renderRecipes(plan, recipesNorm) {
    detectContainers();
    ensureStyles();

    const host = state.els.recipesList || state.els.recipesBox;
    if (!host) return;

    const days = (plan && Array.isArray(plan.days) ? plan.days : []).map((d) => d.date);
    const byDate = (recipesNorm && recipesNorm.byDate) || {};

    const wrap = el("div", { class: "swapui-recipesWrap" });

    if (state.recipesDirty) {
      wrap.appendChild(
        el("div", {
          class: "swapui-warn",
          text: "Heads up: you changed the meal plan (via swaps). Recipes may be out of date — regenerate recipes for the updated plan.",
        })
      );
    }

    // If we have plan days, show accordions per day
    if (days.length) {
      for (const iso of days) {
        const dn = dayNameFromISO(iso);
        const block = byDate[iso] || {};
        const details = el("details", { class: "swapui-dayAccordion" }, [
          el("summary", {}, [
            el("div", {}, [
              el("div", { class: "swapui-accTitle", text: dn || "Day" }),
              el("div", { class: "swapui-accSub", text: toMMDDYYYY(iso) }),
            ]),
            el("div", { class: "swapui-accChevron", text: "Expand" }),
          ]),
          el("div", { class: "swapui-accBody" }, [
            ...renderRecipeBlocksForDay(plan, iso, block),
          ]),
        ]);

        // Update chevron label
        details.addEventListener("toggle", () => {
          const chev = details.querySelector(".swapui-accChevron");
          if (chev) chev.textContent = details.open ? "Collapse" : "Expand";
        });

        wrap.appendChild(details);
      }
      host.innerHTML = "";
      host.appendChild(wrap);
      return;
    }

    // Fallback: no plan => show raw content
    const rawStr =
      (recipesNorm && recipesNorm.byDate && recipesNorm.byDate.__week && recipesNorm.byDate.__week.__all) ||
      (recipesNorm && recipesNorm.byDate && recipesNorm.byDate.__all) ||
      JSON.stringify(recipesNorm && recipesNorm.raw ? recipesNorm.raw : recipesNorm, null, 2);

    host.innerHTML = "";
    host.appendChild(
      el("div", { class: "swapui-recipeBlock" }, [
        el("div", { class: "swapui-recipeHeader" }, [
          el("div", { class: "swapui-recipeMeal", text: "Recipes" }),
          el("div", { class: "swapui-recipeNote", text: "Raw output" }),
        ]),
        el("div", { class: "swapui-recipeText", text: rawStr }),
      ])
    );
  }

  function renderRecipeBlocksForDay(plan, isoDate, recipeObj) {
    const out = [];
    const day = (plan.days || []).find((d) => d.date === isoDate);

    // We prefer to display per meal, and each meal block shows:
    // - clickable food items (so swaps work here too)
    // - recipe text if available
    const meals = (day && Array.isArray(day.meals) ? day.meals : []).slice().sort((a, b) => mealSortKey(a.key || a.mealKey) - mealSortKey(b.key || b.mealKey));

    for (const m of meals) {
      const label = prettyMealLabel(m);
      const mk = String(m.key || m.mealKey || label || "").toLowerCase();
      let text = recipeObj && (recipeObj[mk] || recipeObj[label.toLowerCase()] || "");
      if (!text && recipeObj && recipeObj.__all) text = recipeObj.__all;

      const block = el("div", { class: "swapui-recipeBlock" }, [
        el("div", { class: "swapui-recipeHeader" }, [
          el("div", { class: "swapui-recipeMeal", text: label }),
          el("div", { class: "swapui-recipeNote", text: text ? "Recipe available" : "No recipe yet" }),
        ]),
        // Clickable items (same component as meal plan)
        el("div", { class: "swapui-items", style: "padding:10px 0 0 0;" }, (m.items || []).map((it, idx) =>
          renderFoodItemButton(it, {
            date: isoDate,
            mealKey: (m.key || m.mealKey || label || "").toString(),
            mealLabel: label,
            itemIndex: idx,
            from: "recipes",
          })
        )),
        text ? el("div", { class: "swapui-recipeText", text: text }) : el("div", { class: "swapui-recipeText", text: "Recipes will appear here after generation." }),
      ]);

      out.push(block);
    }

    // If there are no meals in plan (unexpected), show whatever exists
    if (!out.length) {
      const txt = (recipeObj && (recipeObj.__all || JSON.stringify(recipeObj, null, 2))) || "Recipes will appear here after generation.";
      out.push(
        el("div", { class: "swapui-recipeBlock" }, [
          el("div", { class: "swapui-recipeHeader" }, [
            el("div", { class: "swapui-recipeMeal", text: "Recipes" }),
            el("div", { class: "swapui-recipeNote", text: "" }),
          ]),
          el("div", { class: "swapui-recipeText", text: txt }),
        ])
      );
    }

    return out;
  }

  /* ---------------------------
     Public API (SWAP_UI)
  --------------------------- */

  const SWAP_UI = {
    init(opts = {}) {
      ensureStyles();
      detectContainers();
      state.config = { ...state.config, ...(opts.config || {}) };

      // Hydrate from localStorage if needed
      if (!state.plan) {
        const p = loadPlan();
        if (p) {
          state.plan = p;
          renderPlan(state.plan);
        }
      }
      if (state.plan && !state.recipes) {
        const wk = state.plan.weekStart || (state.plan.days && state.plan.days[0] && state.plan.days[0].date);
        if (wk) {
          const r = loadRecipesForWeek(wk);
          if (r) state.recipes = r;
        }
      }

      if (opts.plan) this.setPlan(opts.plan);
      if (opts.recipes) this.setRecipes(opts.recipes);

      // If swaps panel exists and empty, show hint
      if (state.els.swapsBox && (!state.els.swapsList || (state.els.swapsList && !state.els.swapsList.innerHTML.trim()))) {
        renderSwapsEmpty();
      }
    },

    setPlan(planOrResponse) {
      ensureStyles();
      detectContainers();

      const plan = normalizePlan(planOrResponse);
      if (!plan) return;

      state.plan = plan;
      savePlan(plan);

      // When a new plan arrives, recipes are not necessarily dirty; keep current recipes but mark dirty if week differs
      const wk = plan.weekStart || (plan.days && plan.days[0] && plan.days[0].date) || null;
      if (wk && state.recipes && state.recipes.weekStart && state.recipes.weekStart !== wk) {
        state.recipes = null;
        state.recipesDirty = false;
      }

      renderPlan(plan);

      // If recipes view is visible/exists, re-render recipes too (from LS if present)
      if (state.els.recipesBox || state.els.recipesList) {
        const cached = wk ? loadRecipesForWeek(wk) : null;
        if (cached) {
          state.recipes = cached;
          renderRecipes(state.plan, normalizeRecipes(cached, state.plan));
        }
      }
    },

    setRecipes(recipesOrResponse) {
      ensureStyles();
      detectContainers();

      if (!state.plan) {
        state.plan = loadPlan();
      }
      const norm = normalizeRecipes(recipesOrResponse, state.plan);

      if (!norm) return;

      if (!norm.weekStart && state.plan && state.plan.weekStart) norm.weekStart = state.plan.weekStart;

      state.recipes = norm;
      state.recipesDirty = false;

      saveRecipes(norm);
      if (state.plan) renderRecipes(state.plan, norm);
    },

    renderSwaps(swapsOrResponse) {
      // Manual render if app.js uses it
      if (!state.selected) {
        renderSwapsEmpty();
        return;
      }
      const norm = normalizeSwaps(swapsOrResponse);
      if (!norm.ok) {
        renderSwapsError(norm.error || "Unknown swaps error.");
        return;
      }
      renderSwapsList(norm, state.selected.item, state.selected.ctx);
    },

    replaceSelectedWith(candidate) {
      const res = replaceItemInPlan(candidate);
      if (!res.ok) {
        renderSwapsError(res.error || "Could not replace item.");
        return;
      }

      // Re-render plan calendar
      renderPlan(res.plan);

      // Keep selection (reselect the same position but now new item)
      try {
        const sel = state.selected;
        const found = findSelectedInPlan(res.plan, sel);
        if (found) {
          const newItem = found.meal.items[found.idx];
          state.selected.item = newItem;
          // Trigger swaps refresh for newly replaced item
          loadAndRenderSwaps(newItem, sel.ctx);
        }
      } catch {}

      // Re-render recipes if visible (shows warning until regenerate)
      if (state.plan && (state.els.recipesBox || state.els.recipesList)) {
        const wk = state.plan.weekStart || (state.plan.days && state.plan.days[0] && state.plan.days[0].date);
        const cached = wk ? loadRecipesForWeek(wk) : null;
        const norm = cached ? normalizeRecipes(cached, state.plan) : normalizeRecipes(state.recipes, state.plan);
        renderRecipes(state.plan, norm || { weekStart: wk, byDate: {}, raw: null });
      }
    },

    getState() {
      return { ...state };
    },
  };

  // Backward-compatible aliases (so you don’t have to hunt app.js calls)
  window.SWAP_UI = SWAP_UI;
  window.ui = window.ui || SWAP_UI;
  window.UI = window.UI || SWAP_UI;

  document.addEventListener("DOMContentLoaded", () => {
    SWAP_UI.init();
  });
})();
