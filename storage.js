export const Storage = {
  kProfile: "swap_profile_v1",
  kPlan: "swap_plan_v1",
  kRecipes: "swap_recipes_v1",

  getProfile() {
    try { return JSON.parse(localStorage.getItem(this.kProfile) || "null"); }
    catch { return null; }
  },
  setProfile(p) { localStorage.setItem(this.kProfile, JSON.stringify(p)); },

  getPlan() {
    try { return JSON.parse(localStorage.getItem(this.kPlan) || "null"); }
    catch { return null; }
  },
  setPlan(plan) { localStorage.setItem(this.kPlan, JSON.stringify(plan)); },

  getRecipes() {
    try { return JSON.parse(localStorage.getItem(this.kRecipes) || "{}"); }
    catch { return {}; }
  },
  setRecipes(map) { localStorage.setItem(this.kRecipes, JSON.stringify(map)); },

  resetAll() {
    localStorage.removeItem(this.kProfile);
    localStorage.removeItem(this.kPlan);
    localStorage.removeItem(this.kRecipes);
  }
};
