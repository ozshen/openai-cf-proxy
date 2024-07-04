/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npx wrangler dev src/index.js` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npx wrangler publish src/index.js --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

import proxyComs from "./proxy-coms"; // verify enable
import proxyCors from "./proxy-cors"; // verify disable

async function handleOptions(request) {
  let headers = request.headers;
  if (headers.get("Origin") !== null && headers.get("Access-Control-Request-Method") !== null && headers.get("Access-Control-Request-Headers") !== null) {
    const headersCors = {
      "access-control-allow-origin": headers.get("Origin") || "*",
      "Access-Control-Max-Age": "86400",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-allow-headers": headers.get("Access-Control-Request-Headers") || "Content-Type, Authorization",
    };

    return new Response(null, {
      headers: headersCors,
    });
  } else {
    return new Response(null, {
      headers: {
        Allow: "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      },
    });
  }
}

async function handleRequest(request, env) {
  if (request.method === "OPTIONS") {
    return handleOptions(request);
  }

  if (env && !!env.ENABLE_AUTH) {
    return proxyComs(request, env);
  } else {
    return proxyCors(request);
  }

  //logger
  //sematext.log(request, response);
}

const sematext = {
  config: {
    // Docs: https://sematext.com/docs/
    sematextToken: "00000000-0000-0000-0000-000000000000",
  },
  buildBody: (request, response) => {
    const hua = request.headers.get("user-agent");
    const hip = request.headers.get("cf-connecting-ip");
    const hrf = request.headers.get("referer");
    const url = new URL(request.url);

    const body = {
      method: request.method,
      statusCode: response.status,
      clientIp: hip,
      referer: hrf,
      userAgent: hua,
      host: url.host,
      path: url.pathname,
      proxyHost: null,
    };

    if (body.path.includes(".") && body.path != "/" && !body.path.includes("favicon.ico")) {
      try {
        let purl = fixUrl(decodeURIComponent(body.path.substring(1)));

        body.path = purl;
        body.proxyHost = new URL(purl).host;
      } catch {}
    }

    return {
      method: "POST",
      body: JSON.stringify(body),
    };
  },
  log: (request, response) => {
    if (config.sematextToken.length == 0) return;
    let url = `https://logsene-receiver.sematext.com/${config.sematextToken}/example/`;
    const body = sematext.buildBody(request, response);
    fetch(url, body);
  },
};

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env).catch((err) => new Response(err, { status: 408 }));
  },
};
