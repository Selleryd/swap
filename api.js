// Your Apps Script Web App URL (keep as-is unless you redeploy)
export const API_BASE = "https://script.google.com/macros/s/AKfycbxoVkI3xIJ1ErMrQ07pG1Oj2dPE-G1-85R1zTXIHB61j_X66JqoyezCadtdQB6qfenfmQ/exec";

async function postJSON(action, payload){
  const res = await fetch(API_BASE, {
    method: "POST",
    headers: { "Content-Type":"application/json" },
    body: JSON.stringify({ action, payload })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data?.ok === false) {
    const msg = data?.error || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

export const API = {
  async ping(){
    return postJSON("ping", {});
  },
  async generatePlan(profile, targets){
    return postJSON("plan_generate", { profile, targets });
  },
  async suggestSwaps(context){
    return postJSON("swaps_suggest", context);
  },
  async generateRecipe(recipeReq){
    return postJSON("recipe_generate", recipeReq);
  }
};
