// ui.js — SWAP UI (calendar + swaps panel + recipes)
// Must export the exact names that app.js imports.

import { Storage } from "./storage.js";
import { API } from "./api.js";

const UI_STATE = {
  plan: null,
  profile: null,
  selected: null, // { date, mealKey, itemIndex, item }
  swapCache: new Map(), // key -> groups
  recipes: null, // { [date]: recipeDay }
  wired: false,
  cssInjected: false,
};

function $(sel, root = document) {
  return root.querySelector(sel);
}
function $all(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function fmtDateShort(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
}
function dayName(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { weekday: "long" });
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}
function round(n, digits = 0) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  const p = 10 ** digits;
  return Math.round(x * p) / p;
}

function normalizeItem(raw) {
  if (!raw) return null;

  // Plan item shapes we’ve seen:
  // 1) { label, food_id, subgroup, swap_vector, grams, macros:{kcal,carbs_g,protein_g,fat_g...} }
  // 2) { name, id, group, subgroup, grams, calories, protein_g, carbs_g, fat_g, portion }
  const label = raw.label ?? raw.name ?? "";
  const food_id = raw.food_id ?? raw.id ?? null;

  const subgroup = raw.subgroup ?? raw.sub_group ?? "";
  const group = raw.group ?? inferGroupFromSubgroup(subgroup) ?? "";

  const grams =
    Number(raw.grams ?? raw.gram ?? 0) ||
    parseFloat(String(raw.portion ?? "").replace(/[^\d.]/g, "")) ||
    0;

  let macros = raw.macros ?? null;

  if (!macros) {
    // Try to assemble from flat fields
    const kcal = raw.calories ?? raw.kcal ?? 0;
    const protein_g = raw.protein_g ?? raw.protein ?? 0;
    const carbs_g = raw.carbs_g ?? raw.carbs ?? 0;
    const fat_g = raw.fat_g ?? raw.fat ?? 0;
    if ([kcal, protein_g, carbs_g, fat_g].some((v) => Number(v) > 0)) {
      macros = { kcal: Number(kcal), protein_g: Number(protein_g), carbs_g: Number(carbs_g), fat_g: Number(fat_g) };
    }
  }

  const swap_vector = raw.swap_vector ?? raw.swapVec ?? raw.swapvec ?? null;

  return {
    raw,
    label: String(label).trim(),
    food_id,
    subgroup: String(subgroup).trim(),
    group: String(group).trim(),
    grams: Number.isFinite(Number(grams)) ? Number(grams) : 0,
    macros: macros || null,
    swap_vector: swap_vector || null,
  };
}

function inferGroupFromSubgroup(subgroup) {
  const s = String(subgroup || "").toLowerCase();
  if (!s) return "";
  if (s.includes("fruit")) return "fruit";
  if (s.includes("fat") || s.includes("oil") || s.includes("nuts") || s.includes("avocado")) return "fat";
  if (s.includes("protein") || s.includes("meat") || s.includes("poultry") || s.includes("fish") || s.includes("egg")) return "protein";
  if (s.includes("grain") || s.includes("bread") || s.includes("pasta") || s.includes("rice") || s.includes("starch") || s.includes("starchy")) return "carb";
  if (s.includes("veg") || s.includes("vegetable")) return "free";
  return "";
}

function groupDotClass(item) {
  // Keep your “legend” concept:
  // carbs = purple, protein = green, fat = red, free foods = blue (matches your example doc legend style :contentReference[oaicite:1]{index=1})
  const g = (item.group || "").toLowerCase();
  const s = (item.subgroup || "").toLowerCase();

  if (g === "carb" || g === "carbs" || s.includes("grain") || s.includes("starch") || s.includes("starchy")) return "swap-dot--carb";
  if (g === "protein" || s.includes("protein") || s.includes("meat") || s.includes("poultry") || s.includes("fish") || s.includes("egg")) return "swap-dot--protein";
  if (g === "fat" || s.includes("fat") || s.includes("oil") || s.includes("nuts") || s.includes("avocado")) return "swap-dot--fat";
  if (g === "fruit" || s.includes("fruit")) return "swap-dot--carb"; // fruit shows with carb color in many exchange sheets; tweak later if you want separate
  return "swap-dot--free";
}

function ensureCSS() {
  if (UI_STATE.cssInjected) return;
  UI_STATE.cssInjected = true;

  const style = document.createElement("style");
  style.id = "swap-ui-injected";
  style.textContent = `
    /* UI.js injected polish (safe, scoped) */
    .swap-ui-wrap { display:flex; gap:18px; align-items:stretch; }
    .swap-ui-main { flex:1; min-width: 0; }
    .swap-ui-side { width: 420px; max-width: 42vw; min-width: 320px; }
    @media (max-width: 1100px){
      .swap-ui-wrap { flex-direction: column; }
      .swap-ui-side { width:100%; max-width:none; min-width:0; }
    }

    .swap-week-head { display:flex; align-items:flex-end; justify-content:space-between; gap:12px; margin: 6px 0 12px; }
    .swap-week-title { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; }
    .swap-week-sub { color: rgba(0,0,0,0.55); font-weight: 600; margin-top: 2px; }

    .swap-legend { display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin: 10px 0 14px; }
    .swap-legend .swap-legend-item { display:flex; gap:8px; align-items:center; color: rgba(0,0,0,0.6); font-weight: 700; font-size: 12px; }

    .swap-dot { width:10px; height:10px; border-radius: 999px; display:inline-block; }
    .swap-dot--carb { background: #7c3aed; }    /* purple */
    .swap-dot--protein { background: #16a34a; } /* green */
    .swap-dot--fat { background: #ef4444; }     /* red */
    .swap-dot--free { background: #2563eb; }    /* blue */

    .swap-calendar { display:flex; gap:14px; overflow:auto; padding: 6px 2px 10px; scroll-snap-type: x proximity; }
    .swap-day { min-width: 280px; max-width: 320px; scroll-snap-align: start; border-radius: 18px; border: 1px solid rgba(0,0,0,0.08); background: rgba(255,255,255,0.85); box-shadow: 0 10px 25px rgba(0,0,0,0.06); padding: 12px; }
    .swap-day-head { display:flex; justify-content:space-between; align-items:baseline; gap:10px; padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.06); }
    .swap-day-name { font-weight: 900; font-size: 16px; }
    .swap-day-date { font-weight: 800; color: rgba(0,0,0,0.45); font-size: 13px; }

    .swap-meal { margin-top: 10px; }
    .swap-meal-title { font-size: 12px; font-weight: 900; letter-spacing: 0.08em; color: rgba(0,0,0,0.45); margin: 10px 0 6px; }
    .swap-items { display:flex; flex-direction:column; gap:8px; }

    .swap-item-btn { width:100%; border:1px solid rgba(0,0,0,0.10); background: rgba(255,255,255,0.95); border-radius: 14px; padding: 10px 10px; text-align:left; cursor:pointer; display:flex; gap:10px; align-items:flex-start; transition: transform .06s ease, box-shadow .12s ease, border-color .12s ease; }
    .swap-item-btn:hover { box-shadow: 0 10px 18px rgba(0,0,0,0.08); border-color: rgba(0,0,0,0.18); }
    .swap-item-btn:active { transform: translateY(1px); }
    .swap-item-btn.is-selected { outline: 3px solid rgba(124,58,237,0.18); border-color: rgba(124,58,237,0.35); }

    .swap-item-main { flex:1; min-width: 0; }
    .swap-item-title { font-weight: 900; font-size: 13px; line-height: 1.15; }
    .swap-item-sub { margin-top: 3px; color: rgba(0,0,0,0.55); font-weight: 700; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .swap-item-meta { margin-top: 6px; color: rgba(0,0,0,0.45); font-weight: 800; font-size: 11px; display:flex; gap:10px; flex-wrap:wrap; }
    .swap-item-right { color: rgba(0,0,0,0.55); font-weight: 900; font-size: 12px; white-space: nowrap; }

    .swap-panel { border-radius: 18px; border: 1px solid rgba(0,0,0,0.08); background: rgba(255,255,255,0.85); box-shadow: 0 10px 25px rgba(0,0,0,0.06); padding: 14px; }
    .swap-panel h3 { margin: 0; font-size: 18px; font-weight: 900; }
    .swap-panel .sub { margin-top: 4px; color: rgba(0,0,0,0.55); font-weight: 700; }

    .swap-selected { margin-top: 12px; padding: 10px; border-radius: 14px; border: 1px dashed rgba(0,0,0,0.18); background: rgba(0,0,0,0.02); }
    .swap-selected .name { font-weight: 900; }
    .swap-selected .meta { margin-top: 6px; display:flex; gap:10px; flex-wrap:wrap; color: rgba(0,0,0,0.55); font-weight: 800; font-size: 12px; }

    .swap-groups { margin-top: 12px; display:flex; flex-direction:column; gap:10px; }
    .swap-group { border:1px solid rgba(0,0,0,0.08); border-radius: 14px; overflow:hidden; background: rgba(255,255,255,0.75); }
    .swap-group-head { padding: 10px 12px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none; }
    .swap-group-head .t { font-weight: 900; }
    .swap-group-body { padding: 10px 12px; display:flex; flex-direction:column; gap:10px; }

    .swap-sug { display:flex; justify-content:space-between; gap:10px; align-items:flex-start; }
    .swap-sug .left { flex:1; min-width:0; }
    .swap-sug .nm { font-weight: 900; font-size: 13px; }
    .swap-sug .mm { margin-top: 4px; color: rgba(0,0,0,0.55); font-weight: 800; font-size: 12px; display:flex; gap:10px; flex-wrap:wrap; }
    .swap-sug .btn { border: 1px solid rgba(0,0,0,0.14); background: white; border-radius: 12px; padding: 8px 10px; font-weight: 900; cursor:pointer; }
    .swap-sug .btn:hover { box-shadow: 0 10px 18px rgba(0,0,0,0.08); }

    .swap-status-pill { position: fixed; left: 16px; bottom: 16px; z-index: 9999; background: rgba(255,255,255,0.9); border: 1px solid rgba(0,0,0,0.12); border-radius: 999px; padding: 10px 14px; box-shadow: 0 12px 30px rgba(0,0,0,0.12); font-weight: 900; color: rgba(0,0,0,0.72); display:none; }
    .swap-status-pill.show { display:inline-flex; align-items:center; gap:10px; }
    .swap-spinner { width: 12px; height: 12px; border-radius: 999px; border: 2px solid rgba(0,0,0,0.18); border-top-color: rgba(0,0,0,0.55); animation: swapspin .8s linear infinite; }
    @keyframes swapspin { to { transform: rotate(360deg); } }

    /* Recipes */
    .swap-recipes { display:flex; flex-direction:column; gap:12px; }
    .swap-rec-day { border: 1px solid rgba(0,0,0,0.08); border-radius: 16px; background: rgba(255,255,255,0.85); overflow:hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); }
    .swap-rec-day-head { padding: 12px 14px; display:flex; justify-content:space-between; align-items:center; cursor:pointer; user-select:none; }
    .swap-rec-day-head .d { font-weight: 900; }
    .swap-rec-day-body { padding: 12px 14px; display:flex; flex-direction:column; gap:14px; }
    .swap-rec-meal { border-top: 1px solid rgba(0,0,0,0.06); padding-top: 12px; }
    .swap-rec-meal:first-child { border-top: none; padding-top: 0; }
    .swap-rec-meal .h { font-weight: 900; font-size: 14px; }
    .swap-rec-meal .s { margin-top: 6px; color: rgba(0,0,0,0.62); font-weight: 700; }
    .swap-rec-cols { margin-top: 10px; display:grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 900px){ .swap-rec-cols { grid-template-columns: 1fr; } }
    .swap-rec-box { border: 1px solid rgba(0,0,0,0.08); border-radius: 14px; background: rgba(0,0,0,0.02); padding: 10px 12px; }
    .swap-rec-box .t { font-weight: 900; margin-bottom: 8px; }
    .swap-rec-box ol { margin: 0; padding-left: 18px; }
    .swap-rec-box li { margin: 6px 0; font-weight: 700; color: rgba(0,0,0,0.65); }
  `;
  document.head.appendChild(style);
}

function ensureStatusPill() {
  let pill = $("#swapStatusPill");
  if (!pill) {
    pill = document.createElement("div");
    pill.id = "swapStatusPill";
    pill.className = "swap-status-pill";
    pill.innerHTML = `<span class="swap-spinner" aria-hidden="true"></span><span class="txt"></span>`;
    document.body.appendChild(pill);
  }
  return pill;
}

export function setStatus(text, opts = {}) {
  ensureCSS();
  const pill = ensureStatusPill();
  const t = String(text || "").trim();
  const show = opts.show ?? Boolean(t);
  $(".txt", pill).textContent = t || "…";
  pill.classList.toggle("show", Boolean(show));
  pill.querySelector(".swap-spinner").style.display = opts.spin === false ? "none" : "inline-block";
}

export function mountTemplate(rootEl, templateId) {
  ensureCSS();

  const root = typeof rootEl === "string" ? document.querySelector(rootEl) : rootEl;
  if (!root) throw new Error("mountTemplate: root element not found");

  const tpl = document.getElementById(templateId);
  root.innerHTML = "";

  if (tpl && tpl.content) {
    root.appendChild(tpl.content.cloneNode(true));
  } else {
    // Safe fallback (shouldn’t be used if your index.html templates exist)
    root.innerHTML = `
      <div class="swap-ui-wrap" style="padding:18px;">
        <div class="swap-ui-main">
          <div class="swap-week-head">
            <div>
              <div class="swap-week-title">Week Plan</div>
              <div class="swap-week-sub" data-ui="weekSub">—</div>
            </div>
            <div style="display:flex; gap:10px;">
              <button data-action="generate-plan">Generate</button>
              <button data-action="regenerate-plan">Regenerate</button>
            </div>
          </div>
          <div data-ui="calendarHost"></div>
        </div>
        <div class="swap-ui-side">
          <div class="swap-panel">
            <h3>Swaps</h3>
            <div class="sub">Click a food item to see equivalent swaps.</div>
            <div data-ui="swapsHost"></div>
          </div>
          <div style="height:14px;"></div>
          <div class="swap-panel">
            <h3>Free Foods</h3>
            <div class="sub">Extra hunger helpers</div>
            <div data-ui="freeFoodsHost"></div>
          </div>
        </div>
      </div>
    `;
  }

  wireOnce(root);
}

export function setTopbar(arg1, arg2) {
  // Flexible: setTopbar("Meal Plan") or setTopbar({title, subtitle})
  const data = typeof arg1 === "object" ? arg1 : { title: arg1, subtitle: arg2 };
  const title = data?.title != null ? String(data.title) : "";
  const subtitle = data?.subtitle != null ? String(data.subtitle) : "";

  const titleEl =
    document.querySelector('[data-ui="pageTitle"]') ||
    document.querySelector('[data-role="page-title"]') ||
    document.querySelector(".page-title");

  if (titleEl && title) titleEl.textContent = title;

  const subEl =
    document.querySelector('[data-ui="pageSub"]') ||
    document.querySelector('[data-role="page-subtitle"]') ||
    document.querySelector(".page-subtitle");

  if (subEl) subEl.textContent = subtitle || "";
}

function getProfileSafe() {
  try {
    const p = Storage?.getProfile?.() ?? null;
    if (p) return p;
  } catch (_) {}
  return UI_STATE.profile;
}

function setProfileCache() {
  UI_STATE.profile = getProfileSafe();
}

function findCalendarHost() {
  return (
    document.querySelector('[data-ui="calendarHost"]') ||
    document.querySelector('[data-region="calendar"]') ||
    document.querySelector("#calendar") ||
    document.querySelector("#planCalendar") ||
    document.querySelector("#weekCalendar") ||
    document.querySelector('[data-view="plan"] [data-ui="body"]') ||
    null
  );
}

function findSwapsHost() {
  return (
    document.querySelector('[data-ui="swapsHost"]') ||
    document.querySelector('[data-region="swaps"]') ||
    document.querySelector("#swapsPanel") ||
    document.querySelector("#swapPanel") ||
    document.querySelector("#swaps") ||
    null
  );
}

function findFreeFoodsHost() {
  return (
    document.querySelector('[data-ui="freeFoodsHost"]') ||
    document.querySelector('[data-region="freefoods"]') ||
    document.querySelector("#freeFoods") ||
    document.querySelector("#freefoods") ||
    null
  );
}

function findRecipesHost() {
  return (
    document.querySelector('[data-ui="recipesHost"]') ||
    document.querySelector('[data-region="recipes"]') ||
    document.querySelector("#recipes") ||
    document.querySelector("#recipesPanel") ||
    null
  );
}

function wireOnce(root) {
  if (UI_STATE.wired) return;
  UI_STATE.wired = true;

  // Make sure buttons show feedback even if app.js does the actual work.
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-action]");
    if (!btn) return;
    const action = btn.getAttribute("data-action");
    if (!action) return;

    if (action === "generate-plan" || action === "regenerate-plan") {
      setStatus(action === "generate-plan" ? "Generating plan…" : "Regenerating plan…", { show: true });
      // app.js should call renderCalendar when finished; we’ll auto clear then.
    }

    if (action === "generate-recipes") {
      setStatus("Generating recipes…", { show: true });
      // We also provide a fallback generator if app.js doesn’t.
      maybeGenerateRecipesFallback().catch(() => {});
    }
  });

  // Calendar item click delegation
  document.addEventListener("click", (e) => {
    const itemBtn = e.target?.closest?.("[data-swap-item]");
    if (!itemBtn) return;

    const payload = itemBtn.getAttribute("data-swap-item");
    if (!payload) return;

    try {
      const meta = JSON.parse(payload);
      handlePickItem(meta, itemBtn).catch((err) => {
        setStatus(String(err?.message || err || "Swap load failed"), { show: true, spin: false });
        setTimeout(() => setStatus("", { show: false }), 1800);
      });
    } catch (_) {}
  });

  // Apply swap delegation
  document.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("[data-apply-swap]");
    if (!btn) return;
    const raw = btn.getAttribute("data-apply-swap");
    if (!raw) return;

    try {
      const data = JSON.parse(raw); // { to, at }
      applySwapLocal(data).catch((err) => {
        setStatus(String(err?.message || err || "Could not apply swap"), { show: true, spin: false });
        setTimeout(() => setStatus("", { show: false }), 1800);
      });
    } catch (_) {}
  });

  // Accordion toggles
  document.addEventListener("click", (e) => {
    const head = e.target?.closest?.("[data-acc-head]");
    if (!head) return;
    const body = head.parentElement?.querySelector?.("[data-acc-body]");
    if (!body) return;
    const open = body.getAttribute("data-open") !== "true";
    body.setAttribute("data-open", open ? "true" : "false");
    body.style.display = open ? "flex" : "none";
  });

  // Recipe day accordion
  document.addEventListener("click", (e) => {
    const head = e.target?.closest?.("[data-rec-day-head]");
    if (!head) return;
    const body = head.parentElement?.querySelector?.("[data-rec-day-body]");
    if (!body) return;
    const open = body.getAttribute("data-open") !== "true";
    body.setAttribute("data-open", open ? "true" : "false");
    body.style.display = open ? "flex" : "none";
  });
}

function renderLegend() {
  return `
    <div class="swap-legend">
      <div class="swap-legend-item"><span class="swap-dot swap-dot--carb"></span> Carbs</div>
      <div class="swap-legend-item"><span class="swap-dot swap-dot--protein"></span> Protein</div>
      <div class="swap-legend-item"><span class="swap-dot swap-dot--fat"></span> Fat</div>
      <div class="swap-legend-item"><span class="swap-dot swap-dot--free"></span> Free foods</div>
    </div>
  `;
}

function renderItemButton(item, meta) {
  const nm = escapeHtml(item.label || "Unknown");
  const sub = escapeHtml(item.subgroup || item.group || "");
  const grams = item.grams ? `${round(item.grams, 0)}g` : "";

  let kcal = "";
  if (item.macros?.kcal != null && Number(item.macros.kcal) > 0) kcal = `${round(item.macros.kcal, 0)} kcal`;

  const dotClass = groupDotClass(item);

  const metaJson = escapeHtml(JSON.stringify(meta));

  return `
    <button class="swap-item-btn" data-swap-item="${metaJson}" title="${nm}">
      <span class="swap-dot ${dotClass}" style="margin-top:4px;"></span>
      <span class="swap-item-main">
        <div class="swap-item-title">${nm}</div>
        ${sub ? `<div class="swap-item-sub">${sub}</div>` : ``}
        <div class="swap-item-meta">
          ${grams ? `<span>${grams}</span>` : ``}
          ${kcal ? `<span>${kcal}</span>` : ``}
        </div>
      </span>
      <span class="swap-item-right">Swap</span>
    </button>
  `;
}

function mealLabel(mealKey) {
  const m = String(mealKey || "");
  if (m === "snack_am") return "Snack (AM)";
  if (m === "snack_pm") return "Snack (PM)";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

function getMealsInOrder(mealsObj) {
  const order = ["breakfast", "snack_am", "lunch", "snack_pm", "dinner"];
  const keys = Object.keys(mealsObj || {});
  return order.filter((k) => keys.includes(k));
}

function normalizePlan(plan) {
  if (!plan) return null;

  // plan could be { weekStart, days:[{date, meals:{...}}] } or other
  const days = Array.isArray(plan.days) ? plan.days : [];
  const weekStart = plan.weekStart ?? plan.week_start ?? (days[0]?.date ?? "");

  const out = { ...plan, weekStart, days };
  return out;
}

export function renderCalendar(planArg, opts = {}) {
  ensureCSS();
  setProfileCache();

  const plan = normalizePlan(planArg);
  UI_STATE.plan = plan;

  const host = findCalendarHost();
  if (!host) return;

  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
    host.innerHTML = `
      <div class="swap-week-head">
        <div>
          <div class="swap-week-title">Week Plan</div>
          <div class="swap-week-sub">No plan yet. Click Generate.</div>
        </div>
      </div>
    `;
    setStatus("", { show: false });
    return;
  }

  const weekLabel =
    plan.days?.[0]?.date
      ? `Week of ${fmtDateShort(plan.days[0].date)}`
      : (plan.weekStart ? `Week of ${fmtDateShort(plan.weekStart)}` : "—");

  // Try to update any existing header subtitle in your template
  const subEl = document.querySelector('[data-ui="weekSub"]');
  if (subEl) subEl.textContent = weekLabel;

  const daysHtml = plan.days
    .map((day, dayIndex) => {
      const date = day.date ?? "";
      const meals = day.meals ?? {};
      const keys = getMealsInOrder(meals);

      const mealsHtml = keys
        .map((mealKey) => {
          const meal = meals[mealKey] ?? {};
          const items = Array.isArray(meal.items) ? meal.items : [];

          const itemsHtml = items
            .map((rawItem, itemIndex) => {
              const item = normalizeItem(rawItem);
              if (!item || !item.label) return "";
              const meta = { date, dayIndex, mealKey, itemIndex };
              return renderItemButton(item, meta);
            })
            .join("");

          return `
            <div class="swap-meal">
              <div class="swap-meal-title">${escapeHtml(mealLabel(mealKey))}</div>
              <div class="swap-items">${itemsHtml || `<div style="color:rgba(0,0,0,0.45);font-weight:800;font-size:12px;">—</div>`}</div>
            </div>
          `;
        })
        .join("");

      return `
        <section class="swap-day" data-day="${escapeHtml(date)}">
          <div class="swap-day-head">
            <div class="swap-day-name">${escapeHtml(dayName(date) || "Day")}</div>
            <div class="swap-day-date">${escapeHtml(fmtDateShort(date))}</div>
          </div>
          ${mealsHtml}
        </section>
      `;
    })
    .join("");

  host.innerHTML = `
    <div class="swap-week-head">
      <div>
        <div class="swap-week-title">Week Plan</div>
        <div class="swap-week-sub">${escapeHtml(weekLabel)}</div>
      </div>
    </div>
    ${renderLegend()}
    <div class="swap-calendar">${daysHtml}</div>
  `;

  // Clear “Generating…” when calendar successfully re-renders
  setStatus("", { show: false });

  // Re-apply selected highlight if any
  if (UI_STATE.selected) {
    highlightSelected(UI_STATE.selected);
  }
}

function highlightSelected(sel) {
  $all(".swap-item-btn.is-selected").forEach((el) => el.classList.remove("is-selected"));
  const host = findCalendarHost();
  if (!host) return;

  // Find the button with matching meta
  const btns = $all("[data-swap-item]", host);
  for (const b of btns) {
    try {
      const meta = JSON.parse(b.getAttribute("data-swap-item"));
      if (
        meta?.date === sel.date &&
        meta?.mealKey === sel.mealKey &&
        meta?.itemIndex === sel.itemIndex
      ) {
        b.classList.add("is-selected");
        break;
      }
    } catch (_) {}
  }
}

function getPlanItemAt(meta) {
  const plan = UI_STATE.plan;
  if (!plan) return null;
  const day = plan.days?.find((d) => d.date === meta.date) ?? plan.days?.[meta.dayIndex];
  if (!day) return null;
  const meal = day.meals?.[meta.mealKey];
  const rawItem = meal?.items?.[meta.itemIndex];
  if (!rawItem) return null;
  return normalizeItem(rawItem);
}

function cacheKeyFor(meta, item) {
  const base = `${meta.date}|${meta.mealKey}|${meta.itemIndex}`;
  const id = item?.food_id ? `|${item.food_id}` : `|${item.label}`;
  return base + id;
}

async function apiInvoke(preferredFnNames, actionName, payload) {
  const api = API;

  // preferredFnNames: array of possible method names on API
  for (const fn of preferredFnNames) {
    if (api && typeof api[fn] === "function") {
      return await api[fn](payload);
    }
  }

  // common generic patterns
  if (api && typeof api.call === "function") return await api.call(actionName, payload);
  if (api && typeof api.post === "function") return await api.post(actionName, payload);
  if (api && typeof api.request === "function") return await api.request(actionName, payload);
  if (api && typeof api.run === "function") return await api.run(actionName, payload);

  throw new Error("API module does not expose a swaps/recipes method (api.js).");
}

async function handlePickItem(meta, itemBtnEl) {
  const item = getPlanItemAt(meta);
  if (!item) return;

  UI_STATE.selected = { ...meta, item };
  highlightSelected(UI_STATE.selected);

  renderSwapsHeader(item);

  // If your swaps panel exists, scroll it into view gently on small screens
  const swapsHost = findSwapsHost();
  if (swapsHost && window.innerWidth < 1100) {
    swapsHost.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const key = cacheKeyFor(meta, item);
  if (UI_STATE.swapCache.has(key)) {
    renderSwapResults(UI_STATE.swapCache.get(key), { from: item, at: meta });
    return;
  }

  setStatus("Finding swaps…", { show: true });

  const profile = getProfileSafe() || {};
  const payload = {
    item: {
      label: item.label,
      subgroup: item.subgroup,
      swap_vector: item.swap_vector || item.raw?.swap_vector || { c: 0, p: 0, f: 0 },
      food_id: item.food_id || null,
      grams: item.grams || 0,
      macros: item.macros || null,
    },
    profile,
  };

  const res = await apiInvoke(
    ["swapsSuggest", "swaps_suggest", "suggestSwaps", "getSwaps"],
    "swaps_suggest",
    payload
  );

  // normalize response
  const groups =
    res?.groups ??
    res?.data?.groups ??
    res?.ok?.groups ??
    res?.result?.groups ??
    (res?.ok === true ? res?.groups : null) ??
    (res?.ok === true ? res?.data?.groups : null);

  if (!Array.isArray(groups) || groups.length === 0) {
    setStatus("No swaps returned.", { show: true, spin: false });
    setTimeout(() => setStatus("", { show: false }), 1400);
    renderSwapResults([], { from: item, at: meta });
    return;
  }

  UI_STATE.swapCache.set(key, groups);
  renderSwapResults(groups, { from: item, at: meta });

  setStatus("", { show: false });
}

export function renderSwapsHeader(itemArg) {
  ensureCSS();
  const host = findSwapsHost();
  if (!host) return;

  const item = normalizeItem(itemArg);
  if (!item || !item.label) {
    host.innerHTML = `
      <div class="swap-selected">
        <div class="name">Select a food</div>
        <div class="meta">We’ll show equivalent swaps in the same subgroup first, then allowed alternates.</div>
      </div>
    `;
    return;
  }

  const m = item.macros || {};
  const metaParts = [];
  if (item.grams) metaParts.push(`${round(item.grams, 0)} g`);
  if (m.kcal) metaParts.push(`${round(m.kcal, 0)} kcal`);
  if (m.carbs_g != null) metaParts.push(`C ${round(m.carbs_g, 1)}g`);
  if (m.protein_g != null) metaParts.push(`P ${round(m.protein_g, 1)}g`);
  if (m.fat_g != null) metaParts.push(`F ${round(m.fat_g, 1)}g`);

  host.innerHTML = `
    <div class="swap-selected">
      <div class="name">${escapeHtml(item.label)}</div>
      <div class="meta">
        ${item.subgroup ? `<span>${escapeHtml(item.subgroup)}</span>` : ``}
        ${metaParts.map((p) => `<span>${escapeHtml(p)}</span>`).join("")}
      </div>
    </div>
    <div class="swap-groups" data-ui="swapGroups"></div>
  `;
}

export function renderSwapResults(groupsArg, ctx = {}) {
  ensureCSS();
  const host = findSwapsHost();
  if (!host) return;

  const groups = Array.isArray(groupsArg) ? groupsArg : [];
  const box = host.querySelector('[data-ui="swapGroups"]') || host;

  if (!groups.length) {
    box.innerHTML = `
      <div style="margin-top:12px;color:rgba(0,0,0,0.55);font-weight:800;">
        No swaps yet. Click an item in your plan.
      </div>
    `;
    return;
  }

  const from = ctx.from ? normalizeItem(ctx.from) : (UI_STATE.selected?.item ? normalizeItem(UI_STATE.selected.item) : null);
  const at = ctx.at || UI_STATE.selected;

  box.innerHTML = groups
    .map((g, gi) => {
      const title = escapeHtml(g.title || `Swaps ${gi + 1}`);
      const items = Array.isArray(g.items) ? g.items : [];
      const body = items
        .map((it) => {
          const n = normalizeItem(it);
          if (!n || !n.label) return "";

          const m = n.macros || {};
          const mm = [];
          if (n.grams) mm.push(`${round(n.grams, 0)} g`);
          if (m.kcal) mm.push(`${round(m.kcal, 0)} kcal`);
          if (m.carbs_g != null) mm.push(`C ${round(m.carbs_g, 1)}g`);
          if (m.protein_g != null) mm.push(`P ${round(m.protein_g, 1)}g`);
          if (m.fat_g != null) mm.push(`F ${round(m.fat_g, 1)}g`);

          const applyPayload = {
            to: {
              label: n.label,
              food_id: n.food_id || null,
              subgroup: n.subgroup || "",
              group: n.group || "",
              grams: n.grams || 0,
              macros: n.macros || null,
              swap_vector: from?.swap_vector || from?.raw?.swap_vector || it.swap_vector || { c: 0, p: 0, f: 0 },
            },
            at: at ? { date: at.date, dayIndex: at.dayIndex, mealKey: at.mealKey, itemIndex: at.itemIndex } : null,
          };

          return `
            <div class="swap-sug">
              <div class="left">
                <div class="nm">${escapeHtml(n.label)}</div>
                <div class="mm">
                  ${n.subgroup ? `<span>${escapeHtml(n.subgroup)}</span>` : ``}
                  ${mm.map((x) => `<span>${escapeHtml(x)}</span>`).join("")}
                </div>
              </div>
              <button class="btn" data-apply-swap="${escapeHtml(JSON.stringify(applyPayload))}">
                Apply
              </button>
            </div>
          `;
        })
        .join("");

      return `
        <div class="swap-group">
          <div class="swap-group-head" data-acc-head="1">
            <div class="t">${title}</div>
            <div style="font-weight:900;color:rgba(0,0,0,0.45);">Toggle</div>
          </div>
          <div class="swap-group-body" data-acc-body="1" data-open="true" style="display:flex;">
            ${body || `<div style="color:rgba(0,0,0,0.55);font-weight:800;">No items in this group.</div>`}
          </div>
        </div>
      `;
    })
    .join("");
}

async function applySwapLocal(data) {
  const at = data?.at;
  const to = data?.to;
  if (!at || !to) return;

  const plan = normalizePlan(UI_STATE.plan || Storage?.getPlan?.());
  if (!plan) throw new Error("No plan found to apply swap.");

  const day = plan.days?.find((d) => d.date === at.date) ?? plan.days?.[at.dayIndex];
  if (!day) throw new Error("Day not found.");

  const meal = day.meals?.[at.mealKey];
  if (!meal || !Array.isArray(meal.items)) throw new Error("Meal not found.");

  // Preserve existing swap_vector unless new has one
  const prev = meal.items[at.itemIndex] || {};
  meal.items[at.itemIndex] = {
    ...prev,
    label: to.label ?? prev.label ?? prev.name,
    name: to.label ?? prev.name ?? prev.label,
    food_id: to.food_id ?? prev.food_id ?? prev.id ?? null,
    id: to.food_id ?? prev.id ?? prev.food_id ?? null,
    subgroup: to.subgroup ?? prev.subgroup ?? "",
    group: to.group ?? prev.group ?? "",
    grams: Number(to.grams ?? prev.grams ?? 0),
    macros: to.macros ?? prev.macros ?? null,
    swap_vector: to.swap_vector ?? prev.swap_vector ?? null,
  };

  // Save back
  try {
    if (Storage?.setPlan) Storage.setPlan(plan);
  } catch (_) {
    // fallback to localStorage if Storage module differs
    try {
      localStorage.setItem("swap_plan", JSON.stringify(plan));
    } catch (_) {}
  }

  UI_STATE.plan = plan;

  // Re-render calendar & keep selection
  renderCalendar(plan);
  UI_STATE.selected = { ...at, item: normalizeItem(meal.items[at.itemIndex]) };
  highlightSelected(UI_STATE.selected);

  // Update header + re-request swaps for the new item (optional)
  renderSwapsHeader(UI_STATE.selected.item);
  setStatus("Swap applied.", { show: true, spin: false });
  setTimeout(() => setStatus("", { show: false }), 1200);
}

export function renderFreeFoods(listArg) {
  ensureCSS();
  const host = findFreeFoodsHost();
  if (!host) return;

  const list = Array.isArray(listArg) ? listArg : (listArg ? [listArg] : []);
  if (!list.length) {
    host.innerHTML = `<div style="margin-top:10px;color:rgba(0,0,0,0.55);font-weight:800;">No free foods listed yet.</div>`;
    return;
  }

  host.innerHTML = `
    <div style="margin-top:10px;display:flex;flex-direction:column;gap:8px;">
      ${list
        .map((x) => {
          const label = escapeHtml(x?.label ?? x?.name ?? String(x));
          return `<div style="border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:10px 12px;background:rgba(0,0,0,0.02);font-weight:900;color:rgba(0,0,0,0.7);">${label}</div>`;
        })
        .join("")}
    </div>
  `;
}

function readRecipesFromStorage() {
  try {
    if (Storage?.getRecipes) return Storage.getRecipes();
  } catch (_) {}
  try {
    const raw = localStorage.getItem("swap_recipes");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {}
  return null;
}

function writeRecipesToStorage(recipes) {
  try {
    if (Storage?.setRecipes) Storage.setRecipes(recipes);
    else localStorage.setItem("swap_recipes", JSON.stringify(recipes));
  } catch (_) {
    try {
      localStorage.setItem("swap_recipes", JSON.stringify(recipes));
    } catch (_) {}
  }
}

export function renderRecipes(recipesArg, planArg) {
  ensureCSS();
  setProfileCache();

  const host = findRecipesHost();
  if (!host) return;

  const plan = normalizePlan(planArg || UI_STATE.plan || Storage?.getPlan?.());
  const recipes = recipesArg || UI_STATE.recipes || readRecipesFromStorage();

  UI_STATE.recipes = recipes || null;

  // Ensure a button exists in the view (without breaking your templates)
  const existingBtn =
    host.querySelector('[data-action="generate-recipes"]') ||
    document.querySelector('[data-action="generate-recipes"]');

  if (!existingBtn) {
    // Only add if the template didn’t already provide it
    host.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin:6px 0 14px;">
        <div>
          <div style="font-size:22px;font-weight:900;">Recipes</div>
          <div style="color:rgba(0,0,0,0.55);font-weight:700;margin-top:4px;">Generate recipes for your current week. Stored in your browser.</div>
        </div>
        <button data-action="generate-recipes" style="border:1px solid rgba(0,0,0,0.12);background:white;border-radius:14px;padding:10px 14px;font-weight:900;cursor:pointer;">
          Generate recipes for this week
        </button>
      </div>
      <div data-ui="recipesBody"></div>
    `;
  }

  const body = host.querySelector('[data-ui="recipesBody"]') || host;

  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
    body.innerHTML = `<div style="color:rgba(0,0,0,0.55);font-weight:800;">No plan loaded. Generate a week plan first.</div>`;
    return;
  }

  const byDate = recipes && typeof recipes === "object" ? recipes : {};

  const daysUI = plan.days
    .map((d) => {
      const date = d.date;
      const rec = byDate[date] || byDate[String(date)] || null;

      // Recipe payload shape from your backend: { meals:[{meal_key, meal_label, summary, ingredients[], steps[]}] }
      const meals = Array.isArray(rec?.meals) ? rec.meals : [];

      const mealsHtml = meals
        .map((m) => {
          const title = escapeHtml(m.meal_label || mealLabel(m.meal_key));
          const summary = escapeHtml(m.summary || "");
          const ingredients = Array.isArray(m.ingredients) ? m.ingredients : [];
          const steps = Array.isArray(m.steps) ? m.steps : [];

          return `
            <div class="swap-rec-meal">
              <div class="h">${title}</div>
              ${summary ? `<div class="s">${summary}</div>` : ``}
              <div class="swap-rec-cols">
                <div class="swap-rec-box">
                  <div class="t">Ingredients</div>
                  <ol>${ingredients.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>
                </div>
                <div class="swap-rec-box">
                  <div class="t">Steps</div>
                  <ol>${steps.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ol>
                </div>
              </div>
            </div>
          `;
        })
        .join("");

      const has = meals.length > 0;

      return `
        <div class="swap-rec-day">
          <div class="swap-rec-day-head" data-rec-day-head="1">
            <div class="d">${escapeHtml(dayName(date))} · ${escapeHtml(fmtDateShort(date))}</div>
            <div style="font-weight:900;color:rgba(0,0,0,0.45);">${has ? "Toggle" : "Not generated"}</div>
          </div>
          <div class="swap-rec-day-body" data-rec-day-body="1" data-open="${has ? "false" : "false"}" style="display:none;">
            ${has ? mealsHtml : `<div style="color:rgba(0,0,0,0.55);font-weight:800;">Recipes will appear here after generation.</div>`}
          </div>
        </div>
      `;
    })
    .join("");

  body.innerHTML = `<div class="swap-recipes">${daysUI}</div>`;
}

async function maybeGenerateRecipesFallback() {
  // If app.js already generates recipes, it will call renderRecipes.
  // This fallback is only here so your “Generate recipes” button always does something.
  const plan = normalizePlan(UI_STATE.plan || Storage?.getPlan?.());
  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
    setStatus("No plan loaded. Generate a plan first.", { show: true, spin: false });
    setTimeout(() => setStatus("", { show: false }), 1600);
    return;
  }

  const profile = getProfileSafe() || {};
  const out = {};

  for (let i = 0; i < plan.days.length; i++) {
    const day = plan.days[i];
    setStatus(`Generating recipes… (${i + 1}/${plan.days.length})`, { show: true });

    const payload = { day, profile };

    const res = await apiInvoke(
      ["recipeGenerate", "recipe_generate", "generateRecipe", "getRecipe"],
      "recipe_generate",
      payload
    );

    const recipe = res?.recipe ?? res?.data?.recipe ?? (res?.ok === true ? res?.recipe : null) ?? res;
    if (recipe) out[day.date] = recipe;
  }

  UI_STATE.recipes = out;
  writeRecipesToStorage(out);
  renderRecipes(out, plan);

  setStatus("Recipes ready.", { show: true, spin: false });
  setTimeout(() => setStatus("", { show: false }), 1200);
}
