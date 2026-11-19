import { ApiError, requireConfiguration } from "./http.js";

export async function authenticateRequest(request, env) {
  requireConfiguration(env, ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]);
  const authorization = request.headers.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, "unauthorized", "Sign in to use this feature.");

  let response;
  try {
    response = await fetch(env.SUPABASE_URL.replace(/\/+$/, "") + "/auth/v1/user", {
      redirect: "error",
      headers: {
        "apikey": env.SUPABASE_ANON_KEY,
        "Authorization": "Bearer " + match[1]
      }
    });
  } catch (error) {
    throw new ApiError(503, "auth_unavailable", "Authentication could not be verified. Try again shortly.");
  }

  if (response.status === 401 || response.status === 403) {
    throw new ApiError(401, "unauthorized", "Your session is invalid or expired. Sign in again.");
  }
  if (!response.ok) {
    throw new ApiError(503, "auth_unavailable", "Authentication could not be verified. Try again shortly.");
  }

  let user;
  try {
    user = await response.json();
  } catch (error) {
    throw new ApiError(503, "auth_unavailable", "Authentication could not be verified. Try again shortly.");
  }
  if (!user || typeof user.id !== "string") {
    throw new ApiError(401, "unauthorized", "Your session is invalid or expired. Sign in again.");
  }
  return user;
}
