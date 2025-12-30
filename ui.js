// ui.js — SWAP UI rendering (calendar, swaps, recipes, status, topbar)
// Paste-ready full file.

"use strict";

/* =========================
   Small DOM helpers
   ========================= */

function $1(selectors, root = document) {
  for (const sel of selectors) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function clear(el) {
  if (!el) return;
  while (el.firstChild) el.removeChild(el.firstChild);
}

function el(tag, className, text) {
  const n = document.createElement(tag);
  if (className) n.className = className;
  if (text !== undefined && text !== null) n.textContent = String(text);
  return n;
}

// Fix the classic bug: new Date("YYYY-MM-DD") parses as UTC => shows prior day in US timezones.
// This parses as LOCAL date.
function parseISODateLocal(iso) {
  const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || !mo || !d) return null;
  return new Date(y, mo - 1, d, 12, 0, 0); // noon local avoids DST edge weirdness
}

function formatISOToLocalMDY(iso) {
  const dt = parseISODateLocal(iso);
  if (!dt) return "";
  return dt.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
}

function weekdayName(iso) {
  const dt = parseISODateLocal(iso);
  if (!dt) return "";
  return dt.toLocaleDateString(undefined, { weekday: "long" });
}

function clamp(n, a, b) {
  n = Number(n);
  if (!isFinite(n)) return a;
  return Math.max(a, Math.min(b, n));
}

function round1(n) {
  n = Number(n);
  if (!isFinite(n)) return 0;
  return Math.round(n * 10) / 10;
}

/* =========================
   Template mounting
   ========================= */

export function mountTemplate(root, tplId) {
  const tpl = document.getElementById(tplId);
  if (!tpl) throw new Error(`Missing template: ${tplId}`);
  root.innerHTML = "";
  root.appendChild(tpl.content.cloneNode(true));
}

/* =========================
   Status + Topbar
   ========================= */

export function setStatus(text) {
  const node = $1(
    [
      "#statusText",
      "#status",
      '[data-role="status"]',
      ".statusText",
      ".statusPill",
      ".status-pill"
    ],
    document
  );
  if (node) node.textContent = String(text ?? "");
}

export function setTopbar(title, subtitle) {
  const titleEl = $1(
    ["#topTitle", '[data-role="topTitle"]', ".topTitle", ".topbarTitle"],
    document
  );
  const subEl = $1(
    ["#topSubtitle", '[data-role="topSubtitle"]', ".topSubtitle", ".topbarSubtitle"],
    document
  );

  if (titleEl) titleEl.textContent = String(title ?? "");
  if (subEl) subEl.textContent = String(subtitle ?? "");
}

/* =========================
   Calendar rendering (FIX)
   ========================= */

function groupToChipClass(group) {
  const g = String(group || "").toLowerCase();
  if (g.includes("carb")) return "chip chip-carb";
  if (g.includes("protein")) return "chip chip-protein";
  if (g.includes("fat")) return "chip chip-fat";
  if (g.includes("free")) return "chip chip-free";
  if (g.includes("veg")) return "chip chip-free";
  return "chip";
}

function ensureCalendarContainer_() {
  // Try common containers used by templates
  return $1(
    [
      "#calendar",
      '[data-role="calendar"]',
      ".calendar",
      ".calendarGrid",
      ".weekGrid",
      "#weekGrid"
    ],
    document
  );
}

function ensureWeekLabel_() {
  return $1(
    [
      "#weekLabel",
      "#weekStart",
      '[data-role="weekLabel"]',
      '[data-role="weekStart"]',
      ".weekLabel",
      ".weekStart"
    ],
    document
  );
}

function buildMealBlock(day, meal, onClickItem) {
  const block = el("div", "mealBlock");
  const label = el("div", "mealLabel", meal.label || meal.key || "");
  block.appendChild(label);

  const itemsWrap = el("div", "mealItems");
  const items = Array.isArray(meal.items) ? meal.items : [];

  if (!items.length) {
    // Keep it visually clean—no placeholder text by default.
    block.appendChild(itemsWrap);
    return block;
  }

  for (const item of items) {
    const btn = el("button", groupToChipClass(item.group), item.name || item.id || "Food");
    btn.type = "button";
    btn.dataset.foodId = item.id || "";
    btn.dataset.foodName = item.name || "";
    btn.title = [
      item.name ? item.name : null,
      item.grams ? `${round1(item.grams)} g` : null,
      item.calories ? `${round1(item.calories)} kcal` : null
    ]
      .filter(Boolean)
      .join(" • ");

    btn.addEventListener("click", () => {
      if (typeof onClickItem === "function") onClickItem(day, meal, item);
    });

    itemsWrap.appendChild(btn);
  }

  block.appendChild(itemsWrap);
  return block;
}

export function renderCalendar(plan, onClickItem) {
  const grid = ensureCalendarContainer_();
  const weekLabel = ensureWeekLabel_();

  // Update the "Week of ..." label (timezone-safe)
  if (weekLabel) {
    if (plan?.weekStart) {
      weekLabel.textContent = `Week of ${formatISOToLocalMDY(plan.weekStart)}`;
    } else {
      weekLabel.textContent = "Week Plan";
    }
  }

  if (!grid) {
    // If the template changes, fail loudly so you see it in console.
    console.warn("renderCalendar: Could not find calendar container in DOM.");
    return;
  }

  clear(grid);

  const days = Array.isArray(plan?.days) ? plan.days.slice() : [];

  // Sort by date ascending if dates exist (prevents weird ordering)
  days.sort((a, b) => {
    const da = parseISODateLocal(a?.date)?.getTime?.() ?? 0;
    const db = parseISODateLocal(b?.date)?.getTime?.() ?? 0;
    return da - db;
  });

  if (!days.length) {
    // Render an empty 7-day shell so the UI doesn’t look broken
    const fallbackStart = plan?.weekStart || null;
    let base = parseISODateLocal(fallbackStart) || new Date();
    base = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0, 0);

    for (let i = 0; i < 7; i++) {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      const col = el("div", "dayCol");
      col.appendChild(el("div", "dayHeader", d.toLocaleDateString(undefined, { weekday: "long" })));

      ["Breakfast", "Snack (AM)", "Lunch", "Snack (PM)", "Dinner"].forEach((m) => {
        const mb = el("div", "mealBlock");
        mb.appendChild(el("div", "mealLabel", m.toUpperCase()));
        mb.appendChild(el("div", "mealItems"));
        col.appendChild(mb);
      });

      grid.appendChild(col);
    }
    return;
  }

  for (const day of days) {
    const col = el("div", "dayCol");

    const header = el("div", "dayHeader");
    header.appendChild(el("div", "dayName", weekdayName(day.date) || day.day || ""));
    col.appendChild(header);

    const meals = Array.isArray(day.meals) ? day.meals : [];

    // If meals come in wrong format, normalize into the 5 expected blocks
    const byKey = {};
    for (const m of meals) {
      if (!m) continue;
      const k = String(m.key || m.label || "").toLowerCase();
      byKey[k] = m;
    }

    const expected = [
      { key: "breakfast", label: "BREAKFAST" },
      { key: "snack_am", label: "SNACK (AM)" },
      { key: "lunch", label: "LUNCH" },
      { key: "snack_pm", label: "SNACK (PM)" },
      { key: "dinner", label: "DINNER" }
    ];

    for (const e of expected) {
      const match =
        byKey[e.key] ||
        meals.find((m) => String(m.key || "").toLowerCase() === e.key) ||
        meals.find((m) => String(m.label || "").toLowerCase().includes(e.key.replace("_", " "))) ||
        { key: e.key, label: e.label, items: [] };

      // Make sure label is the nice UI label
      const meal = {
        ...match,
        key: match.key || e.key,
        label: match.label || e.label,
        items: Array.isArray(match.items) ? match.items : []
      };

      col.appendChild(buildMealBlock(day, meal, onClickItem));
    }

    grid.appendChild(col);
  }
}

/* =========================
   Swaps panel
   ========================= */

function ensureSwapHeader_() {
  return $1(
    [
      "#swapHeader",
      "#swapsHeader",
      '[data-role="swapHeader"]',
      '[data-role="swapsHeader"]'
    ],
    document
  );
}

function ensureSwapResults_() {
  return $1(
    [
      "#swapResults",
      "#swapsResults",
      '[data-role="swapResults"]',
      '[data-role="swapsResults"]'
    ],
    document
  );
}

export function renderSwapsHeader(item) {
  const header = ensureSwapHeader_();

  // If your template doesn't have a dedicated header container,
  // we fall back to a "Select a food" box if present.
  const fallback = $1(
    [
      "#swapSelection",
      '[data-role="swapSelection"]',
      ".swapSelection",
      ".swapBox"
    ],
    document
  );

  const target = header || fallback;
  if (!target) return;

  const name = item?.name || "Selected food";
  const grams = item?.grams ? `${round1(item.grams)} g` : "";
  const kcal = item?.calories ? `${round1(item.calories)} kcal` : "";

  target.innerHTML = "";
  target.appendChild(el("div", "swapTitle", name));
  const meta = [grams, kcal].filter(Boolean).join(" • ");
  if (meta) target.appendChild(el("div", "swapMeta", meta));
}

export function renderSwapResults(res) {
  const wrap = ensureSwapResults_();
  if (!wrap) return;

  clear(wrap);

  const results = Array.isArray(res?.results) ? res.results : Array.isArray(res) ? res : [];

  if (!results.length) {
    wrap.appendChild(el("div", "swapEmpty", "No swaps found for this item."));
    return;
  }

  for (const r of results) {
    const card = el("div", "swapCard");
    const top = el("div", "swapCardTop");

    const left = el("div", "swapCardLeft");
    left.appendChild(el("div", "swapName", r.name || r.food?.name || r.id || "Swap"));

    const right = el("div", "swapCardRight");
    const portion =
      r.portion_g !== undefined
        ? `${round1(r.portion_g)} g`
        : r.grams !== undefined
        ? `${round1(r.grams)} g`
        : "";

    const score =
      r.score !== undefined ? `score ${round1(r.score)}` : r.similarity !== undefined ? `sim ${round1(r.similarity)}` : "";

    right.appendChild(el("div", "swapPortion", portion));
    if (score) right.appendChild(el("div", "swapScore", score));

    top.appendChild(left);
    top.appendChild(right);
    card.appendChild(top);

    // Optional error display if API provides
    if (r.err?.calories_pct !== undefined) {
      const detail = el("div", "swapDetail");
      detail.textContent =
        `Δ kcal ${Math.round(r.err.calories_pct * 100)}% • ` +
        `Δ P ${Math.round((r.err.protein_pct || 0) * 100)}% • ` +
        `Δ C ${Math.round((r.err.carbs_pct || 0) * 100)}% • ` +
        `Δ F ${Math.round((r.err.fat_pct || 0) * 100)}%`;
      card.appendChild(detail);
    }

    wrap.appendChild(card);
  }
}

/* =========================
   Free foods (static)
   ========================= */

const FREE_FOODS = [
  "Mixed greens",
  "Cucumber",
  "Tomatoes",
  "Bell peppers",
  "Broccoli",
  "Cauliflower",
  "Zucchini",
  "Mushrooms",
  "Asparagus",
  "Green beans",
  "Spinach",
  "Kale",
  "Cabbage",
  "Brussels sprouts",
  "Celery",
  "Radishes",
  "Herbs + spices",
  "Lemon/lime",
  "Vinegar"
];

export function renderFreeFoods() {
  const wrap = $1(
    ["#freeFoods", '[data-role="freeFoods"]', ".freeFoods"],
    document
  );
  if (!wrap) return;

  clear(wrap);

  for (const name of FREE_FOODS) {
    const chip = el("span", "chip chip-free", name);
    wrap.appendChild(chip);
  }
}

/* =========================
   Recipes tab
   ========================= */

export function renderRecipes(plan) {
  const wrap = $1(
    ["#recipesList", '[data-role="recipesList"]', ".recipesList"],
    document
  );
  if (!wrap) return;

  clear(wrap);

  if (!plan?.days?.length) {
    wrap.appendChild(el("div", "recipesEmpty", "Generate a meal plan to see recipes here."));
    return;
  }

  // This tab is driven by app.js + Storage recipes map.
  // We simply show the days as containers (content gets re-rendered when recipes arrive).
  for (const day of plan.days) {
    const card = el("div", "recipeDayCard");
    card.appendChild(el("div", "recipeDayTitle", `${weekdayName(day.date)} • ${formatISOToLocalMDY(day.date)}`));
    card.appendChild(el("div", "recipeDayBody", "Recipes will appear here after generation."));
    wrap.appendChild(card);
  }
}
