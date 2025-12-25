"use strict";

// 1) PASTE YOUR APPS SCRIPT WEB APP /exec URL HERE
const WEBAPP_EXEC = "https://script.google.com/macros/s/AKfycbxoVkI3xIJ1ErMrQ07pG1Oj2dPE-G1-85R1zTXIHB61j_X66JqoyezCadtdQB6qfenfmQ/exec";

const $ = (id) => document.getElementById(id);

const apiStatus = $("apiStatus");

const foodSearch = $("foodSearch");
const foodDropdown = $("foodDropdown");
const btnSwap = $("btnSwap");
const pickedFood = $("pickedFood");

const portionEl = $("portion");
const unitEl = $("unit");

const dietEl = $("diet");
const medicalEl = $("medical");
const allergiesEl = $("allergies");
const calTolEl = $("calTol");
const macroTolEl = $("macroTol");
const modeEl = $("mode");

const swapCards = $("swapCards");
const swapTop = $("swapTop");
const origName = $("origName");
const origChips = $("origChips");
const swapNote = $("swapNote");

// Targets UI
const btnTargets = $("btnTargets");
const heightCm = $("heightCm");
const weightKg = $("weightKg");
const age = $("age");
const sex = $("sex");
const activity = $("activity");
const goal = $("goal");

const kpiBmr = $("kpiBmr");
const kpiTdee = $("kpiTdee");
const kpiCals = $("kpiCals");
const kpiP = $("kpiP");
const kpiC = $("kpiC");
const kpiF = $("kpiF");
const targetsNote = $("targetsNote");

// App state
let selectedFood = null;
let searchTimer = null;

// ---------------------------
// JSONP helper (avoids CORS)
// ---------------------------
function jsonp(url, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const cb = "__swap_cb_" + Math.random().toString(16).slice(2);
    const script = document.createElement("script");
    const t = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, timeoutMs);

    function cleanup() {
      clearTimeout(t);
      delete window[cb];
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }

    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };

    const sep = url.includes("?") ? "&" : "?";
    script.src = url + sep + "callback=" + encodeURIComponent(cb);
    script.onerror = () => {
      cleanup();
      reject(new Error("JSONP network error"));
    };
    document.body.appendChild(script);
  });
}

function routeUrl(route, params = {}) {
  const u = new URL(WEBAPP_EXEC);
  u.searchParams.set("route", route);
  Object.entries(params).forEach(([k,v]) => {
    if (v === undefined || v === null) return;
    u.searchParams.set(k, String(v));
  });
  return u.toString();
}

// ---------------------------
// Boot: health check
// ---------------------------
(async function boot() {
  try {
    const data = await jsonp(routeUrl("health"));
    apiStatus.textContent = data.ok ? "API: connected" : "API: error";
  } catch (e) {
    apiStatus.textContent = "API: disconnected";
  }
})();

// ---------------------------
// Food search + dropdown
// ---------------------------
function hideDropdown() {
  foodDropdown.style.display = "none";
  foodDropdown.innerHTML = "";
}
function showDropdown(items) {
  foodDropdown.innerHTML = items.map(x =>
    `<div class="item" data-id="${x.id}" data-name="${escapeHtml(x.name)}" data-group="${x.group}" data-subgroup="${x.subgroup}">
      <strong>${escapeHtml(x.name)}</strong>
      <span style="opacity:.6"> • ${x.group}${x.subgroup ? ":" + x.subgroup : ""}</span>
    </div>`
  ).join("");
  foodDropdown.style.display = items.length ? "block" : "none";
}

foodSearch.addEventListener("input", () => {
  const q = foodSearch.value.trim();
  selectedFood = null;
  btnSwap.disabled = true;
  pickedFood.textContent = "No food selected";
  hideDropdown();

  clearTimeout(searchTimer);
  if (q.length < 2) return;

  searchTimer = setTimeout(async () => {
    try {
      const data = await jsonp(routeUrl("foods", { q, limit: 12 }));
      if (!data.ok) return;
      showDropdown(data.foods || []);
    } catch (_) {}
  }, 180);
});

foodDropdown.addEventListener("click", (e) => {
  const item = e.target.closest(".item");
  if (!item) return;

  selectedFood = {
    id: item.getAttribute("data-id"),
    name: item.getAttribute("data-name"),
    group: item.getAttribute("data-group"),
    subgroup: item.getAttribute("data-subgroup")
  };

  foodSearch.value = selectedFood.name;
  hideDropdown();

  pickedFood.textContent = `Selected: ${selectedFood.name} (${selectedFood.group})`;
  btnSwap.disabled = false;
});

document.addEventListener("click", (e) => {
  if (!foodDropdown.contains(e.target) && e.target !== foodSearch) hideDropdown();
});

// ---------------------------
// Swap request
// ---------------------------
btnSwap.addEventListener("click", async () => {
  if (!selectedFood) return;

  btnSwap.disabled = true;
  swapNote.textContent = "Computing swaps…";
  swapCards.innerHTML = "";
  swapTop.hidden = true;

  const portion = Number(portionEl.value || 0);
  const unit = unitEl.value;

  const cal_tol = calTolEl.value;
  const macro_tol = macroTolEl.value;

  const diet = dietEl.value;
  const medical = medicalEl.value;
  const allergies = allergiesEl.value.trim();

  const flex = (modeEl.value === "flex") ? "1" : "0";

  try {
    const data = await jsonp(routeUrl("swap", {
      food_id: selectedFood.id,
      portion,
      unit,
      cal_tol,
      macro_tol,
      same_group: "1",
      flex,
      diet,
      medical,
      allergies,
      limit: "12"
    }));

    if (!data.ok) throw new Error(data.error || "Swap failed");

    renderOriginal(data.original);
    renderSwaps(data.swaps || []);
    swapNote.textContent = (data.swaps && data.swaps.length)
      ? `Showing top ${data.swaps.length} swaps within your tolerances.`
      : "No valid swaps found at these tolerances. Try Flex mode or wider tolerances.";
  } catch (err) {
    swapNote.textContent = "Error: " + err.message;
  } finally {
    btnSwap.disabled = false;
  }
});

function renderOriginal(orig) {
  swapTop.hidden = false;
  origName.textContent = `${orig.food.name} • ${orig.grams}g • ${orig.calories} kcal`;
  origChips.innerHTML = [
    `Protein ${orig.macros.protein}g`,
    `Carbs ${orig.macros.carbs}g`,
    `Fat ${orig.macros.fat}g`,
    `Fiber ${orig.macros.fiber}g`,
    `Sugar ${orig.macros.sugar}g`,
    `Sodium ${orig.macros.sodium_mg}mg`
  ].map(t => `<span class="chip">${t}</span>`).join("");
}

function renderSwaps(swaps) {
  swapCards.innerHTML = swaps.map(s => {
    const f = s.food;
    return `
      <div class="swapCard">
        <div class="swapCardTop">
          <div>
            <div style="font-weight:850">${escapeHtml(f.name)}</div>
            <div class="muted mini">${f.group}${f.subgroup ? ":" + f.subgroup : ""} • ${s.grams}g • ${s.calories} kcal</div>
          </div>
          <div class="badge">${s.score}</div>
        </div>

        <div class="line">
          <div class="metric">P ${s.macros.protein}g</div>
          <div class="metric">C ${s.macros.carbs}g</div>
          <div class="metric">F ${s.macros.fat}g</div>
          <div class="metric">Fiber ${s.macros.fiber}g</div>
          <div class="metric">Sugar ${s.macros.sugar}g</div>
          <div class="metric">Na ${s.macros.sodium_mg}mg</div>
        </div>

        <div class="muted mini" style="margin-top:10px">
          Δcal ${(s.deltas.cal*100).toFixed(1)}% • ΔP ${(s.deltas.protein*100).toFixed(1)}% • ΔC ${(s.deltas.carbs*100).toFixed(1)}% • ΔF ${(s.deltas.fat*100).toFixed(1)}%
        </div>

        <div class="mini" style="margin-top:10px; color: rgba(255,255,255,.78)">
          ${escapeHtml(s.reason || "")}
        </div>
      </div>
    `;
  }).join("");
}

// ---------------------------
// Targets request
// ---------------------------
btnTargets.addEventListener("click", async () => {
  btnTargets.disabled = true;
  targetsNote.textContent = "Computing…";
  try {
    const data = await jsonp(routeUrl("targets", {
      height_cm: heightCm.value,
      weight_kg: weightKg.value,
      age: age.value,
      sex: sex.value,
      activity: activity.value,
      goal: goal.value
    }));
    if (!data.ok) throw new Error(data.error || "Targets failed");

    kpiBmr.textContent = data.bmr;
    kpiTdee.textContent = data.tdee;
    kpiCals.textContent = data.target_calories;
    kpiP.textContent = `${data.macros_g.protein}g`;
    kpiC.textContent = `${data.macros_g.carbs}g`;
    kpiF.textContent = `${data.macros_g.fat}g`;
    targetsNote.textContent = "Done.";
  } catch (e) {
    targetsNote.textContent = "Error: " + e.message;
  } finally {
    btnTargets.disabled = false;
  }
});

// ---------------------------
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[c]));
}
