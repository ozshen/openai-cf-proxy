// allowed request api paths
const validPaths = [
  // direct
  "/v1/models",
  "/v1/completions",
  "/v1/chat/completions",
  "/dashboard/billing/usage",
  "/dashboard/billing/subscription",
];
// reverse proxy to hostnames and return the original response, caching it in the process
const hostnames = ["api.openai.com"];

async function handler(request, env, url) {
  const headers = new Headers(request.headers);

  url.port = "443";
  url.protocol = "https";
  url.hostname = hostnames[Math.floor(Math.random() * hostnames.length)];

  if (!validPaths.some((prefix) => url.pathname.startsWith(prefix))) {
    return new Response('{"error": {"message": "not allowed path","type": "invalid_request_error"}}\n', { status: 401 });
  }

  // Only pass body if request method is not 'GET'
  const requestBody = request.method !== "GET" ? JSON.stringify(await request.json()) : null;
  return fetch(url, {
    method: request.method,
    headers: headers,
    body: requestBody,
  });
}

export default handler;
