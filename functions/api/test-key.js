import { authenticateRequest } from "../_shared/auth.js";
import { ApiError, errorResponse, jsonResponse, readJson } from "../_shared/http.js";
import { testProviderKey } from "../_shared/providers.js";

const ALLOWED_PROVIDERS = ["openai", "anthropic", "gemini"];

function inputText(value, field, maxLength) {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_input", field + " is required.");
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new ApiError(400, "invalid_input", "Check the " + field + " value and try again.");
  }
  return cleaned;
}

export async function onRequestPost({ request, env }) {
  let apiKey = "";
  try {
    const user = await authenticateRequest(request, env);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "invalid_input", "Request body must be an object.");
    }
    const provider = inputText(body.provider, "Provider", 20).toLowerCase();
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      throw new ApiError(400, "invalid_provider", "Choose OpenAI, Anthropic, or Google Gemini.");
    }
    const model = inputText(body.model, "Model", 120);
    if (body.api_key !== undefined && typeof body.api_key !== "string") {
      throw new ApiError(400, "invalid_input", "API key must be text.");
    }
    apiKey = String(body.api_key || "").trim();
    if (apiKey.length > 2048) {
      throw new ApiError(400, "invalid_input", "The API key is too long.");
    }
    if (!apiKey) {
      throw new ApiError(400, "key_required", "Re-enter the API key to test it.");
    }

    await testProviderKey(provider, model, apiKey);
    return jsonResponse({ message: "Provider key and model test succeeded." });
  } catch (error) {
    return errorResponse(error);
  } finally {
    apiKey = "";
  }
}
