import { authenticateRequest } from "../_shared/auth.js";
import { encrypt } from "../_shared/crypto.js";
import { getUserIntegration, removeUserIntegrationKey, saveUserIntegration } from "../_shared/database.js";
import { ApiError, errorResponse, jsonResponse, readJson } from "../_shared/http.js";
import { DEFAULT_REPORT_PROMPT } from "../_shared/report_prompt.js";

const DEFAULT_PROGRAM = "Government Internship Program (GIP)";
const MAX_PROMPT_LENGTH = 4000;
const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-5-5",
  gemini: "gemini-3.8-flash"
};
const ALLOWED_PROVIDERS = ["openai", "anthropic", "gemini"];

function cleanText(value, field, maxLength, required) {
  if (typeof value !== "string") {
    if (required) throw new ApiError(400, "invalid_input", field + " is required.");
    return "";
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (cleaned.length > maxLength || required && !cleaned) {
    throw new ApiError(400, "invalid_input", "Check the " + field + " value and try again.");
  }
  return cleaned;
}

function cleanPrompt(value) {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_prompt", "The report prompt must be text.");
  }
  const prompt = value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim();
  if (!prompt || prompt.length > MAX_PROMPT_LENGTH || !prompt.includes("{entries}")) {
    throw new ApiError(400, "invalid_prompt", "The prompt must be 4,000 characters or fewer and include {entries}.");
  }
  return prompt;
}

function publicSettings(row) {
  return {
    provider: row && row.provider || "openai",
    model: row && row.model || DEFAULT_MODELS[row && row.provider || "openai"],
    program: row && row.program || DEFAULT_PROGRAM,
    custom_prompt: row && row.custom_prompt || DEFAULT_REPORT_PROMPT,
    template_path: row && row.template_path || null,
    template_name: row && row.template_name || null,
    template_type: row && row.template_type || null,
    use_custom_template: !!(row && row.use_custom_template),
    has_key: !!(row && row.encrypted_key),
    key_last4: row && row.encrypted_key ? row.key_last4 : null
  };
}

export async function onRequestGet({ request, env }) {
  try {
    const user = await authenticateRequest(request, env);
    return jsonResponse(publicSettings(await getUserIntegration(env, user.id)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPut({ request, env }) {
  let apiKey = "";
  try {
    const user = await authenticateRequest(request, env);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "invalid_input", "Request body must be an object.");
    }
    const existing = await getUserIntegration(env, user.id);
    const provider = (body.provider === undefined
      ? existing && existing.provider || "openai"
      : cleanText(body.provider, "Provider", 20, true)).toLowerCase();
    if (!ALLOWED_PROVIDERS.includes(provider)) {
      throw new ApiError(400, "invalid_provider", "Choose OpenAI, Anthropic, or Google Gemini.");
    }
    const model = body.model === undefined
      ? existing && existing.model || DEFAULT_MODELS[provider]
      : cleanText(body.model, "Model", 120, true);
    const program = body.program === undefined
      ? existing && existing.program || DEFAULT_PROGRAM
      : cleanText(body.program, "Program", 160, true);
    const customPrompt = body.custom_prompt === undefined
      ? existing && existing.custom_prompt || DEFAULT_REPORT_PROMPT
      : cleanPrompt(body.custom_prompt);
    const templatePath = body.template_path === undefined
      ? existing && existing.template_path || null
      : body.template_path;
    const templateName = body.template_name === undefined
      ? existing && existing.template_name || null
      : body.template_name === null ? null : cleanText(body.template_name, "Template filename", 160, true);
    const templateType = body.template_type === undefined
      ? existing && existing.template_type || null
      : body.template_type;
    const useCustomTemplate = body.use_custom_template === undefined
      ? !!(existing && existing.use_custom_template)
      : body.use_custom_template;
    if (templatePath !== null && typeof templatePath !== "string") {
      throw new ApiError(400, "invalid_template", "The report template path is invalid.");
    }
    if (templateType !== null && templateType !== "docx" && templateType !== "xlsx") {
      throw new ApiError(400, "invalid_template", "Only DOCX and XLSX templates are supported.");
    }
    if (templatePath) {
      const ownedPath = templatePath.indexOf(user.id + "/") === 0;
      const storedFilename = templatePath.slice(user.id.length + 1);
      if (!ownedPath || !/^report-template-[0-9a-f-]{36}\.(docx|xlsx)$/.test(storedFilename) ||
          !storedFilename.endsWith("." + templateType)) {
        throw new ApiError(400, "invalid_template", "The report template path is invalid.");
      }
    }
    if (typeof useCustomTemplate !== "boolean") {
      throw new ApiError(400, "invalid_template", "The template selection is invalid.");
    }
    if ((templatePath === null) !== (templateName === null) ||
        (templatePath === null) !== (templateType === null) ||
        useCustomTemplate && !templatePath) {
      throw new ApiError(400, "invalid_template", "Upload a template before choosing it for reports.");
    }
    if (body.api_key !== undefined && typeof body.api_key !== "string") {
      throw new ApiError(400, "invalid_input", "API key must be text.");
    }
    apiKey = cleanText(body.api_key || "", "API key", 2048, false);
    if (!apiKey && existing && existing.encrypted_key && existing.provider !== provider) {
      throw new ApiError(400, "key_required", "Enter an API key for the selected provider.");
    }

    const encryptedKey = apiKey ? await encrypt(apiKey, env) : existing && existing.encrypted_key || null;
    const saved = await saveUserIntegration(env, {
      user_id: user.id,
      provider: provider,
      model: model,
      program: program,
      custom_prompt: customPrompt,
      template_path: templatePath,
      template_name: templateName,
      template_type: templateType,
      use_custom_template: useCustomTemplate,
      encrypted_key: encryptedKey,
      key_last4: apiKey ? apiKey.slice(-4) : existing && existing.key_last4 || null,
      updated_at: new Date().toISOString()
    });
    return jsonResponse(publicSettings(saved));
  } catch (error) {
    return errorResponse(error);
  } finally {
    apiKey = "";
  }
}

export async function onRequestDelete({ request, env }) {
  try {
    const user = await authenticateRequest(request, env);
    const row = await removeUserIntegrationKey(env, user.id);
    return jsonResponse(publicSettings(row));
  } catch (error) {
    return errorResponse(error);
  }
}
