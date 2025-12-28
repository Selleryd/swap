// app.js
"use strict";

/**
 * SWAP Front-end (GitHub Pages)
 * Uses JSONP to talk to Apps Script Web App to avoid CORS.
 *
 * Expected backend routes + JSONP callback support:
 * - route=health
 * - route=foods&q=...&limit=...
 * - route=food&id=...
 * - route=swap&food_id=...&portion=...&unit=...&cal_tol=...&macro_tol=...&same_group=...&flex=...&diet=...&allergies=...&medical=...&limit=...
 * - route=targets&height_cm=...&weight_kg=...&age=...&sex=...&activity=...&goal=...
 *
 * (Matches the SWAP master prompt backend spec.)
 */

// 1) PASTE YOUR APPS SCRIPT /exec URL HERE:
const API_BASE = "https://script.google.com/macros/s/PASTE_YOURS_HERE/exec";

// Demo mode (no API): lets you see the UI
const DEMO_MODE = false;

// Storage keys
const K_PROFILE = "swap_profile_v1";
const K_LAST = "swap_last_v1";

// DOM helpers
const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r=>setTimeout(r, ms));

/* -----------------------------
   Background: planty particles
------------------------------ */
function initBg() {
  const c = $("bgCanvas");
  const ctx = c.getContext("2d", { alpha: true });

  let w=0,h=0, dpr=1;
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function resize(){
    dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    w = c.width = Math.floor(window.innerWidth * dpr);
    h = c.height = Math.floor(window.innerHeight * dpr);
    c.style.width = window.innerWidth + "px";
    c.style.height = window.innerHeight + "px";
  }
  window.addEventListener("resize", resize);
  resize();

  // Soft “leaf blobs” (no emojis): tiny bezier shapes
  const N = prefersReduced ? 10 : 42;
  const particles = Array.from({length:N}).map(()=>({
    x: Math.random()*w,
    y: Math.random()*h,
    r: (8 + Math.random()*22)*dpr,
    a: 0.06 + Math.random()*0.10,
    vx: (-0.10 + Math.random()*0.20)*dpr,
    vy: (0.08 + Math.random()*0.24)*dpr,
    rot: Math.random()*Math.PI*2,
    vr: (-0.004 + Math.random()*0.008)
  }));

  function drawLeaf(x,y,r,rot,alpha){
    ctx.save();
    ctx.translate(x,y);
    ctx.rotate(rot);

    // Gradient fill to feel “botanical + clean”
    const g = ctx.createRadialGradient(-r*0.2, -r*0.2, r*0.2, 0, 0, r);
    g.addColorStop(0, `rgba(39,179,126,${alpha})`);
    g.addColorStop(1, `rgba(12,27,20,${alpha*0.25})`);

    ctx.fillStyle = g;
    ctx.beginPath();
    // leaf-ish bezier
    ctx.moveTo(0, -r);
    ctx.bezierCurveTo(r*0.9, -r*0.6, r*0.9, r*0.6, 0, r);
    ctx.bezierCurveTo(-r*0.9, r*0.6, -r*0.9, -r*0.6, 0, -r);
    ctx.closePath();
    ctx.fill();

    // subtle vein
    ctx.strokeStyle = `rgba(255,255,255,${alpha*0.25})`;
    ctx.lineWidth = Math.max(1, 1.2*dpr);
    ctx.beginPath();
    ctx.moveTo(0, -r*0.85);
    ctx.lineTo(0, r*0.85);
    ctx.stroke();

    ctx.restore();
  }

  function frame(){
    ctx.clearRect(0,0,w,h);

    // base airy wash
    const wash = ctx.createRadialGradient(w*0.2,h*0.2, 0, w*0.2,h*0.2, Math.max(w,h));
    wash.addColorStop(0, "rgba(39,179,126,0.10)");
    wash.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = wash;
    ctx.fillRect(0,0,w,h);

    for (const p of particles){
      drawLeaf(p.x, p.y, p.r, p.rot, p.a);

      if (!prefersReduced){
        p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        if (p.y - p.r > h) { p.y = -p.r; p.x = Math.random()*w; }
        if (p.x + p.r < 0) p.x = w + p.r;
        if (p.x - p.r > w) p.x = -p.r;
      }
    }

    requestAnimationFrame(frame);
  }
  frame();
}

/* -----------------------------
   JSONP client
------------------------------ */
function jsonp(url, params = {}) {
  if (DEMO_MODE) return Promise.resolve({ ok:true, demo:true });

  return new Promise((resolve, reject) => {
    const cb = "__swap_cb_" + Math.random().toString(36).slice(2);
    const qs = new URLSearchParams({ ...params, callback: cb });

    const src = url + (url.includes("?") ? "&" : "?") + qs.toString();

    let done = false;
    const script = document.createElement("script");
    script.src = src;
    script.async = true;

    const timeout = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP timeout (API not responding)."));
    }, 12000);

    function cleanup() {
      clearTimeout(timeout);
      try { delete window[cb]; } catch(_) { window[cb] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[cb] = (data) => {
      if (done) return;
      done = true;
      cleanup();
      resolve(data);
    };

    script.onerror = () => {
      if (done) return;
      done = true;
      cleanup();
      reject(new Error("JSONP script load failed (bad /exec URL or deployment permissions)."));
    };

    document.head.appendChild(script);
  });
}

function api(route, params = {}) {
  return jsonp(API_BASE, { route, ...params });
}

/* -----------------------------
   App state
------------------------------ */
const state = {
  apiOk: false,
  profile: loadProfile(),
  intakeStep: 1,
  pickedFood: null,
  pickedFoodFull: null,
  searchTimer: null,
};

function loadProfile() {
  try {
    const raw = localStorage.getItem(K_PROFILE);
    return raw ? JSON.parse(raw) : {};
  } catch(_) { return {}; }
}

function saveProfile(p) {
  state.profile = p || {};
  localStorage.setItem(K_PROFILE, JSON.stringify(state.profile));
}

function saveLast(payload) {
  localStorage.setItem(K_LAST, JSON.stringify(payload));
}

function loadLast() {
  try {
    const raw = localStorage.getItem(K_LAST);
    return raw ? JSON.parse(raw) : null;
  } catch(_) { return null; }
}

/* -----------------------------
   Views + nav
------------------------------ */
function show(el) {
  el.classList.remove("hidden");
  el.setAttribute("aria-hidden","false");
}
function hide(el) {
  el.classList.add("hidden");
  el.setAttribute("aria-hidden","true");
}

function goToIntake() {
  hide($("splash"));
  hide($("app"));
  show($("intake"));
  state.intakeStep = 1;
  renderWizard();
}

function goToApp() {
  hide($("splash"));
  hide($("intake"));
  show($("app"));
  renderProfileBox();
  setHudApiBadge(state.apiOk);
  selectView("swapView");
}

function selectView(id) {
  // views
  ["swapView","profileView"].forEach(v=>{
    const el = $(v);
    if (v === id) el.classList.remove("hidden");
    else el.classList.add("hidden");
  });

  // sidebar
  document.querySelectorAll(".navItem").forEach(b=>{
    b.classList.toggle("active", b.dataset.view === id);
  });
  // bottom nav
  document.querySelectorAll(".bnItem").forEach(b=>{
    b.classList.toggle("active", b.dataset.view === id);
  });
}

/* -----------------------------
   API health
------------------------------ */
function setApiBadge(ok, text) {
  const dot = $("apiDot");
  const t = $("apiText");
  if (!dot || !t) return;

  dot.style.background = ok ? "rgba(31,157,107,.85)" : "rgba(194,58,58,.80)";
  dot.style.boxShadow = ok ? "0 0 0 6px rgba(31,157,107,.12)" : "0 0 0 6px rgba(194,58,58,.10)";
  t.textContent = text || (ok ? "API: connected" : "API: not responding");
}

function setHudApiBadge(ok) {
  const dot = $("hudApiDot");
  const t = $("hudApiText");
  if (!dot || !t) return;

  dot.style.background = ok ? "rgba(31,157,107,.85)" : "rgba(194,58,58,.80)";
  dot.style.boxShadow = ok ? "0 0 0 6px rgba(31,157,107,.12)" : "0 0 0 6px rgba(194,58,58,.10)";
  t.textContent = ok ? "Connected" : "Not connected";
}

async function checkApi() {
  try {
    setApiBadge(false, "Checking API…");
    const res = await api("health", {});
    const ok = !!(res && (res.ok || res.status === "ok"));
    state.apiOk = ok;
    setApiBadge(ok, ok ? "API: connected" : "API: responded (unexpected format)");
    setHudApiBadge(ok);
    return ok;
  } catch (e) {
    state.apiOk = false;
    setApiBadge(false, "API: not responding");
    setHudApiBadge(false);
    return false;
  }
}

/* -----------------------------
   Wizard
------------------------------ */
function renderWizard() {
  const stepEl = $("wizardStep");
  const fill = $("wizardProgFill");
  const prog = document.querySelector(".wizardProgress");
  const step = state.intakeStep;

  stepEl.textContent = `Step ${step} of 3`;
  fill.style.width = `${(step/3)*100}%`;
  prog.setAttribute("aria-valuenow", String(step));

  document.querySelectorAll(".stepPanel").forEach(p=>{
    const s = Number(p.dataset.step);
    p.classList.toggle("hidden", s !== step);
  });

  $("backBtn").style.visibility = step === 1 ? "hidden" : "visible";

  const nextBtn = $("nextBtn");
  nextBtn.textContent = step === 3 ? "Finish" : "Continue";
}

function collectIntake() {
  const p = {
    height_cm: num($("height_cm").value),
    weight_kg: num($("weight_kg").value),
    age: int($("age").value),
    sex: ($("sex").value || "").trim(),
    activity: ($("activity").value || "").trim(),
    goal: ($("goal").value || "").trim(),
    diet: ($("diet").value || "").trim(),
    medical: ($("medical").value || "").trim(),
    allergies: ($("allergies").value || "").trim()
  };
  return p;
}

async function maybePreviewTargets() {
  // Only if step 2 fields are set
  const p = collectIntake();
  const box = $("targetsPreview");

  if (!(p.height_cm>0 && p.weight_kg>0 && p.age>0 && p.sex && p.activity && p.goal)) {
    box.classList.add("hidden");
    box.textContent = "";
    return;
  }

  try {
    const res = await api("targets", {
      height_cm: p.height_cm,
      weight_kg: p.weight_kg,
      age: p.age,
      sex: p.sex,
      activity: p.activity,
      goal: p.goal
    });

    if (res && res.ok) {
      box.classList.remove("hidden");
      box.innerHTML = `
        <b>Targets preview</b><br>
        BMR: <b>${res.bmr}</b> • TDEE: <b>${res.tdee}</b><br>
        Target calories: <b>${res.target_calories}</b><br>
        Macros (g): P <b>${res.macros_g?.protein ?? "—"}</b> • C <b>${res.macros_g?.carbs ?? "—"}</b> • F <b>${res.macros_g?.fat ?? "—"}</b>
      `;
    } else {
      box.classList.add("hidden");
    }
  } catch(_) {
    box.classList.add("hidden");
  }
}

/* -----------------------------
   Food search + pick
------------------------------ */
function clearPickedFood() {
  state.pickedFood = null;
  state.pickedFoodFull = null;
  $("pickedFoodHint").classList.add("hidden");
  $("pickedFoodHint").textContent = "";
}

function renderSearchResults(items) {
  const drop = $("searchDrop");
  drop.innerHTML = "";

  if (!items || !items.length) {
    drop.classList.add("hidden");
    return;
  }
  drop.classList.remove("hidden");

  for (const it of items) {
    const div = document.createElement("div");
    div.className = "sItem";
    div.setAttribute("role","option");
    div.innerHTML = `
      <div class="sName">${escapeHtml(it.name || it.id)}</div>
      <div class="sMeta">${escapeHtml((it.group || "—") + " • " + (it.subgroup || "—"))}</div>
    `;
    div.onclick = async () => {
      drop.classList.add("hidden");
      $("foodSearch").value = it.name || it.id;
      state.pickedFood = it;
      await loadFoodDetail(it.id);
    };
    drop.appendChild(div);
  }
}

async function loadFoodDetail(id) {
  try {
    const res = await api("food", { id });
    if (!res || !res.ok || !res.food) throw new Error(res?.error || "Could not load food.");

    state.pickedFoodFull = res.food;

    // Populate unit dropdown from units_json (if provided)
    const units = res.food.units || {};
    const unitSel = $("unit");
    const keep = unitSel.value || "g";

    const options = new Set(["g","oz","serving"]);
    Object.keys(units).forEach(k=>options.add(String(k).toLowerCase()));

    unitSel.innerHTML = "";
    [...options].forEach(u=>{
      const opt = document.createElement("option");
      opt.value = u;
      opt.textContent = u;
      unitSel.appendChild(opt);
    });
    unitSel.value = options.has(keep) ? keep : "g";

    const hint = $("pickedFoodHint");
    hint.classList.remove("hidden");
    hint.textContent = `Selected: ${res.food.name} (${res.food.group}/${res.food.subgroup})`;

    // Default portion if we have serving
    const serving = units.serving || units.piece || 0;
    if (!num($("portion").value) && serving) {
      $("portion").value = serving;
      $("unit").value = "serving";
    }

    renderOriginalBox(res.food);
  } catch (e) {
    showError("swapError", e.message || String(e));
  }
}

function renderOriginalBox(food) {
  const box = $("originalBox");
  if (!food) {
    box.className = "macroBox muted";
    box.textContent = "Pick a food to see the breakdown.";
    return;
  }

  const units = food.units || {};
  const unitLines = Object.keys(units).slice(0,8).map(k=>`${k}: ${units[k]}`).join(" • ");

  box.className = "macroBox";
  box.innerHTML = `
    <div style="font-weight:900">${escapeHtml(food.name)}</div>
    <div style="margin-top:6px;color:rgba(12,27,20,.62);font-weight:650;font-size:12px">
      ${escapeHtml((food.group||"") + " • " + (food.subgroup||""))}
      ${unitLines ? " • Units: " + escapeHtml(unitLines) : ""}
    </div>
  `;
}

/* -----------------------------
   Swap
------------------------------ */
function getSwapParams() {
  const p = collectIntake();
  return {
    diet: p.diet || "",
    medical: p.medical || "",
    allergies: p.allergies || "",
    food_id: state.pickedFood?.id || "",
    portion: num($("portion").value),
    unit: ($("unit").value || "g").trim(),
    cal_tol: Number($("calTol").value || 0.05),
    macro_tol: Number($("macroTol").value || 0.10),
    same_group: $("sameGroup").checked ? 1 : 0,
    flex: $("flex").checked ? 1 : 0,
    limit: 12
  };
}

function renderResults(res) {
  const box = $("resultsBox");
  box.innerHTML = "";

  if (!res || !res.ok) {
    box.innerHTML = `
      <div class="emptyState">
        <div class="emptyTitle">No results</div>
        <div class="emptySub">${escapeHtml(res?.error || "Unknown error")}</div>
      </div>
    `;
    return;
  }

  // original block
  const o = res.original || {};
  if (o.food) {
    renderOriginalTotals(o);
  }

  const swaps = Array.isArray(res.swaps) ? res.swaps : [];
  if (!swaps.length) {
    box.innerHTML = `
      <div class="emptyState">
        <div class="emptyTitle">No valid swaps found</div>
        <div class="emptySub">Try Flex mode or widen tolerances.</div>
      </div>
    `;
    return;
  }

  for (const s of swaps) {
    const card = document.createElement("div");
    card.className = "resultCard";

    const score = Number(s.score || 0);
    const badgeClass = score >= 80 ? "good" : score >= 60 ? "" : "warn";
    const badgeLabel = `${score}/100`;

    const grams = s.grams ?? "—";
    const cal = s.calories ?? "—";
    const m = s.macros || {};
    const d = s.deltas || {};

    card.innerHTML = `
      <div class="rTop">
        <div>
          <div class="rName">${escapeHtml(s.food?.name || s.food?.id || "Swap")}</div>
          <div class="rMeta">${escapeHtml((s.food?.group||"") + " • " + (s.food?.subgroup||""))}</div>
        </div>
        <div class="badge ${badgeClass}">${badgeLabel}</div>
      </div>

      <div class="kv">
        <div class="kvItem">
          <div class="kvLabel">Portion match</div>
          <div class="kvVal">${escapeHtml(String(grams))} g</div>
        </div>
        <div class="kvItem">
          <div class="kvLabel">Calories</div>
          <div class="kvVal">${escapeHtml(String(cal))}</div>
        </div>
        <div class="kvItem">
          <div class="kvLabel">Protein</div>
          <div class="kvVal">${escapeHtml(String(m.protein ?? "—"))} g</div>
        </div>
        <div class="kvItem">
          <div class="kvLabel">Carbs</div>
          <div class="kvVal">${escapeHtml(String(m.carbs ?? "—"))} g</div>
        </div>
        <div class="kvItem">
          <div class="kvLabel">Fat</div>
          <div class="kvVal">${escapeHtml(String(m.fat ?? "—"))} g</div>
        </div>
        <div class="kvItem">
          <div class="kvLabel">Delta (C/P/F)</div>
          <div class="kvVal">${fmtPct(d.carbs)} / ${fmtPct(d.protein)} / ${fmtPct(d.fat)}</div>
        </div>
      </div>

      ${s.reason ? `<div class="reason">${escapeHtml(s.reason)}</div>` : ""}
    `;

    box.appendChild(card);
  }
}

function renderOriginalTotals(original) {
  // if backend returns original totals, show them above swaps
  // (we keep it minimal: the backend already computed the target calories and macros)
  // We'll render into resultsBox header area via a small card.
  // Note: originalBox already shows food identity.
  const o = original || {};
  const m = o.macros || {};
  const info = document.createElement("div");
  info.className = "resultCard";
  info.innerHTML = `
    <div class="rTop">
      <div>
        <div class="rName">Original portion</div>
        <div class="rMeta">${escapeHtml(o.food?.name || "")} • ${escapeHtml(String(o.grams ?? "—"))} g</div>
      </div>
      <div class="badge">Baseline</div>
    </div>
    <div class="kv">
      <div class="kvItem">
        <div class="kvLabel">Calories</div>
        <div class="kvVal">${escapeHtml(String(o.calories ?? "—"))}</div>
      </div>
      <div class="kvItem">
        <div class="kvLabel">Protein</div>
        <div class="kvVal">${escapeHtml(String(m.protein ?? "—"))} g</div>
      </div>
      <div class="kvItem">
        <div class="kvLabel">Carbs</div>
        <div class="kvVal">${escapeHtml(String(m.carbs ?? "—"))} g</div>
      </div>
      <div class="kvItem">
        <div class="kvLabel">Fat</div>
        <div class="kvVal">${escapeHtml(String(m.fat ?? "—"))} g</div>
      </div>
    </div>
  `;
  $("resultsBox").appendChild(info);
}

/* -----------------------------
   Profile view
------------------------------ */
function renderProfileBox() {
  const box = $("profileBox");
  const p = state.profile || {};

  const rows = [
    ["Height (cm)", val(p.height_cm)],
    ["Weight (kg)", val(p.weight_kg)],
    ["Age", val(p.age)],
    ["Sex", val(p.sex)],
    ["Activity", val(p.activity)],
    ["Goal", val(p.goal)],
    ["Diet", val(p.diet)],
    ["Medical", val(p.medical)],
    ["Allergies", val(p.allergies)]
  ];

  box.innerHTML = rows.map(([k,v])=>`
    <div class="profileRow">
      <div class="profileKey">${escapeHtml(k)}</div>
      <div class="profileVal">${escapeHtml(v)}</div>
    </div>
  `).join("");
}

/* -----------------------------
   Modal
------------------------------ */
function openModal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modal").classList.remove("hidden");
  $("modal").setAttribute("aria-hidden","false");
}
function closeModal() {
  $("modal").classList.add("hidden");
  $("modal").setAttribute("aria-hidden","true");
}

/* -----------------------------
   Errors
------------------------------ */
function showError(id, msg) {
  const el = $(id);
  el.classList.remove("hidden");
  el.textContent = msg;
}
function clearError(id) {
  const el = $(id);
  el.classList.add("hidden");
  el.textContent = "";
}

/* -----------------------------
   Utilities
------------------------------ */
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}
function num(v){ const n = Number(v); return isFinite(n) ? n : 0; }
function int(v){ const n = parseInt(v,10); return isFinite(n) ? n : 0; }
function val(v){ return (v===undefined || v===null || v==="") ? "—" : String(v); }
function fmtPct(x){
  const n = Number(x);
  if (!isFinite(n)) return "—";
  return (n*100).toFixed(1) + "%";
}

/* -----------------------------
   Wire up events
------------------------------ */
function wire() {
  // Splash
  $("getStartedBtn").onclick = () => goToIntake();
  $("demoBtn").onclick = () => {
    openModal("Demo mode", `
      <div style="font-weight:800;margin-bottom:8px">This UI will run without the API.</div>
      <div>To connect live swaps, paste your Apps Script <b>/exec</b> URL into <code>API_BASE</code> in <b>app.js</b>.</div>
    `);
  };
  $("apiRetry").onclick = () => checkApi();

  // Wizard
  $("skipIntakeBtn").onclick = () => {
    saveProfile(collectIntake());
    goToApp();
  };
  $("backBtn").onclick = () => {
    state.intakeStep = Math.max(1, state.intakeStep - 1);
    renderWizard();
  };
  $("nextBtn").onclick = async () => {
    if (state.intakeStep === 1) {
      // light validation
      const p = collectIntake();
      if (!(p.height_cm>0 && p.weight_kg>0 && p.age>0 && p.sex)) {
        openModal("Missing basics", "Please enter height, weight, age, and sex — or click “Skip for now”.");
        return;
      }
      saveProfile(p);
      state.intakeStep = 2;
      renderWizard();
      await maybePreviewTargets();
      return;
    }

    if (state.intakeStep === 2) {
      saveProfile(collectIntake());
      state.intakeStep = 3;
      renderWizard();
      return;
    }

    // finish
    saveProfile(collectIntake());
    goToApp();
  };

  ["height_cm","weight_kg","age","sex","activity","goal"].forEach(id=>{
    const el = $(id);
    if (!el) return;
    el.addEventListener("change", async ()=>{
      if (state.intakeStep === 2) await maybePreviewTargets();
    });
  });

  // App nav
  document.querySelectorAll(".navItem").forEach(b=>{
    b.onclick = ()=>selectView(b.dataset.view);
  });
  document.querySelectorAll(".bnItem").forEach(b=>{
    b.onclick = ()=>selectView(b.dataset.view);
  });

  $("openProfileBtn").onclick = ()=>selectView("profileView");
  $("editIntakeBtn").onclick = ()=>goToIntake();

  $("resetSwapBtn").onclick = () => {
    $("foodSearch").value = "";
    $("portion").value = "";
    $("unit").value = "g";
    $("calTol").value = "0.05";
    $("macroTol").value = "0.10";
    $("sameGroup").checked = true;
    $("flex").checked = false;
    clearPickedFood();
    $("resultsBox").innerHTML = `
      <div class="emptyState">
        <div class="emptyTitle">No swaps yet</div>
        <div class="emptySub">Search a food, enter portion, then click “Get swaps”.</div>
      </div>
    `;
    renderOriginalBox(null);
    clearError("swapError");
  };

  // Search
  $("foodSearch").addEventListener("input", () => {
    clearPickedFood();
    clearError("swapError");

    const q = $("foodSearch").value.trim();
    if (q.length < 2) {
      $("searchDrop").classList.add("hidden");
      return;
    }

    if (state.searchTimer) clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(async () => {
      try {
        const res = await api("foods", { q, limit: 16 });
        if (!res || !res.ok) throw new Error(res?.error || "Search error.");
        renderSearchResults(res.items || res.foods || []);
      } catch (e) {
        $("searchDrop").classList.add("hidden");
      }
    }, 220);
  });

  // click-away for dropdown
  document.addEventListener("click", (e)=>{
    const drop = $("searchDrop");
    const wrap = document.querySelector(".searchWrap");
    if (!wrap.contains(e.target)) drop.classList.add("hidden");
  });

  // Swap button
  $("swapBtn").onclick = async () => {
    clearError("swapError");

    if (!state.pickedFood?.id) {
      showError("swapError", "Pick a food from the search dropdown first.");
      return;
    }
    const p = getSwapParams();
    if (!(p.portion > 0)) {
      showError("swapError", "Portion must be greater than 0.");
      return;
    }

    // optimistic UI
    $("resultsBox").innerHTML = `
      <div class="emptyState">
        <div class="emptyTitle">Working…</div>
        <div class="emptySub">Calculating portion-matched swaps from your database.</div>
      </div>
    `;

    try {
      const res = await api("swap", p);
      saveLast({ at: Date.now(), params: p, res });
      $("resultsBox").innerHTML = ""; // clear so render can add original card first
      renderResults(res);
    } catch (e) {
      showError("swapError", e.message || String(e));
      $("resultsBox").innerHTML = `
        <div class="emptyState">
          <div class="emptyTitle">Couldn’t get results</div>
          <div class="emptySub">API did not respond. Check deployment + /exec URL.</div>
        </div>
      `;
    }
  };

  // Modal
  $("modalClose").onclick = closeModal;
  document.querySelector("#modal .modalBackdrop").onclick = closeModal;
}

/* -----------------------------
   Boot
------------------------------ */
(async function boot(){
  initBg();
  wire();

  // restore profile to inputs
  const p = state.profile || {};
  ["height_cm","weight_kg","age","sex","activity","goal","diet","medical","allergies"].forEach(id=>{
    if ($(id) && p[id] !== undefined) $(id).value = p[id];
  });

  // initial api check
  await checkApi();

  // start at splash (always), but if profile exists you’ll feel “ready”
  // Optional: auto-skip to app if you prefer. For now, keep splash as requested.
})();
