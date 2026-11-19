import { ApiError, fetchWithTimeout } from "./http.js";

function restUrl(env, path) {
  return env.SUPABASE_URL.replace(/\/+$/, "") + "/rest/v1/" + path;
}

async function serviceRequest(env, path, method, body, prefer) {
  const headers = {
    "apikey": env.SUPABASE_SERVICE_ROLE_KEY,
    "Authorization": "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (prefer) headers.Prefer = prefer;

  const response = await fetchWithTimeout(restUrl(env, path), {
    method: method,
    headers: headers,
    redirect: "error",
    body: body === undefined ? undefined : JSON.stringify(body)
  }, 12000, "The settings database");
  if (!response.ok) {
    throw new ApiError(
      response.status === 404 ? 503 : 502,
      response.status === 404 ? "database_not_configured" : "database_error",
      response.status === 404
        ? "The AI settings database schema is missing. Apply the latest Supabase schema."
        : "The settings database could not complete the request."
    );
  }
  if (response.status === 204) return null;
  try {
    return await response.json();
  } catch (error) {
    throw new ApiError(502, "database_error", "The settings database returned an unreadable response.");
  }
}

export async function getUserIntegration(env, userId) {
  const query = "ai_integrations?select=user_id,provider,model,program,custom_prompt," +
    "template_path,template_name,template_type,use_custom_template,encrypted_key,key_last4" +
    "&user_id=eq." + encodeURIComponent(userId) + "&limit=1";
  const rows = await serviceRequest(env, query, "GET");
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function saveUserIntegration(env, settings) {
  const rows = await serviceRequest(
    env,
    "ai_integrations?on_conflict=user_id",
    "POST",
    settings,
    "resolution=merge-duplicates,return=representation"
  );
  return Array.isArray(rows) && rows.length ? rows[0] : settings;
}

export async function removeUserIntegrationKey(env, userId) {
  const existing = await getUserIntegration(env, userId);
  if (!existing) return null;
  const rows = await serviceRequest(
    env,
    "ai_integrations?user_id=eq." + encodeURIComponent(userId),
    "PATCH",
    { encrypted_key: null, key_last4: null, updated_at: new Date().toISOString() },
    "return=representation"
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

export async function consumeDailyReportQuota(env, userId) {
  const result = await serviceRequest(
    env,
    "rpc/consume_ai_report_quota",
    "POST",
    { target_user_id: userId }
  );
  return result === true;
}
