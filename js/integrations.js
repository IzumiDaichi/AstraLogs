var aiIntegrationDefaults = {
  openai: "gpt-4o-mini",
  anthropic: "claude-haiku-5-5",
  gemini: "gemini-3.8-flash"
};
var INTEGRATION_PROMPT_MAX_LENGTH = 4000;
var INTEGRATION_PROMPT_VARIABLES = ["program", "date_from", "date_to", "entries"];
var aiIntegrationSettings = null;
window.aiIntegrationSettings = null;

function setIntegrationStatus(text, kind) {
  $("integrationStatus").textContent = text;
  $("integrationStatus").className = "message " + (kind || "");
}

function setIntegrationBusy(isBusy) {
  ["saveIntegrationButton", "saveIntegrationPromptButton", "resetIntegrationPrompt", "testIntegrationButton", "removeIntegrationButton"].forEach(function (id) {
    $(id).disabled = isBusy;
  });
}

function updateIntegrationPromptHints() {
  var prompt = $("integrationPrompt").value;
  var unknownVariables = new Set();
  var match;
  var variablePattern = /\{([^{}]+)\}/g;
  while ((match = variablePattern.exec(prompt)) !== null) {
    var variable = match[1].trim();
    if (INTEGRATION_PROMPT_VARIABLES.indexOf(variable) === -1) unknownVariables.add(variable);
  }
  $("integrationPromptCount").textContent = prompt.length + " / " + INTEGRATION_PROMPT_MAX_LENGTH + " characters";
  $("integrationPromptWarning").textContent = unknownVariables.size
    ? "Unknown variables will not be replaced: " + Array.from(unknownVariables).map(function (value) {
      return "{" + value + "}";
    }).join(", ")
    : "";
}

async function requestIntegrationApi(path, method, body) {
  var sessionResult = await supabaseClient.auth.getSession();
  if (sessionResult.error) throw sessionResult.error;
  var session = sessionResult.data.session;
  if (!session) throw new Error("Your session has expired. Sign in again.");
  var headers = { "Authorization": "Bearer " + session.access_token };
  var options = { method: method, headers: headers };
  if (body) {
    headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }
  var response = await fetch(path, options);
  var result;
  try {
    result = await response.json();
  } catch (error) {
    throw new Error("The integration service returned an unreadable response.");
  }
  if (!response.ok) {
    var apiError = new Error(result.message || "The integration request failed.");
    apiError.code = result.code || "request_failed";
    throw apiError;
  }
  return result;
}

function renderIntegrationSettings(settings) {
  aiIntegrationSettings = settings;
  window.aiIntegrationSettings = settings;
  $("integrationProvider").value = settings.provider || "openai";
  $("integrationModel").value = settings.model || aiIntegrationDefaults[$("integrationProvider").value];
  $("integrationProgram").value = settings.program || "Government Internship Program (GIP)";
  $("integrationPrompt").value = settings.custom_prompt || DEFAULT_REPORT_PROMPT;
  updateIntegrationPromptHints();
  var hasKey = !!settings.has_key;
  $("integrationKeyStatus").textContent = hasKey
    ? "API key saved ·••••" + settings.key_last4
    : "No API key saved.";
  $("integrationApiKey").hidden = hasKey;
  $("integrationKeyLabel").hidden = hasKey;
  $("replaceIntegrationKey").hidden = !hasKey;
  $("removeIntegrationButton").hidden = !hasKey;
  $("integrationApiKey").value = "";
  renderReportTemplateSettings(settings);
  setIntegrationStatus("");
}

async function loadIntegrationsSettings() {
  var settings = await requestIntegrationApi("/api/integrations", "GET");
  renderIntegrationSettings(settings);
}

function integrationFormSettings() {
  var provider = $("integrationProvider").value;
  var model = $("integrationModel").value.trim();
  var program = $("integrationProgram").value.trim();
  var customPrompt = $("integrationPrompt").value.trim();
  if (!model) throw new Error("Enter a model name.");
  if (!program) throw new Error("Enter a program name.");
  if (!customPrompt || customPrompt.length > INTEGRATION_PROMPT_MAX_LENGTH || customPrompt.indexOf("{entries}") === -1) {
    throw new Error("The prompt must be 4,000 characters or fewer and include {entries}.");
  }
  return {
    provider: provider,
    model: model,
    program: program,
    custom_prompt: customPrompt
  };
}

$("integrationProvider").addEventListener("change", function () {
  $("integrationModel").value = aiIntegrationDefaults[$("integrationProvider").value];
});

$("integrationPrompt").addEventListener("input", updateIntegrationPromptHints);

$("saveIntegrationPromptButton").addEventListener("click", async function () {
  var customPrompt = $("integrationPrompt").value.trim();
  if (!customPrompt || customPrompt.length > INTEGRATION_PROMPT_MAX_LENGTH || customPrompt.indexOf("{entries}") === -1) {
    $("integrationPromptStatus").textContent = "The prompt must be 4,000 characters or fewer and include {entries}.";
    $("integrationPromptStatus").className = "message err";
    return;
  }
  setIntegrationBusy(true);
  $("integrationPromptStatus").textContent = "Saving prompt...";
  $("integrationPromptStatus").className = "message";
  try {
    var settings = await requestIntegrationApi("/api/integrations", "PUT", { custom_prompt: customPrompt });
    aiIntegrationSettings = settings;
    window.aiIntegrationSettings = settings;
    $("integrationPrompt").value = settings.custom_prompt;
    updateIntegrationPromptHints();
    $("integrationPromptStatus").textContent = "Prompt saved.";
  } catch (error) {
    $("integrationPromptStatus").textContent = error.message;
    $("integrationPromptStatus").className = "message err";
  } finally {
    setIntegrationBusy(false);
  }
});

$("resetIntegrationPrompt").addEventListener("click", function () {
  $("integrationPrompt").value = DEFAULT_REPORT_PROMPT;
  updateIntegrationPromptHints();
  $("integrationPromptStatus").textContent = "Default prompt loaded. Save prompt to apply it.";
  $("integrationPromptStatus").className = "message";
});

$("replaceIntegrationKey").addEventListener("click", function () {
  $("integrationApiKey").hidden = false;
  $("integrationKeyLabel").hidden = false;
  $("replaceIntegrationKey").hidden = true;
  $("integrationApiKey").focus();
});

$("saveIntegrationButton").addEventListener("click", async function () {
  var apiKey = $("integrationApiKey").value.trim();
  var button = $("saveIntegrationButton");
  setIntegrationStatus("Saving integration...");
  setIntegrationBusy(true);
  try {
    var body = integrationFormSettings();
    if (apiKey) body.api_key = apiKey;
    var settings = await requestIntegrationApi("/api/integrations", "PUT", body);
    renderIntegrationSettings(settings);
    setIntegrationStatus("Integration settings saved.");
  } catch (error) {
    setIntegrationStatus(error.message, "err");
  } finally {
    $("integrationApiKey").value = "";
    setIntegrationBusy(false);
    button.disabled = false;
  }
});

$("testIntegrationButton").addEventListener("click", async function () {
  var apiKey = $("integrationApiKey").value.trim();
  if (!apiKey) {
    $("integrationApiKey").hidden = false;
    $("integrationKeyLabel").hidden = false;
    $("replaceIntegrationKey").hidden = true;
    $("integrationApiKey").focus();
    setIntegrationStatus(aiIntegrationSettings && aiIntegrationSettings.has_key
      ? "Re-enter the API key to test it."
      : "Enter an API key to test it.", "err");
    return;
  }
  setIntegrationStatus("Testing provider key...");
  setIntegrationBusy(true);
  try {
    var body = integrationFormSettings();
    if (apiKey) body.api_key = apiKey;
    var result = await requestIntegrationApi("/api/test-key", "POST", body);
    setIntegrationStatus(result.message || "Provider key is valid.");
  } catch (error) {
    setIntegrationStatus(error.message, "err");
  }
  setIntegrationBusy(false);
});

$("removeIntegrationButton").addEventListener("click", async function () {
  if (!window.confirm("Remove your saved AI API key?")) return;
  setIntegrationStatus("Removing saved key...");
  setIntegrationBusy(true);
  try {
    var settings = await requestIntegrationApi("/api/integrations", "DELETE");
    renderIntegrationSettings(settings);
    setIntegrationStatus("Saved API key removed.");
  } catch (error) {
    setIntegrationStatus(error.message, "err");
  } finally {
    setIntegrationBusy(false);
  }
});
