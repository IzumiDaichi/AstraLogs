import { authenticateRequest } from "../_shared/auth.js";
import { ApiError, errorResponse, jsonResponse, readJson, requireConfiguration } from "../_shared/http.js";

function cleanText(value, field, maxLength) {
  if (typeof value !== "string") {
    throw new ApiError(400, "invalid_input", field + " is required.");
  }
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!cleaned || cleaned.length > maxLength) {
    throw new ApiError(400, "invalid_input", "Check the " + field + " value and try again.");
  }
  return cleaned;
}

function cleanList(value, field) {
  if (!Array.isArray(value) || !value.length || value.length > 100) {
    throw new ApiError(400, "invalid_input", "The report must contain between 1 and 100 " + field + ".");
  }
  return value.map(function (item) { return cleanText(item, field, 2000); });
}

function validateEmail(value) {
  const email = cleanText(value, "Recipient email", 254);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "invalid_email", "Enter a valid recipient email address.");
  }
  return email;
}

export async function onRequestPost({ request, env }) {
  try {
    await authenticateRequest(request, env);
    requireConfiguration(env, ["MAKE_WEBHOOK_URL", "MAKE_SECRET"]);
    const body = await readJson(request);
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError(400, "invalid_input", "Request body must be an object.");
    }

    const userEmail = validateEmail(body.user_email);
    const periodCovered = cleanText(body.period_covered, "Period covered", 160);
    const specificTasks = cleanList(body.specific_tasks, "specific tasks");
    const output = cleanList(body.output, "completed-work sentences");
    if (specificTasks.length !== output.length) {
      throw new ApiError(400, "invalid_input", "Specific tasks and completed-work sentences must have matching counts.");
    }
    const totalCharacters = periodCovered.length + userEmail.length +
      specificTasks.concat(output).reduce(function (total, line) { return total + line.length; }, 0);
    if (totalCharacters > 30000) {
      throw new ApiError(413, "input_too_large", "The edited report is too long to send.");
    }

    let webhookUrl;
    try {
      webhookUrl = new URL(env.MAKE_WEBHOOK_URL);
    } catch (error) {
      throw new ApiError(503, "delivery_not_configured", "The Make.com webhook URL is not configured correctly.");
    }
    if (webhookUrl.protocol !== "https:" || webhookUrl.username || webhookUrl.password) {
      throw new ApiError(503, "delivery_not_configured", "The Make.com webhook URL must be a valid HTTPS URL.");
    }

    const controller = new AbortController();
    const timeout = setTimeout(function () { controller.abort(); }, 20000);
    let response;
    try {
      response = await fetch(webhookUrl.toString(), {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.MAKE_SECRET
        },
        body: JSON.stringify({
          user_email: userEmail,
          period_covered: periodCovered,
          specific_tasks: specificTasks,
          output: output
        }),
        signal: controller.signal
      });
    } catch (error) {
      throw new ApiError(502, "delivery_failed", "Make.com could not be reached. Try sending again.");
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) {
      throw new ApiError(502, "delivery_failed", "Make.com rejected delivery (HTTP " + response.status + ").");
    }
    return jsonResponse({ message: "Report delivered to Make.com." });
  } catch (error) {
    return errorResponse(error);
  }
}
