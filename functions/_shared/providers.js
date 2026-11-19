import { ApiError, fetchWithTimeout } from "./http.js";

const SYSTEM_PROMPT = "You write government internship accomplishment reports. Use formal, concise, past-tense language. Return ONLY valid JSON, no markdown.";

function providerFailure(provider, status, body) {
  const providerError = body && body.error ? body.error : {};
  const message = String(providerError.message || providerError.code || "").toLowerCase();
  const code = String(providerError.code || providerError.type || "").toLowerCase();
  if (message.indexOf("quota") !== -1 || code.indexOf("quota") !== -1) {
    return new ApiError(429, "provider_quota", "The provider reports that your account has no remaining quota.");
  }
  if (status === 401 || status === 403 || code.indexOf("api_key") !== -1 ||
      message.indexOf("api key") !== -1 || message.indexOf("invalid key") !== -1) {
    return new ApiError(400, "invalid_key", "The provider rejected this API key. Check it in Integrations.");
  }
  if (status === 404 || message.indexOf("model") !== -1 && message.indexOf("not found") !== -1) {
    return new ApiError(400, "wrong_model", "The provider could not find this model. Check the model name in Integrations.");
  }
  if (status === 429) {
    return new ApiError(429, "provider_rate_limit", "The provider is rate-limiting requests. Wait and try again.");
  }
  if (status === 400 && (message.indexOf("model") !== -1 || code.indexOf("model") !== -1)) {
    return new ApiError(400, "wrong_model", "The provider rejected this model name. Check the model in Integrations.");
  }
  return new ApiError(502, "provider_error", "The provider could not complete the request (HTTP " + status + ").");
}

async function providerRequest(provider, model, apiKey, prompt, isTest) {
  let url;
  let headers = { "Content-Type": "application/json" };
  let body;

  if (provider === "openai") {
    url = "https://api.openai.com/v1/chat/completions";
    headers.Authorization = "Bearer " + apiKey;
    body = {
      model: model,
      messages: isTest
        ? [{ role: "user", content: "Reply with a JSON object such as {\"ok\":true}." }]
        : [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: prompt }
        ],
      temperature: isTest ? 0 : 0.2,
      max_tokens: isTest ? 16 : 2000,
      response_format: { type: "json_object" }
    };
  } else if (provider === "anthropic") {
    url = "https://api.anthropic.com/v1/messages";
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    body = {
      model: model,
      max_tokens: isTest ? 16 : 2000,
      system: isTest ? "Reply with OK only." : SYSTEM_PROMPT,
      messages: [{
        role: "user",
        content: isTest ? "Reply with OK." : prompt
      }]
    };
  } else if (provider === "gemini") {
    url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) + ":generateContent";
    headers["x-goog-api-key"] = apiKey;
    body = {
      systemInstruction: {
        parts: [{ text: isTest ? "Reply with OK only." : SYSTEM_PROMPT }]
      },
      contents: [{
        role: "user",
        parts: [{ text: isTest ? "Reply with OK." : prompt }]
      }],
      generationConfig: isTest
        ? { maxOutputTokens: 16 }
        : { temperature: 0.2, maxOutputTokens: 2000, responseMimeType: "application/json" }
    };
  } else {
    throw new ApiError(400, "invalid_provider", "Choose OpenAI, Anthropic, or Google Gemini.");
  }

  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers: headers,
    body: JSON.stringify(body),
    redirect: "error"
  }, isTest ? 20000 : 60000);

  let result;
  try {
    result = await response.json();
  } catch (error) {
    throw new ApiError(502, "provider_error", "The provider returned an unreadable response.");
  }
  if (!response.ok) throw providerFailure(provider, response.status, result);
  return result;
}

function extractText(provider, result) {
  if (provider === "openai") {
    const content = result.choices && result.choices[0] && result.choices[0].message &&
      result.choices[0].message.content;
    if (typeof content === "string") return content;
  } else if (provider === "anthropic") {
    const blocks = Array.isArray(result.content) ? result.content : [];
    return blocks.filter(function (block) { return block.type === "text"; })
      .map(function (block) { return block.text || ""; }).join("");
  } else if (provider === "gemini") {
    const parts = result.candidates && result.candidates[0] &&
      result.candidates[0].content && result.candidates[0].content.parts;
    if (Array.isArray(parts)) {
      return parts.map(function (part) { return part.text || ""; }).join("");
    }
  }
  throw new ApiError(502, "malformed_output", "The provider response did not contain report text.");
}

function parseReportJson(text) {
  let source = text.trim();
  const fenced = source.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced) source = fenced[1].trim();

  let report;
  try {
    report = JSON.parse(source);
  } catch (error) {
    throw new ApiError(502, "malformed_output", "The AI returned malformed JSON. Try generating the report again.");
  }

  if (!report || typeof report.period_covered !== "string" ||
      !Array.isArray(report.specific_tasks) || !Array.isArray(report.output) ||
      !report.specific_tasks.every(function (item) { return typeof item === "string" && item.trim(); }) ||
      !report.output.every(function (item) { return typeof item === "string" && item.trim(); }) ||
      !report.period_covered.trim() || !report.specific_tasks.length ||
      report.specific_tasks.length !== report.output.length ||
      report.specific_tasks.length > 100 ||
      report.period_covered.length > 160 ||
      report.specific_tasks.concat(report.output).some(function (item) { return item.length > 2000; })) {
    throw new ApiError(502, "malformed_output", "The AI returned an invalid report structure. Try generating the report again.");
  }

  return {
    period_covered: report.period_covered.trim(),
    specific_tasks: report.specific_tasks.map(function (item) { return item.trim(); }),
    output: report.output.map(function (item) { return item.trim(); })
  };
}

export async function testProviderKey(provider, model, apiKey) {
  await providerRequest(provider, model, apiKey, "", true);
}

export async function generateWithProvider(provider, model, apiKey, prompt) {
  const result = await providerRequest(provider, model, apiKey, prompt, false);
  return parseReportJson(extractText(provider, result));
}

export function reportSystemPrompt() {
  return SYSTEM_PROMPT;
}
