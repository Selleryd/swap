"use strict";

/**
 * PASTE YOUR APPS SCRIPT WEB APP EXEC URL HERE (must end with /exec)
 * Example:
 * const API_BASE = "https://script.google.com/macros/s/XXXXXXXXXXXX/exec";
 */
const API_BASE = "https://script.google.com/macros/s/AKfycbxoVkI3xIJ1ErMrQ07pG1Oj2dPE-G1-85R1zTXIHB61j_X66JqoyezCadtdQB6qfenfmQ/exec";

/* ---------- Ambient background animation ---------- */
const canvas = document.getElementById("bg");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, blobs = [];

function resize() {
  W = canvas.width = window.innerWidth * devicePixelRatio;
  H = canvas.height = window.innerHeight * devicePixelRatio;
  canvas.style.width = window.innerWidth + "px";
  canvas.style.height = window.innerHeight + "px";
}
window.addEventListener("resize", resize);
resize();

function makeBlobs() {
  const n = Math.max(10, Math.floor(Math.min(window.innerWidth, 1400) / 120));
  blobs = Array.from({ length: n }).map(() => ({
    x: Math.random() * W,
    y: Math.random() * H,
    r: (80 + Math.random() * 220) * devicePixelRatio,
    vx: (-0.12 + Math.random() * 0.24) * devicePixelRatio,
    vy: (-0.10 + Math.random() * 0.20) * devicePixelRatio,
    a: 0.08 + Math.random() * 0.10
  }));
}
makeBlobs();

function tick() {
  ctx.clearRect(0, 0, W, H);
  // subtle vignette
  const g = ctx.createRadialGradient(W*0.5, H*0.5, 0, W*0.5, H*0.5, Math.max(W,H)*0.6);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.45)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  for (const b of blobs) {
    b.x += b.vx; b.y += b.vy;
    if (b.x < -b.r) b.x = W + b.r;
    if (b.x > W + b.r) b.x = -b.r;
    if (b.y < -b.r) b.y = H + b.r;
    if (b.y > H + b.r) b.y = -b.r;

    const grad = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
    grad.addColorStop(0, `rgba(65,214,164,${b.a})`);
    grad.addColorStop(0.55, `rgba(120,160,255,${b.a * 0.8})`);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(tick);
}
tick();

/* ---------- UI helpers ---------- */
const $ = (id) => document.getElementById(id);
function toast(msg, ms = 2200) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), ms);
}
function setApi(ok, text) {
  const dotA = $("apiDot"), dotB = $("apiDot2");
  const txtA = $("apiText"), txtB = $("apiText2");
  const cls = ok === true ? "good" : ok === false ? "bad" : "warn";
  [dotA, dotB].forEach(d => {
    if (!d) return;
    d.classList.remove("good","bad","warn");
    d.classList.add(cls);
  });
  if (txtA) txtA.textContent = text;
  if (txtB) txtB.textContent = text;
}

/* ---------- JSONP + Fetch (won’t hang) ---------- */
function withTimeout(promise, ms, label="timeout") {
  let t;
  const timeout = new Promise((_, rej) => t = setTimeout(() => rej(new Error(label)), ms));
  return Promise.race([promise.finally(() => clearTimeout(t)), timeout]);
}

function jsonp(url, timeoutMs = 2500) {
  return new Promise((resolve, reject) => {
    const cbName = "SWAP_JSONP_" + Math.random().toString(16).slice(2);
    const script = document.createElement("script");
    const cleanup = () => {
      delete window[cbName];
      script.remove();
    };
    window[cbName] = (data) => {
      cleanup();
      resolve(data);
    };
    script.onerror = () => {
      cleanup();
      reject(new Error("jsonp_error"));
    };
    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${cbName}`;
    document.body.appendChild(script);
    setTimeout(() => {
      cleanup();
      reject(new Error("jsonp_timeout"));
    }, timeoutMs);
  });
}

async function apiGet(params) {
  const qs = new URLSearchParams(params).toString();
  const url = `${API_BASE}${API_BASE.includes("?") ? "&" : "?"}${qs}`;

  // try fetch first (some deployments allow it)
  try {
    const res = await withTimeout(fetch(url, { method: "GET" }), 2500, "fetch_timeout");
    const j = await res.json();
    return j;
  } catch (_) {
    // fallback JSONP (reliable from GitHub Pages)
    return await jsonp(url, 3000);
  }
}

async function apiPing() {
  if (!API_BASE || API_BASE.includes("https://script.google.com/macros/s/AKfycbxoVkI3xIJ1ErMrQ07pG1Oj2dPE-G1-85R1zTXIHB61j_X66JqoyezCadtdQB6qfenfmQ/exec")) {
    setApi(null, "API: not set");
    return false;
  }
  setApi(null, "API: checking…");
  try {
    const r = await apiGet({ action: "ping", ts: Date.now() });
    if (r && r.ok) {
      setApi(true, "API: connected");
      return true;
    }
    setApi(false, "API: not responding");
    return false;
  } catch (e) {
    setApi(false, "API: unreachable");
    return false;
  }
}

/* ---------- Demo DB (fallback) ---------- */
const DEMO = [
  { id:"usda_demo_chicken_breast", name:"Chicken breast (demo)", group:"meat", subgroup:"poultry",
    calories_per_g:1.65, protein_per_g:0.31, carbs_per_g:0, fat_per_g:0.036, fiber_per_g:0,
    units:{ g:1, oz:28.35, serving:140, piece:140 }, syn:["chicken breast","grilled chicken breast"] },
  { id:"usda_demo_chicken_thigh", name:"Chicken thigh (demo)", group:"meat", subgroup:"poultry",
    calories_per_g:2.15, protein_per_g:0.25, carbs_per_g:0, fat_per_g:0.13, fiber_per_g:0,
    units:{ g:1, oz:28.35, serving:140, piece:140 }, syn:["chicken thigh"] },
  { id:"usda_demo_salmon", name:"Salmon (demo)", group:"seafood", subgroup:"fish",
    calories_per_g:2.08, protein_per_g:0.20, carbs_per_g:0, fat_per_g:0.13, fiber_per_g:0,
    units:{ g:1, oz:28.35, serving:140, piece:140 }, syn:["salmon","atlantic salmon"] },
  { id:"usda_demo_greek_yogurt", name:"Greek yogurt plain (demo)", group:"dairy", subgroup:"yogurt",
    calories_per_g:0.59, protein_per_g:0.10, carbs_per_g:0.036, fat_per_g:0.004, fiber_per_g:0,
    units:{ g:1, oz:28.35, serving:170 }, syn:["greek yogurt","yogurt plain"] },
];

function demoSearch(q, limit=10){
  const s = q.toLowerCase().trim();
  return DEMO.filter(f => (f.name+" "+(f.syn||[]).join(" ")).toLowerCase().includes(s))
    .slice(0, limit)
    .map(f => ({ id:f.id, name:f.name, group:f.group, subgroup:f.subgroup, units:f.units }));
}

/* ---------- App state ---------- */
let apiOk = false;
let selected = null;

function showSplash(){ $("splash").classList.remove("hidden"); $("hud").classList.add("hidden"); }
function showHud(){ $("splash").classList.add("hidden"); $("hud").classList.remove("hidden"); }

function setTab(tab){
  document.querySelectorAll(".navItem").forEach(b => b.classList.toggle("active", b.dataset.tab === tab));
  document.querySelectorAll(".panel").forEach(p => p.classList.toggle("hidden", p.dataset.panel !== tab));
  $("pageTitle").textContent = tab === "swap" ? "Swap Engine" : tab === "targets" ? "Targets" : "Notes";
}

function renderSelected() {
  if (!selected) { $("selected").classList.add("hidden"); return; }
  $("selected").classList.remove("hidden");
  $("selected").innerHTML = `
    <div style="font-weight:900">${selected.name}</div>
    <div class="muted" style="margin-top:4px">${selected.group} • ${selected.subgroup}</div>
  `;
}

function renderTargetBox(target) {
  if (!target) { $("targetBox").classList.add("hidden"); return; }
  $("targetBox").classList.remove("hidden");
  $("targetBox").innerHTML = `
    <div style="font-weight:900;margin-bottom:8px">Target nutrition</div>
    <div class="muted">kcal: <b>${target.kcal}</b> • P: <b>${target.protein_g}g</b> • C: <b>${target.carbs_g}g</b> • F: <b>${target.fat_g}g</b> • Fiber: <b>${target.fiber_g}g</b></div>
  `;
}

function renderResults(swaps, mode) {
  const box = $("results");
  if (!swaps || !swaps.length) {
    box.innerHTML = `<div class="empty">No swaps found. Try Flex mode or widen tolerances.</div>`;
    return;
  }
  box.innerHTML = swaps.map(s => `
    <div class="rCard">
      <div class="rTop">
        <div>
          <div class="rName">${s.name}</div>
          <div class="rSub">${s.group} • ${s.subgroup} • ${s.grams}g (${s.portion.amount} ${s.portion.unit})</div>
        </div>
        <div class="badge ${s.pass ? "pass" : "flex"}">${s.pass ? "Strict pass" : (mode==="flex" ? "Flex" : "—")}</div>
      </div>
      <div class="rGrid">
        <div class="metric"><div class="k">kcal</div><div class="v">${s.kcal}</div></div>
        <div class="metric"><div class="k">Protein</div><div class="v">${s.protein_g}g</div></div>
        <div class="metric"><div class="k">Carbs</div><div class="v">${s.carbs_g}g</div></div>
        <div class="metric"><div class="k">Fat</div><div class="v">${s.fat_g}g</div></div>
      </div>
      <div class="muted" style="margin-top:10px;font-size:12.5px">
        Δ% — kcal ${s.deltas_pct.kcal} • P ${s.deltas_pct.protein} • C ${s.deltas_pct.carbs} • F ${s.deltas_pct.fat}
      </div>
    </div>
  `).join("");
}

/* ---------- Suggest / Search ---------- */
let suggestTimer = null;

async function refreshSuggest() {
  const q = $("q").value.trim();
  const sug = $("suggest");
  if (q.length < 2) { sug.classList.add("hidden"); sug.innerHTML=""; return; }

  let results = [];
  try {
    if (apiOk) {
      const r = await apiGet({ action: "search", q, limit: 8, ts: Date.now() });
      results = (r && r.ok) ? r.results : [];
    } else {
      results = demoSearch(q, 8);
    }
  } catch (_) {
    results = demoSearch(q, 8);
  }

  if (!results.length) { sug.classList.add("hidden"); sug.innerHTML=""; return; }

  sug.innerHTML = results.map(r => `
    <div class="sRow" data-id="${r.id}">
      <div class="sLeft">
        <div class="sName">${r.name}</div>
        <div class="sMeta">${r.group} • ${r.subgroup}</div>
      </div>
      <div class="sMeta">select</div>
    </div>
  `).join("");
  sug.classList.remove("hidden");

  sug.querySelectorAll(".sRow").forEach(row => {
    row.addEventListener("click", async () => {
      const id = row.dataset.id;
      await selectFood(id);
      sug.classList.add("hidden");
    });
  });
}

async function selectFood(id) {
  try {
    if (apiOk) {
      const r = await apiGet({ action: "food", id, ts: Date.now() });
      if (r && r.ok) selected = r.food;
      else selected = null;
    } else {
      selected = DEMO.find(x => x.id === id) || null;
    }
  } catch (_) {
    selected = DEMO.find(x => x.id === id) || null;
  }
  renderSelected();
  toast("Selected: " + (selected ? selected.name : "none"));
}

/* ---------- Swap ---------- */
async function runSwap() {
  const q = $("q").value.trim();
  if (!selected && q.length < 2) { toast("Search and select a food first"); return; }

  const portion = $("portion").value;
  const unit = $("unit").value;
  const calTol = $("calTol").value;
  const macroTol = $("macroTol").value;
  const mode = $("mode").value;

  try {
    if (apiOk) {
      const r = await apiGet({
        action: "swap",
        id: selected ? selected.id : "",
        q: selected ? "" : q,
        portion,
        unit,
        calTol,
        macroTol,
        mode,
        limit: 12,
        ts: Date.now()
      });

      if (!r || !r.ok) {
        renderResults([], mode);
        toast("No swaps (API)");
        return;
      }
      selected = r.source ? (selected || { id:r.source.id, name:r.source.name, group:r.source.group, subgroup:r.source.subgroup }) : selected;
      renderSelected();
      renderTargetBox(r.target);
      renderResults(r.swaps, mode);
      return;
    }

    // demo behavior (simple)
    const hits = demoSearch(q, 1);
    const src = selected || (hits.length ? DEMO.find(x => x.id === hits[0].id) : null);
    if (!src) { toast("No demo match"); return; }

    const grams = unit === "g" ? Number(portion) : unit === "oz" ? Number(portion) * 28.35 : (src.units[unit] ? Number(portion) * src.units[unit] : Number(portion) * (src.units.serving || 100));
    const target = {
      kcal: +(src.calories_per_g * grams).toFixed(2),
      protein_g: +(src.protein_per_g * grams).toFixed(2),
      carbs_g: +(src.carbs_per_g * grams).toFixed(2),
      fat_g: +(src.fat_per_g * grams).toFixed(2),
      fiber_g: +((src.fiber_per_g || 0) * grams).toFixed(2),
    };
    renderTargetBox(target);
    renderResults([], mode);
    toast("Demo mode: connect API for real swaps");
  } catch (e) {
    renderResults([], mode);
    toast("Swap failed. Check API URL + deployment.");
  }
}

/* ---------- Wiring ---------- */
$("enterBtn").addEventListener("click", () => { showHud(); setTab("swap"); });
$("demoBtn").addEventListener("click", () => { showHud(); setTab("swap"); toast("Demo mode active"); });

$("backToSplash").addEventListener("click", () => showSplash());

document.querySelectorAll(".navItem").forEach(btn => {
  btn.addEventListener("click", () => setTab(btn.dataset.tab));
});

$("findBtn").addEventListener("click", runSwap);

$("q").addEventListener("input", () => {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(refreshSuggest, 180);
});

$("apiRetry").addEventListener("click", async () => {
  apiOk = await apiPing();
  toast(apiOk ? "API connected" : "API not reachable");
});
$("apiRetry2").addEventListener("click", async () => {
  apiOk = await apiPing();
  toast(apiOk ? "API connected" : "API not reachable");
});

/* Boot */
(async function init(){
  showSplash();
  apiOk = await apiPing();
})();
