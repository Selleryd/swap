// ui.js
// SWAP UI helpers (renders into index.html templates + styles.css)
//
// This file is intentionally template-aware (uses the existing IDs/classes in index.html).
// It does NOT inject its own layout/CSS, to avoid conflicts.

"use strict";

import { Storage } from "./storage.js";

const UI_STATE = {
  plan: null,
  onPick: null,            // function- (day, meal, item)
  selected: null,          // { dayIndex, date, mealKey, itemIndex }
  lastSwapResponse: null,  // raw response from API.suggestSwaps()
  boundCalendarEl: null,
  boundSwapEl: null,
};

const MEAL_ORDER = ["breakfast", "snack1", "lunch", "snack2", "dinner"];
const MEAL_LABELS = {
  breakfast: "Breakfast",
  lunch: "Lunch",
  dinner: "Dinner",
  snack: "Snack",
  snack1: "Snack 1",
  snack2: "Snack 2",
};

const GROUP_LABELS = { protein: "Protein", carb: "Carb", fat: "Fat", free: "Free" };

export function mountTemplate(container, tplId) {
  const tpl = document.getElementById(tplId);
  if (!tpl) throw new Error(`Missing template: ${tplId}`);
  container.replaceChildren(tpl.content.cloneNode(true));

  // Template swap means element references change; rebind on next render.
  UI_STATE.boundCalendarEl = null;
  UI_STATE.boundSwapEl = null;
}

export function setTopbar(title, targetsText) {
  const t = document.getElementById("topbarTitle");
  if (t) t.textContent = title || "";
  const chip = document.getElementById("chipTargets");
  if (chip && targetsText != null) chip.textContent = targetsText;
}

export function setStatus(message) {
  const chip = document.getElementById("chipStatus");
  if (chip) chip.textContent = message || "";
}

/* =========================
   Rendering helpers
   ========================= */

function esc(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function titleCase(s) {
  const str = String(s || "").trim();
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function cssEscapeSafe(s) {
  const v = String(s ?? "");
  // Modern browsers have CSS.escape; fallback is a conservative escape.
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(v);
  return v.replace(/[^a-zA-Z0-9_\-]/g, "\\$&");
}

function looksLikePlan(x) {
  return !!x && typeof x === "object" && Array.isArray(x.days);
}

function slugMealKey(label) {
  const s = String(label || "").toLowerCase().trim();
  if (!s) return "meal";
  if (s.includes("break")) return "breakfast";
  if (s.includes("lunch")) return "lunch";
  if (s.includes("dinner")) return "dinner";
  if (s.includes("snack 1") || s.includes("snack1")) return "snack1";
  if (s.includes("snack 2") || s.includes("snack2")) return "snack2";
  if (s.includes("snack")) return "snack";
  return s.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "meal";
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items.map((it) => {
    const name = it?.name ?? it?.label ?? it?.food ?? it?.title ?? "";
    return { ...it, name, label: it?.label ?? name };
  });
}

function normalizeMeals(meals) {
  if (!meals) return {};
  if (Array.isArray(meals)) {
    const out = {};
    for (const m of meals) {
      const key = String(m?.key ?? m?.meal_key ?? m?.mealKey ?? slugMealKey(m?.label ?? m?.meal)).toLowerCase();
      out[key] = {
        ...m,
        key,
        label: m?.label ?? MEAL_LABELS[key] ?? titleCase(key),
        items: normalizeItems(m?.items ?? m?.foods ?? []),
      };
    }
    return out;
  }

  // object form
  const out = {};
  for (const k of Object.keys(meals)) {
    const m = meals[k] ?? {};
    const key = String(m?.key ?? k).toLowerCase();
    out[key] = {
      ...m,
      key,
      label: m?.label ?? MEAL_LABELS[key] ?? titleCase(key),
      items: normalizeItems(m?.items ?? m?.foods ?? []),
    };
  }
  return out;
}

function normalizePlan(planArg) {
  if (!planArg || typeof planArg !== "object") return null;
  const plan = planArg; // mutate-in-place (stored in localStorage anyway)
  if (!Array.isArray(plan.days)) plan.days = [];
  for (const d of plan.days) {
    d.meals = normalizeMeals(d.meals);
  }
  return plan;
}

function parseDateLabel(dateStr) {
  const s = String(dateStr || "").trim();
  if (!s) return "";
  const dt = new Date(s.length === 10 ? `${s}T00:00:00` : s);
  if (Number.isNaN(dt.getTime())) return s;
  return dt.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function weekMetaText(plan) {
  if (!plan) return "";
  const ws = plan.weekStart ?? plan.week_start ?? plan.week ?? "";
  if (ws) return `Week of ${parseDateLabel(ws)}`;
  const d0 = plan.days?.[0]?.date;
  return d0 ? `Week of ${parseDateLabel(d0)}` : "";
}

function mealKeysInOrder(mealsObj) {
  if (!mealsObj || typeof mealsObj !== "object") return [];
  const keys = Object.keys(mealsObj);
  const ordered = [];
  for (const k of MEAL_ORDER) if (keys.includes(k)) ordered.push(k);
  for (const k of keys) if (!ordered.includes(k)) ordered.push(k);
  return ordered;
}

function extractCalories(item) {
  const m = item?.macros ?? item?.macro ?? null;
  const c = item?.calories ?? m?.calories ?? m?.kcal ?? null;
  return c == null ? null : Number(c);
}

function extractMacros(item) {
  const m = item?.macros ?? item?.macro ?? {};
  return {
    p: Number(item?.protein_g ?? m?.protein_g ?? m?.protein ?? m?.p ?? 0) || 0,
    c: Number(item?.carbs_g ?? m?.carbs_g ?? m?.carbs ?? m?.c ?? 0) || 0,
    f: Number(item?.fat_g ?? m?.fat_g ?? m?.fat ?? m?.f ?? 0) || 0,
  };
}

function formatPortion(item) {
  const g = item?.portion_g ?? item?.grams ?? null;
  const portion = item?.portion ?? item?.serving ?? null;
  if (portion) return String(portion);
  if (g != null && !Number.isNaN(Number(g))) return `${Math.round(Number(g))} g`;
  const qty = item?.qty ?? item?.quantity ?? null;
  const unit = item?.unit ?? null;
  if (qty != null && unit) return `${qty} ${unit}`;
  return "";
}

function groupClass(item) {
  const g = (item?.group ?? item?.food_group ?? item?.category ?? item?.macro_group ?? "").toString().toLowerCase();
  if (!g) return "";
  if (g.includes("protein")) return "protein";
  if (g.includes("carb")) return "carb";
  if (g.includes("fat")) return "fat";
  if (g.includes("veg") || g.includes("free")) return "free";
  return "";
}

/* =========================
   Calendar
   ========================= */

export function renderCalendar(planArg, onClickItem) {
  const host = document.getElementById("calendar");
  if (!host) return;

  const plan = normalizePlan(planArg);
  UI_STATE.plan = plan;
  UI_STATE.onPick = typeof onClickItem === "function" ? onClickItem : null;

  // Persist normalized plan (so apply-swap works reliably later)
  try { if (plan) Storage.setPlan(plan); } catch (_) {}

  const meta = document.getElementById("weekMeta");
  if (meta) meta.textContent = weekMetaText(plan);

  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
    host.innerHTML = `<div class="muted">No meal plan yet. Click “Generate Plan” to build your week.</div>`;
    bindCalendar(host);
    return;
  }

  const cards = plan.days.map((day, dayIndex) => renderDayCard(day, dayIndex)).join("");
  host.innerHTML = cards;
  bindCalendar(host);
  applySelectedHighlight();
}

function renderDayCard(day, dayIndex) {
  const date = day?.date ?? day?.day ?? "";
  const dayTitle = day?.title ?? day?.label ?? parseDateLabel(date) ?? `Day ${dayIndex + 1}`;

  const mealsObj = day?.meals ?? {};
  const mealKeys = mealKeysInOrder(mealsObj);

  const mealBlocks = mealKeys.map((k) => {
    const meal = mealsObj[k] ?? { key: k, label: MEAL_LABELS[k] ?? titleCase(k), items: [] };
    const items = Array.isArray(meal.items) ? meal.items : [];

    const itemsHtml = items.length
      ? items.map((it, itemIndex) => renderItemButton(it, dayIndex, date, meal.key, itemIndex)).join("")
      : `<div class="muted">—</div>`;

    return `
      <div class="mealBlock">
        <div class="mealName">${esc(meal.label ?? MEAL_LABELS[k] ?? titleCase(k))}</div>
        ${itemsHtml}
      </div>`;
  }).join("");

  return `
    <div class="dayCard" data-day-index="${dayIndex}">
      <div class="dayTitle">${esc(dayTitle)}</div>
      ${mealBlocks}
    </div>`;
}

function renderItemButton(itemRaw, dayIndex, date, mealKey, itemIndex) {
  const item = itemRaw ?? {};
  const name = item?.label ?? item?.name ?? "Food";
  const portion = formatPortion(item);
  const kcal = extractCalories(item);
  const macros = extractMacros(item);

  const metaParts = [];
  if (portion) metaParts.push(portion);
  if (kcal != null && !Number.isNaN(kcal)) metaParts.push(`${Math.round(kcal)} kcal`);
  if (macros.p || macros.c || macros.f) metaParts.push(`P ${Math.round(macros.p)} • C ${Math.round(macros.c)} • F ${Math.round(macros.f)}`);

  const gClass = groupClass(item);
  const badge = gClass ? `<span class="badge ${gClass}">${esc(GROUP_LABELS[gClass] ?? titleCase(gClass))}</span>` : "";

  return `
    <button type="button"
      class="item"
      data-day-index="${dayIndex}"
      data-date="${esc(date)}"
      data-meal-key="${esc(mealKey)}"
      data-item-index="${itemIndex}">
      <div class="itemTop">
        <div>
          <div class="itemName">${esc(name)}</div>
          <div class="itemMeta">${esc(metaParts.join(" • "))}</div>
        </div>
        ${badge ? `<div class="badges">${badge}</div>` : ""}
      </div>
    </button>`;
}

function bindCalendar(host) {
  if (UI_STATE.boundCalendarEl === host) return;

  UI_STATE.boundCalendarEl = host;
  host.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button.item");
    if (!btn) return;

    const dayIndex = Number(btn.getAttribute("data-day-index"));
    const itemIndex = Number(btn.getAttribute("data-item-index"));
    const mealKey = String(btn.getAttribute("data-meal-key") || "");
    const date = String(btn.getAttribute("data-date") || "");

    UI_STATE.selected = { dayIndex, itemIndex, mealKey, date };
    applySelectedHighlight();

    const plan = UI_STATE.plan ?? Storage.getPlan();
    if (!plan?.days?.[dayIndex]) return;

    const day = plan.days[dayIndex];
    day.meals = normalizeMeals(day.meals);

    const meal = day.meals[mealKey] || { key: mealKey, label: MEAL_LABELS[mealKey] ?? titleCase(mealKey), items: [] };
    const item = meal.items?.[itemIndex];
    if (!item) return;

    if (typeof UI_STATE.onPick === "function") {
      UI_STATE.onPick(day, { key: mealKey, label: meal.label ?? MEAL_LABELS[mealKey] ?? titleCase(mealKey) }, item);
    }
  });
}

function applySelectedHighlight() {
  const host = document.getElementById("calendar");
  if (!host) return;
  host.querySelectorAll("button.item.selected").forEach((el) => el.classList.remove("selected"));

  const sel = UI_STATE.selected;
  if (!sel) return;

  const selector = `button.item[data-day-index="${sel.dayIndex}"][data-meal-key="${cssEscapeSafe(sel.mealKey)}"][data-item-index="${sel.itemIndex}"]`;
  const btn = host.querySelector(selector);
  if (btn) btn.classList.add("selected");
}

/* =========================
   Swaps panel
   ========================= */

export function renderSwapsHeader(itemRaw) {
  const item = itemRaw ?? {};
  const name = item?.label ?? item?.name ?? "Selected item";

  const titleEl = document.getElementById("swapTitle");
  const subEl = document.getElementById("swapSub");
  const chipsEl = document.getElementById("swapChips");

  if (titleEl) titleEl.textContent = `Swaps for: ${name}`;
  if (subEl) subEl.textContent = "Click an option below to apply it to your plan.";

  if (chipsEl) {
    const portion = formatPortion(item);
    const kcal = extractCalories(item);
    const macros = extractMacros(item);

    const chips = [];
    if (portion) chips.push(chipHtml(portion));
    if (kcal != null && !Number.isNaN(kcal)) chips.push(chipHtml(`${Math.round(kcal)} kcal`));
    if (macros.p || macros.c || macros.f) chips.push(chipHtml(`P ${Math.round(macros.p)} • C ${Math.round(macros.c)} • F ${Math.round(macros.f)}`));

    chipsEl.innerHTML = chips.join("") || chipHtml("No nutrition data");
  }
}

function chipHtml(text) {
  return `<div class="chip subtle">${esc(text)}</div>`;
}

function readGroupsFromSwapResponse(res) {
  if (!res) return [];
  if (Array.isArray(res)) return res;

  const groups = res.groups ?? res.results ?? res.swaps ?? res.options ?? null;
  if (Array.isArray(groups)) return groups;

  const g2 = res.data?.groups;
  if (Array.isArray(g2)) return g2;

  return [];
}

export function renderSwapResults(resOrGroups) {
  const host = document.getElementById("swapBody");
  if (!host) return;

  UI_STATE.lastSwapResponse = resOrGroups;

  const groups = readGroupsFromSwapResponse(resOrGroups);
  if (!groups.length) {
    host.innerHTML = `<div class="muted">No swaps found for this item.</div>`;
    bindSwapApply(host);
    return;
  }

  host.innerHTML = groups.map((g, gi) => renderSwapGroup(g, gi)).join("");
  bindSwapApply(host);
}

function renderSwapGroup(group, groupIndex) {
  const title = group?.title ?? group?.label ?? group?.group ?? `Group ${groupIndex + 1}`;
  const items = Array.isArray(group?.items) ? group.items : [];
  const rows = items.map((it, ii) => renderSwapRow(it, groupIndex, ii)).join("");

  return `
    <div class="swapGroup">
      <div class="swapGroupTitle">${esc(title)}</div>
      ${rows || `<div class="muted">No options in this group.</div>`}
    </div>`;
}

function renderSwapRow(itemRaw, groupIndex, itemIndex) {
  const it = itemRaw ?? {};
  const name = it?.label ?? it?.name ?? "Food";
  const portion = formatPortion(it);
  const kcal = extractCalories(it);
  const macros = extractMacros(it);

  const metaParts = [];
  if (portion) metaParts.push(portion);
  if (kcal != null && !Number.isNaN(kcal)) metaParts.push(`${Math.round(kcal)} kcal`);
  if (macros.p || macros.c || macros.f) metaParts.push(`P ${Math.round(macros.p)} • C ${Math.round(macros.c)} • F ${Math.round(macros.f)}`);

  const diff = it?.diff_pct ?? it?.diffPct ?? null;
  if (diff != null && !Number.isNaN(Number(diff))) {
    const n = Number(diff);
    const pct = Math.abs(n) <= 1.2 ? (n * 100) : n;
    metaParts.push(`Δ ${Math.round(pct * 10) / 10}%`);
  }

  return `
    <div class="swapRow">
      <div>
        <div class="swapName">${esc(name)}</div>
        <div class="swapMeta">${esc(metaParts.join(" • "))}</div>
      </div>
      <button class="btn sm" type="button" data-action="apply-swap" data-gi="${groupIndex}" data-ii="${itemIndex}">
        Apply
      </button>
    </div>`;
}

function bindSwapApply(host) {
  if (UI_STATE.boundSwapEl === host) return;
  UI_STATE.boundSwapEl = host;

  host.addEventListener("click", (e) => {
    const btn = e.target?.closest?.("button[data-action='apply-swap']");
    if (!btn) return;

    const sel = UI_STATE.selected;
    if (!sel) {
      setStatus("Pick an item in the plan first.");
      return;
    }

    const gi = Number(btn.getAttribute("data-gi"));
    const ii = Number(btn.getAttribute("data-ii"));

    const groups = readGroupsFromSwapResponse(UI_STATE.lastSwapResponse);
    const candidate = groups?.[gi]?.items?.[ii];
    if (!candidate) {
      setStatus("Could not apply swap (missing candidate).");
      return;
    }

    const plan = normalizePlan(Storage.getPlan() || UI_STATE.plan);
    if (!plan?.days?.[sel.dayIndex]) {
      setStatus("Could not apply swap (missing plan/day).");
      return;
    }

    const day = plan.days[sel.dayIndex];
    day.meals = normalizeMeals(day.meals);

    const meal = day.meals[sel.mealKey];
    if (!meal?.items?.[sel.itemIndex]) {
      setStatus("Could not apply swap (missing meal/item).");
      return;
    }

    const oldItem = meal.items[sel.itemIndex];

    const next = { ...candidate };
    next.name = next.name ?? next.label ?? oldItem?.name ?? oldItem?.label ?? "Food";
    next.label = next.label ?? next.name;

    const g = next.portion_g ?? next.grams ?? oldItem?.portion_g ?? oldItem?.grams ?? null;
    if (g != null && !Number.isNaN(Number(g))) {
      next.grams = Number(g);
      next.portion_g = Number(g);
    }

    if (!next.group && oldItem?.group) next.group = oldItem.group;

    meal.items[sel.itemIndex] = next;

    try { Storage.setPlan(plan); } catch (_) {}
    UI_STATE.plan = plan;

    setStatus("Swap applied.");
    renderCalendar(plan, UI_STATE.onPick);
    renderSwapsHeader(next);
  });
}

/* =========================
   Free foods
   ========================= */

const DEFAULT_FREE_FOODS = [
  "Leafy greens", "Cucumber", "Celery", "Zucchini", "Mushrooms", "Tomatoes",
  "Pickles", "Sauerkraut", "Salsa", "Broth", "Hot sauce", "Mustard",
  "Herbs & spices", "Coffee (unsweetened)", "Tea (unsweetened)", "Sparkling water"
];

export function renderFreeFoods(listArg) {
  const host = document.getElementById("freeList");
  if (!host) return;

  const list = Array.isArray(listArg) && listArg.length ? listArg : DEFAULT_FREE_FOODS;
  host.innerHTML = list.map((x) => `<div class="freePill">${esc(x)}</div>`).join("");
}

/* =========================
   Recipes
   ========================= */

export function renderRecipes(arg1, arg2) {
  // App calls renderRecipes(plan). Support both:
  // - renderRecipes(plan)
  // - renderRecipes(recipesMap, plan)
  let plan = null;
  let recipesMap = null;

  if (looksLikePlan(arg1) && arg2 == null) {
    plan = normalizePlan(arg1);
    recipesMap = Storage.getRecipes() || {};
  } else {
    recipesMap = (arg1 && typeof arg1 === "object") ? arg1 : (Storage.getRecipes() || {});
    plan = normalizePlan(arg2 || Storage.getPlan());
  }

  const host = document.getElementById("recipesList");
  if (!host) return;

  if (!plan || !Array.isArray(plan.days) || plan.days.length === 0) {
    host.innerHTML = `<div class="muted">Generate a plan first, then create recipes.</div>`;
    return;
  }

  const cards = [];
  let missing = 0;

  for (const day of plan.days) {
    const date = day?.date ?? "";
    const key = `day:${date}`;
    const recipe = recipesMap?.[key];
    if (!recipe) missing++;
    cards.push(renderRecipeCard(day, recipe));
  }

  host.innerHTML = cards.join("");

  const status = document.getElementById("recipeStatus");
  if (status) status.textContent = missing ? `Missing recipes: ${missing}/${plan.days.length}` : "Recipes ready.";
}

function renderRecipeCard(day, recipe) {
  const date = day?.date ?? "";
  const title = day?.title ?? day?.label ?? parseDateLabel(date);

  if (!recipe) {
    return `
      <div class="card recipeCard">
        <div class="recipeTitle">${esc(title)}</div>
        <div class="recipeBody muted">No recipe generated yet for this day.</div>
      </div>`;
  }

  if (typeof recipe === "string") {
    return `
      <div class="card recipeCard">
        <div class="recipeTitle">${esc(title)}</div>
        <div class="recipeBody"><pre style="white-space:pre-wrap;margin:0">${esc(recipe)}</pre></div>
      </div>`;
  }

  const rTitle = recipe.title || recipe.name || "";
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : (Array.isArray(recipe.instructions) ? recipe.instructions : []);

  const parts = [];
  if (rTitle) parts.push(`<div style="font-weight:700;margin:0 0 8px 0">${esc(rTitle)}</div>`);

  if (ingredients.length) {
    parts.push(`<div style="font-weight:700;margin:10px 0 6px 0">Ingredients</div>`);
    parts.push(`<ul style="margin:0 0 0 18px;padding:0">${ingredients.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`);
  }

  if (steps.length) {
    parts.push(`<div style="font-weight:700;margin:10px 0 6px 0">Steps</div>`);
    parts.push(`<ol style="margin:0 0 0 18px;padding:0">${steps.map((x) => `<li>${esc(x)}</li>`).join("")}</ol>`);
  }

  if (!parts.length) {
    parts.push(`<pre style="white-space:pre-wrap;margin:0">${esc(JSON.stringify(recipe, null, 2))}</pre>`);
  }

  return `
    <div class="card recipeCard">
      <div class="recipeTitle">${esc(title)}</div>
      <div class="recipeBody">${parts.join("")}</div>
    </div>`;
}
