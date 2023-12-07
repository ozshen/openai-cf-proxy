// allowed request api paths
const validPaths = [
  // adapter
  "/v1/models",
  "/v1/completions",
  "/v1/chat/completions",
  "/dashboard/billing/usage",
  "/dashboard/billing/subscription",
  // direct
  "/chat/completions",
  "/completions",
];

async function handler(request, env, url) {
  const headers = new Headers(request.headers);

  url.port = "443";
  url.protocol = "https";
  url.hostname = `${env.AZURE_RESOURCE}.openai.azure.com`;

  if (!validPaths.some((prefix) => url.pathname.startsWith(prefix))) {
    return new Response('{"error": {"message": "not allowed path","type": "invalid_request_error"}}\n', { status: 401 });
  }

  if (env.ENABLE_ADAPTER == "1") return adapter(request, env, url);

  // Only pass body if request method is not 'GET'
  const requestBody = request.method !== "GET" ? JSON.stringify(await request.json()) : null;
  return fetch(url, {
    method: request.method,
    headers: headers,
    body: requestBody,
  });
}

async function adapter(request, env, url) {
  const headers = new Headers(request.headers);

  // Only pass body if request method is not 'GET'
  const requestBody = request.method !== "GET" ? JSON.stringify(await request.json()) : null;
  return fetch(url, {
    method: request.method,
    headers: headers,
    body: requestBody,
  });
}

export default handler;
