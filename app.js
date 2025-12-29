/*
  SWAP UI (GitHub Pages)
  - Uses JSONP to talk to your Google Apps Script Web App
  - Routes expected:
      ?route=health
      ?route=foods&q=chicken&limit=20
      ?route=food&id=...
      ?route=swap&id=...&portion_g=...&tol=0.05&same_group=1&flex=0&limit=12
*/

"use strict";

/********************
 * CONFIG
 ********************/
// IMPORTANT: paste your Apps Script Web App EXEC URL below (must end with /exec)
// Example: https://script.google.com/macros/s/AKfycb.../exec
const DEFAULT_API_BASE = "PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE";

const STORE = {
  apiBase: "swap_api_base_v1",
  profile: "swap_profile_v2",
  demoSeen: "swap_demo_seen_v1"
};

/********************
 * DOM helpers
 ********************/
const $ = (id) => document.getElementById(id);

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function round(n, d = 1) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

function fmt(n, d = 0) {
  if (!isFinite(n)) return "—";
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d });
}

function safeJsonParse(x) {
  try {
    if (x === null || x === undefined) return null;
    if (typeof x === "object") return x;
    const s = String(x).trim();
    if (!s) return null;
    return JSON.parse(s);
  } catch {
    return null;
  }
}

function normalizeUnitsMap(unitsJson) {
  const u = safeJsonParse(unitsJson);
  const out = {};
  if (!u || typeof u !== "object") return out;
  for (const [k, v] of Object.entries(u)) {
    const key = String(k).trim().toLowerCase();
    const val = Number(v);
    if (!key || !isFinite(val) || val <= 0) continue;
    out[key] = val;
  }
  return out;
}

/********************
 * JSONP
 ********************/
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const timeoutMs = 15000;
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("Request timed out"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      try { delete window[cb]; } catch {}
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };

    const glue = url.includes("?") ? "&" : "?";
    const finalUrl = url + glue + "callback=" + cb;

    const script = document.createElement("script");
    script.src = finalUrl;
    script.onerror = () => {
      cleanup();
      reject(new Error("Network error"));
    };
    document.head.appendChild(script);
  });
}

/********************
 * API
 ********************/
function getApiBase() {
  const qs = new URLSearchParams(location.search);
  const fromQs = qs.get("api");
  const fromStore = localStorage.getItem(STORE.apiBase);
  return (fromQs || fromStore || DEFAULT_API_BASE || "").trim();
}

let API_BASE = getApiBase();

async function api(route, params = {}) {
  if (!API_BASE || API_BASE === "PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE") {
    return { ok: false, error: "Missing API base" };
  }
  const u = new URL(API_BASE);
  u.searchParams.set("route", route);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    u.searchParams.set(k, String(v));
  }
  const res = await jsonp(u.toString());
  return res;
}

/********************
 * Profile
 ********************/
const Profile = {
  load() {
    const raw = localStorage.getItem(STORE.profile);
    if (!raw) return null;
    const obj = safeJsonParse(raw);
    return obj && typeof obj === "object" ? obj : null;
  },
  save(p) {
    localStorage.setItem(STORE.profile, JSON.stringify(p));
  },
  clear() {
    localStorage.removeItem(STORE.profile);
  }
};

function toCm(heightVal, unit) {
  const n = Number(heightVal);
  if (!isFinite(n) || n <= 0) return NaN;
  return unit === "in" ? n * 2.54 : n;
}

function toKg(weightVal, unit) {
  const n = Number(weightVal);
  if (!isFinite(n) || n <= 0) return NaN;
  return unit === "lb" ? n * 0.45359237 : n;
}

function mifflinBmr({ sex, age, height_cm, weight_kg }) {
  const A = Number(age);
  const H = Number(height_cm);
  const W = Number(weight_kg);
  if (![A, H, W].every((x) => isFinite(x) && x > 0)) return NaN;
  const base = 10 * W + 6.25 * H - 5 * A;
  if (sex === "male") return base + 5;
  if (sex === "female") return base - 161;
  // conservative default
  return base - 78;
}

const ACT_MULT = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
  athlete: 1.9
};

function calorieGoal(tdee, goal) {
  if (!isFinite(tdee) || tdee <= 0) return NaN;
  if (goal === "fat_loss") return tdee * 0.8;
  if (goal === "lean_gain") return tdee * 1.1;
  if (goal === "muscle_gain") return tdee * 1.15;
  if (goal === "recomp") return tdee * 0.9;
  return tdee;
}

function macroTargets({ goal, weight_kg, kcal }) {
  // Simple, non-dogmatic defaults aligned with your prompt
  const w = Number(weight_kg);
  const K = Number(kcal);
  if (![w, K].every((x) => isFinite(x) && x > 0)) return null;

  let proteinPerKg = 1.6;
  if (goal === "fat_loss" || goal === "recomp") proteinPerKg = 2.0;
  if (goal === "muscle_gain") proteinPerKg = 2.2;
  proteinPerKg = clamp(proteinPerKg, 1.2, 2.6);

  const p_g = round(w * proteinPerKg, 0);

  // fat baseline: 0.8 g/kg
  const f_g = round(w * 0.8, 0);

  const p_kcal = p_g * 4;
  const f_kcal = f_g * 9;

  const remaining = Math.max(0, K - p_kcal - f_kcal);
  const c_g = round(remaining / 4, 0);

  return { p_g, c_g, f_g };
}

/********************
 * App state
 ********************/
const state = {
  connected: false,
  foods: [],
  picked: null, // {id,name,group,subgroup}
  pickedDetails: null,
  swaps: [],
  pickedSwap: null,
  foodCache: new Map(),
  profile: Profile.load()
};

/********************
 * UI: views
 ********************/
function showView(which) {
  for (const id of ["viewSplash", "viewIntake", "viewApp"]) {
    $(id).classList.toggle("active", id === which);
  }
}

function setConnected(on) {
  state.connected = !!on;
  const el = $("connBadge");
  const dot = $("connDot");
  if (!el || !dot) return;
  el.textContent = on ? "Connected" : "Not connected";
  dot.classList.toggle("ok", on);
  dot.classList.toggle("bad", !on);
}

function setFooterYear() {
  const y = new Date().getFullYear();
  const el = $("year");
  if (el) el.textContent = String(y);
}

/********************
 * UI: Intake
 ********************/
function renderProfileSummary() {
  const p = state.profile;
  const wrap = $("profileSummary");
  if (!wrap) return;
  if (!p) {
    wrap.innerHTML = `
      <div class="empty">
        <div class="emptyTitle">No profile yet</div>
        <div class="emptySub">Create a profile once, and we’ll remember it on this device.</div>
      </div>`;
    return;
  }

  const bmr = mifflinBmr({ sex: p.sex, age: p.age, height_cm: p.height_cm, weight_kg: p.weight_kg });
  const tdee = isFinite(bmr) ? bmr * (ACT_MULT[p.activity] || 1.2) : NaN;
  const goalKcal = calorieGoal(tdee, p.goal);
  const macros = macroTargets({ goal: p.goal, weight_kg: p.weight_kg, kcal: goalKcal });

  wrap.innerHTML = `
    <div class="profileGrid">
      <div class="kv"><div class="k">Height</div><div class="v">${fmt(p.height_cm,0)} cm</div></div>
      <div class="kv"><div class="k">Weight</div><div class="v">${fmt(p.weight_kg,1)} kg</div></div>
      <div class="kv"><div class="k">Age</div><div class="v">${fmt(p.age,0)}</div></div>
      <div class="kv"><div class="k">Sex</div><div class="v">${p.sex === "male" ? "Male" : p.sex === "female" ? "Female" : "Unspecified"}</div></div>
      <div class="kv"><div class="k">Activity</div><div class="v">${p.activityLabel}</div></div>
      <div class="kv"><div class="k">Goal</div><div class="v">${p.goalLabel}</div></div>
    </div>
    <div class="profileDivider"></div>
    <div class="profileGrid">
      <div class="kv"><div class="k">BMR</div><div class="v">${fmt(round(bmr,0),0)} kcal</div></div>
      <div class="kv"><div class="k">TDEE</div><div class="v">${fmt(round(tdee,0),0)} kcal</div></div>
      <div class="kv"><div class="k">Goal calories</div><div class="v">${fmt(round(goalKcal,0),0)} kcal</div></div>
      <div class="kv"><div class="k">Protein</div><div class="v">${macros ? fmt(macros.p_g,0) + " g" : "—"}</div></div>
      <div class="kv"><div class="k">Carbs</div><div class="v">${macros ? fmt(macros.c_g,0) + " g" : "—"}</div></div>
      <div class="kv"><div class="k">Fat</div><div class="v">${macros ? fmt(macros.f_g,0) + " g" : "—"}</div></div>
    </div>
  `;
}

function saveProfileFromIntake() {
  const heightVal = $("heightVal").value;
  const heightUnit = $("heightUnit").value;
  const weightVal = $("weightVal").value;
  const weightUnit = $("weightUnit").value;
  const age = Number($("age").value);
  const sex = $("sex").value;
  const activity = $("activity").value;
  const goal = $("goal").value;

  const height_cm = toCm(heightVal, heightUnit);
  const weight_kg = toKg(weightVal, weightUnit);

  const err = [];
  if (!isFinite(height_cm) || height_cm < 80 || height_cm > 260) err.push("height");
  if (!isFinite(weight_kg) || weight_kg < 25 || weight_kg > 300) err.push("weight");
  if (!isFinite(age) || age < 10 || age > 100) err.push("age");

  if (err.length) {
    showToast("Please check your " + err.join(", ") + ".", "bad");
    return null;
  }

  const activityLabel = {
    sedentary: "Sedentary",
    light: "Light",
    moderate: "Moderate",
    high: "High",
    athlete: "Athlete"
  }[activity] || "Sedentary";

  const goalLabel = {
    fat_loss: "Fat loss",
    maintenance: "Maintenance",
    lean_gain: "Lean gain",
    muscle_gain: "Muscle gain",
    recomp: "Recomp"
  }[goal] || "Maintenance";

  const p = {
    height_cm: round(height_cm, 0),
    weight_kg: round(weight_kg, 2),
    age,
    sex,
    activity,
    activityLabel,
    goal,
    goalLabel,
    savedAt: Date.now()
  };

  state.profile = p;
  Profile.save(p);
  renderProfileSummary();
  return p;
}

/********************
 * UI: Swap finder
 ********************/
let searchTimer = null;

function setSearchHint(text, kind = "") {
  const el = $("searchHint");
  if (!el) return;
  el.textContent = text || "";
  el.classList.remove("bad", "ok");
  if (kind) el.classList.add(kind);
}

function showToast(msg, kind = "") {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.remove("show", "bad", "ok");
  if (kind) el.classList.add(kind);
  el.classList.add("show");
  window.clearTimeout(showToast._t);
  showToast._t = window.setTimeout(() => el.classList.remove("show"), 2400);
}

function renderSearchResults(items) {
  const drop = $("searchDrop");
  const list = $("searchList");
  if (!drop || !list) return;

  state.foods = Array.isArray(items) ? items : [];

  if (!state.foods.length) {
    drop.classList.remove("open");
    list.innerHTML = "";
    return;
  }

  list.innerHTML = state.foods
    .slice(0, 20)
    .map((it, idx) => {
      const sub = [it.group, it.subgroup].filter(Boolean).join(" • ");
      return `
        <button class="sItem" type="button" data-idx="${idx}">
          <div class="sName">${escapeHtml(it.name || "")}</div>
          <div class="sMeta">${escapeHtml(sub)}</div>
        </button>`;
    })
    .join("");

  drop.classList.add("open");
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function ensureFoodDetails(id) {
  if (!id) return null;
  if (state.foodCache.has(id)) return state.foodCache.get(id);
  const res = await api("food", { id });
  if (!res || !res.ok) return null;
  state.foodCache.set(id, res.food);
  return res.food;
}

function gramsToOz(g) {
  const n = Number(g);
  if (!isFinite(n)) return NaN;
  return n / 28.349523125;
}

function computePortionGrams(amount, unit, food) {
  const amt = Number(amount);
  if (!isFinite(amt) || amt <= 0) return { ok: false, error: "Enter a portion amount." };

  const u = String(unit || "").toLowerCase();
  if (u === "g") return { ok: true, grams: amt };
  if (u === "oz") return { ok: true, grams: amt * 28.349523125 };

  const unitsMap = normalizeUnitsMap(food && food.units_json);
  if (unitsMap[u]) return { ok: true, grams: amt * unitsMap[u] };

  return { ok: false, error: `This food doesn't have a “${u}” conversion yet. Use grams or ounces, or choose an available unit.` };
}

function renderUnitOptions(food) {
  const sel = $("portionUnit");
  if (!sel) return;
  const unitsMap = normalizeUnitsMap(food && food.units_json);

  const desired = [
    { v: "g", label: "g" },
    { v: "oz", label: "oz" },
    { v: "serving", label: "serving" },
    { v: "piece", label: "piece" },
    { v: "cup", label: "cup" },
    { v: "tbsp", label: "tbsp" },
    { v: "tsp", label: "tsp" },
    { v: "slice", label: "slice" },
    { v: "item", label: "item" }
  ];

  const current = sel.value || "g";
  sel.innerHTML = desired
    .map((o) => {
      const enabled = o.v === "g" || o.v === "oz" || !!unitsMap[o.v];
      const suffix = enabled ? "" : " (unavailable)";
      return `<option value="${o.v}" ${enabled ? "" : "disabled"}>${o.label}${suffix}</option>`;
    })
    .join("");

  // restore if still available
  const opt = Array.from(sel.options).find((x) => x.value === current && !x.disabled);
  sel.value = opt ? current : "g";

  const unitsLine = $("unitsLine");
  if (unitsLine) {
    const available = Object.keys(unitsMap)
      .filter((k) => !["g", "oz"].includes(k))
      .sort();
    unitsLine.textContent = available.length
      ? `Available for this food: ${available.join(", ")}`
      : "Available for this food: g, oz";
  }
}

function clearSwaps() {
  state.swaps = [];
  state.pickedSwap = null;
  $("swapList").innerHTML = "";
  $("breakdown").innerHTML = `
    <div class="empty">
      <div class="emptyTitle">No swap selected</div>
      <div class="emptySub">Pick a swap to see the full macro breakdown.</div>
    </div>`;
}

function renderSwaps(swaps) {
  const list = $("swapList");
  if (!list) return;

  state.swaps = Array.isArray(swaps) ? swaps : [];

  if (!state.swaps.length) {
    list.innerHTML = `
      <div class="empty">
        <div class="emptyTitle">No matches</div>
        <div class="emptySub">Try Best‑fit mode, or choose a more specific food.</div>
      </div>`;
    return;
  }

  list.innerHTML = state.swaps
    .map((s, idx) => {
      const score = isFinite(s.score) ? Math.round(s.score) : "—";
      const e = s.err || {};
      const line = [
        `Δ cal ${pct(e.cal_pct)}`,
        `Δ P ${pct(e.protein_pct)}`,
        `Δ C ${pct(e.carbs_pct)}`,
        `Δ F ${pct(e.fat_pct)}`
      ].join(" · ");

      const portion = isFinite(s.portion_g) ? `${fmt(round(s.portion_g, 0), 0)} g` : "";

      return `
        <button type="button" class="swapCard" data-idx="${idx}">
          <div class="swapTop">
            <div class="swapName">${escapeHtml(s.name || "")}</div>
            <div class="swapScore">${score}</div>
          </div>
          <div class="swapMeta">${escapeHtml(portion)} · ${escapeHtml([s.group, s.subgroup].filter(Boolean).join(" • "))}</div>
          <div class="swapLine">${escapeHtml(line)}</div>
        </button>`;
    })
    .join("");
}

function pct(x) {
  if (!isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return sign + fmt(round(x * 100, 1), 1) + "%";
}

function selectSwap(idx) {
  const s = state.swaps[idx];
  if (!s) return;
  state.pickedSwap = s;

  // highlight
  document.querySelectorAll(".swapCard").forEach((el) => el.classList.remove("active"));
  const el = document.querySelector(`.swapCard[data-idx='${idx}']`);
  if (el) el.classList.add("active");

  renderBreakdown();
}

async function renderBreakdown() {
  const base = state.pickedDetails;
  const pick = state.picked;
  const swap = state.pickedSwap;

  const box = $("breakdown");
  if (!box) return;

  if (!base || !pick || !swap) {
    box.innerHTML = `
      <div class="empty">
        <div class="emptyTitle">No swap selected</div>
        <div class="emptySub">Pick a swap to see the full macro breakdown.</div>
      </div>`;
    return;
  }

  const swapFood = await ensureFoodDetails(swap.id);
  if (!swapFood) {
    box.innerHTML = `
      <div class="empty">
        <div class="emptyTitle">Couldn’t load swap details</div>
        <div class="emptySub">Try again in a moment.</div>
      </div>`;
    return;
  }

  const basePortion_g = Number($("portionAmount").value) ? Number(state._basePortionG || 0) : Number(state._basePortionG || 0);
  const baseG = isFinite(basePortion_g) && basePortion_g > 0 ? basePortion_g : Number(state._basePortionG || 0);

  const baseTotal = totalsFromPerG(base, baseG);
  const swapTotal = totalsFromPerG(swapFood, Number(swap.portion_g));

  box.innerHTML = `
    <div class="bTitle">Original vs Swap</div>
    <div class="bSub">Honest totals for the exact portions.</div>

    <div class="bChips">
      <div class="chip"><span class="chipK">Original</span><span class="chipV">${escapeHtml(pick.name)} · ${fmt(round(baseG, 0), 0)} g (${fmt(round(gramsToOz(baseG), 1), 1)} oz)</span></div>
      <div class="chip"><span class="chipK">Swap</span><span class="chipV">${escapeHtml(swap.name)} · ${fmt(round(swap.portion_g, 0), 0)} g (${fmt(round(gramsToOz(swap.portion_g), 1), 1)} oz)</span></div>
    </div>

    <div class="bTable">
      ${row("Calories", baseTotal.cal, swapTotal.cal, "kcal", 0)}
      ${row("Protein", baseTotal.p, swapTotal.p, "g", 1)}
      ${row("Carbs", baseTotal.c, swapTotal.c, "g", 1)}
      ${row("Fat", baseTotal.f, swapTotal.f, "g", 1)}
      ${row("Fiber", baseTotal.fiber, swapTotal.fiber, "g", 1)}
      ${row("Sodium", baseTotal.sodium, swapTotal.sodium, "mg", 0)}
    </div>

    <div class="bNote">
      <strong>Swap score:</strong> ${isFinite(swap.score) ? Math.round(swap.score) : "—"}/100 ·
      Built from calorie match + macro deviation (plus optional same-group filtering).
    </div>
  `;
}

function totalsFromPerG(food, grams) {
  const g = Number(grams);
  const cal = Number(food.calories_per_g) * g;
  const p = Number(food.protein_per_g) * g;
  const c = Number(food.carbs_per_g) * g;
  const f = Number(food.fat_per_g) * g;
  const fiber = Number(food.fiber_per_g) * g;
  const sodium = Number(food.sodium_mg_per_g) * g;
  return {
    cal: isFinite(cal) ? cal : NaN,
    p: isFinite(p) ? p : NaN,
    c: isFinite(c) ? c : NaN,
    f: isFinite(f) ? f : NaN,
    fiber: isFinite(fiber) ? fiber : NaN,
    sodium: isFinite(sodium) ? sodium : NaN
  };
}

function row(label, a, b, unit, d) {
  const delta = isFinite(a) && isFinite(b) ? b - a : NaN;
  const sign = delta > 0 ? "+" : "";
  const cls = !isFinite(delta) ? "" : delta > 0 ? "up" : delta < 0 ? "down" : "flat";
  return `
    <div class="bRow">
      <div class="bL">${escapeHtml(label)}</div>
      <div class="bA">${fmt(round(a, d), d)} <span class="u">${unit}</span></div>
      <div class="bB">${fmt(round(b, d), d)} <span class="u">${unit}</span></div>
      <div class="bD ${cls}">${isFinite(delta) ? sign + fmt(round(delta, d), d) : "—"} <span class="u">${unit}</span></div>
    </div>`;
}

/********************
 * Event wiring
 ********************/
async function connectCheck() {
  const res = await api("health", {});
  setConnected(!!(res && res.ok));
}

function closeSearchDrop() {
  const drop = $("searchDrop");
  if (drop) drop.classList.remove("open");
}

function pickFoodByIndex(idx) {
  const it = state.foods[idx];
  if (!it) return;
  state.picked = it;
  $("foodSearch").value = it.name;
  closeSearchDrop();
  setSearchHint(`Selected: ${it.name}`, "ok");
  clearSwaps();

  ensureFoodDetails(it.id).then((food) => {
    state.pickedDetails = food;
    renderUnitOptions(food);
  });
}

function tryAutoPickExact() {
  const q = String($("foodSearch").value || "").trim().toLowerCase();
  if (!q || !state.foods.length) return false;
  const hit = state.foods.find((x) => String(x.name || "").trim().toLowerCase() === q);
  if (hit) {
    state.picked = hit;
    $("foodSearch").value = hit.name;
    closeSearchDrop();
    setSearchHint(`Selected: ${hit.name}`, "ok");
    clearSwaps();
    ensureFoodDetails(hit.id).then((food) => {
      state.pickedDetails = food;
      renderUnitOptions(food);
    });
    return true;
  }
  return false;
}

async function runSwap() {
  const q = String($("foodSearch").value || "").trim();

  // Ensure a database-backed pick
  if (!state.picked || !state.picked.id || $("foodSearch").value.trim().toLowerCase() !== String(state.picked.name || "").trim().toLowerCase()) {
    // try to auto-pick if exact match exists
    const ok = tryAutoPickExact();
    if (!ok) {
      setSearchHint("Choose a food from the suggestions for accuracy.", "bad");
      showToast("Pick a food from the suggestions.", "bad");
      return;
    }
  }

  const base = state.pickedDetails || (await ensureFoodDetails(state.picked.id));
  if (!base) {
    showToast("Couldn’t load that food. Try again.", "bad");
    return;
  }
  state.pickedDetails = base;

  const amount = $("portionAmount").value;
  const unit = $("portionUnit").value;

  const portionRes = computePortionGrams(amount, unit, base);
  if (!portionRes.ok) {
    showToast(portionRes.error, "bad");
    return;
  }

  const portion_g = portionRes.grams;
  state._basePortionG = portion_g;

  const sameGroup = $("sameGroup").checked;
  const bestFit = $("bestFit").checked;

  // Internal tolerance (not shown to users)
  const tol = bestFit ? 0.10 : 0.05;
  const flex = bestFit ? 1 : 0;

  $("getSwaps").disabled = true;
  $("getSwaps").textContent = "Finding swaps…";

  try {
    const res = await api("swap", {
      id: state.picked.id,
      portion_g: round(portion_g, 4),
      tol,
      same_group: sameGroup ? 1 : 0,
      flex,
      limit: 12
    });

    if (!res || !res.ok) {
      renderSwaps([]);
      showToast(res && res.error ? res.error : "Swap request failed.", "bad");
      return;
    }

    renderSwaps(res.results || []);
    if ((res.results || []).length) {
      showToast("Swaps ready.", "ok");
      // auto-select first
      selectSwap(0);
    } else {
      clearSwaps();
    }
  } catch (e) {
    renderSwaps([]);
    showToast(e.message || "Swap request failed.", "bad");
  } finally {
    $("getSwaps").disabled = false;
    $("getSwaps").textContent = "Get swaps";
  }
}

function resetAll() {
  state.picked = null;
  state.pickedDetails = null;
  state.foods = [];
  state._basePortionG = null;
  $("foodSearch").value = "";
  $("portionAmount").value = "";
  setSearchHint("Type a food name and pick from suggestions.");
  clearSwaps();
  closeSearchDrop();
}

function wireEvents() {
  // Splash buttons
  $("btnGetStarted").addEventListener("click", () => {
    showView("viewIntake");
  });
  $("btnOpenDemo").addEventListener("click", () => {
    // Demo just skips intake
    showView("viewApp");
  });

  // Intake
  $("intakeSkip").addEventListener("click", () => {
    showView("viewApp");
  });
  $("intakeContinue").addEventListener("click", () => {
    const p = saveProfileFromIntake();
    if (p) {
      showView("viewApp");
      showToast("Profile saved.", "ok");
    }
  });

  // Navigation
  $("navSwap").addEventListener("click", () => {
    $("panelSwap").classList.add("active");
    $("panelProfile").classList.remove("active");
    $("navSwap").classList.add("active");
    $("navProfile").classList.remove("active");
  });
  $("navProfile").addEventListener("click", () => {
    renderProfileSummary();
    $("panelProfile").classList.add("active");
    $("panelSwap").classList.remove("active");
    $("navProfile").classList.add("active");
    $("navSwap").classList.remove("active");
  });

  $("resetAll").addEventListener("click", resetAll);

  // Search input
  $("foodSearch").addEventListener("input", () => {
    const q = String($("foodSearch").value || "").trim();
    state.picked = null;
    state.pickedDetails = null;
    clearSwaps();

    if (searchTimer) clearTimeout(searchTimer);
    if (q.length < 2) {
      renderSearchResults([]);
      setSearchHint("Type a food name and pick from suggestions.");
      return;
    }

    setSearchHint("Searching…");
    searchTimer = setTimeout(async () => {
      const res = await api("foods", { q, limit: 20 });
      if (res && res.ok) {
        renderSearchResults(res.results || []);
        setSearchHint(res.count ? "Pick the exact match from suggestions." : "No matches. Try another term.");
      } else {
        renderSearchResults([]);
        setSearchHint("Search unavailable (API not connected).", "bad");
      }
    }, 220);
  });

  // Click suggestions
  $("searchList").addEventListener("click", (e) => {
    const btn = e.target.closest(".sItem");
    if (!btn) return;
    const idx = Number(btn.getAttribute("data-idx"));
    if (Number.isFinite(idx)) pickFoodByIndex(idx);
  });

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    const drop = $("searchDrop");
    if (!drop) return;
    if (drop.contains(e.target) || $("foodSearch").contains(e.target)) return;
    closeSearchDrop();
  });

  // Get swaps
  $("getSwaps").addEventListener("click", runSwap);

  // Swap selection
  $("swapList").addEventListener("click", (e) => {
    const card = e.target.closest(".swapCard");
    if (!card) return;
    const idx = Number(card.getAttribute("data-idx"));
    if (Number.isFinite(idx)) selectSwap(idx);
  });

  // Profile edit
  $("profileEdit").addEventListener("click", () => {
    // Pre-fill intake values from saved profile if available
    const p = state.profile;
    if (p) {
      $("heightVal").value = p.height_cm;
      $("heightUnit").value = "cm";
      $("weightVal").value = p.weight_kg;
      $("weightUnit").value = "kg";
      $("age").value = p.age;
      $("sex").value = p.sex;
      $("activity").value = p.activity;
      $("goal").value = p.goal;
    }
    showView("viewIntake");
  });

  $("profileClear").addEventListener("click", () => {
    if (!confirm("Clear your saved profile on this device?")) return;
    Profile.clear();
    state.profile = null;
    renderProfileSummary();
    showToast("Profile cleared.", "ok");
  });

  $("apiSave").addEventListener("click", async () => {
    const val = String($("apiBase").value || "").trim();
    if (!val || !val.includes("/exec")) {
      showToast("Paste your Apps Script /exec URL.", "bad");
      return;
    }
    localStorage.setItem(STORE.apiBase, val);
    API_BASE = val;
    await connectCheck();
    showToast("API saved.", "ok");
  });
}

/********************
 * Boot
 ********************/
async function boot() {
  setFooterYear();
  $("apiBase").value = API_BASE && API_BASE !== "PASTE_YOUR_APPS_SCRIPT_EXEC_URL_HERE" ? API_BASE : "";

  wireEvents();
  renderProfileSummary();
  resetAll();

  await connectCheck();

  // If profile exists, go straight to app. Otherwise splash.
  if (state.profile) {
    showView("viewApp");
  } else {
    showView("viewSplash");
  }
}

boot();
