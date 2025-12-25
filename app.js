"use strict";

/*
  1) PASTE YOUR APPS SCRIPT WEB APP EXEC URL HERE:
     Example:
     const API_BASE = "https://script.google.com/macros/s/XXXXXXXXXXXX/exec";
*/
const API_BASE = ""; https://script.google.com/macros/s/AKfycbxoVkI3xIJ1ErMrQ07pG1Oj2dPE-G1-85R1zTXIHB61j_X66JqoyezCadtdQB6qfenfmQ/exec

// Simple debounce
function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

const $ = (id) => document.getElementById(id);

const ui = {
  // tabs
  navItems: Array.from(document.querySelectorAll(".navItem")),
  tabs: {
    targets: $("tab-targets"),
    swap: $("tab-swap"),
    about: $("tab-about"),
  },
  pageTitle: $("pageTitle"),
  pageHint: $("pageHint"),
  primaryActionBtn: $("primaryActionBtn"),

  // status
  apiPill: $("apiPill"),
  apiDot: $("apiDot"),
  apiText: $("apiText"),
  refreshBtn: $("refreshBtn"),
  demoBtn: $("demoBtn"),

  // targets inputs
  heightCm: $("heightCm"),
  weightKg: $("weightKg"),
  age: $("age"),
  sex: $("sex"),
  activity: $("activity"),
  goal: $("goal"),
  targetsBadge: $("targetsBadge"),
  bmrVal: $("bmrVal"),
  tdeeVal: $("tdeeVal"),
  tkcalVal: $("tkcalVal"),
  protVal: $("protVal"),
  carbVal: $("carbVal"),
  fatVal: $("fatVal"),

  // swap inputs
  foodQuery: $("foodQuery"),
  suggestions: $("suggestions"),
  portion: $("portion"),
  unit: $("unit"),
  diet: $("diet"),
  medical: $("medical"),
  allergies: $("allergies"),
  calTol: $("calTol"),
  macroTol: $("macroTol"),
  mode: $("mode"),
  maxResults: $("maxResults"),
  swapBtn: $("swapBtn"),
  clearBtn: $("clearBtn"),
  selectedFood: $("selectedFood"),
  results: $("results"),
  resultsBadge: $("resultsBadge"),
  emptyState: $("emptyState"),
};

let DEMO_MODE = false;

// Store selected food
let selected = null;

/* -----------------------------
   API helpers
--------------------------------*/

async function apiGet(params) {
  if (!API_BASE) throw new Error("API_BASE not configured");
  const url = API_BASE + "?" + new URLSearchParams(params).toString();
  const res = await fetch(url, { method: "GET" });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return data;
}

async function apiPost(action, payload) {
  if (!API_BASE) throw new Error("API_BASE not configured");
  const url = API_BASE;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...payload }),
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text}`);
  return data;
}

/*
  Expected backend (recommended):
  GET  ?action=ping                          -> { ok:true }
  GET  ?action=search&q=chicken              -> { items:[{id,name,group,subgroup,units_json}] }
  GET  ?action=swap&id=usda_123&grams=200... -> { base:{...}, swaps:[...]}
  POST {action:"targets", heightCm,...}      -> { bmr,tdee,targetKcal,protein_g,carbs_g,fat_g }

  If your backend differs, map it here without touching the UI code.
*/

async function apiPing() {
  if (DEMO_MODE) return { ok: true };
  return apiGet({ action: "ping" });
}

async function apiSearch(q) {
  if (DEMO_MODE) return demoSearch(q);
  return apiGet({ action: "search", q });
}

async function apiTargets(input) {
  if (DEMO_MODE) return demoTargets(input);
  return apiPost("targets", input);
}

async function apiSwap(payload) {
  if (DEMO_MODE) return demoSwap(payload);
  // Prefer GET for cacheable requests
  return apiGet({ action: "swap", ...payload });
}

/* -----------------------------
   UI: Tabs
--------------------------------*/

function setTab(tab) {
  ui.navItems.forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  Object.entries(ui.tabs).forEach(([k, el]) => el.classList.toggle("active", k === tab));

  if (tab === "targets") {
    ui.pageTitle.textContent = "Targets";
    ui.pageHint.textContent = "Compute BMR/TDEE + macro targets, then swap foods at any portion.";
    ui.primaryActionBtn.textContent = "Compute targets";
  } else if (tab === "swap") {
    ui.pageTitle.textContent = "Swap Engine";
    ui.pageHint.textContent = "Find precision-equivalent swaps within your calorie + macro tolerance.";
    ui.primaryActionBtn.textContent = "Find swaps";
  } else {
    ui.pageTitle.textContent = "Notes";
    ui.pageHint.textContent = "Ship clean MVP now, harden later.";
    ui.primaryActionBtn.textContent = "Open Swap Engine";
  }
}

ui.navItems.forEach(b => b.addEventListener("click", () => setTab(b.dataset.tab)));

ui.primaryActionBtn.addEventListener("click", async () => {
  const active = ui.navItems.find(b => b.classList.contains("active"))?.dataset.tab;
  if (active === "targets") return onComputeTargets();
  if (active === "swap") return onFindSwaps();
  if (active === "about") return setTab("swap");
});

/* -----------------------------
   API Status
--------------------------------*/

async function refreshStatus() {
  ui.apiText.textContent = DEMO_MODE ? "API: demo mode" : "API: checking…";
  ui.apiDot.className = "dot";

  if (DEMO_MODE) {
    ui.apiDot.classList.add("good");
    return;
  }

  if (!API_BASE) {
    ui.apiText.textContent = "API: not configured";
    ui.apiDot.classList.add("bad");
    return;
  }

  try {
    const r = await apiPing();
    if (r && r.ok) {
      ui.apiText.textContent = "API: connected";
      ui.apiDot.classList.add("good");
    } else {
      ui.apiText.textContent = "API: responded";
      ui.apiDot.classList.add("warn");
    }
  } catch (e) {
    ui.apiText.textContent = "API: offline";
    ui.apiDot.classList.add("bad");
  }
}

ui.refreshBtn.addEventListener("click", refreshStatus);
ui.demoBtn.addEventListener("click", () => {
  DEMO_MODE = !DEMO_MODE;
  ui.demoBtn.textContent = DEMO_MODE ? "Demo mode: ON" : "Demo mode";
  refreshStatus();
});

/* -----------------------------
   Targets
--------------------------------*/

function round(n) { return Math.round(n); }

async function onComputeTargets() {
  ui.targetsBadge.textContent = "Computing…";
  try {
    const input = {
      heightCm: Number(ui.heightCm.value),
      weightKg: Number(ui.weightKg.value),
      age: Number(ui.age.value),
      sex: ui.sex.value,
      activity: ui.activity.value,
      goal: ui.goal.value,
    };

    const out = await apiTargets(input);

    ui.bmrVal.textContent = out.bmr ? round(out.bmr) : "—";
    ui.tdeeVal.textContent = out.tdee ? round(out.tdee) : "—";
    ui.tkcalVal.textContent = out.targetKcal ? round(out.targetKcal) : "—";
    ui.protVal.textContent = out.protein_g ? round(out.protein_g) : "—";
    ui.carbVal.textContent = out.carbs_g ? round(out.carbs_g) : "—";
    ui.fatVal.textContent = out.fat_g ? round(out.fat_g) : "—";

    ui.targetsBadge.textContent = "Computed";
    ui.targetsBadge.classList.remove("subtle");
  } catch (e) {
    ui.targetsBadge.textContent = "Error";
    console.error(e);
    alert("Targets failed. If API isn’t wired yet, toggle Demo mode.");
  }
}

/* -----------------------------
   Search suggestions
--------------------------------*/

function closeSuggestions() {
  ui.suggestions.classList.remove("open");
  ui.suggestions.innerHTML = "";
}

function renderSuggestions(items = []) {
  if (!items.length) return closeSuggestions();

  ui.suggestions.innerHTML = items.slice(0, 8).map(it => {
    const meta = [it.group, it.subgroup].filter(Boolean).join(" • ");
    return `
      <div class="sugItem" data-id="${escapeHtml(it.id)}">
        <div class="sugName">${escapeHtml(it.name || it.id)}</div>
        <div class="sugMeta">${escapeHtml(meta || "")}</div>
      </div>
    `;
  }).join("");

  ui.suggestions.classList.add("open");

  ui.suggestions.querySelectorAll(".sugItem").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.getAttribute("data-id");
      const it = items.find(x => x.id === id);
      if (it) selectFood(it);
      closeSuggestions();
    });
  });
}

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const onSearchChange = debounce(async () => {
  const q = ui.foodQuery.value.trim();
  if (q.length < 2) return closeSuggestions();
  try {
    const res = await apiSearch(q);
    const items = res.items || res.results || [];
    renderSuggestions(items);
    // Keep latest list for click selection
    ui.suggestions._items = items;
  } catch (e) {
    // no spam alerts while typing
    closeSuggestions();
  }
}, 180);

ui.foodQuery.addEventListener("input", onSearchChange);
ui.foodQuery.addEventListener("focus", onSearchChange);
document.addEventListener("click", (e) => {
  if (!ui.suggestions.contains(e.target) && e.target !== ui.foodQuery) closeSuggestions();
});

/* -----------------------------
   Food selection + unit handling
--------------------------------*/

function selectFood(it) {
  selected = it;

  ui.foodQuery.value = it.name || it.id;

  // Try to use units_json if provided
  let units = null;
  try {
    units = it.units_json ? JSON.parse(it.units_json) : null;
  } catch {}

  // rebuild unit options smartly
  const baseUnits = [
    ["g","g"], ["oz","oz"], ["serving","serving"], ["piece","piece"], ["cup","cup"], ["tbsp","tbsp"]
  ];
  const available = new Set(Object.keys(units || {}));

  ui.unit.innerHTML = baseUnits
    .filter(([val]) => val === "g" || val === "oz" || available.has(val) || val === "serving")
    .map(([val,label]) => `<option value="${val}">${label}</option>`)
    .join("");

  // prefer piece if exists
  if (available.has("piece")) ui.unit.value = "piece";
  else ui.unit.value = "serving";

  ui.selectedFood.innerHTML = `
    <div class="selectedTitle">${escapeHtml(it.name || it.id)}</div>
    <div class="selectedSub">${escapeHtml([it.group, it.subgroup].filter(Boolean).join(" • ") || "—")}</div>
  `;
}

/* -----------------------------
   Swap
--------------------------------*/

ui.swapBtn.addEventListener("click", onFindSwaps);
ui.clearBtn.addEventListener("click", () => {
  selected = null;
  ui.foodQuery.value = "";
  ui.portion.value = "2";
  ui.allergies.value = "";
  ui.results.innerHTML = "";
  ui.emptyState.style.display = "block";
  ui.resultsBadge.textContent = "Waiting";
  ui.selectedFood.innerHTML = `
    <div class="selectedTitle">No food selected</div>
    <div class="selectedSub">Search a food and pick one from the list.</div>
  `;
});

async function onFindSwaps() {
  if (!selected) {
    alert("Pick a food first (select from suggestions).");
    return;
  }

  ui.resultsBadge.textContent = "Computing…";
  ui.emptyState.style.display = "none";
  ui.results.innerHTML = "";

  const payload = {
    id: selected.id,
    portion: String(ui.portion.value || "1"),
    unit: ui.unit.value,
    diet: ui.diet.value,
    medical: ui.medical.value,
    allergies: ui.allergies.value,
    calTol: ui.calTol.value,
    macroTol: ui.macroTol.value,
    mode: ui.mode.value,
    maxResults: ui.maxResults.value
  };

  try {
    const out = await apiSwap(payload);
    const swaps = out.swaps || out.items || out.results || [];
    ui.resultsBadge.textContent = swaps.length ? `${swaps.length} found` : "None found";

    if (!swaps.length) {
      ui.emptyState.style.display = "block";
      ui.emptyState.querySelector(".emptyTitle").textContent = "No matches within tolerance";
      ui.emptyState.querySelector(".emptySub").textContent =
        payload.mode === "strict"
          ? "Try Flex mode or widen tolerances slightly."
          : "Try different portion or search another base food.";
      return;
    }

    ui.results.innerHTML = swaps.map(s => {
      const title = s.name || s.id;
      const meta = [s.group, s.subgroup].filter(Boolean).join(" • ");
      const portionText = s.portionText || s.portion_display || "";
      const kcal = s.kcal ?? s.calories ?? "";
      const p = s.p ?? s.protein ?? "";
      const c = s.c ?? s.carbs ?? "";
      const f = s.f ?? s.fat ?? "";

      return `
        <div class="resultCard">
          <div>
            <div class="rcTitle">${escapeHtml(title)}</div>
            <div class="rcMeta">${escapeHtml(meta)}</div>
            <div class="rcMeta">${escapeHtml(portionText)}</div>
          </div>
          <div class="rcRight">
            <div class="rcBig">${escapeHtml(String(kcal))} kcal</div>
            <div class="rcSmall">P ${escapeHtml(String(p))} • C ${escapeHtml(String(c))} • F ${escapeHtml(String(f))}</div>
          </div>
        </div>
      `;
    }).join("");

  } catch (e) {
    console.error(e);
    ui.resultsBadge.textContent = "Error";
    ui.emptyState.style.display = "block";
    ui.emptyState.querySelector(".emptyTitle").textContent = "Swap request failed";
    ui.emptyState.querySelector(".emptySub").textContent =
      "If your backend isn’t wired to these endpoints yet, toggle Demo mode for UI testing.";
  }
}

/* -----------------------------
   Demo fallback (so UI works instantly)
--------------------------------*/

const DEMO_FOODS = [
  { id:"usda_171077", name:"Chicken Breast, Raw", group:"protein", subgroup:"meat", units_json: JSON.stringify({g:1,oz:28.35,serving:100,piece:140}) },
  { id:"usda_173686", name:"Salmon, Atlantic, Raw", group:"protein", subgroup:"seafood", units_json: JSON.stringify({g:1,oz:28.35,serving:100,piece:140}) },
  { id:"usda_168917", name:"Greek Yogurt, Plain, Nonfat", group:"protein", subgroup:"dairy", units_json: JSON.stringify({g:1,oz:28.35,serving:170,cup:245}) },
  { id:"usda_168880", name:"Rolled Oats, Dry", group:"carb", subgroup:"grain", units_json: JSON.stringify({g:1,oz:28.35,serving:40,cup:80}) },
  { id:"usda_169133", name:"White Rice, Cooked", group:"carb", subgroup:"grain", units_json: JSON.stringify({g:1,oz:28.35,serving:158,cup:158}) },
];

function demoSearch(q){
  const s = q.toLowerCase();
  const items = DEMO_FOODS.filter(f => (f.name||"").toLowerCase().includes(s) || f.id.includes(s));
  return Promise.resolve({ items });
}

function demoTargets(input){
  const { heightCm, weightKg, age, sex, activity, goal } = input;

  // Mifflin-St Jeor
  const bmr = sex === "female"
    ? (10*weightKg + 6.25*heightCm - 5*age - 161)
    : (10*weightKg + 6.25*heightCm - 5*age + 5);

  const mult = ({
    sedentary:1.2, light:1.375, moderate:1.55, high:1.725, athlete:1.9
  })[activity] || 1.55;

  const tdee = bmr * mult;

  const targetKcal = goal === "cut" ? tdee*0.85 : goal === "bulk" ? tdee*1.10 : tdee;

  // Simple default macros: protein 1.8g/kg, fat 0.8g/kg, rest carbs
  const protein_g = weightKg * 1.8;
  const fat_g = weightKg * 0.8;
  const proteinKcal = protein_g * 4;
  const fatKcal = fat_g * 9;
  const carbsKcal = Math.max(0, targetKcal - proteinKcal - fatKcal);
  const carbs_g = carbsKcal / 4;

  return Promise.resolve({ bmr, tdee, targetKcal, protein_g, carbs_g, fat_g });
}

function demoSwap(payload){
  // Fake results just to show UI. Your backend will return real swaps.
  const swaps = [
    { id:"usda_173686", name:"Salmon, Atlantic, Raw", group:"protein", subgroup:"seafood", portionText:"≈ 1.2 pieces", kcal: 280, p: 28, c: 0, f: 18 },
    { id:"usda_168917", name:"Greek Yogurt, Plain, Nonfat", group:"protein", subgroup:"dairy", portionText:"≈ 2 cups", kcal: 260, p: 46, c: 18, f: 0 },
  ];
  return Promise.resolve({ swaps });
}

/* -----------------------------
   Init
--------------------------------*/

refreshStatus();
setTab("targets");
