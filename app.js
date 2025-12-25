"use strict";

/**
 * SWAP Frontend (static, GitHub Pages)
 * - App-store splash → SaaS HUD
 * - API health check with timeout (won't hang)
 * - Works even with API down using a demo DB + local swap engine
 */

/** 🔧 PASTE YOUR APPS SCRIPT WEB APP EXEC URL HERE (must end with /exec) */
const API_BASE = "https://script.google.com/macros/s/AKfycbxoVkI3xIJ1ErMrQ07pG1Oj2dPE-G1-85R1zTXIHB61j_X66JqoyezCadtdQB6qfenfmQ/exec";

/** ---- Helpers ---- */
const $ = (id) => document.getElementById(id);

function toast(msg, ms = 2200) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  setTimeout(() => t.classList.add("hidden"), ms);
}

function setApiStatus(ok, text) {
  const dot1 = $("apiDot"), dot2 = $("apiDot2");
  const s1 = $("apiStatus"), s2 = $("apiStatus2");
  const cls = ok === true ? "good" : ok === false ? "bad" : "warn";

  if (dot1) { dot1.className = `dot ${cls}`; }
  if (dot2) { dot2.className = `dot ${cls}`; }
  if (s1) { s1.textContent = text; }
  if (s2) { s2.textContent = text; }
}

function qs(params) {
  return new URLSearchParams(params).toString();
}

async function fetchJson(url, { timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const ct = res.headers.get("content-type") || "";
    const data = ct.includes("application/json") ? await res.json() : await res.text();
    return { ok: res.ok, status: res.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: String(e) } };
  } finally {
    clearTimeout(t);
  }
}

function apiUrl(params) {
  if (!API_BASE || !API_BASE.startsWith("http")) return null;
  return `${API_BASE}?${qs(params)}`;
}

/** ---- Demo DB (fallback if API unreachable) ----
 * values are per gram (kcal_per_g, p/c/f per g)
 * units_map are approximate; your backend DB can override/expand these.
 */
const DEMO_FOODS = [
  { id:"usda_chicken_breast", name:"Chicken breast (cooked)", kcal:1.65, p:0.31, c:0.00, f:0.036, units:{ g:1, oz:28.35, piece:140, serving:100 } },
  { id:"usda_chicken_thigh", name:"Chicken thigh (cooked)",  kcal:2.10, p:0.26, c:0.00, f:0.11,  units:{ g:1, oz:28.35, piece:120, serving:100 } },
  { id:"usda_salmon",        name:"Salmon (cooked)",         kcal:2.06, p:0.22, c:0.00, f:0.13,  units:{ g:1, oz:28.35, piece:140, serving:100 } },
  { id:"usda_egg",           name:"Whole egg",              kcal:1.43, p:0.126,c:0.01,f:0.10,  units:{ g:1, oz:28.35, piece:50,  serving:100 } },
  { id:"usda_rice",          name:"White rice (cooked)",    kcal:1.30, p:0.027,c:0.28,f:0.003, units:{ g:1, oz:28.35, cup:158,  serving:100 } },
  { id:"usda_oats",          name:"Oats (dry)",             kcal:3.89, p:0.169,c:0.663,f:0.069, units:{ g:1, oz:28.35, cup:81,  serving:40 } },
  { id:"usda_apple",         name:"Apple",                  kcal:0.52, p:0.003,c:0.14,f:0.002, units:{ g:1, oz:28.35, piece:182, serving:100 } },
  { id:"usda_avocado",       name:"Avocado",               kcal:1.60, p:0.02, c:0.085,f:0.147, units:{ g:1, oz:28.35, piece:200, serving:100 } },
  { id:"usda_greek_yogurt",  name:"Greek yogurt (plain)",  kcal:0.59, p:0.10, c:0.036,f:0.004, units:{ g:1, oz:28.35, cup:245, serving:170 } },
  { id:"usda_peanut_butter", name:"Peanut butter",         kcal:5.88, p:0.25, c:0.20, f:0.50,  units:{ g:1, oz:28.35, tbsp:16, serving:32 } },
];

/** Convert user portion+unit to grams using food.units */
function portionToGrams(food, portion, unit) {
  const u = (food.units && food.units[unit]) ? food.units[unit] : null;
  if (!u) return null;
  return Number(portion) * Number(u);
}

function calcTotals(food, grams) {
  return {
    kcal: food.kcal * grams,
    p: food.p * grams,
    c: food.c * grams,
    f: food.f * grams
  };
}

function pctDiff(a, b) {
  if (b === 0) return a === 0 ? 0 : 999;
  return Math.abs(a - b) / Math.abs(b) * 100;
}

function distanceScore(candidateTotals, targetTotals) {
  // weighted macro+cal distance (lower is better)
  const dk = pctDiff(candidateTotals.kcal, targetTotals.kcal);
  const dp = pctDiff(candidateTotals.p, targetTotals.p);
  const dc = pctDiff(candidateTotals.c, targetTotals.c);
  const df = pctDiff(candidateTotals.f, targetTotals.f);
  return dk*1.6 + dp*1.2 + dc*1.0 + df*1.1;
}

/** Local swap engine: strict filter then rank */
function localFindSwaps({ query, portion, unit, calTol, macroTol, mode, limit=10 }) {
  const q = String(query||"").toLowerCase().trim();
  if (!q) return { selected:null, swaps:[] };

  const selected = DEMO_FOODS.find(x => x.name.toLowerCase().includes(q)) || DEMO_FOODS[0];
  const grams = portionToGrams(selected, portion, unit) ?? (Number(portion) * (unit==="g"?1:28.35));
  const target = calcTotals(selected, grams);

  const calTolN = Number(calTol);
  const macroTolN = Number(macroTol);

  const swaps = DEMO_FOODS
    .filter(x => x.id !== selected.id)
    .map(x => {
      // find candidate grams that match target kcal best (since kcal is primary constraint)
      // grams = target_kcal / kcal_per_g
      const gramsCand = target.kcal / x.kcal;
      const totals = calcTotals(x, gramsCand);

      const dk = pctDiff(totals.kcal, target.kcal);
      const dp = pctDiff(totals.p, target.p);
      const dc = pctDiff(totals.c, target.c);
      const df = pctDiff(totals.f, target.f);

      const strictOk = (dk <= calTolN) && (dp <= macroTolN) && (dc <= macroTolN) && (df <= macroTolN);
      const dist = distanceScore(totals, target);

      return {
        id: x.id, name: x.name,
        grams: gramsCand,
        totals,
        diffs: { dk, dp, dc, df },
        strictOk,
        dist
      };
    })
    .filter(r => mode === "flex" ? true : r.strictOk)
    .sort((a,b) => a.dist - b.dist)
    .slice(0, limit);

  return { selected: { ...selected, grams, totals: target }, swaps };
}

/** ---- Targets (Mifflin-St Jeor) ---- */
function computeTargets() {
  const h = Number($("height").value || 0);
  const w = Number($("weight").value || 0);
  const a = Number($("age").value || 0);
  const sex = ($("sex").value || "Male").toLowerCase();
  const activity = $("activity").value || "Moderate";
  const goal = $("goal").value || "Maintain";

  if (!h || !w || !a) return null;

  // Mifflin-St Jeor
  const s = sex.includes("female") ? -161 : 5;
  const bmr = (10*w) + (6.25*h) - (5*a) + s;

  // activity factor
  const af = activity === "Low" ? 1.35 : activity === "High" ? 1.725 : 1.55;
  const tdee = bmr * af;

  // goal adjust
  const kcal = goal === "Lose" ? (tdee * 0.85) : goal === "Gain" ? (tdee * 1.12) : tdee;

  // simple macro targets (can be replaced with your master logic)
  const protein = w * 1.8; // g/day baseline
  const fat = (kcal * 0.20) / 9; // 20% fat
  const carbs = (kcal - (protein*4) - (fat*9)) / 4;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    kcal: Math.round(kcal),
    p: Math.round(protein),
    c: Math.round(carbs),
    f: Math.round(fat),
  };
}

function renderTargets(out) {
  $("outBmr").textContent = out ? out.bmr : "—";
  $("outTdee").textContent = out ? out.tdee : "—";
  $("outKcal").textContent = out ? out.kcal : "—";
  $("outP").textContent = out ? out.p : "—";
  $("outC").textContent = out ? out.c : "—";
  $("outF").textContent = out ? out.f : "—";

  const st = $("targetStatus");
  if (out) {
    st.textContent = "Computed";
    st.classList.remove("muted");
  } else {
    st.textContent = "Not computed";
    st.classList.add("muted);
  }
}

/** ---- Tabs ---- */
function setTab(tab) {
  document.querySelectorAll(".navItem").forEach(b => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  document.querySelectorAll(".tab").forEach(p => p.classList.remove("active"));
  $(`tab-${tab}`).classList.add("active");

  const title = $("pageTitle");
  const sub = $("pageSub");
  if (tab === "targets") {
    title.textContent = "Targets";
    sub.textContent = "Compute BMR/TDEE + macro targets, then swap foods at any portion.";
  } else if (tab === "swap") {
    title.textContent = "Swap Engine";
    sub.textContent = "Search foods, enter portion size, enforce strict equivalence.";
  } else {
    title.textContent = "Notes";
    sub.textContent = "How SWAP enforces precision and handles missing optional fields.";
  }
}

/** ---- API Check ---- */
async function checkApi() {
  // if empty -> demo
  if (!API_BASE || !API_BASE.startsWith("http")) {
    setApiStatus(null, "API: demo mode (no API URL)");
    return false;
  }

  const url = apiUrl({ action: "ping" });
  if (!url) {
    setApiStatus(false, "API: invalid URL");
    return false;
  }

  setApiStatus(null, "API: checking…");
  const r = await fetchJson(url, { timeoutMs: 4500 });

  if (r.ok) {
    setApiStatus(true, "API: connected");
    return true;
  }

  // Common failure modes: permissions / deploy access / CORS
  setApiStatus(false, "API: not reachable (demo fallback)");
  return false;
}

/** ---- Render swaps ---- */
function fmt(n, d=0) {
  if (!isFinite(n)) return "—";
  return Number(n).toFixed(d);
}

function renderResults(selected, swaps, metaText) {
  const results = $("results");
  const badge = $("resultsBadge");
  const meta = $("swapMeta");

  meta.textContent = metaText || "";

  if (!selected) {
    results.innerHTML = `<div class="result"><div class="resultName">No food selected</div><div class="resultMeta">Type a search and try again.</div></div>`;
    badge.textContent = "No results";
    badge.classList.add("muted");
    return;
  }

  if (!swaps || !swaps.length) {
    results.innerHTML = `<div class="result">
      <div class="resultName">No valid swaps found</div>
      <div class="resultMeta">Try increasing tolerance or switching to Flex mode.</div>
    </div>`;
    badge.textContent = "No results";
    badge.classList.add("muted");
    return;
  }

  badge.textContent = `${swaps.length} results`;
  badge.classList.remove("muted");

  const sel = selected;
  const selLine = `Target: ${fmt(sel.totals.kcal,0)} kcal • P ${fmt(sel.totals.p,0)}g • C ${fmt(sel.totals.c,0)}g • F ${fmt(sel.totals.f,0)}g`;

  results.innerHTML = `
    <div class="result">
      <div class="resultTop">
        <div>
          <div class="resultName">${sel.name}</div>
          <div class="resultMeta">${selLine}</div>
        </div>
        <div class="pill">Target</div>
      </div>
    </div>
  ` + swaps.map(r => {
    const g = r.grams;
    const t = r.totals;
    const label = r.strictOk ? "Strict-valid" : "Flex";
    const labelClass = r.strictOk ? "pill" : "pill";
    return `
      <div class="result">
        <div class="resultTop">
          <div>
            <div class="resultName">${r.name}</div>
            <div class="resultMeta">
              Portion: ${fmt(g,0)} g • ${fmt(t.kcal,0)} kcal • P ${fmt(t.p,0)}g • C ${fmt(t.c,0)}g • F ${fmt(t.f,0)}g
            </div>
            <div class="pills">
              <span class="pill">Δkcal ${fmt(r.diffs.dk,1)}%</span>
              <span class="pill">ΔP ${fmt(r.diffs.dp,1)}%</span>
              <span class="pill">ΔC ${fmt(r.diffs.dc,1)}%</span>
              <span class="pill">ΔF ${fmt(r.diffs.df,1)}%</span>
              <span class="${labelClass}">${label}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

/** ---- UI wiring ---- */
function showApp() {
  $("splash").classList.add("hidden");
  $("app").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showSplash() {
  $("app").classList.add("hidden");
  $("splash").classList.remove("hidden");
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/** ---- Particles ---- */
function startParticles() {
  const c = $("particles");
  if (!c) return;
  const ctx = c.getContext("2d");
  let w = 0, h = 0;

  const particles = Array.from({ length: 42 }, () => ({
    x: Math.random(),
    y: Math.random(),
    r: 0.6 + Math.random()*1.8,
    vx: (Math.random()-0.5)*0.0006,
    vy: (Math.random()-0.5)*0.0006,
    a: 0.18 + Math.random()*0.28
  }));

  function resize() {
    w = c.width = Math.floor(window.innerWidth * devicePixelRatio);
    h = c.height = Math.floor(window.innerHeight * devicePixelRatio);
  }
  window.addEventListener("resize", resize, { passive:true });
  resize();

  function tick() {
    ctx.clearRect(0,0,w,h);

    // soft connections
    for (let i=0;i<particles.length;i++){
      const p = particles[i];
      const x = p.x*w, y = p.y*h;
      for (let j=i+1;j<particles.length;j++){
        const q = particles[j];
        const dx = (p.x-q.x)*w, dy=(p.y-q.y)*h;
        const d = Math.sqrt(dx*dx+dy*dy);
        if (d < 160*devicePixelRatio){
          const alpha = (1 - d/(160*devicePixelRatio)) * 0.10;
          ctx.strokeStyle = `rgba(143,227,194,${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x,y);
          ctx.lineTo(q.x*w, q.y*h);
          ctx.stroke();
        }
      }
    }

    // points
    for (const p of particles){
      p.x += p.vx; p.y += p.vy;
      if (p.x < -0.05) p.x = 1.05;
      if (p.x > 1.05) p.x = -0.05;
      if (p.y < -0.05) p.y = 1.05;
      if (p.y > 1.05) p.y = -0.05;

      const x = p.x*w, y = p.y*h;
      ctx.fillStyle = `rgba(139,208,255,${p.a})`;
      ctx.beginPath();
      ctx.arc(x,y, p.r*devicePixelRatio, 0, Math.PI*2);
      ctx.fill();
    }

    requestAnimationFrame(tick);
  }
  tick();
}

/** ---- Init ---- */
async function init() {
  startParticles();

  // Tabs
  document.querySelectorAll(".navItem").forEach(btn => {
    btn.addEventListener("click", () => setTab(btn.dataset.tab));
  });

  // Splash controls
  $("enterBtn").addEventListener("click", () => {
    showApp();
    toast("Welcome to SWAP.");
  });
  $("demoBtn").addEventListener("click", () => {
    showApp();
    toast("Demo mode enabled (local DB).");
  });

  // Demo buttons inside HUD
  $("demoBtn2").addEventListener("click", () => {
    toast("Demo mode: local DB active.");
  });

  // Targets
  const compute = () => {
    const out = computeTargets();
    if (!out) return toast("Enter height/weight/age first.");
    $("targetStatus").textContent = "Computed";
    $("targetStatus").classList.remove("muted");
    $("outBmr").textContent = out.bmr;
    $("outTdee").textContent = out.tdee;
    $("outKcal").textContent = out.kcal;
    $("outP").textContent = out.p;
    $("outC").textContent = out.c;
    $("outF").textContent = out.f;
    toast("Targets computed.");
  };
  $("computeTargets").addEventListener("click", compute);
  $("computeTargets2").addEventListener("click", compute);
  $("clearTargets").addEventListener("click", () => {
    $("height").value = "";
    $("weight").value = "";
    $("age").value = "";
    $("targetStatus").textContent = "Not computed";
    $("targetStatus").classList.add("muted");
    $("outBmr").textContent = "—";
    $("outTdee").textContent = "—";
    $("outKcal").textContent = "—";
    $("outP").textContent = "—";
    $("outC").textContent = "—";
    $("outF").textContent = "—";
    toast("Cleared.");
  });

  // Swap
  $("swapBtn").addEventListener("click", async () => {
    const query = $("foodQuery").value;
    const portion = $("portion").value || 1;
    const unit = $("unit").value;
    const calTol = $("calTol").value;
    const macroTol = $("macroTol").value;
    const mode = $("mode").value;

    if (!String(query || "").trim()) {
      renderResults(null, [], "Enter a food search term.");
      return;
    }

    // For MVP: local engine always works.
    const out = localFindSwaps({ query, portion, unit, calTol, macroTol, mode, limit: 12 });
    const meta = mode === "strict"
      ? `Strict mode: only swaps within tolerance are shown.`
      : `Flex mode: ranked best-fit results (may exceed tolerance).`;

    renderResults(out.selected, out.swaps, meta);
  });

  $("swapClear").addEventListener("click", () => {
    $("foodQuery").value = "";
    $("portion").value = 2;
    $("unit").value = "piece";
    $("diet").value = "";
    $("medical").value = "";
    $("allergies").value = "";
    $("calTol").value = "5";
    $("macroTol").value = "10";
    $("mode").value = "strict";
    renderResults(null, [], "Cleared.");
    toast("Swap cleared.");
  });

  // API check buttons
  const doCheck = async () => {
    const ok = await checkApi();
    if (ok) toast("API connected.");
    else toast("API not reachable — using demo fallback.");
  };

  $("apiRetry").addEventListener("click", doCheck);
  $("apiRetrySplash").addEventListener("click", doCheck);

  // Initial check (won't hang)
  await doCheck();

  // Seed initial results
  renderResults(null, [], "Type a food search term to begin (e.g., “chicken breast”).");
}

document.addEventListener("DOMContentLoaded", init);
