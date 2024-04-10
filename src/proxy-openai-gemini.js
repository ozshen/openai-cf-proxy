// allowed request api paths
const validPaths = [
  // adapter
  "/v1/models",
  "/v1/completions",
  "/v1/chat/completions",
  "/dashboard/billing/usage",
  "/dashboard/billing/subscription",
  // direct
  `/${API_VERSION}/models/`
];

const API_VERSION = "v1beta";
const API_CLIENT = "genai-js/0.2.1"; // https://github.com/google/generative-ai-js/blob/d9c3f4d421100b5656d63e084ca93e418d00bf07/packages/main/src/requests/request.ts#L60

async function handler(request, env, url) {
  const headers = new Headers(request.headers);

  url.port = "443";
  url.protocol = "https";
  url.hostname = `generativelanguage.googleapis.com`;

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

  const MODEL = hasImageMessage(request.messages)
    ? "gemini-pro-vision"
    : "gemini-pro";
  const TASK = request.stream ? "streamGenerateContent" : "generateContent";
  
  let response;
  try {
    let url = `${BASE_URL}/${API_VERSION}/models/${MODEL}:${TASK}`;
    let apiKey = headers.get("Authorization").replace("Bearer ", "").trimEnd();
    if (request.stream) { url += "?alt=sse"; }
    
    response = await fetch(url, {
      method: request.method,
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
        "x-goog-api-client": API_CLIENT,
      },
      body: JSON.stringify(await transformRequest(request)), // try
    });     
  } catch (err) {
    console.error(err);
    return new Response(err, { status: 400, headers: {"Access-Control-Allow-Origin": "*"} });
  }

  let body;
  const headers_res = new Headers(response.headers);
  headers_res.set("Access-Control-Allow-Origin", "*");
  if (response.ok) {
    let id = generateChatcmplId(); //"chatcmpl-8pMMaqXMK68B3nyDBrapTDrhkHBQK";
    if (request.stream) {
      body = response.body
        .pipeThrough(new TextDecoderStream())
        .pipeThrough(new TransformStream({
          transform: parseStream,
          flush: parseStreamFlush,
          buffer: "" ,
        }))
        .pipeThrough(new TransformStream({
          transform: toOpenAiStream,
          flush: toOpenAiStreamFlush,
          MODEL, id, last: [],
        }))
        .pipeThrough(new TextEncoderStream());
    } else {
      body = await response.text();
      try {
        body = await processResponse(JSON.parse(body).candidates, MODEL, id);
      } catch (err) {
        console.error(err);
        response = { status: 500 };
        headers_res.set("Content-Type", "text/plain");
      }
    }
  } else {
    // Error: [400 Bad Request] User location is not supported for the API use.
    body = await response.text();
    try {
      const { code, status, message } = JSON.parse(body).error;
      body = `Error: [${code} ${status}] ${message}`;
    } catch (err) {
      // pass body as is
    }
    headers_res.set("Content-Type", "text/plain");
    //headers_res.delete("Transfer-Encoding");
  }
  return new Response(body, { status: response.status, statusText: response.statusText, headers_res });
}

const hasImageMessage = (messages) => { // OpenAI "model": "gpt-4-vision-preview"
  return messages.some(({ content }) => {
    return Array.isArray(content)
      ? content.some((it) => it.type === "image_url")
      : false;
  });
};

const harmCategory = [
  "HARM_CATEGORY_HATE_SPEECH",
  "HARM_CATEGORY_SEXUALLY_EXPLICIT",
  "HARM_CATEGORY_DANGEROUS_CONTENT",
  "HARM_CATEGORY_HARASSMENT"
];
const safetySettings = harmCategory.map((category) => ({
  category,
  threshold: "BLOCK_NONE",
}));
const fieldsMap = {
  stop: "stopSequences",
  // n: "candidateCount", // { "error": { "code": 400, "message": "Only one candidate can be specified", "status": "INVALID_ARGUMENT" } }
  max_tokens: "maxOutputTokens",
  temperature: "temperature",
  top_p: "topP",
  //..."topK"
};
const transformConfig = (req) => {
  let cfg = {};
  // if (typeof req.stop === "string") { req.stop = [req.stop]; } // no need
  for (let key in req) {
    const matchedKey = fieldsMap[key];
    if (matchedKey) {
      cfg[matchedKey] = req[key];
    }
  }
  return cfg;
};

const parseImg = async (url) => {
  let mimeType, data;
  if (url.startsWith("http://") || url.startsWith("https://")) {
    try {
      const response = await fetch(url);
      mimeType = response.headers.get("content-type");
      data = Buffer.from(await response.arrayBuffer()).toString("base64");
    } catch (err) {
      throw Error("Error fetching image: " + err.toString());
    }
  } else {
    const match = url.match(/^data:(?<mimeType>.*?)(;base64)?,(?<data>.*)$/);
    if (!match) {
      throw Error("Invalid image data: " + url);
    }
    ({ mimeType, data } = match.groups);
  }
  return {
    inlineData: {
      mimeType,
      data,
    },
  };
};

const transformMsg = async ({ role, content }) => {
  const parts = [];
  if (!Array.isArray(content)) {
    // system, user: string
    // assistant: string or null (Required unless tool_calls is specified.)
    parts.push({ text: content });
    return [{ role, parts }];
  }
  // user:
  // An array of content parts with a defined type, each can be of type text or image_url when passing in images.
  // You can pass multiple images by adding multiple image_url content parts.
  // Image input is only supported when using the gpt-4-visual-preview model.
  for (const item of content) {
    switch (item.type) {
    case "text":
      parts.push({ text: item.text });
      break;
    case "image_url":
      parts.push(await parseImg(item.image_url.url));
      break;
    default:
      throw TypeError(`Unknown "content" item type: "${item.type}"`);
    }
  }
  return [{ role, parts }];
};

const transformMessages = async (messages) => {
  const result = [];
  let lastRole;
  for (const item of messages) {
    item.role = item.role === "assistant" ? "model" : "user";
    if (item.role === "user" && lastRole === "user") {
      result.push([{ role: "model", parts: [{ text: "" }] }]);
    }
    lastRole = item.role;
    result.push(await transformMsg(item));
  }
  //console.info(JSON.stringify(result, 2));
  return result;
};

const transformRequest = async (req) => ({
  contents: await transformMessages(req.messages),
  safetySettings,
  generationConfig: transformConfig(req),
});

const generateChatcmplId = () => {
  const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "chatcmpl-";
  for (let i = 0; i <= 29; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

const reasonsMap = { //https://ai.google.dev/api/rest/v1/GenerateContentResponse#finishreason
  //"FINISH_REASON_UNSPECIFIED": // Default value. This value is unused.
  "STOP": "stop",
  "MAX_TOKENS": "length",
  "SAFETY": "content_filter",
  "RECITATION": "content_filter",
  "OTHER": "???"
  // :"function_call",
};
const transformCandidates = (key, cand) => ({
  index: cand.index,
  [key]: { role: "assistant", content: cand.content?.parts[0].text },
  logprobs: null,
  finish_reason: reasonsMap[cand.finishReason] || cand.finishReason,
});
const transformCandidatesMessage = transformCandidates.bind(null, "message");
const transformCandidatesDelta = transformCandidates.bind(null, "delta");

const processResponse = async (candidates, model, id) => {
  return JSON.stringify({
    id,
    object: "chat.completion",
    created: Date.now(),
    model,
    // system_fingerprint: "fp_69829325d0",
    choices: candidates.map(transformCandidatesMessage),
  });
};

const responseLineRE = /^data: (.*)(?:\n\n|\r\r|\r\n\r\n)/;
async function parseStream (chunk, controller) {
  chunk = await chunk;
  if (!chunk) { return; }
  this.buffer += chunk;
  do {
    const match = this.buffer.match(responseLineRE);
    if (!match) { break; }
    controller.enqueue(match[1]);
    this.buffer = this.buffer.substring(match[0].length);
  } while (true); // eslint-disable-line no-constant-condition
}
async function parseStreamFlush (controller) {
  if (this.buffer) {
    console.error("Invalid data:", this.buffer);
    controller.enqueue(this.buffer);
  }
}

function transformResponseStream (cand, stop, first) {
  const item = transformCandidatesDelta(cand);
  if (stop) { item.delta = {}; } else { item.finish_reason = null; }
  if (first) { item.delta.content = ""; } else { delete item.delta.role; }
  const data = {
    id: this.id,
    object: "chat.completion.chunk",
    created: Date.now(),
    model: this.MODEL,
    // system_fingerprint: "fp_69829325d0",
    choices: [item],
  };
  return "data: " + JSON.stringify(data) + delimiter;
}
const delimiter = "\n\n";
async function toOpenAiStream (chunk, controller) {
  const transform = transformResponseStream.bind(this);
  const line = await chunk;
  if (!line) { return; }
  let candidates;
  try {
    candidates = JSON.parse(line).candidates;
  } catch (err) {
    console.error(line);
    console.error(err);    
    const length = this.last.length || 1; // at least 1 error msg
    candidates = Array.from({ length }, (_, index) => ({
      finishReason: "error",
      content: { parts: [{ text: err }] },
      index,
    }));    
  }  
  for (const cand of candidates) { // !!untested with candidateCount>1
    if (!this.last[cand.index]) {
      controller.enqueue(transform(cand, false, "first"));
    }
    this.last[cand.index] = cand;
    if (cand.content) {// prevent empty data (e.g. when MAX_TOKENS)
      controller.enqueue(transform(cand));
    }
  }
}
async function toOpenAiStreamFlush (controller) {
  const transform = transformResponseStream.bind(this);
  if (this.last.length > 0) {
    for (const cand of this.last) {
      controller.enqueue(transform(cand, "stop"));
    }
    controller.enqueue("data: [DONE]" + delimiter);
  }  
}

export default handler;
