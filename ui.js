import { Storage } from "./storage.js";
import { dailyTemplate } from "./nutrition.js";

export function el(html){
  const d = document.createElement("div");
  d.innerHTML = html.trim();
  return d.firstChild;
}

export function setStatus(text){
  const chip = document.getElementById("chipStatus");
  if (chip) chip.textContent = text;
}

export function setTopbar(title, targetsText){
  const t = document.getElementById("topbarTitle");
  const c = document.getElementById("chipTargets");
  if (t) t.textContent = title;
  if (c) c.textContent = targetsText || "—";
}

export function mountTemplate(appRoot, tplId){
  const tpl = document.getElementById(tplId);
  appRoot.innerHTML = "";
  appRoot.appendChild(tpl.content.cloneNode(true));
}

export function renderFreeFoods(){
  const free = [
    "Mixed greens", "Cucumber", "Tomatoes", "Bell peppers", "Broccoli",
    "Cauliflower", "Zucchini", "Mushrooms", "Asparagus", "Green beans",
    "Spinach", "Kale", "Cabbage", "Brussels sprouts", "Celery", "Radishes",
    "Herbs + spices", "Lemon/lime", "Vinegar"
  ];
  const node = document.getElementById("freeList");
  if (!node) return;
  node.innerHTML = "";
  for (const f of free){
    node.appendChild(el(`<span class="freePill">${f}</span>`));
  }
}

function badgeForVector(v){
  const badges = [];
  if (v?.c) badges.push(`<span class="badge carb">${v.c}C</span>`);
  if (v?.p) badges.push(`<span class="badge protein">${v.p}P</span>`);
  if (v?.f) badges.push(`<span class="badge fat">${v.f}F</span>`);
  return badges.join("");
}

export function renderCalendar(plan, onClickItem){
  const cal = document.getElementById("calendar");
  const weekMeta = document.getElementById("weekMeta");
  if (!cal) return;

  cal.innerHTML = "";
  if (!plan?.days?.length){
    weekMeta.textContent = "No plan yet. Generate to begin.";
    return;
  }
  weekMeta.textContent = `Week of ${new Date(plan.weekStart).toLocaleDateString()}`;

  const meals = dailyTemplate();

  for (const day of plan.days){
    const dayName = new Date(day.date).toLocaleDateString(undefined, { weekday:"long" });
    const card = el(`<div class="dayCard">
      <div class="dayTitle">${dayName}</div>
      <div class="dayBody"></div>
    </div>`);
    const body = card.querySelector(".dayBody");

    for (const m of meals){
      const block = el(`<div class="mealBlock">
        <div class="mealName">${m.label}</div>
        <div class="mealItems"></div>
      </div>`);
      const list = block.querySelector(".mealItems");

      const items = day.meals?.[m.key]?.items || [];
      for (const it of items){
        const grams = it.grams ? `${Math.round(it.grams)}g` : "";
        const kcal = it.macros?.kcal ? `${Math.round(it.macros.kcal)} kcal` : "";
        const meta = [grams, kcal, it.subgroup].filter(Boolean).join(" • ");

        const node = el(`<div class="item" role="button" tabindex="0">
          <div class="itemTop">
            <div class="itemName">${it.label}</div>
            <div class="itemMeta">${meta}</div>
          </div>
          <div class="badges">${badgeForVector(it.swap_vector)}</div>
        </div>`);
        node.addEventListener("click", () => onClickItem(day, m, it));
        list.appendChild(node);
      }

      body.appendChild(block);
    }

    cal.appendChild(card);
  }
}

export function renderSwapsHeader(clicked){
  const title = document.getElementById("swapTitle");
  const sub = document.getElementById("swapSub");
  const chips = document.getElementById("swapChips");
  if (!title || !sub || !chips) return;

  title.textContent = clicked?.label ? `Swaps for: ${clicked.label}` : "Swaps";
  sub.textContent = clicked?.subgroup ? `Subgroup: ${clicked.subgroup} • Target swaps preserved exactly` : "—";
  chips.innerHTML = "";
  if (clicked?.swap_vector){
    const v = clicked.swap_vector;
    if (v.c) chips.appendChild(el(`<span class="chip">Carb: ${v.c} swap(s)</span>`));
    if (v.p) chips.appendChild(el(`<span class="chip">Protein: ${v.p} swap(s)</span>`));
    if (v.f) chips.appendChild(el(`<span class="chip">Fat: ${v.f} swap(s)</span>`));
  }
}

export function renderSwapResults(result){
  const body = document.getElementById("swapBody");
  if (!body) return;

  if (!result?.groups?.length){
    body.innerHTML = `<div class="emptyState"><div class="big">No swaps found</div><div class="muted">Try a different item or regenerate the plan.</div></div>`;
    return;
  }

  body.innerHTML = "";
  for (const g of result.groups){
    const wrap = el(`<div class="swapGroup">
      <h3 class="swapGroupTitle">${g.title}</h3>
      <div class="swapList"></div>
    </div>`);
    const list = wrap.querySelector(".swapList");
    for (const s of g.items){
      const grams = s.grams ? `${Math.round(s.grams)}g` : "";
      const kcal = s.macros?.kcal ? `${Math.round(s.macros.kcal)} kcal` : "";
      const meta = [grams, kcal, s.subgroup].filter(Boolean).join(" • ");
      list.appendChild(el(`<div class="swapRow">
        <div>
          <div class="swapName">${s.label}</div>
          <div class="swapMeta">${meta}</div>
        </div>
        <div class="badges">
          ${s.swap_vector?.c ? `<span class="badge carb">${s.swap_vector.c}C</span>` : ""}
          ${s.swap_vector?.p ? `<span class="badge protein">${s.swap_vector.p}P</span>` : ""}
          ${s.swap_vector?.f ? `<span class="badge fat">${s.swap_vector.f}F</span>` : ""}
        </div>
      </div>`));
    }
    body.appendChild(wrap);
  }
}

export function renderRecipes(plan){
  const list = document.getElementById("recipesList");
  const recipes = Storage.getRecipes();
  if (!list) return;

  list.innerHTML = "";
  if (!plan?.days?.length){
    list.innerHTML = `<div class="glass recipeCard"><div class="recipeTitle">No plan yet</div><div class="muted">Generate a week plan first.</div></div>`;
    return;
  }

  for (const day of plan.days){
    const dayName = new Date(day.date).toLocaleDateString(undefined, { weekday:"long", month:"short", day:"numeric" });
    const key = `day:${day.date}`;
    const saved = recipes[key];

    const card = el(`<div class="glass recipeCard">
      <div class="recipeTitle">${dayName}</div>
      <div class="muted">Recipes for the day’s meals (healthful, whole-food, no additives).</div>
      <hr class="sep" />
      <div class="recipeBody">${saved ? formatRecipeHTML(saved) : `<span class="muted">Not generated yet.</span>`}</div>
    </div>`);
    list.appendChild(card);
  }
}

function esc(s){ return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function formatRecipeHTML(r){
  if (!r?.meals) return `<span class="muted">Invalid recipe data.</span>`;
  let out = "";
  for (const meal of r.meals){
    out += `<div style="margin-bottom:14px"><div style="font-weight:950">${esc(meal.meal_label)}</div>`;
    out += `<div class="muted" style="margin-top:2px">${esc(meal.summary || "")}</div>`;
    if (meal.ingredients?.length){
      out += `<div style="margin-top:8px;font-weight:900">Ingredients</div><div>${meal.ingredients.map(x=>`• ${esc(x)}`).join("<br>")}</div>`;
    }
    if (meal.steps?.length){
      out += `<div style="margin-top:8px;font-weight:900">Steps</div><div>${meal.steps.map((x,i)=>`${i+1}) ${esc(x)}`).join("<br>")}</div>`;
    }
    out += `</div>`;
  }
  return out;
}
