"use strict";

/**
 * IMPORTANT:
 * Paste your Apps Script WEB APP /exec URL here.
 * Example:
 * const API_BASE = "https://script.google.com/macros/s/XXXXXXXXXXXX/exec";
 */
const API_BASE = "https://script.google.com/macros/s/AKfycbxoVkI3xIJ1ErMrQ07pG1Oj2dPE-G1-85R1zTXIHB61j_X66JqoyezCadtdQB6qfenfmQ/exec";

// --- small demo DB (used if API is down or demo mode enabled) ---
const DEMO_FOODS = [
  { id:"usda_demo_chicken_breast", name:"Chicken breast, cooked", group:"meat", subgroup:"poultry", calories_per_g:1.65/1, protein_per_g:0.31, carbs_per_g:0, fat_per_g:0.036, units:{g:1,oz:28.3495,serving:100,piece:140} },
  { id:"usda_demo_salmon", name:"Salmon, cooked", group:"meat", subgroup:"seafood", calories_per_g:2.06, protein_per_g:0.22, carbs_per_g:0, fat_per_g:0.13, units:{g:1,oz:28.3495,serving:100,piece:140} },
  { id:"usda_demo_greek_yogurt", name:"Greek yogurt, plain", group:"dairy", subgroup:"yogurt", calories_per_g:0.97, protein_per_g:0.10, carbs_per_g:0.036, fat_per_g:0.045, units:{g:1,oz:28.3495,serving:170} },
  { id:"usda_demo_rice", name:"White rice, cooked", group:"grain", subgroup:"rice", calories_per_g:1.30, protein_per_g:0.027, carbs_per_g:0.28, fat_per_g:0.003, units:{g:1,oz:28.3495,serving:158} }
];

const $ = (id) => document.getElementById(id);

const state = {
  apiOk: false,
  demo: false,
  selected: null, // {id,name,...}
};

// ---------- Toast ----------
function toast(msg, ms = 2200) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.remove("hidden");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add("hidden"), ms);
}

// ---------- JSONP (no CORS issues) ----------
function jsonp(url, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(timer);
      script.remove();
      try { delete window[cb]; } catch(_) {}
    }

    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };

    const sep = url.includes("?") ? "&" : "?";
    script.src = `${url}${sep}callback=${cb}`;
    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP load error"));
    };
    document.head.appendChild(script);
  });
}

// ---------- API wrappers ----------
async function apiPing() {
  if (!API_BASE || API_BASE.includes("PASTE_YOUR_EXEC_URL_HERE")) throw new Error("API_BASE not set");
  return jsonp(`${API_BASE}?action=ping`, 4500);
}

async function apiSearch(q) {
  return jsonp(`${API_BASE}?action=search&q=${encodeURIComponent(q)}&limit=25`, 6500);
}

async function apiSwap(payload) {
  const qs = new URLSearchParams(payload).toString();
  return jsonp(`${API_BASE}?action=swap&${qs}`, 9000);
}

// ---------- UI: API status ----------
function setApiStatus(ok, text) {
  const dot1 = $("apiDot"), dot2 = $("apiDot2");
  const t1 = $("apiText"), t2 = $("apiText2");

  const color = ok ? "var(--good)" : "var(--warn)";
  if (dot1) dot1.style.background = color;
  if (dot2) dot2.style.background = color;

  if (t1) t1.textContent = text;
  if (t2) t2.textContent = text;

  state.apiOk = !!ok;
}

async function checkApi() {
  setApiStatus(false, "API: checking…");
  try {
    const r = await apiPing();
    if (r && r.ok) setApiStatus(true, `API: connected (${r.indexedItems ?? "ok"})`);
    else setApiStatus(false, "API: not responding");
  } catch (e) {
    setApiStatus(false, "API: offline (demo available)");
  }
}

// ---------- Background animation ----------
function startBg() {
  const c = $("bg");
  const ctx = c.getContext("2d");
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  let w, h;

  const pts = Array.from({length: 70}, () => ({
    x: Math.random(), y: Math.random(),
    vx: (Math.random() - .5) * 0.00035,
    vy: (Math.random() - .5) * 0.00035,
    r: 1 + Math.random()*2.2
  }));

  function resize() {
    w = window.innerWidth; h = window.innerHeight;
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    c.style.width = w + "px";
    c.style.height = h + "px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
  }

  function tick() {
    ctx.clearRect(0,0,w,h);

    // soft gradient wash
    const g = ctx.createRadialGradient(w*0.35,h*0.25, 10, w*0.35,h*0.25, Math.max(w,h)*0.9);
    g.addColorStop(0, "rgba(140,231,207,.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // points + links
    for (const p of pts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0 || p.x > 1) p.vx *= -1;
      if (p.y < 0 || p.y > 1) p.vy *= -1;
    }

    for (let i=0;i<pts.length;i++){
      const a = pts[i];
      const ax = a.x*w, ay = a.y*h;
      for (let j=i+1;j<pts.length;j++){
        const b = pts[j];
        const bx = b.x*w, by = b.y*h;
        const dx = ax-bx, dy = ay-by;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 140){
          ctx.globalAlpha = (1 - dist/140) * 0.22;
          ctx.strokeStyle = "rgba(255,255,255,1)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(ax,ay);
          ctx.lineTo(bx,by);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = "rgba(255,255,255,.9)";
      ctx.beginPath();
      ctx.arc(ax, ay, a.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    requestAnimationFrame(tick);
  }

  window.addEventListener("resize", resize);
  resize();
  tick();
}

// ---------- Tabs ----------
function showTab(name) {
  document.querySelectorAll(".navItem").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  $("tab-targets").classList.toggle("hidden", name !== "targets");
  $("tab-swap").classList.toggle("hidden", name !== "swap");
  $("tab-notes").classList.toggle("hidden", name !== "notes");
}

// ---------- Targets logic ----------
function computeTargets() {
  const h = Number($("height").value || 0);
  const w = Number($("weight").value || 0);
  const age = Number($("age").value || 0);
  const sex = $("sex").value;
  const act = Number($("activity").value || 1.2);
  const goal = $("goal").value;

  if (!(h>0 && w>0 && age>0)) return toast("Enter height/weight/age");

  // Mifflin-St Jeor
  const s = (sex === "Male") ? 5 : -161;
  const bmr = 10*w + 6.25*h - 5*age + s;
  const tdee = bmr * act;

  let targetKcal = tdee;
  if (goal === "cut") targetKcal = tdee * 0.85;
  if (goal === "bulk") targetKcal = tdee * 1.10;

  // Simple macro targets (can refine later):
  // protein ~ 1.8g/kg, fat ~ 0.8g/kg, carbs remainder
  const protein = 1.8 * w;
  const fat = 0.8 * w;
  const kcalFromP = protein * 4;
  const kcalFromF = fat * 9;
  const carbs = Math.max(0, (targetKcal - kcalFromP - kcalFromF) / 4);

  $("bmrOut").textContent = Math.round(bmr);
  $("tdeeOut").textContent = Math.round(tdee);
  $("kcalOut").textContent = Math.round(targetKcal);
  $("pOut").textContent = Math.round(protein);
  $("cOut").textContent = Math.round(carbs);
  $("fOut").textContent = Math.round(fat);

  $("targetsBadge").textContent = "Computed";
  toast("Targets computed");
}

// ---------- Swap UI ----------
let searchTimer = null;

function renderResults(list) {
  const box = $("results");
  if (!list || !list.length) {
    box.classList.add("hidden");
    box.innerHTML = "";
    return;
  }
  box.classList.remove("hidden");
  box.innerHTML = list.map(r => `
    <div class="result" data-id="${r.id}">
      <div class="r1">
        <div class="name">${escapeHtml(r.name || r.id)}</div>
        <div class="muted">${escapeHtml(r.group || "")}</div>
      </div>
      <div class="meta">
        ${escapeHtml(r.subgroup || "")}
        • ${r.per100g ? `${r.per100g.kcal} kcal/100g` : ""}
      </div>
    </div>
  `).join("");

  box.querySelectorAll(".result").forEach(el => {
    el.addEventListener("click", async () => {
      const id = el.getAttribute("data-id");
      state.selected = list.find(x => x.id === id) || { id, name: id };
      $("selectedFood").innerHTML = `<b>Selected:</b> ${escapeHtml(state.selected.name)} <span style="color:var(--muted)">(${escapeHtml(state.selected.id)})</span>`;
      $("swapBtn").disabled = false;
      box.classList.add("hidden");
    });
  });
}

async function doSearch(q) {
  if (!q || q.length < 2) return renderResults([]);
  if (state.demo || !state.apiOk) {
    const hits = DEMO_FOODS
      .filter(f => (f.name + " " + f.id + " " + f.group + " " + f.subgroup).toLowerCase().includes(q.toLowerCase()))
      .slice(0, 25)
      .map(f => ({ id:f.id, name:f.name, group:f.group, subgroup:f.subgroup, per100g:{kcal: (f.calories_per_g*100).toFixed(1)} }));
    return renderResults(hits);
  }
  const r = await apiSearch(q);
  renderResults(r.results || []);
}

function renderSwapList(swaps, mode) {
  const list = $("swapList");
  if (!swaps || !swaps.length) {
    list.innerHTML = `<div class="mini">No swaps found. Try flex mode or loosen tolerances.</div>`;
    return;
  }
  list.innerHTML = swaps.map(s => `
    <div class="swapItem">
      <div class="swapTop">
        <div>
          <div class="swapName">${escapeHtml(s.name)}</div>
          <div class="swapPortion">${escapeHtml(s.portion)} • ${escapeHtml(s.group || "")}</div>
        </div>
        <div class="badge">${mode === "strict" ? "Strict" : (s.strictPass ? "Flex (passes strict)" : "Flex (best-fit)")}</div>
      </div>

      <div class="swapGrid">
        ${cell("kcal", s.totals.kcal, `Δ ${s.diffPct.kcal}%`)}
        ${cell("P", s.totals.p, `Δ ${s.diffPct.p}%`)}
        ${cell("C", s.totals.c, `Δ ${s.diffPct.c}%`)}
        ${cell("F", s.totals.f, `Δ ${s.diffPct.f}%`)}
      </div>
    </div>
  `).join("");
}

function cell(k, v, d) {
  return `
    <div class="cell">
      <div class="ck">${k}</div>
      <div class="cv">${escapeHtml(String(v))}</div>
      <div class="cd">${escapeHtml(d)}</div>
    </div>
  `;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[m]));
}

async function findSwaps() {
  if (!state.selected) return toast("Pick a food first");
  const portion = $("portion").value || "1";
  const unit = $("unit").value || "g";
  const diet = $("diet").value || "";
  const medical = $("medical").value || "";
  const allergies = $("allergies").value || "";
  const mode = $("mode").value || "strict";
  const calTol = $("calTol").value || "5";
  const macroTol = $("macroTol").value || "10";

  $("swapBadge").textContent = "Working…";
  $("swapMeta").textContent = "";
  $("swapList").innerHTML = "";

  try {
    if (state.demo || !state.apiOk) {
      toast("Demo mode: swaps require API");
      $("swapBadge").textContent = "Demo";
      $("swapList").innerHTML = `<div class="mini">Connect API to compute real swaps from your Foods sheet.</div>`;
      return;
    }

    const r = await apiSwap({
      id: state.selected.id,
      portion,
      unit,
      diet,
      medical,
      allergies,
      mode,
      calTol,
      macroTol,
      limit: 12
    });

    if (!r || !r.ok) throw new Error((r && r.error) ? r.error : "Swap failed");

    $("swapBadge").textContent = `${r.meta.returned} swaps`;
    $("swapMeta").textContent = `Base: ${r.base.name} • ${r.base.portion.grams} g • ${r.base.totals.kcal} kcal • pool: ${r.meta.candidatePool}`;
    renderSwapList(r.swaps, r.mode);

  } catch (e) {
    $("swapBadge").textContent = "Error";
    $("swapList").innerHTML = `<div class="mini">${escapeHtml(String(e.message || e))}</div>`;
  }
}

// ---------- Splash / HUD ----------
function enterApp() {
  $("splash").classList.add("hidden");
  $("app").classList.remove("hidden");
  showTab("targets");
}

// ---------- Wire up ----------
function main() {
  startBg();

  // Nav
  document.querySelectorAll(".navItem").forEach(btn => {
    btn.addEventListener("click", () => showTab(btn.dataset.tab));
  });

  // Splash buttons
  $("enterBtn").addEventListener("click", enterApp);
  $("demoBtn").addEventListener("click", () => {
    state.demo = true;
    toast("Demo mode enabled");
    enterApp();
    setApiStatus(false, "API: demo mode");
  });

  // Back
  $("backToSplash").addEventListener("click", () => {
    $("app").classList.add("hidden");
    $("splash").classList.remove("hidden");
  });

  // API retry
  $("apiRetry").addEventListener("click", checkApi);
  $("apiRetry2").addEventListener("click", checkApi);

  // Targets
  $("computeBtn").addEventListener("click", computeTargets);
  $("demoToggle").addEventListener("click", () => {
    state.demo = !state.demo;
    toast(state.demo ? "Demo mode enabled" : "Demo mode disabled");
    if (state.demo) setApiStatus(false, "API: demo mode");
    else checkApi();
  });

  // Swap search
  $("q").addEventListener("input", (ev) => {
    const q = ev.target.value;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => doSearch(q), 220);
  });

  $("clearFood").addEventListener("click", () => {
    state.selected = null;
    $("q").value = "";
    $("results").classList.add("hidden");
    $("swapBtn").disabled = true;
    $("selectedFood").textContent = "No food selected";
  });

  $("swapBtn").addEventListener("click", findSwaps);

  // Initial API check (won’t hang)
  checkApi();
}

main();
