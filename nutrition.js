export function normalizeHeightToCm(heightValue, heightUnit){
  const v = Number(heightValue);
  if (!Number.isFinite(v) || v <= 0) return null;

  if (heightUnit === "cm") return v;

  // inches mode
  // if user enters 5.6 treat as 5 ft 6 in
  if (v >= 3 && v <= 7 && String(heightValue).includes(".")) {
    const [ftStr, inStr] = String(heightValue).split(".");
    const ft = Number(ftStr);
    const inch = Number(inStr);
    if (Number.isFinite(ft) && Number.isFinite(inch)) {
      return (ft * 12 + inch) * 2.54;
    }
  }
  // otherwise treat as total inches
  return v * 2.54;
}

export function normalizeWeightToKg(weightValue, weightUnit){
  const v = Number(weightValue);
  if (!Number.isFinite(v) || v <= 0) return null;
  if (weightUnit === "kg") return v;
  return v / 2.2046226218;
}

export function mifflinStJeor({sex, weightKg, heightCm, age}){
  // BMR
  // male: 10W + 6.25H - 5A + 5
  // female: 10W + 6.25H - 5A - 161
  const base = 10*weightKg + 6.25*heightCm - 5*age;
  return sex === "male" ? base + 5 : base - 161;
}

export function activityMultiplier(activity){
  switch(activity){
    case "sedentary": return 1.2;
    case "light": return 1.375;
    case "moderate": return 1.55;
    case "very": return 1.725;
    case "extreme": return 1.9;
    default: return 1.2;
  }
}

export function applyGoalCalories(tdee, goal, paceLbPerWeek){
  // 1 lb/week ~ 500 kcal/day, 0.5 ~ 250, 2 ~ 1000
  const pace = Number(paceLbPerWeek || 0);
  const delta = Math.round((pace * 500));
  let target = tdee;

  if (goal === "lose") target = tdee - delta;
  if (goal === "gain") target = tdee + delta;

  // Safety rails (simple, adjustable later)
  // keep target within reasonable bounds
  const min = 1200;
  const max = 4500;
  target = Math.max(min, Math.min(max, target));

  // avoid overly aggressive deficit/surplus
  if (goal === "lose") target = Math.max(tdee - 1000, target);
  if (goal === "gain") target = Math.min(tdee + 800, target);

  return target;
}

export function proteinFloorG(weightKg){
  // hard requirement per your spec
  return Math.ceil(0.8 * weightKg);
}

export function swapsFromTargets({caloriesTarget, proteinGTarget}){
  // SWAP definitions
  // carb swap = 15g carbs ~60kcal
  // protein swap = 15g protein ~60kcal
  // fat swap = 7g fat ~63kcal
  // We ensure protein floor first, then distribute remaining calories.
  const proteinSwaps = Math.max(1, Math.ceil(proteinGTarget / 15));
  const proteinCalories = proteinSwaps * 60;

  const remaining = Math.max(0, caloriesTarget - proteinCalories);

  // Split remaining calories between carbs and fats (default 65/35 of remaining kcal)
  const carbsCalories = remaining * 0.65;
  const fatsCalories  = remaining * 0.35;

  const carbSwaps = Math.max(4, Math.round(carbsCalories / 60));
  const fatSwaps  = Math.max(3, Math.round(fatsCalories / 63));

  return { carbSwaps, proteinSwaps, fatSwaps };
}

export function dailyTemplate(){
  return [
    { key:"breakfast", label:"Breakfast" },
    { key:"snack_am", label:"Snack (AM)" },
    { key:"lunch", label:"Lunch" },
    { key:"snack_pm", label:"Snack (PM)" },
    { key:"dinner", label:"Dinner" }
  ];
}
