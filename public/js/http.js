async function readJsonResponse(response) {
  const raw = await response.text();
  const text = raw.trim();

  if (!text) return {};

  const contentType = response.headers.get("content-type") || "";
  if (text.startsWith("<")) {
    const status = response.status ? `HTTP ${response.status}` : "server response";
    const error = new Error(`The server returned an HTML page instead of JSON. Please log in again or check that the API route is correct. (${status})`);
    error.responseText = text.slice(0, 500);
    throw error;
  }

  if (contentType.includes("application/json") || text.startsWith("{") || text.startsWith("[")) {
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Server returned invalid JSON: ${error.message}`);
    }
  }

  const status = response.status ? `HTTP ${response.status}` : "server response";
  const hint = "The server returned a non-JSON response.";
  const error = new Error(`${hint} (${status})`);
  error.responseText = text.slice(0, 500);
  throw error;
}
