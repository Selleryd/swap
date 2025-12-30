// ui.js (ESM) — SWAP UI renderer
// Exports: mountTemplate (required by app.js), plus helpers used by app layer.
// Version: 2025-12-30.3

export const UI_VERSION = "ui-2025-12-30.3";

// -----------------------------
// Fail-open (prevents blank page)
// -----------------------------
export function failOpen() {
  try {
    document.documentElement.style.visibility = "visible";
    document.body.style.visibility = "visible";
    document.body.style.opacity = "1";
    document.body.style.display = "";
    document.documentElement.classList.remove("preload", "loading", "is-loading", "hidden");
    document.body.classList.remove("preload", "loading", "is-loading", "hidden");
  } catch (_) {}
}

// -----------------------------
// DOM helpers
// -----------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function safeJSONParse(s, fallback = null) {
  try { return JSON.parse(s); } catch (_) { return fallback; }
}
function isoToDate(iso) {
  const d = new Date(String(iso || "") + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}
function fmtDow(d) { return d.toLocaleDateString(undefined, { weekday: "long" }); }
function fmtMD(d) { return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric" }); }
function ellipsize(s, n) {
  s = String(s || "").trim();
  if (s.length <= n) return s;
  return s.slice(0, Math.max(0, n - 1)).trim() + "…";
}
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

// -----------------------------
// Style injection
// -----------------------------
function injectStyles() {
  if ($("#swap-ui-css")) return;
  const css = `
/* ---- SWAP UI injected styles (scoped) ---- */
.swap-ui-weekwrap { overflow-x: auto; padding-bottom: 10px; }
.swap-ui-weekgrid {
  display: grid;
  grid-template-columns: repeat(7, minmax(240px, 1fr));
  gap: 14px;
  align-items: start;
  width: 100%;
}
@media (max-width: 1100px) {
  .swap-ui-weekgrid { width: max-content; grid-template-columns: repeat(7, 280px); scroll-snap-type: x mandatory; }
  .swap-ui-day { scroll-snap-align: start; }
}
.swap-ui-day {
  background: rgba(255,255,255,0.78);
  border: 1px solid rgba(15, 23, 42, 0.08);
  border-radius: 18px;
  padding: 12px;
  box-shadow: 0 18px 42px rgba(15, 23, 42, 0.08);
}
.swap-ui-dayhead { display:flex; align-items:baseline; justify-content:space-between; gap:10px; margin-bottom:10px; }
.swap-ui-dayname { font-weight: 900; font-size: 13px; color: rgba(15, 23, 42, 0.92); }
.swap-ui-daydate { font-size: 12px; color: rgba(71, 85, 105, 0.92); font-weight: 700; }

.swap-ui-meal { margin-top: 10px; }
.swap-ui-mealhead { display:flex; align-items:center; justify-content:space-between; gap:8px; padding-bottom:6px; border-bottom:1px solid rgba(15, 23, 42, 0.06); }
.swap-ui-meallabel { font-size: 12px; font-weight: 900; color: rgba(51, 65, 85, 0.95); }
.swap-ui-mealmeta { font-size: 11px; font-weight: 700; color: rgba(100, 116, 139, 0.95); white-space:nowrap; }

.swap-ui-items { display:grid; gap: 8px; margin-top: 8px; }
.swap-ui-food {
  width: 100%;
  text-align: left;
  border: 1px solid rgba(15, 23, 42, 0.09);
  background: rgba(255,255,255,0.96);
  border-radius: 14px;
  padding: 9px 10px;
  cursor: pointer;
  transition: transform .08s ease, box-shadow .12s ease, border-color .12s ease;
}
.swap-ui-food:hover { transform: translateY(-1px); box-shadow: 0 14px 30px rgba(15, 23, 42, 0.10); border-color: rgba(15, 23, 42, 0.16); }
.swap-ui-food.is-selected { outline: 2px solid rgba(99, 102, 241, 0.55); box-shadow: 0 16px 40px rgba(99, 102, 241, 0.18); }

.swap-ui-foodname { font-size: 12px; font-weight: 900; color: rgba(15, 23, 42, 0.92); line-height: 1.2; }
.swap-ui-foodsub { font-size: 11px; font-weight: 700; color: rgba(71, 85, 105, 0.92); margin-top: 3px; display:flex; gap:10px; flex-wrap:wrap; }
.swap-ui-tag { display:inline-flex; align-items:center; gap:6px; padding:3px 8px; border-radius:999px; border:1px solid rgba(15, 23, 42, 0.08); background: rgba(248, 250, 252, 0.9); }

.swap-ui-dot { width:8px; height:8px; border-radius:999px; opacity:0.9; }
.swap-ui-dot.protein{ background: rgba(34, 197, 94, 0.95); }
.swap-ui-dot.carb{ background: rgba(168, 85, 247, 0.95); }
.swap-ui-dot.fat{ background: rgba(239, 68, 68, 0.92); }
.swap-ui-dot.fruit{ background: rgba(59, 130, 246, 0.92); }
.swap-ui-dot.veg{ background: rgba(20, 184, 166, 0.92); }
.swap-ui-dot.other{ background: rgba(148, 163, 184, 0.92); }

.swap-ui-muted { font-size: 12px; color: rgba(100, 116, 139, 0.95); font-weight: 700; padding: 10px 0; }

/* Swaps panel */
.swap-ui-swaps { display:grid; gap:10px; }
.swap-ui-seltitle { font-size: 13px; font-weight: 950; color: rgba(15, 23, 42, 0.92); }
.swap-ui-selmeta { font-size: 11px; font-weight: 700; color: rgba(100, 116, 139, 0.95); }
.swap-ui-swaprow {
  border: 1px solid rgba(15, 23, 42, 0.09);
  background: rgba(255,255,255,0.96);
  border-radius: 14px;
  padding: 10px;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 12px;
}
.swap-ui-swapname { font-size: 12px; font-weight: 900; color: rgba(15, 23, 42, 0.92); line-height:1.2; }
.swap-ui-swapmeta { margin-top:3px; font-size: 11px; font-weight: 700; color: rgba(71, 85, 105, 0.92); }
.swap-ui-btn {
  border: 1px solid rgba(15, 23, 42, 0.10);
  background: rgba(248, 250, 252, 0.92);
  border-radius: 12px;
  padding: 8px 10px;
  font-weight: 900;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
}
.swap-ui-btn:hover { border-color: rgba(15, 23, 42, 0.18); }

/* Recipes accordion */
.swap-ui-recipes { display:grid; gap:10px; }
.swap-ui-acc { border:1px solid rgba(15,23,42,0.09); background: rgba(255,255,255,0.92); border-radius: 18px; overflow:hidden; }
.swap-ui-accbtn { width:100%; text-align:left; padding:12px 14px; display:flex; justify-content:space-between; gap:12px; cursor:pointer; border:0; background:transparent; }
.swap-ui-acctitle { font-size:13px; font-weight: 950; color: rgba(15,23,42,0.92); }
.swap-ui-accsub { font-size:12px; font-weight: 700; color: rgba(100,116,139,0.95); white-space:nowrap; }
.swap-ui-accbody { padding: 0 14px 14px 14px; display:none; }
.swap-ui-acc.is-open .swap-ui-accbody { display:block; }
.swap-ui-recipeblock { border-top: 1px solid rgba(15,23,42,0.06); padding-top: 10px; margin-top: 10px; }
.swap-ui-recipename { font-weight: 950; font-size: 12px; color: rgba(15,23,42,0.92); }
.swap-ui-recipetext { margin-top:6px; font-size:12px; line-height:1.5; color: rgba(51,65,85,0.95); white-space: pre-wrap; }
.swap-ui-link { margin-top: 8px; display:inline-flex; font-size:12px; font-weight: 900; cursor:pointer; color: rgba(99,102,241,0.95); }
.swap-ui-link:hover { text-decoration: underline; }
  `.trim();
  const style = document.createElement("style");
  style.id = "swap-ui-css";
  style.textContent = css;
  document.head.appendChild(style);
}

// -----------------------------
// Mount points (non brittle)
// -----------------------------
function findHeading(text) {
  const t = String(text || "").trim().toLowerCase();
  for (const h of $$("h1,h2,h3")) {
    if (String(h.textContent || "").trim().toLowerCase() === t) return h;
  }
  return null;
}
function getPlanMount() {
  return (
    $("#swap-week-grid") ||
    $("[data-swap-week-grid]") ||
    $("#weekGrid") ||
    $("#week-grid") ||
    $(".week-plan-grid") ||
    (function () {
      const h = findHeading("Week Plan");
      return h ? h.closest("section,div") : null;
    })()
  );
}
function getSwapsMount() {
  return (
    $("#swap-swaps") ||
    $("[data-swap-swaps]") ||
    $("#swapsPanel") ||
    $("#swaps-panel") ||
    $(".swaps-panel") ||
    (function () {
      const h = findHeading("Swaps");
      return h ? h.closest("section,div") : null;
    })()
  );
}
function getRecipesMount() {
  return (
    $("#swap-recipes") ||
    $("[data-swap-recipes]") ||
    $("#recipesList") ||
    $("#recipes-list") ||
    $(".recipes-list") ||
    (function () {
      const h = findHeading("Recipes");
      return h ? h.closest("section,div") : null;
    })()
  );
}

// -----------------------------
// Public state + exports used by app.js
// -----------------------------
export const state = {
  plan: null,
  selected: null, // {dayIndex, mealKey, itemIndex, item}
  swaps: [],
  recipes: null,
};

// Storage keys (compatible with different past versions)
const PLAN_KEYS = ["swap.plan", "SWAP_PLAN", "swap_plan", "swap:plan"];

export function savePlan(plan) {
  try { localStorage.setItem("swap.plan", JSON.stringify(plan)); } catch (_) {}
}
export function loadPlan() {
  for (const k of PLAN_KEYS) {
    const v = localStorage.getItem(k);
    if (!v) continue;
    const p = safeJSONParse(v, null);
    if (p && (p.days || p.weekStart)) return p;
  }
  return null;
}

// -----------------------------
// REQUIRED BY app.js
// mountTemplate: should mount a base template if needed.
// We keep it safe: if DOM already exists, it won't overwrite.
// -----------------------------
export function mountTemplate() {
  injectStyles();
  failOpen();

  // If your HTML already includes layout, do nothing.
  // This function only ensures required mount containers exist.
  const planMount = getPlanMount();
  const swapsMount = getSwapsMount();
  const recipesMount = getRecipesMount();

  // If mounts exist, we’re good.
  if (planMount && swapsMount && recipesMount) return;

  // Minimal fallback layout (only if your page is missing containers)
  const root = $("#app") || document.body;
  const shell = document.createElement("div");
  shell.innerHTML = `
    <div style="max-width:1400px;margin:0 auto;padding:18px;display:grid;grid-template-columns:1fr 360px;gap:16px;">
      <div>
        <div id="swap-week-grid"></div>
        <div style="height:18px"></div>
        <div id="swap-recipes"></div>
      </div>
      <div id="swap-swaps"></div>
    </div>
  `;
  root.appendChild(shell);
}

// -----------------------------
// Meal plan calendar rendering
// -----------------------------
const MEAL_ORDER = [
  { key: "breakfast", label: "Breakfast" },
  { key: "snack_am", label: "Snack (AM)" },
  { key: "lunch", label: "Lunch" },
  { key: "snack_pm", label: "Snack (PM)" },
  { key: "dinner", label: "Dinner" },
];

function normalizeMealKey(k) {
  k = String(k || "").toLowerCase().trim();
  if (k === "snack (am)" || k === "snack_am" || k === "snackam") return "snack_am";
  if (k === "snack (pm)" || k === "snack_pm" || k === "snackpm") return "snack_pm";
  if (k === "breakfast") return "breakfast";
  if (k === "lunch") return "lunch";
  if (k === "dinner") return "dinner";
  return k || "other";
}

function groupDotClass(group) {
  group = String(group || "").toLowerCase();
  if (group.includes("protein")) return "protein";
  if (group.includes("carb") || group.includes("grain") || group.includes("starch")) return "carb";
  if (group.includes("fat") || group.includes("oil")) return "fat";
  if (group.includes("fruit")) return "fruit";
  if (group.includes("veg")) return "veg";
  return "other";
}

function mealTotals(meal) {
  const items = meal?.items || [];
  let c = 0;
  for (const it of items) c += Number(it.calories || 0) || 0;
  return Math.round(c);
}

export function renderPlan(plan) {
  mountTemplate(); // ensures mounts exist
  state.plan = plan;
  savePlan(plan);

  const mount = getPlanMount();
  if (!mount) return;

  const days = Array.isArray(plan?.days) ? plan.days : [];
  if (!days.length) {
    mount.innerHTML = `<div class="swap-ui-muted">No plan found for this week yet.</div>`;
    return;
  }

  const html = `
    <div class="swap-ui-weekwrap">
      <div class="swap-ui-weekgrid">
        ${days.map((day, dayIndex) => {
          const d = isoToDate(day.date) || new Date();
          const meals = Array.isArray(day.meals) ? day.meals : [];
          const mealMap = {};
          for (const m of meals) mealMap[normalizeMealKey(m.key || m.label)] = m;

          return `
            <div class="swap-ui-day" data-day-index="${dayIndex}">
              <div class="swap-ui-dayhead">
                <div class="swap-ui-dayname">${fmtDow(d)}</div>
                <div class="swap-ui-daydate">${fmtMD(d)}</div>
              </div>

              ${MEAL_ORDER.map(({ key, label }) => {
                const m = mealMap[key] || { key, label, items: [] };
                const items = Array.isArray(m.items) ? m.items : [];

                return `
                  <div class="swap-ui-meal" data-meal-key="${key}">
                    <div class="swap-ui-mealhead">
                      <div class="swap-ui-meallabel">${label}</div>
                      <div class="swap-ui-mealmeta">${items.length ? `${mealTotals(m)} kcal` : ""}</div>
                    </div>
                    <div class="swap-ui-items">
                      ${items.length ? items.map((it, itemIndex) => {
                        const g = groupDotClass(it.group);
                        const grams = Math.round(Number(it.grams || it.portion_g || 0) || 0);
                        const cals = Math.round(Number(it.calories || 0) || 0);
                        const name = String(it.name || "Food item");
                        return `
                          <button type="button"
                            class="swap-ui-food"
                            data-day-index="${dayIndex}"
                            data-meal-key="${key}"
                            data-item-index="${itemIndex}"
                          >
                            <div class="swap-ui-foodname">${ellipsize(name, 44)}</div>
                            <div class="swap-ui-foodsub">
                              <span class="swap-ui-tag"><span class="swap-ui-dot ${g}"></span>${String(it.group || "other")}</span>
                              <span class="swap-ui-tag">${grams ? `${grams} g` : "portion"}</span>
                              <span class="swap-ui-tag">${cals ? `${cals} kcal` : "kcal"}</span>
                            </div>
                          </button>
                        `;
                      }).join("") : `<div class="swap-ui-muted">—</div>`}
                    </div>
                  </div>
                `;
              }).join("")}
            </div>
          `;
        }).join("")}
      </div>
    </div>
  `.trim();

  mount.innerHTML = html;

  // Highlight restore
  if (state.selected) highlightSelected(state.selected);
}

function highlightSelected(sel) {
  $$(".swap-ui-food").forEach(b => b.classList.remove("is-selected"));
  const btn = $(`.swap-ui-food[data-day-index="${sel.dayIndex}"][data-meal-key="${sel.mealKey}"][data-item-index="${sel.itemIndex}"]`);
  if (btn) btn.classList.add("is-selected");
}

// -----------------------------
// Swaps render + replace hooks
// (app.js or ui.js can call loadSwaps externally; here we only render)
// -----------------------------
export function renderSwaps(selected, swaps) {
  mountTemplate();
  const mount = getSwapsMount();
  if (!mount) return;

  if (!selected) {
    mount.innerHTML = `<div class="swap-ui-muted">Select a food item to see swaps.</div>`;
    return;
  }

  const it = selected.item || {};
  const grams = Math.round(Number(it.grams || it.portion_g || 0) || 0);
  const cals = Math.round(Number(it.calories || 0) || 0);

  const rows = Array.isArray(swaps) ? swaps : [];
  mount.innerHTML = `
    <div class="swap-ui-swaps">
      <div>
        <div class="swap-ui-seltitle">${ellipsize(String(it.name || "Selected item"), 64)}</div>
        <div class="swap-ui-selmeta">${String(it.group || "other")} • ${grams ? `${grams} g` : "portion"} • ${cals ? `${cals} kcal` : "kcal"}</div>
      </div>

      ${rows.length ? rows.map((s, idx) => {
        const sGrams = Math.round(Number(s.grams || s.portion_g || 0) || 0);
        const sCals = Math.round(Number(s.calories || 0) || 0);
        return `
          <div class="swap-ui-swaprow">
            <div>
              <div class="swap-ui-swapname">${ellipsize(String(s.name || "Swap"), 54)}</div>
              <div class="swap-ui-swapmeta">${sGrams ? `${sGrams} g` : "portion"} • ${sCals ? `${sCals} kcal` : "kcal"}</div>
            </div>
            <button class="swap-ui-btn" type="button" data-action="replace" data-swap-index="${idx}">Replace</button>
          </div>
        `;
      }).join("") : `<div class="swap-ui-muted">No swaps found for this item.</div>`}
    </div>
  `.trim();
}

// -----------------------------
// Recipes render (accordion)
// -----------------------------
export function renderRecipes(recipesObj) {
  mountTemplate();
  const mount = getRecipesMount();
  if (!mount) return;

  // Flexible shapes accepted
  const days = [];
  if (recipesObj && Array.isArray(recipesObj.days)) {
    for (const d of recipesObj.days) days.push(d);
  } else if (recipesObj && typeof recipesObj === "object") {
    const keys = Object.keys(recipesObj).sort();
    for (const date of keys) {
      const v = recipesObj[date];
      const meals = [];
      if (v && typeof v === "object") {
        for (const mk of Object.keys(v)) meals.push({ key: mk, label: mk, text: v[mk] });
      }
      days.push({ date, meals });
    }
  }

  if (!days.length) {
    mount.innerHTML = `<div class="swap-ui-muted">Recipes will appear here after generation.</div>`;
    return;
  }

  mount.innerHTML = `
    <div class="swap-ui-recipes">
      ${days.map((day, idx) => {
        const d = isoToDate(day.date) || new Date();
        const title = `${fmtDow(d)} • ${day.date || fmtMD(d)}`;
        const meals = Array.isArray(day.meals) ? day.meals : [];

        const body = meals.length ? meals.map(m => {
          const label = String(m.label || m.key || "Meal");
          const text = String(m.text || m.recipe || m.recipeText || "").trim();
          return `
            <div class="swap-ui-recipeblock">
              <div class="swap-ui-recipename">${label}</div>
              <div class="swap-ui-recipetext">${text || "No recipe text yet."}</div>
            </div>
          `;
        }).join("") : `<div class="swap-ui-muted">No recipes stored for this day yet.</div>`;

        return `
          <div class="swap-ui-acc" data-acc="${idx}">
            <button type="button" class="swap-ui-accbtn" data-action="toggleAcc" data-acc="${idx}">
              <div class="swap-ui-acctitle">${title}</div>
              <div class="swap-ui-accsub">${meals.length ? `${meals.length} meals` : "No meals"}</div>
            </button>
            <div class="swap-ui-accbody">${body}</div>
          </div>
        `;
      }).join("")}
    </div>
  `.trim();

  const first = $(`.swap-ui-acc[data-acc="0"]`, mount);
  if (first) first.classList.add("is-open");
}

// -----------------------------
// Wiring: click behavior for food → swaps, and replace button
// NOTE: app.js likely already does some of this. This is safe + additive.
// -----------------------------
export function attachUIHandlers({ onFoodClick, onReplaceClick } = {}) {
  // Avoid double-binding
  if (attachUIHandlers._done) return;
  attachUIHandlers._done = true;

  document.addEventListener("click", (e) => {
    const foodBtn = e.target.closest && e.target.closest(".swap-ui-food");
    if (foodBtn) {
      const dayIndex = Number(foodBtn.getAttribute("data-day-index"));
      const mealKey = String(foodBtn.getAttribute("data-meal-key") || "");
      const itemIndex = Number(foodBtn.getAttribute("data-item-index"));

      const plan = state.plan || loadPlan();
      const day = plan?.days?.[dayIndex];
      if (!day) return;

      const meal = (day.meals || []).find(m => normalizeMealKey(m.key || m.label) === mealKey);
      const item = meal?.items?.[itemIndex];
      if (!item) return;

      state.plan = plan;
      state.selected = { dayIndex, mealKey, itemIndex, item };
      highlightSelected(state.selected);

      if (typeof onFoodClick === "function") onFoodClick(state.selected);
      return;
    }

    const rep = e.target.closest && e.target.closest('[data-action="replace"]');
    if (rep) {
      const idx = Number(rep.getAttribute("data-swap-index"));
      if (typeof onReplaceClick === "function") onReplaceClick(idx);
      return;
    }

    const acc = e.target.closest && e.target.closest('[data-action="toggleAcc"]');
    if (acc) {
      const id = acc.getAttribute("data-acc");
      const box = document.querySelector(`.swap-ui-acc[data-acc="${id}"]`);
      if (box) box.classList.toggle("is-open");
    }
  });
}

// -----------------------------
// Boot safety
// -----------------------------
window.addEventListener("error", failOpen);
window.addEventListener("unhandledrejection", failOpen);
failOpen();
injectStyles();
