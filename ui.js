// ui.js — rendering + events
import { Storage } from "./storage.js";

const $ = (sel, root=document) => root.querySelector(sel);
const $$ = (sel, root=document) => Array.from(root.querySelectorAll(sel));

function mountTemplate(root, tplId){
  const tpl = document.getElementById(tplId);
  if (!tpl) throw new Error("Missing template: " + tplId);
  root.innerHTML = "";
  root.appendChild(tpl.content.cloneNode(true));
}

function setStatus(text){
  const el = $("#statusPill");
  if (el) el.textContent = text || "Ready";
}

function setTopbar({ title, sub, actions }){
  const t = $("#topbarTitle");
  const s = $("#topbarSub");
  const a = $("#topbarActions");
  if (t) t.textContent = title || "";
  if (s) s.textContent = sub || "";
  if (a){
    a.innerHTML = "";
    (actions || []).forEach(btn => a.appendChild(btn));
  }
}

function btn(label, opts={}){
  const b = document.createElement("button");
  b.className = "btn" + (opts.primary ? " primary" : "") + (opts.subtle ? " subtle" : "");
  b.textContent = label;
  if (opts.action) b.dataset.action = opts.action;
  if (opts.disabled) b.disabled = true;
  if (opts.title) b.title = opts.title;
  return b;
}

function fmtDayName(dateStr){
  try{
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { weekday: "long" });
  }catch(e){
    return "Day";
  }
}
function fmtShortDate(dateStr){
  try{
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString(undefined, { month: "numeric", day: "numeric", year: "numeric" });
  }catch(e){
    return dateStr;
  }
}

function normalizePlan(plan){
  if (!plan) return null;

  // Support multiple shapes:
  // A) {weekStart, days:[{date, meals:{breakfast:{items:[]},...}}]}
  // B) {weekStart, days:[{date, meals:[{key,label,items:[]}]}]}
  const out = { weekStart: plan.weekStart || plan.week_start || plan.start || "", days: [] };

  const days = Array.isArray(plan.days) ? plan.days : [];
  for (const d of days){
    const date = d.date || d.day || "";
    const mealsOut = [];

    if (Array.isArray(d.meals)){
      for (const m of d.meals){
        mealsOut.push({
          key: m.key || m.meal_key || "",
          label: m.label || m.meal_label || "",
          items: Array.isArray(m.items) ? m.items : []
        });
      }
    }else if (d.meals && typeof d.meals === "object"){
      const order = ["breakfast","snack_am","lunch","snack_pm","dinner"];
      for (const k of order){
        const mo = d.meals[k];
        mealsOut.push({
          key: k,
          label: keyToLabel(k),
          items: Array.isArray(mo?.items) ? mo.items : []
        });
      }
    }

    out.days.push({ date, meals: mealsOut });
  }
  return out;
}

function keyToLabel(k){
  switch(k){
    case "snack_am": return "Snack (AM)";
    case "snack_pm": return "Snack (PM)";
    default: return (k||"").charAt(0).toUpperCase() + (k||"").slice(1);
  }
}

function itemName(it){
  return it.label || it.name || "Food item";
}

function itemSubgroup(it){
  return it.subgroup || it.group || "";
}

function itemFoodId(it){
  return it.food_id || it.id || null;
}

function itemSwapVec(it){
  const sv = it.swap_vector || it.swapVec || it.swap || null;
  if (sv && typeof sv === "object") return {
    c: Number(sv.c||0),
    p: Number(sv.p||0),
    f: Number(sv.f||0)
  };
  // Try infer from group if old plan
  return { c:0, p:0, f:0 };
}

function itemMacros(it){
  // New backend: it.macros = {kcal, carbs_g, protein_g, fat_g}
  if (it.macros && typeof it.macros === "object"){
    return {
      kcal: Number(it.macros.kcal||0),
      carbs_g: Number(it.macros.carbs_g||0),
      protein_g: Number(it.macros.protein_g||0),
      fat_g: Number(it.macros.fat_g||0)
    };
  }
  // Older plan shape: direct numbers
  const kcal = Number(it.calories || it.kcal || 0);
  const carbs_g = Number(it.carbs_g || it.carbs || 0);
  const protein_g = Number(it.protein_g || it.protein || 0);
  const fat_g = Number(it.fat_g || it.fat || 0);
  if ([kcal,carbs_g,protein_g,fat_g].some(n => Number.isFinite(n) && n>0)){
    return { kcal, carbs_g, protein_g, fat_g };
  }
  return null;
}

function swapTagsFromVec(vec){
  const parts = [];
  if (vec.c) parts.push({ cls:"carb", txt: `${vec.c}C` });
  if (vec.p) parts.push({ cls:"prot", txt: `${vec.p}P` });
  if (vec.f) parts.push({ cls:"fat", txt: `${vec.f}F` });
  return parts;
}

function renderCalendar(planRaw){
  const plan = normalizePlan(planRaw);
  const root = $("#calendarGrid");
  const meta = $("#weekMeta");
  if (!root) return;

  root.innerHTML = "";
  if (!plan || !plan.days.length){
    root.innerHTML = `<div class="muted">No plan yet. Click Generate.</div>`;
    if (meta) meta.textContent = "";
    return;
  }

  if (meta){
    const wk = plan.weekStart ? fmtShortDate(plan.weekStart) : "";
    meta.textContent = wk ? `Week of ${wk}` : "";
  }

  for (const day of plan.days){
    const dayCard = document.createElement("div");
    dayCard.className = "dayCard";

    const header = document.createElement("div");
    header.className = "dayHeader";
    header.innerHTML = `<div class="dayName">${escapeHtml(fmtDayName(day.date))}</div>
                        <div class="dayDate">${escapeHtml(fmtShortDate(day.date))}</div>`;
    dayCard.appendChild(header);

    for (const meal of day.meals){
      const block = document.createElement("div");
      block.className = "mealBlock";

      const kcal = meal.items?.reduce((sum, it) => {
        const m = itemMacros(it);
        return sum + (m ? (Number(m.kcal)||0) : 0);
      }, 0) || 0;

      const titleRow = document.createElement("div");
      titleRow.className = "mealTitleRow";
      titleRow.innerHTML = `<div class="mealTitle">${escapeHtml(meal.label || keyToLabel(meal.key))}</div>
                            <div class="mealKcal">${kcal ? Math.round(kcal) + " kcal" : ""}</div>`;
      block.appendChild(titleRow);

      const itemsWrap = document.createElement("div");
      itemsWrap.className = "items";

      (meal.items || []).forEach((it, idx) => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "foodBtn";
        b.title = itemName(it);

        const vec = itemSwapVec(it);
        const macros = itemMacros(it);
        const grams = Number(it.grams || it.portion_g || it.g || it.grams_g || 0);

        // Data attributes for app.js or event consumers
        b.dataset.action = "select-food";
        b.dataset.date = day.date || "";
        b.dataset.meal = meal.key || "";
        b.dataset.index = String(idx);
        b.dataset.label = itemName(it);
        b.dataset.subgroup = itemSubgroup(it);
        const fid = itemFoodId(it);
        if (fid) b.dataset.foodId = String(fid);
        b.dataset.swapC = String(vec.c||0);
        b.dataset.swapP = String(vec.p||0);
        b.dataset.swapF = String(vec.f||0);
        if (grams) b.dataset.grams = String(grams);
        if (macros){
          b.dataset.kcal = String(macros.kcal||0);
          b.dataset.carbs = String(macros.carbs_g||0);
          b.dataset.protein = String(macros.protein_g||0);
          b.dataset.fat = String(macros.fat_g||0);
        }

        const tags = document.createElement("div");
        tags.className = "foodMeta";

        swapTagsFromVec(vec).forEach(t => {
          const s = document.createElement("span");
          s.className = "tag " + t.cls;
          s.textContent = t.txt;
          tags.appendChild(s);
        });

        if (macros && macros.kcal){
          const s = document.createElement("span");
          s.className = "tag kcal";
          s.textContent = `${Math.round(macros.kcal)} kcal`;
          tags.appendChild(s);
        }

        const top = document.createElement("div");
        top.className = "foodTop";
        top.innerHTML = `<div class="foodName">${escapeHtml(truncate(itemName(it), 36))}</div>`;
        top.appendChild(tags);

        const bottom = document.createElement("div");
        bottom.className = "foodBottom";
        const gStr = grams ? `${Math.round(grams)} g` : "";
        const sub = itemSubgroup(it) ? itemSubgroup(it).replace(/_/g," ") : "";
        bottom.innerHTML = `<span>${escapeHtml(sub)}</span><span>${escapeHtml(gStr)}</span>`;

        b.appendChild(top);
        b.appendChild(bottom);

        itemsWrap.appendChild(b);
      });

      block.appendChild(itemsWrap);
      dayCard.appendChild(block);
    }

    root.appendChild(dayCard);
  }

  // Event delegation: clicking an item dispatches a custom event
  root.onclick = (ev) => {
    const target = ev.target.closest(".foodBtn");
    if (!target) return;
    ev.preventDefault();

    const item = {
      label: target.dataset.label || "",
      subgroup: target.dataset.subgroup || "",
      food_id: target.dataset.foodId || null,
      grams: Number(target.dataset.grams || 0) || 0,
      swap_vector: {
        c: Number(target.dataset.swapC || 0) || 0,
        p: Number(target.dataset.swapP || 0) || 0,
        f: Number(target.dataset.swapF || 0) || 0
      },
      macros: {
        kcal: Number(target.dataset.kcal || 0) || 0,
        carbs_g: Number(target.dataset.carbs || 0) || 0,
        protein_g: Number(target.dataset.protein || 0) || 0,
        fat_g: Number(target.dataset.fat || 0) || 0
      }
    };

    window.dispatchEvent(new CustomEvent("swap:item", {
      detail: {
        date: target.dataset.date || "",
        meal: target.dataset.meal || "",
        item
      }
    }));
  };
}

function renderSwapsHeader(item){
  const box = $("#swapSelected");
  if (!box) return;
  if (!item){
    box.innerHTML = `<div class="selectedTitle">Select a food</div>
                     <div class="selectedSub">We’ll show same-subgroup swaps first, then allowed alternates.</div>`;
    return;
  }
  const m = item.macros || null;
  const lines = [];
  if (m && (m.kcal || m.protein_g || m.carbs_g || m.fat_g)){
    lines.push(`${Math.round(m.kcal||0)} kcal`);
    lines.push(`P ${fmt1(m.protein_g)}g`);
    lines.push(`C ${fmt1(m.carbs_g)}g`);
    lines.push(`F ${fmt1(m.fat_g)}g`);
  }
  const extra = lines.length ? `• ${lines.join("  ")}` : "";
  box.innerHTML = `<div class="selectedTitle">${escapeHtml(item.label || "Selected")}</div>
                   <div class="selectedSub">${escapeHtml((item.subgroup||"").replace(/_/g," "))} ${escapeHtml(extra)}</div>`;
}

function renderSwapResults(groups){
  const root = $("#swapResults");
  if (!root) return;
  root.innerHTML = "";

  if (!groups || !groups.length){
    root.innerHTML = `<div class="muted">No swaps found for this item.</div>`;
    return;
  }

  for (const g of groups){
    const wrap = document.createElement("div");
    wrap.className = "swapGroup";

    const head = document.createElement("div");
    head.className = "swapGroupHeader";
    head.textContent = g.title || "Swaps";
    wrap.appendChild(head);

    const list = document.createElement("div");
    list.className = "swapList";

    (g.items || []).forEach(it => {
      const row = document.createElement("div");
      row.className = "swapRow";

      const left = document.createElement("div");
      left.innerHTML = `<div class="swapName">${escapeHtml(it.label || it.name || "Swap")}</div>
                        <div class="small">${escapeHtml((it.subgroup||"").replace(/_/g," "))} • ${it.grams ? Math.round(it.grams) + " g" : ""}</div>`;

      const m = it.macros || it;
      const nums = document.createElement("div");
      nums.className = "swapNums";
      nums.innerHTML = `
        <span>${Math.round(Number(m.kcal||m.calories||0))} kcal</span>
        <span>P ${fmt1(Number(m.protein_g||0))}g • C ${fmt1(Number(m.carbs_g||0))}g • F ${fmt1(Number(m.fat_g||0))}g</span>
      `;

      row.appendChild(left);
      row.appendChild(nums);
      list.appendChild(row);
    });

    wrap.appendChild(list);
    root.appendChild(wrap);
  }
}

function renderFreeFoods(items){
  const root = $("#freeFoods");
  if (!root) return;
  root.innerHTML = "";
  (items || []).slice(0, 14).forEach(t => {
    const s = document.createElement("span");
    s.className = "freeChip";
    s.textContent = String(t);
    root.appendChild(s);
  });
}

function renderRecipes(recipesByDate){
  const root = $("#recipesRoot");
  if (!root) return;
  root.innerHTML = "";

  const plan = Storage.getPlan();
  const planN = normalizePlan(plan);
  if (!planN || !planN.days?.length){
    root.innerHTML = `<div class="muted">Generate a meal plan first.</div>`;
    return;
  }

  // Day picker + generate button row
  const pickerRow = document.createElement("div");
  pickerRow.className = "card";
  pickerRow.innerHTML = `<div class="cardTitle">Pick a day</div>`;

  const select = document.createElement("select");
  select.className = "input";
  select.id = "recipeDaySelect";
  planN.days.forEach(d => {
    const o = document.createElement("option");
    o.value = d.date;
    o.textContent = `${fmtDayName(d.date)} — ${fmtShortDate(d.date)}`;
    select.appendChild(o);
  });

  const genBtn = document.createElement("button");
  genBtn.className = "btn primary";
  genBtn.dataset.action = "generate-recipes";
  genBtn.textContent = "Generate recipes for selected day";

  pickerRow.appendChild(select);
  pickerRow.appendChild(document.createElement("div")).style.height = "10px";
  pickerRow.appendChild(genBtn);
  root.appendChild(pickerRow);

  const rec = recipesByDate || {};
  const dates = Object.keys(rec).sort();
  if (!dates.length){
    const empty = document.createElement("div");
    empty.className = "muted";
    empty.textContent = "No recipes generated yet.";
    root.appendChild(empty);
    return;
  }

  dates.forEach(date => {
    const day = rec[date];
    const box = document.createElement("div");
    box.className = "accordion";
    box.innerHTML = `<div class="accHead"><div class="accTitle">${escapeHtml(fmtDayName(date))} — ${escapeHtml(fmtShortDate(date))}</div><div class="small">Click to expand</div></div><div class="accBody"></div>`;
    const body = box.querySelector(".accBody");

    const meals = day?.meals || [];
    meals.forEach(m => {
      const sec = document.createElement("div");
      sec.style.marginTop = "10px";
      sec.innerHTML = `<div style="font-weight:950">${escapeHtml(m.meal_label || m.meal_key || "Meal")}</div>
                       <div class="small">${escapeHtml(m.summary || "")}</div>`;
      const ing = document.createElement("ul");
      ing.className = "list";
      (m.ingredients || []).forEach(x => {
        const li = document.createElement("li");
        li.textContent = String(x);
        ing.appendChild(li);
      });
      const steps = document.createElement("ol");
      steps.className = "list";
      (m.steps || []).forEach(x => {
        const li = document.createElement("li");
        li.textContent = String(x);
        steps.appendChild(li);
      });
      sec.appendChild(ing);
      sec.appendChild(steps);
      body.appendChild(sec);
    });

    box.querySelector(".accHead").onclick = () => box.classList.toggle("open");
    root.appendChild(box);
  });
}

function escapeHtml(s){
  return String(s||"")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#039;");
}

function truncate(s, n){
  const str = String(s||"");
  return str.length > n ? str.slice(0, n-1) + "…" : str;
}
function fmt1(n){
  const x = Number(n||0);
  if (!Number.isFinite(x)) return "0";
  return (Math.round(x*10)/10).toFixed(1).replace(/\.0$/,"");
}

// Backwards-compatible export names (some of your app.js variants import different names)
const renderSwapHeader = renderSwapsHeader;
const renderSwapsHeader = renderSwapsHeader; // eslint silence

export {
  mountTemplate,
  setStatus,
  setTopbar,
  btn,
  renderCalendar,
  renderSwapsHeader,
  renderSwapHeader,
  renderSwapResults,
  renderFreeFoods,
  renderRecipes
};
