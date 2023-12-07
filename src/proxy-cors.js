import HomeHtml from "./index.html";

const dropReferer = false;

async function handler(request, env, url) {
  // request headers
  let reqHeaders = new Headers(request.headers),
    outBody,
    outStatus = 200,
    outStatusText = "OK",
    outCt = null,
    outHeaders = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        reqHeaders.get("Access-Control-Allow-Headers") || "Accept, Authorization, Cache-Control, Content-Type, DNT, If-Modified-Since, Keep-Alive, Origin, User-Agent, X-Requested-With, Token, x-access-token",
    });

  try {
    let fetchUrl = url.pathname;

    if (url.pathname === "/") {
      return new Response(
        renderTemplate(HomeHtml, {
          url: url.origin,
        }),
        {
          status: 200,
          headers: { "content-type": "text/html;charset=utf-8" },
        }
      );
    }

    if (fetchUrl.startsWith("/")) {
      fetchUrl = decodeURIComponent(fetchUrl.substr(1));
    }

    if (request.method == "OPTIONS" || fetchUrl.length < 3 || fetchUrl === "robots.txt" || fetchUrl === "favicon.ico" || fetchUrl.indexOf(".") === -1) {
      return new Response(`User-agent: *\nDisallow: ${fetchUrl}`, { status: 404 });
    } else {
      // fetchOptions
      let fp = {
        method: request.method,
        headers: {},
      };

      // headers
      const dropHeaders = ["content-length", "content-type", "host"];
      if (dropReferer) dropHeaders.push("referer");
      let he = reqHeaders.entries();
      for (let h of he) {
        const key = h[0],
          value = h[1];
        if (!dropHeaders.includes(key)) {
          fp.headers[key] = value;
        }
      }

      // check body
      if (["POST", "PUT", "PATCH", "DELETE"].indexOf(request.method) >= 0) {
        const ct = (reqHeaders.get("content-type") || "").toLowerCase();
        if (ct.includes("application/json")) {
          fp.body = JSON.stringify(await request.json());
        } else if (ct.includes("application/text") || ct.includes("text/html")) {
          fp.body = await request.text();
        } else if (ct.includes("form")) {
          fp.body = await request.formData();
        } else {
          fp.body = await request.blob();
        }
      }

      let fr = await fetch(fixUrl(fetchUrl), fp);
      outCt = fr.headers.get("content-type");
      outStatus = fr.status;
      outStatusText = fr.statusText;
      outBody = fr.body;
    }
  } catch (err) {
    outCt = "application/json";
    outBody = JSON.stringify({
      code: -1,
      msg: JSON.stringify(err.stack) || err,
    });
    outStatus = 500;
  }

  //content-type
  if (outCt && outCt != "") {
    outHeaders.set("content-type", outCt);
  }

  let response = new Response(outBody, {
    status: outStatus,
    statusText: outStatusText,
    headers: outHeaders,
  });

  return response;
}

function fixUrl(url) {
  if (url.startsWith("/")) {
    url = decodeURIComponent(url.substr(1));
  }

  if (url.includes("://")) {
    return new URL(url);
  } else if (url.includes(":/")) {
    return new URL(url.replace(":/", "://"));
  } else if (!/^((http|https)?:\/\/)/.test(url)) {
    return new URL(url.replace(/^/, "http://"));
  } else {
    return new URL("http://" + url);
  }
}

function renderTemplate(content, data) {
  return content.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
    return data[key] || "";
  });
}

export default handler;
