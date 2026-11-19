export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

export function errorResponse(error) {
  if (error instanceof ApiError) {
    return jsonResponse({ code: error.code, message: error.message }, error.status);
  }
  return jsonResponse({
    code: "internal_error",
    message: "The service could not complete the request. Please try again."
  }, 500);
}

export async function readJson(request) {
  try {
    return await request.json();
  } catch (error) {
    throw new ApiError(400, "invalid_json", "Request body must be valid JSON.");
  }
}

export function requireConfiguration(env, names) {
  if (names.some(function (name) { return !env[name]; })) {
    throw new ApiError(503, "service_not_configured", "The report service is not fully configured.");
  }
}

export async function fetchWithTimeout(url, options, timeoutMs, serviceName) {
  const controller = new AbortController();
  const timeout = setTimeout(function () { controller.abort(); }, timeoutMs);
  const service = serviceName || "AI provider";
  try {
    return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
  } catch (error) {
    if (error.name === "AbortError") {
      throw new ApiError(504, "upstream_timeout", service + " took too long to respond. Please try again.");
    }
    throw new ApiError(502, "upstream_unavailable", service + " could not be reached. Please try again.");
  } finally {
    clearTimeout(timeout);
  }
}
