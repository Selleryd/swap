// ui.js (ES Module)
// Provides the exact named exports app.js imports.
// Focus: stable mounting + clean calendar rendering + recipes rendering + swap sidebar rendering.

"use strict";

/* -----------------------------
   Small, namespaced UI styles
   ----------------------------- */
function ensureInlineStyles_() {
  if (document.getElementById("swap-ui-inline-styles")) return;
  const style = document.createElement("style");
  style.id = "swap-ui-inline-styles";
  style.textContent = `
  .swap-ui * { box-sizing: border-box; }
  .swap-ui {
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial;
    color: #0f172a;
  }
  .swap-ui .shell {
    display: grid;
    grid-template-columns: 260px 1fr;
    min-height: 100vh;
    background: radial-gradient(1200px 600px at 60% -10%, rgba(99,102,241,.18), transparent 60%),
                radial-gradient(900px 500px at 90% 30%, rgba(16,185,129,.14), transparent 60%),
                #f8fafc;
  }
  .swap-ui .sidebar {
    padding: 18px 14px;
    border-right: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.6);
    backdrop-filter: blur(14px);
  }
  .swap-ui .brand {
    display:flex; gap:10px; align-items:center;
    padding: 10px 10px 16px 10px;
  }
  .swap-ui .brand .logo {
    width: 44px; height: 44px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(99,102,241,.25), rgba(16,185,129,.25));
    border: 1px solid rgba(15,23,42,.08);
    display:grid; place-items:center;
    font-weight: 800;
  }
  .swap-ui .brand .title { font-weight: 800; line-height: 1.1; }
  .swap-ui .brand .sub { font-size: 12px; opacity: .72; margin-top: 2px; }

  .swap-ui .nav {
    display:flex; flex-direction:column; gap:10px;
    padding: 10px;
  }
  .swap-ui .nav button {
    width: 100%;
    text-align: left;
    padding: 10px 12px;
    border-radius: 14px;
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.7);
    cursor: pointer;
    font-weight: 700;
  }
  .swap-ui .nav button.is-active {
    background: rgba(99,102,241,.12);
    border-color: rgba(99,102,241,.25);
  }
  .swap-ui .sidebarFooter {
    margin-top: auto;
    padding: 12px 10px;
    position: sticky;
    bottom: 10px;
  }
  .swap-ui .statusPill {
    display:flex; justify-content:space-between; align-items:center; gap:10px;
    padding: 10px 12px;
    border-radius: 16px;
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.75);
  }
  .swap-ui .statusText { font-weight: 700; opacity: .85; }
  .swap-ui .resetBtn {
    padding: 8px 10px;
    border-radius: 12px;
    border: 1px solid rgba(15,23,42,.1);
    background: rgba(255,255,255,.9);
    cursor:pointer;
    font-weight: 800;
  }

  .swap-ui .main {
    padding: 18px;
  }
  .swap-ui .topbar {
    display:flex; justify-content:space-between; align-items:center;
    padding: 12px 14px;
    border-radius: 18px;
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.75);
    backdrop-filter: blur(14px);
  }
  .swap-ui .topbar .crumb {
    font-weight: 900;
  }
  .swap-ui .statsPill {
    font-weight: 800;
    font-size: 13px;
    color: rgba(15,23,42,.75);
    padding: 8px 10px;
    border-radius: 999px;
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.85);
  }

  .swap-ui .contentGrid {
    margin-top: 14px;
    display:grid;
    grid-template-columns: 1.55fr .85fr;
    gap: 14px;
    align-items: start;
  }
  .swap-ui .card {
    border-radius: 22px;
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.75);
    backdrop-filter: blur(14px);
    box-shadow: 0 18px 50px rgba(2,6,23,.08);
  }
  .swap-ui .cardHeader {
    padding: 14px 16px 10px 16px;
    display:flex; justify-content:space-between; align-items:flex-start; gap:10px;
    border-bottom: 1px solid rgba(15,23,42,.06);
  }
  .swap-ui .cardHeader h2 {
    margin: 0;
    font-size: 18px;
    font-weight: 900;
  }
  .swap-ui .muted { opacity: .7; font-size: 13px; margin-top: 2px; }
  .swap-ui .btnRow { display:flex; gap:10px; }
  .swap-ui .btn {
    border: 0;
    padding: 10px 12px;
    border-radius: 14px;
    cursor: pointer;
    font-weight: 900;
    background: rgba(255,255,255,.9);
    border: 1px solid rgba(15,23,42,.1);
  }
  .swap-ui .btnPrimary {
    background: linear-gradient(135deg, rgba(99,102,241,1), rgba(16,185,129,1));
    color: white;
    border: 0;
  }
  .swap-ui .cardBody { padding: 14px 16px 16px 16px; }

  /* Calendar layout */
  .swap-ui .calendarScroller {
    overflow-x: auto;
    padding-bottom: 6px;
  }
  .swap-ui .calendarGrid {
    display:grid;
    grid-template-columns: repeat(7, minmax(220px, 1fr));
    gap: 10px;
    min-width: 980px;
  }
  .swap-ui .dayCol {
    border-radius: 18px;
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.78);
    padding: 10px;
  }
  .swap-ui .dayHead {
    display:flex; justify-content:space-between; align-items:baseline;
    gap: 8px;
    padding: 4px 6px 10px 6px;
  }
  .swap-ui .dayName { font-weight: 950; }
  .swap-ui .dayDate { font-size: 12px; opacity: .68; font-weight: 800; }

  .swap-ui .mealBlock { padding: 8px 6px; border-top: 1px dashed rgba(15,23,42,.12); }
  .swap-ui .mealLabel { font-size: 12px; letter-spacing: .06em; text-transform: uppercase; opacity: .7; font-weight: 900; }
  .swap-ui .pillList { display:flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .swap-ui .foodPill {
    border: 1px solid rgba(15,23,42,.12);
    background: rgba(255,255,255,.95);
    border-radius: 999px;
    padding: 7px 10px;
    cursor: pointer;
    font-weight: 800;
    font-size: 12px;
    line-height: 1.05;
    max-width: 100%;
    text-align: left;
  }
  .swap-ui .foodPill:hover { border-color: rgba(99,102,241,.35); box-shadow: 0 10px 22px rgba(2,6,23,.08); }
  .swap-ui .foodPill .subline { display:block; margin-top: 4px; font-size: 11px; opacity: .62; font-weight: 900; }

  /* Swaps panel */
  .swap-ui .swapIntro {
    padding: 10px 12px;
    border-radius: 16px;
    border: 1px dashed rgba(15,23,42,.18);
    background: rgba(255,255,255,.7);
    font-weight: 800;
    color: rgba(15,23,42,.8);
  }
  .swap-ui .swapList { margin-top: 12px; display:flex; flex-direction:column; gap: 8px; }
  .swap-ui .swapRow {
    display:flex; justify-content:space-between; align-items:flex-start; gap:10px;
    padding: 10px 12px;
    border-radius: 16px;
    border: 1px solid rgba(15,23,42,.1);
    background: rgba(255,255,255,.85);
    cursor: pointer;
  }
  .swap-ui .swapRow:hover { border-color: rgba(16,185,129,.35); box-shadow: 0 10px 22px rgba(2,6,23,.08); }
  .swap-ui .swapName { font-weight: 950; font-size: 13px; }
  .swap-ui .swapMeta { font-size: 12px; opacity: .72; font-weight: 900; margin-top: 4px; }
  .swap-ui .swapKcal { font-weight: 950; font-size: 12px; opacity: .85; white-space: nowrap; }

  /* Recipes */
  .swap-ui .recipesList { display:flex; flex-direction:column; gap: 10px; }
  .swap-ui details {
    border-radius: 18px;
    border: 1px solid rgba(15,23,42,.08);
    background: rgba(255,255,255,.8);
    padding: 10px 12px;
  }
  .swap-ui summary { cursor: pointer; font-weight: 950; }
  .swap-ui .recipeBody { margin-top: 10px; font-weight: 700; opacity: .88; line-height: 1.45; white-space: pre-wrap; }
  .swap-ui .view { display:none; }
  .swap-ui .view.is-active { display:block; }

  @media (max-width: 980px) {
    .swap-ui .shell { grid-template-columns: 1fr; }
    .swap-ui .sidebar { position: sticky; top: 0; z-index: 5; border-right: 0; border-bottom: 1px solid rgba(15,23,42,.08); }
    .swap-ui .contentGrid { grid-template-columns: 1fr; }
    .swap-ui .calendarGrid { min-width: 820px; }
  }
  `;
  document.head.appendChild(style);
}

/* -----------------------------
   Templates
   ----------------------------- */
const TEMPLATES_ = {
  tplSplash: (data = {}) => `
    <div class="swap-ui">
      <div class="shell" style="grid-template-columns: 1fr;">
        <div class="main" style="display:grid; place-items:center;">
          <div class="card" style="max-width: 820px; width: 100%;">
            <div class="cardHeader" style="border-bottom:0;">
              <div>
                <div style="display:flex; gap:10px; align-items:center;">
                  <div class="logo" style="width:54px;height:54px;border-radius:18px;font-weight:1000;display:grid;place-items:center;">SW</div>
                  <div>
                    <div style="font-size:20px;font-weight:1000;">SWAP</div>
                    <div class="muted">Switch With Any Portion</div>
                  </div>
                </div>
              </div>
              <div class="statsPill" id="topbarStats">Ready</div>
            </div>
            <div class="cardBody" style="padding-top: 6px;">
              <div style="font-size:34px;font-weight:1000;line-height:1.05;margin: 6px 0 10px 0;">
                Build a week plan.<br/>Swap any item.
              </div>
              <div class="muted" style="font-size:14px;max-width: 640px;">
                Generate a structured week plan and click any item to see equivalent swaps from your food database.
              </div>
              <div style="margin-top: 18px; display:flex; gap:10px; flex-wrap:wrap;">
                <button class="btn btnPrimary" data-action="go-intake">Enter now</button>
                <button class="btn" data-action="go-profile">Profile</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,

  tplShell: () => `
    <div class="swap-ui">
      <div class="shell">
        <aside class="sidebar">
          <div class="brand">
            <div class="logo">SW</div>
            <div>
              <div class="title">SWAP</div>
              <div class="sub">Switch With Any Portion</div>
            </div>
          </div>

          <div class="nav">
            <button class="is-active" id="navPlan" data-action="tab" data-tab="plan" data-target="plan">Meal Plan</button>
            <button id="navRecipes" data-action="tab" data-tab="recipes" data-target="recipes">Recipes</button>
            <button id="navProfile" data-action="tab" data-tab="profile" data-target="profile">Profile</button>
          </div>

          <div class="sidebarFooter">
            <div class="statusPill">
              <span class="statusText" id="statusText">Ready</span>
              <button class="resetBtn" data-action="reset">Reset</button>
            </div>
          </div>
        </aside>

        <main class="main">
          <div class="topbar">
            <div class="crumb" id="topbarTitle">Meal Plan</div>
            <div class="statsPill" id="topbarStats">—</div>
          </div>

          <!-- PLAN VIEW -->
          <section class="view is-active" id="viewPlan" data-view="plan" data-tab-page="plan">
            <div class="contentGrid">
              <div class="card">
                <div class="cardHeader">
                  <div>
                    <h2>Week Plan</h2>
                    <div class="muted" id="weekStartText">—</div>
                    <div class="muted" style="margin-top:6px;">
                      Click any food item to see equivalent swaps.
                    </div>
                  </div>
                  <div class="btnRow">
                    <button class="btn btnPrimary" data-action="generate-plan" id="btnGeneratePlan">Generate</button>
                    <button class="btn" data-action="regenerate-plan" id="btnRegeneratePlan">Regenerate</button>
                  </div>
                </div>
                <div class="cardBody">
                  <div class="calendarScroller">
                    <div class="calendarGrid" id="calendarGrid"></div>
                  </div>
                </div>
              </div>

              <div class="card">
                <div class="cardHeader">
                  <div>
                    <h2>Swaps</h2>
                    <div class="muted" id="swapHint">Click a food item to see equivalent swaps.</div>
                  </div>
                </div>
                <div class="cardBody">
                  <div id="swapSidebar">
                    <div class="swapIntro" id="swapIntro">
                      <div style="font-weight:950;">Select a food</div>
                      <div style="margin-top:6px;font-weight:800;opacity:.8;">
                        We’ll show equivalent swaps in the same subgroup first (fruit→fruit, grain→grain), then allowed alternates.
                      </div>
                    </div>
                    <div class="swapList" id="swapResults"></div>
                  </div>

                  <div style="margin-top:14px; border-top: 1px solid rgba(15,23,42,.06); padding-top: 12px;">
                    <div style="font-weight:950; font-size:13px;">Free Foods (extra hunger)</div>
                    <div class="pillList" id="freeFoods"></div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <!-- RECIPES VIEW -->
          <section class="view" id="viewRecipes" data-view="recipes" data-tab-page="recipes">
            <div class="card">
              <div class="cardHeader">
                <div>
                  <h2>Recipes</h2>
                  <div class="muted">Recipes generate when you request them. They’re stored in your browser so you don’t lose them.</div>
                </div>
                <div class="btnRow">
                  <button class="btn btnPrimary" data-action="generate-recipes" id="btnGenerateRecipes">Generate recipes for this week</button>
                </div>
              </div>
              <div class="cardBody">
                <div class="recipesList" id="recipesList"></div>
              </div>
            </div>
          </section>

          <!-- PROFILE VIEW -->
          <section class="view" id="viewProfile" data-view="profile" data-tab-page="profile">
            <div class="card">
              <div class="cardHeader">
                <div>
                  <h2>Profile</h2>
                  <div class="muted">Your intake + targets live here.</div>
                </div>
              </div>
              <div class="cardBody">
                <div class="muted">Profile UI is handled in app.js (this is just a stable shell placeholder).</div>
                <div style="margin-top:12px;">
                  <button class="btn" data-action="go-intake">Edit intake</button>
                </div>
              </div>
            </div>
          </section>

        </main>
      </div>
    </div>
  `,
};

/* -----------------------------
   Utilities
   ----------------------------- */
function esc_(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function asDate_(iso) {
  const d = new Date(String(iso || "").slice(0, 10) + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

function fmtDayName_(iso) {
  const d = asDate_(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}

function fmtShortDate_(iso) {
  const d = asDate_(iso);
  if (!d) return "—";
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
}

function fmtWeekLabel_(weekStartIso) {
  const d = asDate_(weekStartIso);
  if (!d) return "Week Plan";
  return `Week of ${d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" })}`;
}

function normalizePlan_(planLike) {
  let plan = planLike;
  if (!plan) return null;
  if (plan.ok && plan.plan) plan = plan.plan;

  // expected:
  // { weekStart, targets, days:[{date, meals:[{key,label,items:[...]}]}] }
  const weekStart = plan.weekStart || plan.week_start || plan.start || plan.week || null;
  const targets = plan.targets || plan.goal || plan.macros || null;
  const days = Array.isArray(plan.days) ? plan.days : Array.isArray(plan.week) ? plan.week : null;

  if (!days) return { weekStart, targets, days: [] };

  // ensure each day has a meals array
  const fixedDays = days.map((d) => {
    const date = d.date || d.day || d.iso || null;
    const meals = Array.isArray(d.meals) ? d.meals : [];
    return { date, meals };
  });

  return { weekStart, targets, days: fixedDays };
}

function mealOrder_() {
  return [
    { key: "breakfast", label: "Breakfast" },
    { key: "snack_am", label: "Snack (AM)" },
    { key: "lunch", label: "Lunch" },
    { key: "snack_pm", label: "Snack (PM)" },
    { key: "dinner", label: "Dinner" },
  ];
}

function findMeal_(meals, key) {
  // accept: snack-am, snack_am, snack (am), etc
  const norm = (s) => String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const wanted = norm(key);
  return (meals || []).find((m) => norm(m.key || m.id || m.name || "") === wanted) || null;
}

/* -----------------------------
   Exported API (used by app.js)
   ----------------------------- */
function mountTemplate(root, templateName, data) {
  ensureInlineStyles_();
  const tpl = TEMPLATES_[templateName];
  if (!tpl) throw new Error(`ui.js: unknown template "${templateName}"`);
  root.innerHTML = typeof tpl === "function" ? tpl(data) : String(tpl);
}

function setStatus(text) {
  const el = document.getElementById("statusText");
  if (el) el.textContent = String(text ?? "");
}

function setTopbar(value) {
  // Accept either object {kcal, protein} or string.
  const el = document.getElementById("topbarStats");
  if (!el) return;

  if (value && typeof value === "object") {
    const kcal = value.kcal ?? value.calories ?? value.kcal_per_day ?? "—";
    const protein = value.protein ?? value.protein_g ?? value.protein_per_day ?? "—";
    el.textContent = `${kcal} kcal/day • ≥${protein}g protein/day`;
    return;
  }
  el.textContent = String(value ?? "—");
}

function renderCalendar(planLike) {
  const grid = document.getElementById("calendarGrid");
  if (!grid) return;

  const plan = normalizePlan_(planLike);

  const weekStartEl = document.getElementById("weekStartText");
  if (weekStartEl) weekStartEl.textContent = plan?.weekStart ? fmtWeekLabel_(plan.weekStart) : "Week Plan";

  // If no plan yet, show a tidy placeholder week.
  const days = (plan?.days && plan.days.length) ? plan.days : Array.from({ length: 7 }).map((_, i) => ({ date: null, meals: [] }));

  const mealDefs = mealOrder_();

  grid.innerHTML = days
    .map((day, idx) => {
      const dateIso = day.date || null;
      const dayName = dateIso ? fmtDayName_(dateIso) : ["Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday","Friday"][idx] || "Day";
      const dayDate = dateIso ? fmtShortDate_(dateIso) : "—";

      const mealsHtml = mealDefs.map(({ key, label }) => {
        const meal = findMeal_(day.meals, key);
        const items = Array.isArray(meal?.items) ? meal.items : [];

        const pills = items.length
          ? items.map((it) => {
              const id = it.id ?? it.foodId ?? it.usda_id ?? "";
              const name = it.name ?? it.title ?? "Item";
              const grams = it.grams ?? it.g ?? it.portion_g ?? it.portion ?? "";
              const kcal = it.calories ?? it.kcal ?? "";
              const p = it.protein_g ?? it.protein ?? "";
              const c = it.carbs_g ?? it.carbs ?? "";
              const f = it.fat_g ?? it.fat ?? "";
              const group = it.group ?? "";
              const subgroup = it.subgroup ?? "";

              const subline = grams ? `${grams}g${kcal ? ` • ${kcal} kcal` : ""}` : (kcal ? `${kcal} kcal` : "");

              return `
                <button
                  class="foodPill"
                  type="button"
                  title="${esc_(name)}"
                  data-action="select-food"
                  data-food-id="${esc_(id)}"
                  data-food-name="${esc_(name)}"
                  data-food-grams="${esc_(grams)}"
                  data-food-calories="${esc_(kcal)}"
                  data-food-protein_g="${esc_(p)}"
                  data-food-carbs_g="${esc_(c)}"
                  data-food-fat_g="${esc_(f)}"
                  data-food-group="${esc_(group)}"
                  data-food-subgroup="${esc_(subgroup)}"
                  data-plan-date="${esc_(dateIso || "")}"
                  data-plan-meal="${esc_(key)}"
                >
                  ${esc_(name)}
                  ${subline ? `<span class="subline">${esc_(subline)}</span>` : ""}
                </button>
              `;
            }).join("")
          : `<div class="muted" style="margin-top:8px;">—</div>`;

        return `
          <div class="mealBlock">
            <div class="mealLabel">${esc_(label)}</div>
            <div class="pillList">${pills}</div>
          </div>
        `;
      }).join("");

      return `
        <div class="dayCol">
          <div class="dayHead">
            <div class="dayName">${esc_(dayName)}</div>
            <div class="dayDate">${esc_(dayDate)}</div>
          </div>
          ${mealsHtml}
        </div>
      `;
    })
    .join("");
}

function renderSwapSidebar(selectedFood) {
  const hint = document.getElementById("swapHint");
  const intro = document.getElementById("swapIntro");
  const results = document.getElementById("swapResults");

  if (!results) return;

  // selectedFood can be null -> show intro again
  if (!selectedFood) {
    if (hint) hint.textContent = "Click a food item to see equivalent swaps.";
    if (intro) intro.style.display = "";
    results.innerHTML = "";
    return;
  }

  const name = selectedFood.name || selectedFood.food_name || selectedFood.title || "Selected food";
  if (hint) hint.textContent = `Swaps for: ${name}`;
  if (intro) intro.style.display = "none";
  results.innerHTML = "";
}

function renderSwapResults(swapsLike, selectedFood) {
  const results = document.getElementById("swapResults");
  const intro = document.getElementById("swapIntro");
  if (!results) return;

  const swaps = (swapsLike && swapsLike.ok && swapsLike.swaps) ? swapsLike.swaps : swapsLike;
  const list = Array.isArray(swaps) ? swaps : [];

  if (intro) intro.style.display = selectedFood ? "none" : "";

  if (!list.length) {
    results.innerHTML = `<div class="muted">No swaps yet. Click a food item in the plan.</div>`;
    return;
  }

  results.innerHTML = list.map((s) => {
    const id = s.id ?? s.foodId ?? "";
    const name = s.name ?? s.title ?? "Swap";
    const grams = s.grams ?? s.g ?? s.portion_g ?? "";
    const kcal = s.calories ?? s.kcal ?? "";
    const p = s.protein_g ?? "";
    const c = s.carbs_g ?? "";
    const f = s.fat_g ?? "";
    const group = s.group ?? "";
    const subgroup = s.subgroup ?? "";

    const metaParts = [];
    if (grams) metaParts.push(`${grams}g`);
    if (p || c || f) metaParts.push(`P${p || 0} C${c || 0} F${f || 0}`);
    const meta = metaParts.join(" • ");

    return `
      <div
        class="swapRow"
        role="button"
        tabindex="0"
        data-action="apply-swap"
        data-swap-id="${esc_(id)}"
        data-swap-name="${esc_(name)}"
        data-swap-grams="${esc_(grams)}"
        data-swap-calories="${esc_(kcal)}"
        data-swap-protein_g="${esc_(p)}"
        data-swap-carbs_g="${esc_(c)}"
        data-swap-fat_g="${esc_(f)}"
        data-swap-group="${esc_(group)}"
        data-swap-subgroup="${esc_(subgroup)}"
      >
        <div>
          <div class="swapName">${esc_(name)}</div>
          <div class="swapMeta">${esc_(meta)}</div>
        </div>
        <div class="swapKcal">${kcal ? `${esc_(kcal)} kcal` : ""}</div>
      </div>
    `;
  }).join("");
}

function renderFreeFoods(listLike) {
  const box = document.getElementById("freeFoods");
  if (!box) return;
  const list = Array.isArray(listLike) ? listLike : [];
  box.innerHTML = list.map((x) => {
    const label = typeof x === "string" ? x : (x?.name || x?.label || "");
    if (!label) return "";
    return `<span class="foodPill" style="cursor:default;">${esc_(label)}</span>`;
  }).join("");
}

function renderRecipes(recipesLike, planLike) {
  const listEl = document.getElementById("recipesList");
  if (!listEl) return;

  // Normalize shapes:
  // - {ok:true, recipes:{weekStart, days:[{date, items:[{title, body}]}]}}
  // - {weekStart, days:[{date, recipes:[...]}]}
  // - Array of day objects
  let recipes = recipesLike;
  if (recipes && recipes.ok && recipes.recipes) recipes = recipes.recipes;

  const plan = normalizePlan_(planLike);
  const weekStart = recipes?.weekStart || plan?.weekStart || null;

  const days =
    Array.isArray(recipes?.days) ? recipes.days :
    Array.isArray(recipes) ? recipes :
    Array.isArray(plan?.days) ? plan.days.map(d => ({ date: d.date, recipes: [] })) :
    [];

  if (!days.length) {
    listEl.innerHTML = `<div class="muted">Recipes will appear here after generation.</div>`;
    return;
  }

  listEl.innerHTML = days.map((d) => {
    const date = d.date || d.day || null;
    const title = date ? `${fmtDayName_(date)} • ${fmtShortDate_(date)}` : "Day";
    const entries = Array.isArray(d.recipes) ? d.recipes
                  : Array.isArray(d.items) ? d.items
                  : Array.isArray(d.meals) ? d.meals
                  : [];

    if (!entries.length) {
      return `<div class="muted">${esc_(title)}<div class="muted">Recipes will appear here after generation.</div></div>`;
    }

    const blocks = entries.map((r, idx) => {
      const rTitle = r.title || r.name || r.label || `Recipe ${idx + 1}`;
      const body = r.body || r.text || r.instructions || r.recipe || "";
      return `
        <details>
          <summary>${esc_(rTitle)}</summary>
          <div class="recipeBody">${esc_(body)}</div>
        </details>
      `;
    }).join("");

    return `
      <div>
        <div style="font-weight:1000; margin: 8px 0;">${esc_(title)}</div>
        ${blocks}
      </div>
    `;
  }).join("");
}

/* -----------------------------
   Exports (MUST match app.js)
   ----------------------------- */
export {
  mountTemplate,
  setStatus,
  setTopbar,
  renderCalendar,
  renderSwapSidebar,
  renderSwapResults,
  renderFreeFoods,
  renderRecipes
};
