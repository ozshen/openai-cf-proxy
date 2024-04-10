
const apiVersion="2023-12-01-preview"

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
    return new Response(`{"error": {"message": "not allowed path ${url.pathname}","type": "invalid_request_error"}}\n`, { status: 401 });
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

  if (url.pathname.startsWith("//")) {
    url.pathname = url.pathname.replace('/',"")
  }
  if (url.pathname === '/v1/chat/completions') {
    var path="chat/completions"
  } else if (url.pathname === '/v1/images/generations') {
    var path="images/generations"
  } else if (url.pathname === '/v1/completions') {
    var path="completions"
  } else if (url.pathname === '/v1/models') {
    return handleModels(request)
  } else {
    return new Response('404 Not Found', { status: 404 })
  }

  let body;
  if (request.method === 'POST') {
    body = await request.json();
  }

  const modelName = body?.model || '';  
  const deployName = modelName.startsWith("gpt-3.5") ? env.DEPLOY_NAME_GPT35 : modelName.startsWith("gpt-4") ? env.DEPLOY_NAME_GPT4 : modelName.startsWith("dall-e") ? env.DEPLOY_NAME_DALLE3 : 'gpt-3.5-turbo';

  const fetchAPI = `https://${env.AZURE_RESOURCE}.openai.azure.com/openai/deployments/${deployName}/${path}?api-version=${apiVersion}`

  const apiKey = headers.get('Authorization')?.replace('Bearer ', '');
  if (!apiKey) {
    return new Response("Not allowed", {
      status: 403
    });
  }

  const payload = {
    method: request.method,
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: typeof body === 'object' ? JSON.stringify(body) : '{}',
  };

  let response = await fetch(fetchAPI, payload);
  response = new Response(response.body, response);
  response.headers.set("Access-Control-Allow-Origin", "*");

  if (body?.stream != true){
    return response
  } 

  let { readable, writable } = new TransformStream()
  stream(response.body, writable);
  return new Response(readable, response);
}

export default handler;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// support printer mode and add newline
async function stream(readable, writable) {
  const reader = readable.getReader();
  const writer = writable.getWriter();

  // const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
// let decodedValue = decoder.decode(value);
  const newline = "\n";
  const delimiter = "\n\n"
  const encodedNewline = encoder.encode(newline);

  let buffer = "";
  while (true) {
    let { value, done } = await reader.read();
    if (done) {
      break;
    }
    buffer += decoder.decode(value, { stream: true }); // stream: true is important here,fix the bug of incomplete line
    let lines = buffer.split(delimiter);

    // Loop through all but the last line, which may be incomplete.
    for (let i = 0; i < lines.length - 1; i++) {
      await writer.write(encoder.encode(lines[i] + delimiter));
      await sleep(20);
    }

    buffer = lines[lines.length - 1];
  }

  if (buffer) {
    await writer.write(encoder.encode(buffer));
  }
  await writer.write(encodedNewline)
  await writer.close();
}

async function handleModels(request) {
  const data = {
    "object": "list",
    "data": []  
  };

  for (let key in mapper) {
    data.data.push({
      "id": key,
      "object": "model",
      "created": 1677610602,
      "owned_by": "openai",
      "permission": [{
        "id": "modelperm-M56FXnG1AsIr3SXq8BYPvXJA",
        "object": "model_permission",
        "created": 1679602088,
        "allow_create_engine": false,
        "allow_sampling": true,
        "allow_logprobs": true,
        "allow_search_indices": false,
        "allow_view": true,
        "allow_fine_tuning": false,
        "organization": "*",
        "group": null,
        "is_blocking": false
      }],
      "root": key,
      "parent": null
    });  
  }

  const json = JSON.stringify(data, null, 2);
  return new Response(json, {
    headers: { 'Content-Type': 'application/json' },
  });
}
