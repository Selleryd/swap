// app.js — SWAP (GitHub Pages UI)
// Paste your Apps Script Web App /exec URL here if you have one.
// Example: const API_BASE = "https://script.google.com/macros/s/XXXX/exec";
const API_BASE = "";

// -----------------------------
// Utilities
// -----------------------------
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round = (n, d = 0) => {
  const p = Math.pow(10, d);
  return Math.round((Number(n) || 0) * p) / p;
};
const esc = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

async function fetchJson(url, options = {}, timeoutMs = 9000){
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try{
    const res = await fetch(url, { ...options, signal: ctrl.signal, headers: { "Accept": "application/json", ...(options.headers || {}) } });
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    const text = await res.text();
    let data = null;
    if (ct.includes("application/json")) data = JSON.parse(text);
    else {
      // Some Apps Script deployments return JSON with text/plain
      try { data = JSON.parse(text); } catch { data = { ok: false, raw: text }; }
    }
    if (!res.ok) throw new Error((data && (data.error || data.message)) || `HTTP ${res.status}`);
    return data;
  } finally{
    clearTimeout(t);
  }
}

// -----------------------------
// Storage (profile)
// -----------------------------
const STORE_KEY = "swap_profile_v1";
const API_KEY = "swap_api_base_v1";

function loadProfile(){
  try{
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  }catch{ return null; }
}
function saveProfile(p){
  localStorage.setItem(STORE_KEY, JSON.stringify(p));
}
function clearProfile(){
  localStorage.removeItem(STORE_KEY);
}

function getApiBase(){
  return (API_BASE || localStorage.getItem(API_KEY) || "").trim();
}

// -----------------------------
// View routing
// -----------------------------
const views = {
  splash: $("viewSplash"),
  intake: $("viewIntake"),
  app: $("viewApp"),
};

function showView(name){
  for (const k of Object.keys(views)){
    views[k].classList.toggle("hidden", k !== name);
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// -----------------------------
// Background (subtle AI SaaS vibe)
// -----------------------------
function initBg(){
  const c = $("bg");
  const ctx = c.getContext("2d");
  const bubbles = [];
  const N = 24;

  function resize(){
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(window.innerWidth * dpr);
    c.height = Math.floor(window.innerHeight * dpr);
    c.style.width = window.innerWidth + "px";
    c.style.height = window.innerHeight + "px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }
  resize();
  window.addEventListener("resize", resize);

  function resetBubble(b){
    b.x = Math.random() * window.innerWidth;
    b.y = Math.random() * window.innerHeight;
    b.r = 18 + Math.random() * 46;
    b.vy = 0.12 + Math.random() * 0.40;
    b.vx = (-0.25 + Math.random() * 0.5) * 0.3;
    b.o = 0.06 + Math.random() * 0.10;
  }
  for (let i=0;i<N;i++){
    const b = {};
    resetBubble(b);
    b.y = Math.random() * window.innerHeight;
    bubbles.push(b);
  }

  function draw(){
    ctx.clearRect(0,0,window.innerWidth,window.innerHeight);
    for (const b of bubbles){
      b.x += b.vx;
      b.y += b.vy;
      if (b.y - b.r > window.innerHeight + 40) { b.y = -40; b.x = Math.random() * window.innerWidth; }
      if (b.x < -60) b.x = window.innerWidth + 60;
      if (b.x > window.innerWidth + 60) b.x = -60;

      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.fillStyle = `rgba(22,163,74,${b.o})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(b.x + b.r*0.35, b.y - b.r*0.25, b.r*0.45, 0, Math.PI*2);
      ctx.fillStyle = `rgba(14,165,233,${b.o*0.55})`;
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  draw();
}

// -----------------------------
// API adapter (tries multiple route names)
// -----------------------------
const api = {
  base: "",
  ok: false,
  foodsLocal: null,
  lastPing: null,
};

async function pingApi(){
  api.base = getApiBase();
  const statusEl = $("apiStatus");
  const statusText = $("apiStatusText");
  if (!api.base){
    statusEl.classList.remove("status--ok","status--bad");
    statusText.textContent = "Demo mode";
    api.ok = false;
    return false;
  }

  const candidates = [
    `${api.base}?action=ping`,
    `${api.base}?ping=1`,
    api.base,
  ];

  for (const url of candidates){
    try{
      const data = await fetchJson(url, {}, 6500);
      api.lastPing = data;
      api.ok = true;
      statusEl.classList.add("status--ok");
      statusEl.classList.remove("status--bad");
      statusText.textContent = "Connected";
      return true;
    }catch(e){
      // try next
    }
  }

  api.ok = false;
  statusEl.classList.add("status--bad");
  statusEl.classList.remove("status--ok");
  statusText.textContent = "Offline";
  return false;
}

function normalizeFoods(payload){
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.foods)) return payload.foods;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.results)) return payload.results;
  return [];
}

function normalizeSwaps(payload){
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.swaps)) return payload.swaps;
  if (Array.isArray(payload.matches)) return payload.matches;
  if (Array.isArray(payload.items)) return payload.items;
  return [];
}

async function searchFoodsRemote(q){
  const qs = encodeURIComponent(q);
  const routes = [
    `${api.base}?action=search&q=${qs}`,
    `${api.base}?action=foods&q=${qs}`,
    `${api.base}?action=food_search&q=${qs}`,
    `${api.base}?q=${qs}`,
  ];
  for (const url of routes){
    try{
      const data = await fetchJson(url, {}, 9000);
      const foods = normalizeFoods(data);
      if (foods.length) return foods;
    }catch(e){ /* try next */ }
  }
  return [];
}

async function getSwapsRemote(params){
  // params: { foodId, portion, unit, mode, sameGroup }
  const qs = new URLSearchParams();
  qs.set("foodId", params.foodId);
  qs.set("portion", String(params.portion));
  qs.set("unit", params.unit);
  qs.set("mode", params.mode);
  qs.set("sameGroup", params.sameGroup ? "1" : "0");

  const getRoutes = [
    `${api.base}?action=swaps&${qs.toString()}`,
    `${api.base}?action=getSwaps&${qs.toString()}`,
    `${api.base}?action=swap&${qs.toString()}`,
    `${api.base}?action=match&${qs.toString()}`,
  ];

  // Try GET routes first (common for Apps Script)
  for (const url of getRoutes){
    try{
      const data = await fetchJson(url, {}, 12000);
      const swaps = normalizeSwaps(data);
      if (swaps.length) return swaps;
    }catch(e){ /* try next */ }
  }

  // Then try POST routes
  const postRoutes = [
    `${api.base}?action=swaps`,
    `${api.base}?action=getSwaps`,
    `${api.base}?action=swap`,
    `${api.base}?action=match`,
  ];
  for (const url of postRoutes){
    try{
      const data = await fetchJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(params),
      }, 12000);
      const swaps = normalizeSwaps(data);
      if (swaps.length) return swaps;
    }catch(e){ /* try next */ }
  }

  return [];
}

// -----------------------------
// Local foods (optional foods.json)
// -----------------------------
async function loadLocalFoods(){
  try{
    const data = await fetchJson("foods.json", {}, 6000);
    const foods = normalizeFoods(data);
    if (foods.length){
      api.foodsLocal = foods;
      return foods;
    }
  }catch{}
  return null;
}

function caloriesFromMacros(p,c,f){
  return (Number(p)||0)*4 + (Number(c)||0)*4 + (Number(f)||0)*9;
}

function gramsFromPortion(food, portion, unit){
  const n = Number(portion);
  if (!food || !Number.isFinite(n) || n <= 0) return null;
  const units = food.units || {};
  if (unit === "g") return n;
  if (unit === "oz") return n * 28.35;
  if (units && units[unit]) return n * Number(units[unit]);
  // Fallbacks (honest): piece/serving if only serving exists
  if (unit === "piece" && units.serving) return n * Number(units.serving);
  if (unit === "serving" && food.serving_g) return n * Number(food.serving_g);
  return null;
}

function macrosForPortion(food, grams){
  const servingG = Number(food.serving_g || food.servingG || 0) || 0;
  const per = food.per_serving || food.perServing || food.nutrients || null;
  if (!per) return null;

  // If per_serving is per 1 serving, scale by grams/serving_g when available,
  // otherwise treat grams as 1 serving (not ideal but better than guessing).
  const scale = servingG > 0 ? (grams / servingG) : 1;

  const p = (Number(per.p)||0) * scale;
  const c = (Number(per.c)||0) * scale;
  const f = (Number(per.f)||0) * scale;
  const fiber = (Number(per.fiber)||0) * scale;
  const sugar = (Number(per.sugar)||0) * scale;
  const sodium = (Number(per.sodium)||0) * scale;
  const satfat = (Number(per.satfat)||0) * scale;
  return { p, c, f, fiber, sugar, sodium, satfat, calories: caloriesFromMacros(p,c,f) };
}

function bestLocalSwaps(food, grams, opts){
  // opts: { sameGroup, mode }
  if (!api.foodsLocal || !api.foodsLocal.length) return [];

  const base = macrosForPortion(food, grams);
  if (!base) return [];
  const baseCals = base.calories;

  const tol = opts.mode === "flex" ? 0.10 : 0.05; // internal tolerance
  const group = food.group || food.exchange_group || food.category || null;

  const scored = [];
  for (const cand of api.foodsLocal){
    if (!cand || cand.id === food.id) continue;
    if (opts.sameGroup && group){
      const cg = cand.group || cand.exchange_group || cand.category || null;
      if (cg && cg !== group) continue;
    }

    const candUnits = cand.units || {};
    const candServingG = Number(cand.serving_g || cand.servingG || candUnits.serving || 0) || 0;
    if (!candServingG) continue;

    // portion in grams to match calories: gramsNeeded = (baseCals / candCalsPerGram)
    const candPer = macrosForPortion(cand, candServingG);
    if (!candPer || candPer.calories <= 0) continue;

    const calsPerGram = candPer.calories / candServingG;
    const gramsNeeded = baseCals / calsPerGram;

    if (!Number.isFinite(gramsNeeded) || gramsNeeded <= 0) continue;

    const candAt = macrosForPortion(cand, gramsNeeded);
    if (!candAt) continue;

    const calDelta = Math.abs(candAt.calories - baseCals) / baseCals;

    if (calDelta > tol && opts.mode !== "flex") continue;

    // macro distance (weighted)
    const dP = Math.abs(candAt.p - base.p) / (base.p + 10);
    const dC = Math.abs(candAt.c - base.c) / (base.c + 10);
    const dF = Math.abs(candAt.f - base.f) / (base.f + 10);
    const dist = dP*0.9 + dC*0.9 + dF*1.0 + calDelta*1.2;

    scored.push({
      ...cand,
      _match: { grams: gramsNeeded, calDelta, dist, macros: candAt }
    });
  }

  scored.sort((a,b) => a._match.dist - b._match.dist);
  return scored.slice(0, 8);
}

// -----------------------------
// Swap Finder UI logic
// -----------------------------
const state = {
  pickedFood: null,
  lastResults: [],
  activeSwapId: null,
};

function setError(msg){
  const el = $("swapError");
  if (!msg){
    el.classList.add("hidden");
    el.textContent = "";
    return;
  }
  el.classList.remove("hidden");
  el.textContent = msg;
}

function setHint(msg){
  $("unitHint").textContent = msg || "";
}

function renderPicked(food){
  if (!food){
    $("pickedLine").textContent = "";
    return;
  }
  const group = food.group || food.exchange_group || food.category || "";
  $("pickedLine").innerHTML = `Picked: <b>${esc(food.name || food.label || food.id)}</b>${group ? ` <span class="muted">(${esc(group)})</span>` : ""}`;
}

function renderSearchDropdown(items){
  const drop = $("searchDrop");
  drop.innerHTML = "";
  if (!items.length){
    drop.classList.add("hidden");
    return;
  }
  for (const f of items.slice(0, 10)){
    const name = f.name || f.label || f.id || "Unknown";
    const meta = f.group || f.exchange_group || f.category || "";
    const div = document.createElement("div");
    div.className = "searchItem";
    div.setAttribute("role","option");
    div.innerHTML = `<div class="searchItem__name">${esc(name)}</div><div class="searchItem__meta">${esc(meta)}</div>`;
    div.addEventListener("click", () => {
      state.pickedFood = f;
      $("foodSearch").value = name;
      renderPicked(f);
      drop.classList.add("hidden");
      setError("");
      setHint("");
    });
    drop.appendChild(div);
  }
  drop.classList.remove("hidden");
}

async function handleSearchInput(){
  const q = $("foodSearch").value.trim();
  state.pickedFood = null;
  renderPicked(null);
  setError("");
  if (q.length < 2){
    renderSearchDropdown([]);
    return;
  }

  // Prefer remote if API ok, otherwise local
  let foods = [];
  if (api.ok){
    foods = await searchFoodsRemote(q);
  }
  if (!foods.length){
    if (!api.foodsLocal) await loadLocalFoods();
    if (api.foodsLocal){
      const ql = q.toLowerCase();
      foods = api.foodsLocal.filter(f => {
        const name = (f.name || f.label || f.id || "").toLowerCase();
        if (name.includes(ql)) return true;
        const syn = f.syn || f.synonyms || [];
        return Array.isArray(syn) && syn.some(s => String(s).toLowerCase().includes(ql));
      }).slice(0, 12);
    }
  }

  renderSearchDropdown(foods);
}

function clearResults(){
  $("resultsBox").innerHTML = `<div class="empty">
      <div class="empty__title">No swaps yet</div>
      <div class="empty__sub">Search a food, enter a portion, then click “Get swaps”.</div>
    </div>`;
  state.lastResults = [];
  state.activeSwapId = null;
}

function pctBadge(p){
  const v = Number(p) || 0;
  if (v <= 0.05) return { cls: "badge--good", label: `${round(v*100,1)}%` };
  if (v <= 0.12) return { cls: "badge--mid", label: `${round(v*100,1)}%` };
  return { cls: "badge--bad", label: `${round(v*100,1)}%` };
}

function renderCompare(base, swap){
  const baseM = base._computed;
  const swapM = swap._computed;
  const rows = [
    ["Calories", baseM.calories, swapM.calories, "kcal"],
    ["Protein", baseM.p, swapM.p, "g"],
    ["Carbs", baseM.c, swapM.c, "g"],
    ["Fat", baseM.f, swapM.f, "g"],
    ["Fiber", baseM.fiber, swapM.fiber, "g"],
    ["Sugar", baseM.sugar, swapM.sugar, "g"],
    ["Sodium", baseM.sodium, swapM.sodium, "mg"],
    ["Sat. fat", baseM.satfat, swapM.satfat, "g"],
  ];

  const html = `
    <div class="compare">
      <div class="compareRow compareHead">
        <div class="compareCell">Metric</div>
        <div class="compareCell">Original</div>
        <div class="compareCell">Swap</div>
      </div>
      ${rows.map(r => `
        <div class="compareRow">
          <div class="compareCell muted">${esc(r[0])}</div>
          <div class="compareCell">${round(r[1], r[3]==="mg"?0:1)} ${esc(r[3])}</div>
          <div class="compareCell">${round(r[2], r[3]==="mg"?0:1)} ${esc(r[3])}</div>
        </div>
      `).join("")}
    </div>
  `;
  return html;
}

function renderResults(baseFood, baseGrams, swaps, unitLabel){
  // Normalize swaps coming from remote/local
  // For remote, accept: {id,name,portion_g,portion_unit,delta_calories,...}
  // For local, we already computed _match data.
  const baseMacros = macrosForPortion(baseFood, baseGrams) || {p:0,c:0,f:0,fiber:0,sugar:0,sodium:0,satfat:0,calories:0};
  baseFood._computed = baseMacros;

  const root = document.createElement("div");

  const top = document.createElement("div");
  top.className = "resultTop";
  top.innerHTML = `
    <div class="resultTop__name">${esc(baseFood.name || baseFood.label || baseFood.id)}</div>
    <div class="resultTop__meta">${round(baseGrams,0)} g • ${round(baseMacros.calories,0)} kcal • ${round(baseMacros.p,1)}P / ${round(baseMacros.c,1)}C / ${round(baseMacros.f,1)}F</div>
  `;
  root.appendChild(top);

  const list = document.createElement("div");
  list.className = "swapList";

  swaps.forEach((s, idx) => {
    const name = s.name || s.label || s.id || `Swap ${idx+1}`;

    // Determine grams + macros for display
    let grams = null;
    let macros = null;
    let calDelta = null;

    if (s._match){
      grams = s._match.grams;
      macros = s._match.macros;
      calDelta = s._match.calDelta;
    }else{
      // remote: try direct fields
      grams = Number(s.grams || s.portion_g || s.portionGrams || s.match_grams || 0) || null;
      if (!grams){
        // if only portion + unit, attempt convert
        const pu = s.unit || s.portion_unit || "g";
        const pv = Number(s.portion || s.portion_value || 0) || 0;
        grams = gramsFromPortion(s, pv, pu);
      }
      if (grams) macros = macrosForPortion(s, grams);
      // delta might be provided by backend
      const d = Number(s.calDelta || s.delta_calories_pct || s.deltaPct || 0);
      calDelta = d ? d : (macros && baseMacros.calories ? Math.abs(macros.calories - baseMacros.calories)/baseMacros.calories : null);
    }

    if (!macros && grams){
      macros = macrosForPortion(s, grams);
    }

    s._computed = macros || { p:0,c:0,f:0,fiber:0,sugar:0,sodium:0,satfat:0,calories:0 };

    const badge = calDelta != null ? pctBadge(calDelta) : { cls: "badge--mid", label: "—" };

    const row = document.createElement("div");
    row.className = "swapRow";
    row.dataset.id = s.id || `row_${idx}`;
    row.innerHTML = `
      <div class="swapRow__top">
        <div class="swapRow__name">${esc(name)}</div>
        <div class="swapRow__portion">${grams ? `${round(grams,0)} g` : ""}</div>
      </div>
      <div class="swapRow__meta">
        <span class="badge ${badge.cls}">Δ cals ${esc(badge.label)}</span>
        <span class="badge">kcal ${round(s._computed.calories,0)}</span>
        <span class="badge">P ${round(s._computed.p,1)}g</span>
        <span class="badge">C ${round(s._computed.c,1)}g</span>
        <span class="badge">F ${round(s._computed.f,1)}g</span>
      </div>
    `;

    row.addEventListener("click", () => {
      // active state
      [...list.querySelectorAll(".swapRow")].forEach(n => n.classList.remove("swapRow--active"));
      row.classList.add("swapRow--active");
      state.activeSwapId = row.dataset.id;

      const compare = renderCompare(baseFood, s);
      const compareWrap = root.querySelector("#compareWrap");
      compareWrap.innerHTML = compare;
      compareWrap.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    list.appendChild(row);
  });

  root.appendChild(list);

  const compareWrap = document.createElement("div");
  compareWrap.id = "compareWrap";
  compareWrap.innerHTML = `<div class="help muted">Select a swap to see the full breakdown.</div>`;
  root.appendChild(compareWrap);

  const box = $("resultsBox");
  box.innerHTML = "";
  box.appendChild(root);

  // auto select first swap
  const first = list.querySelector(".swapRow");
  if (first){
    first.click();
  }
}

async function handleGetSwaps(){
  setError("");
  const q = $("foodSearch").value.trim();
  const portion = $("portionVal").value.trim();
  const unit = $("portionUnit").value;

  if (!q){
    setError("Type a food name first.");
    return;
  }
  if (!portion || !Number.isFinite(Number(portion)) || Number(portion) <= 0){
    setError("Enter a valid portion size.");
    return;
  }

  // Ensure user picked from dropdown OR auto-pick best match
  let food = state.pickedFood;

  // Auto-pick: if dropdown is open with options, choose top.
  const drop = $("searchDrop");
  if (!food){
    // Try exact match locally / remote
    const ql = q.toLowerCase();
    let candidates = [];
    if (api.ok){
      candidates = await searchFoodsRemote(q);
    }
    if (!candidates.length){
      if (!api.foodsLocal) await loadLocalFoods();
      if (api.foodsLocal){
        candidates = api.foodsLocal.filter(f => (f.name || f.label || f.id || "").toLowerCase() === ql);
        if (!candidates.length){
          candidates = api.foodsLocal.filter(f => (f.name || f.label || f.id || "").toLowerCase().includes(ql));
        }
      }
    }
    if (candidates.length){
      food = candidates[0];
      state.pickedFood = food;
      renderPicked(food);
    }
  }

  if (!food){
    setError("Pick a food from the search results (we need an exact database match).");
    return;
  }

  const grams = gramsFromPortion(food, portion, unit);
  if (!grams){
    setError(`That unit (“${unit}”) isn't available for this food yet. Try grams, ounces, or serving.`);
    const units = Object.keys(food.units || {}).join(", ");
    setHint(units ? `Available units for this food: ${units}` : "");
    return;
  }

  const sameGroup = $("sameGroup").checked;
  const mode = $("flexMode").checked ? "flex" : "strict";

  // Use internal calorie tolerance; not exposed to user
  const swapsRemote = api.ok ? await getSwapsRemote({
    foodId: food.id || food.food_id || food.key || (food.name || ""),
    portion: Number(portion),
    unit,
    mode,
    sameGroup,
    tolerance: mode === "flex" ? 0.10 : 0.05,
  }) : [];

  let swaps = swapsRemote;

  // If remote yields nothing, fall back to local foods if present
  if (!swaps.length){
    if (!api.foodsLocal) await loadLocalFoods();
    if (api.foodsLocal){
      swaps = bestLocalSwaps(food, grams, { sameGroup, mode });
    }
  }

  if (!swaps.length){
    setError("No swaps found for that portion. Try a different portion, switch to Best‑fit mode, or try grams/oz.");
    clearResults();
    return;
  }

  renderResults(food, grams, swaps);
}

// -----------------------------
// Intake flow
// -----------------------------
const intake = {
  step: 1,
  setStep(n){
    intake.step = n;
    $("intakeStepLabel").textContent = `Step ${n} of 2`;
    $("intakeProgress").style.width = n === 1 ? "50%" : "100%";
    document.querySelectorAll(".intakeStep").forEach(el => {
      const is = Number(el.dataset.step) === n;
      el.classList.toggle("hidden", !is);
    });
  }
};

function readIntake(){
  const heightVal = Number($("heightVal").value);
  const heightUnit = $("heightUnit").value;
  const weightVal = Number($("weightVal").value);
  const weightUnit = $("weightUnit").value;
  const age = Number($("ageVal").value);
  const sex = $("sexVal").value;

  const activity = $("activityVal").value;
  const goal = $("goalVal").value;
  const diet = $("dietVal").value;
  const medical = $("medicalVal").value;
  const allergies = $("allergiesVal").value.trim();

  return {
    height: heightVal || null,
    heightUnit,
    weight: weightVal || null,
    weightUnit,
    age: age || null,
    sex: sex || null,
    activity, goal, diet, medical, allergies,
    updatedAt: new Date().toISOString(),
  };
}

function validateStep1(p){
  // allow skipping everything, but if user enters a number, validate ranges
  if (p.height != null){
    if (p.heightUnit === "cm" && (p.height < 90 || p.height > 260)) return "Height looks off. Try cm between 90–260.";
    if (p.heightUnit === "in" && (p.height < 36 || p.height > 100)) return "Height looks off. Try inches between 36–100.";
  }
  if (p.weight != null){
    if (p.weightUnit === "kg" && (p.weight < 25 || p.weight > 250)) return "Weight looks off. Try kg between 25–250.";
    if (p.weightUnit === "lb" && (p.weight < 55 || p.weight > 550)) return "Weight looks off. Try lb between 55–550.";
  }
  if (p.age != null && (p.age < 5 || p.age > 110)) return "Age looks off.";
  return null;
}

function renderProfileSummary(profile){
  const el = $("profileSummary");
  if (!profile){
    el.innerHTML = `<div class="empty">
      <div class="empty__title">No profile saved</div>
      <div class="empty__sub">Set up your profile once to skip intake next time.</div>
    </div>`;
    return;
  }

  const items = [
    ["Height", profile.height ? `${profile.height} ${profile.heightUnit}` : "—"],
    ["Weight", profile.weight ? `${profile.weight} ${profile.weightUnit}` : "—"],
    ["Age", profile.age ?? "—"],
    ["Sex", profile.sex ?? "—"],
    ["Activity", profile.activity ?? "—"],
    ["Goal", profile.goal ?? "—"],
    ["Diet", profile.diet || "—"],
    ["Medical focus", profile.medical || "—"],
    ["Allergies", profile.allergies || "—"],
  ];

  el.innerHTML = `
    <div class="profileGrid">
      ${items.map(([k,v]) => `
        <div class="profileItem">
          <div class="profileItem__label">${esc(k)}</div>
          <div class="profileItem__val">${esc(v)}</div>
        </div>
      `).join("")}
    </div>
    <div class="help muted" style="margin-top:10px;">Last updated: ${esc(new Date(profile.updatedAt).toLocaleString())}</div>
  `;
}

// -----------------------------
// Navigation / Panels
// -----------------------------
function showPanel(name){
  $("panelSwap").classList.toggle("hidden", name !== "swap");
  $("panelProfile").classList.toggle("hidden", name !== "profile");

  $("tabSwap").classList.toggle("side__tab--active", name === "swap");
  $("tabProfile").classList.toggle("side__tab--active", name === "profile");
}

function bindEvents(){
  $("year").textContent = String(new Date().getFullYear());

  $("getStartedBtn").addEventListener("click", () => {
    intake.setStep(1);
    showView("intake");
  });

  $("launchBtn").addEventListener("click", () => {
    const p = loadProfile();
    if (!p){
      intake.setStep(1);
      showView("intake");
    }else{
      showView("app");
      showPanel("swap");
      renderProfileSummary(p);
    }
  });

  $("homeLink").addEventListener("click", (e) => {
    e.preventDefault();
    showView("splash");
  });

  $("navSwap").addEventListener("click", () => {
    showView("app");
    showPanel("swap");
  });
  $("navProfile").addEventListener("click", () => {
    showView("app");
    showPanel("profile");
    renderProfileSummary(loadProfile());
  });

  $("tabSwap").addEventListener("click", () => showPanel("swap"));
  $("tabProfile").addEventListener("click", () => { showPanel("profile"); renderProfileSummary(loadProfile()); });

  $("logoutBtn").addEventListener("click", () => {
    clearProfile();
    clearResults();
    state.pickedFood = null;
    $("foodSearch").value = "";
    $("portionVal").value = "";
    renderPicked(null);
    showView("splash");
  });

  // Intake
  $("intakeNext1").addEventListener("click", () => {
    const p = readIntake();
    const err = validateStep1(p);
    if (err){
      alert(err);
      return;
    }
    intake.setStep(2);
  });
  $("intakeBack").addEventListener("click", () => intake.setStep(1));
  $("intakeSkip").addEventListener("click", () => {
    showView("app");
    showPanel("swap");
    renderProfileSummary(loadProfile());
  });
  $("intakeSave").addEventListener("click", () => {
    const p = readIntake();
    const err = validateStep1(p);
    if (err){ alert(err); return; }
    saveProfile(p);
    showView("app");
    showPanel("swap");
    renderProfileSummary(p);
  });

  $("editProfileBtn").addEventListener("click", () => {
    const p = loadProfile();
    // Prefill intake fields
    if (p){
      $("heightVal").value = p.height ?? "";
      $("heightUnit").value = p.heightUnit ?? "cm";
      $("weightVal").value = p.weight ?? "";
      $("weightUnit").value = p.weightUnit ?? "kg";
      $("ageVal").value = p.age ?? "";
      $("sexVal").value = p.sex ?? "";
      $("activityVal").value = p.activity ?? "moderate";
      $("goalVal").value = p.goal ?? "maintenance";
      $("dietVal").value = p.diet ?? "";
      $("medicalVal").value = p.medical ?? "";
      $("allergiesVal").value = p.allergies ?? "";
    }
    intake.setStep(1);
    showView("intake");
  });

  // Swap finder
  let debounce = null;
  $("foodSearch").addEventListener("input", () => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(handleSearchInput, 180);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".searchWrap")) $("searchDrop").classList.add("hidden");
  });

  $("getSwapsBtn").addEventListener("click", handleGetSwaps);
  $("resetSwap").addEventListener("click", () => {
    state.pickedFood = null;
    $("foodSearch").value = "";
    $("portionVal").value = "";
    $("portionUnit").value = "serving";
    $("sameGroup").checked = true;
    $("flexMode").checked = false;
    renderPicked(null);
    setError("");
    setHint("");
    clearResults();
  });

  // nicer enter behavior
  $("foodSearch").addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      // pick first dropdown item if available
      const first = $("searchDrop").querySelector(".searchItem");
      if (first) first.click();
    }
  });
  $("portionVal").addEventListener("keydown", (e) => {
    if (e.key === "Enter"){
      e.preventDefault();
      handleGetSwaps();
    }
  });
}

// -----------------------------
// Boot
// -----------------------------
(async function boot(){
  initBg();
  bindEvents();
  clearResults();

  // Load local foods.json if present (nice offline fallback)
  loadLocalFoods();

  // Ping API (if configured)
  await pingApi();

  // Route based on stored profile
  const p = loadProfile();
  if (p){
    showView("app");
    showPanel("swap");
    renderProfileSummary(p);
  }else{
    showView("splash");
  }
})();
