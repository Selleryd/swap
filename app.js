import { Storage } from "./storage.js";
import { API } from "./api.js";
import {
  normalizeHeightToCm,
  normalizeWeightToKg,
  mifflinStJeor,
  activityMultiplier,
  applyGoalCalories,
  proteinFloorG,
  swapsFromTargets
} from "./nutrition.js";
import {
  mountTemplate,
  setStatus,
  setTopbar,
  renderCalendar,
  renderSwapsHeader,
  renderSwapResults,
  renderFreeFoods,
  renderRecipes
} from "./ui.js";

const appRoot = document.getElementById("app");

boot();

function boot(){
  const profile = Storage.getProfile();
  if (!profile){
    mountTemplate(appRoot, "tplSplash");
    wireSplash();
    return;
  }
  renderShell();
}

function renderShell(){
  mountTemplate(appRoot, "tplShell");
  wireShell();
  showTab("plan");
}

function wireSplash(){
  appRoot.querySelector('[data-action="go-intake"]').addEventListener("click", () => {
    renderShell();
    showTab("profile");
  });
}

function wireShell(){
  document.querySelectorAll(".navItem").forEach(btn=>{
    btn.addEventListener("click", () => {
      document.querySelectorAll(".navItem").forEach(b=>b.classList.remove("active"));
      btn.classList.add("active");
      showTab(btn.dataset.tab);
    });
  });

  document.querySelector('[data-action="reset"]').addEventListener("click", () => {
    Storage.resetAll();
    location.reload();
  });
}

function showTab(tab){
  const content = document.getElementById("content");

  if (tab === "profile"){
    setTopbar("Profile", targetsText());
    mountInto(content, "tplProfile");
    wireProfileForm();
    return;
  }

  if (tab === "recipes"){
    setTopbar("Recipes", targetsText());
    mountInto(content, "tplRecipes");
    wireRecipesTab();
    return;
  }

  // default plan
  setTopbar("Meal Plan", targetsText());
  mountInto(content, "tplPlan");
  wirePlanTab();
}

function mountInto(container, tplId){
  const tpl = document.getElementById(tplId);
  container.innerHTML = "";
  container.appendChild(tpl.content.cloneNode(true));
}

function targetsText(){
  const p = Storage.getProfile();
  if (!p?.computed) return "—";
  const c = p.computed;
  return `${Math.round(c.caloriesTarget)} kcal/day • ≥${c.proteinGTarget}g protein/day`;
}

function wireProfileForm(){
  const form = document.getElementById("profileForm");
  const profile = Storage.getProfile();
  if (profile) hydrateProfileForm(form, profile);

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const fd = new FormData(form);
    const age = Number(fd.get("age"));
    const gender = String(fd.get("gender"));
    const heightValue = String(fd.get("heightValue"));
    const heightUnit = String(fd.get("heightUnit"));
    const weightValue = String(fd.get("weightValue"));
    const weightUnit = String(fd.get("weightUnit"));
    const activity = String(fd.get("activity"));
    const goal = String(fd.get("goal"));
    const pace = String(fd.get("pace"));
    const dietary = String(fd.get("dietary") || "");
    const allergens = String(fd.get("allergens") || "");

    const heightCm = normalizeHeightToCm(heightValue, heightUnit);
    const weightKg = normalizeWeightToKg(weightValue, weightUnit);

    if (!heightCm || !weightKg || !age || !gender || !activity || !goal){
      alert("Please complete all required fields.");
      return;
    }

    const bmr = mifflinStJeor({ sex: gender, weightKg, heightCm, age });
    const tdee = bmr * activityMultiplier(activity);
    const caloriesTarget = applyGoalCalories(tdee, goal, pace);
    const proteinGTarget = proteinFloorG(weightKg);
    const swaps = swapsFromTargets({ caloriesTarget, proteinGTarget });

    const computed = {
      heightCm,
      weightKg,
      bmr: Math.round(bmr),
      tdee: Math.round(tdee),
      caloriesTarget: Math.round(caloriesTarget),
      proteinGTarget,
      swaps,
      servings: { vegNonStarchy: 5, fruit: 2.5 },
      // locked rules
      rules: lockedRules()
    };

    const newProfile = {
      age,
      gender,
      heightValue,
      heightUnit,
      weightValue,
      weightUnit,
      activity,
      goal,
      pace,
      dietary,
      allergens,
      computed,
      updatedAt: new Date().toISOString()
    };

    Storage.setProfile(newProfile);
    setStatus("Profile saved");
    setTopbar("Profile", targetsText());
  });

  document.querySelector('[data-action="go-plan"]').addEventListener("click", () => {
    document.querySelector('[data-tab="plan"]')?.click();
  });
}

function hydrateProfileForm(form, p){
  const set = (name, val) => { const el = form.elements[name]; if (el) el.value = val ?? ""; };
  set("age", p.age);
  set("gender", p.gender);
  set("heightValue", p.heightValue);
  set("heightUnit", p.heightUnit);
  set("weightValue", p.weightValue);
  set("weightUnit", p.weightUnit);
  set("activity", p.activity);
  set("goal", p.goal);
  set("pace", p.pace ?? "0");
  set("dietary", p.dietary ?? "");
  set("allergens", p.allergens ?? "");
}

function lockedRules(){
  return {
    no_added_sugar: true,
    no_artificial_sweeteners: true,
    no_food_dyes: true,
    no_artificial_flavors: true,
    no_trans_fats: true,
    no_refined_grains: true,
    no_processed_meats_high_sodium: true,
    avoid_ultra_processed_additives: true,
    prefer_whole_grains: true,
    prefer_lean_protein: true,
    require_protein_each_meal: true
  };
}

function wirePlanTab(){
  renderFreeFoods();

  const plan = Storage.getPlan();
  renderCalendar(plan, onClickItem);

  const btnGen = document.querySelector('[data-action="generate-plan"]');
  const btnRegen = document.querySelector('[data-action="regenerate-plan"]');

  btnGen.addEventListener("click", () => generatePlan(false));
  btnRegen.addEventListener("click", () => generatePlan(true));

  // if no plan, encourage generation
  if (!plan){
    setStatus("Generate a plan");
  }
}

async function generatePlan(force){
  const profile = Storage.getProfile();
  if (!profile?.computed){
    alert("Please complete your profile first.");
    document.querySelector('[data-tab="profile"]')?.click();
    return;
  }

  if (Storage.getPlan() && !force){
    setStatus("Plan already exists");
    return;
  }

  try{
    setStatus("Generating plan…");
    const res = await API.generatePlan(profile, profile.computed);
    Storage.setPlan(res.plan);
    renderCalendar(res.plan, onClickItem);
    setStatus("Plan ready");
  }catch(err){
    console.error(err);
    setStatus("Error");
    alert(err.message || "Failed to generate plan.");
  }
}

async function onClickItem(day, meal, item){
  try{
    renderSwapsHeader(item);
    setStatus("Finding swaps…");

    const profile = Storage.getProfile();
    const context = {
      item,
      day: { date: day.date },
      meal: { key: meal.key, label: meal.label },
      profile: {
        dietary: profile?.dietary || "",
        allergens: profile?.allergens || "",
        rules: profile?.computed?.rules || {}
      }
    };

    const res = await API.suggestSwaps(context);
    renderSwapResults(res);
    setStatus("Swaps ready");
  }catch(err){
    console.error(err);
    setStatus("Error");
    alert(err.message || "Failed to fetch swaps.");
  }
}

function wireRecipesTab(){
  const plan = Storage.getPlan();
  renderRecipes(plan);

  const status = document.getElementById("recipeStatus");
  status.textContent = plan?.weekStart ? `Loaded week of ${new Date(plan.weekStart).toLocaleDateString()}` : "Generate a plan first.";

  document.querySelector('[data-action="generate-recipes-week"]').addEventListener("click", async () => {
    const plan = Storage.getPlan();
    if (!plan?.days?.length){
      alert("Generate a meal plan first.");
      return;
    }
    await generateRecipesForWeek(plan);
  });
}

async function generateRecipesForWeek(plan){
  const profile = Storage.getProfile();
  const recipesMap = Storage.getRecipes();

  const status = document.getElementById("recipeStatus");
  try{
    setStatus("Generating recipes…");
    for (let i=0; i<plan.days.length; i++){
      const day = plan.days[i];
      const key = `day:${day.date}`;
      if (recipesMap[key]) continue;

      status.textContent = `Generating recipes… (${i+1}/${plan.days.length})`;
      const res = await API.generateRecipe({
        day,
        profile: {
          dietary: profile?.dietary || "",
          allergens: profile?.allergens || "",
          rules: profile?.computed?.rules || {}
        }
      });

      recipesMap[key] = res.recipe;
      Storage.setRecipes(recipesMap);
      renderRecipes(plan);
    }
    status.textContent = "All recipes generated.";
    setStatus("Recipes ready");
  }catch(err){
    console.error(err);
    setStatus("Error");
    alert(err.message || "Failed to generate recipes.");
  }
}
