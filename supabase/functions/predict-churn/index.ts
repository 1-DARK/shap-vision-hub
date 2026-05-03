import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const inputs = await req.json();
    const apiUrl = Deno.env.get("PREDICTION_API_URL");
    if (!apiUrl) {
      return new Response(JSON.stringify({ error: "PREDICTION_API_URL not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build form data matching the Flask app's expected fields
    const form = new URLSearchParams();
    if (inputs.gender) form.set("gender", String(inputs.gender));
    if (inputs.SeniorCitizen) form.set("SeniorCitizen", "on");
    if (inputs.Partner) form.set("Partner", "on");
    if (inputs.Dependents) form.set("Dependents", "on");
    if (inputs.PaperlessBilling) form.set("PaperlessBilling", "on");
    if (inputs.PhoneService) form.set("PhoneService", "on");
    if (inputs.MultipleLines) form.set("MultipleLines", "on");
    if (inputs.OnlineSecurity) form.set("OnlineSecurity", "on");
    if (inputs.OnlineBackup) form.set("OnlineBackup", "on");
    if (inputs.DeviceProtection) form.set("DeviceProtection", "on");
    if (inputs.TechSupport) form.set("TechSupport", "on");
    if (inputs.StreamingTV) form.set("StreamingTV", "on");
    if (inputs.StreamingMovies) form.set("StreamingMovies", "on");
    form.set("MonthlyCharges", String(inputs.MonthlyCharges ?? 0));
    form.set("Tenure", String(inputs.Tenure ?? 0));
    form.set("InternetService", String(inputs.InternetService ?? "0"));
    form.set("Contract", String(inputs.Contract ?? "0"));
    form.set("PaymentMethod", String(inputs.PaymentMethod ?? "0"));

    let result: any;
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, "")}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
        body: form.toString(),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Model API returned ${response.status}: ${text.slice(0, 200)}`);
      }
      const ct = response.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        result = await response.json();
      } else {
        // Flask app returns rendered HTML; cannot parse — instruct user to add a JSON endpoint.
        throw new Error("Model API must return JSON. Add a JSON endpoint that returns { churn_probability, lifetime_value, shap_image, gauge_image, hazard_image, survival_image }.");
      }
    } catch (e) {
      return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Persist
    const { data: saved, error: insErr } = await supabase.from("predictions").insert({
      user_id: user.id,
      inputs,
      churn_probability: Number(result.churn_probability ?? 0),
      lifetime_value: Number(result.lifetime_value ?? 0),
      shap_image: result.shap_image ?? null,
      gauge_image: result.gauge_image ?? null,
      hazard_image: result.hazard_image ?? null,
      survival_image: result.survival_image ?? null,
    }).select().single();

    if (insErr) console.error("Insert error:", insErr);

    return new Response(JSON.stringify({ ...result, id: saved?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("predict-churn error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
