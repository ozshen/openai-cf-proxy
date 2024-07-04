import HomeHtml from "./index.html";
import InjectHtml from "./inject.html";

const proxyCookie = "__PROXY_VISITEDSITE__";

var serverDomain;
var serverHost;

async function handler(request, url) {

  // response headers
  let reqHeaders = new Headers(request.headers),
    outCt = null,
    outBody,
    outStatus = 200,
    outStatusText = "OK",
    outHeaders = new Headers({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers":
        reqHeaders.get("Access-Control-Allow-Headers") ||
        "Accept, Authorization, Cache-Control, Content-Type, DNT, If-Modified-Since, Keep-Alive, Origin, User-Agent, X-Requested-With, Token, x-access-token",
    });

  // home page
  const requrl = new URL(request.url);
  serverDomain = `${requrl.protocol}//${requrl.hostname}${requrl.port ? (`:` + requrl.port) : ''}/`;
  serverHost = requrl.host;

  // console.log("serverDomain: " + serverDomain)
  // console.log("serverHost: " + serverHost)

  let actualUrlStr = "";

  //verify actual url path
  try {
    if (url) {
      actualUrlStr = url.pathname ? url.pathname.substring(url.pathname.indexOf("/") + 1) : "" + url.search + url.hash;
    } else {
      actualUrlStr = requrl.pathname ? requrl.pathname.substring(requrl.pathname.indexOf("/") + 1) : "" + requrl.search + requrl.hash;
    }

    if (!actualUrlStr || actualUrlStr === "") {
      return getHTMLResponse(renderTemplate(HomeHtml, { url: requrl.origin }));
    }

    // if (!actualUrlStr.startsWith("http") && !actualUrlStr.includes("://")) {
    //   return Response.redirect(serverDomain + "https://" + actualUrlStr, 301);
    // }

    if (actualUrlStr === "robots.txt" || actualUrlStr === "favicon.ico") {
      return new Response(`User-agent: *\nDisallow: ${pathname}`, { status: 404 });
    }

    var test = actualUrlStr;
    if (!test.startsWith("http")) {
      test = "https://" + test;
    }
    var u = new URL(test);
    if (!u.host.includes(".")) {
      throw new Error();
    }
  } catch {
    //可能是搜素引擎，比如proxy.com/https://www.duckduckgo.com/ 转到 proxy.com/?q=key
    var siteCookie = request.headers.get("Cookie");
    var lastVisit;
    if (siteCookie != null && siteCookie != "") {
      lastVisit = genCookie(proxyCookie, siteCookie);

      if (lastVisit != null && lastVisit != "") {
        return Response.redirect(serverDomain + lastVisit + "/" + actualUrlStr, 301);
      }
    }
    return getHTMLResponse("Something is wrong while trying to get your cookie: <br> siteCookie: " + siteCookie + "<br>" + "lastSite: " + lastVisit);
  }

  // fetch handler
  try {

    // fetch url
    const fetchUrl = fixUrl(actualUrlStr);
    // fetch options
    let fetchOps = {
      method: request.method,
      headers: {},
      redirect: "manual"
    };
  
    // fetch headers
    const dropHeaders = ["content-length", "content-type", "host", "referer"];
    for (let [key, value] of request.headers.entries()) {
      if (!dropHeaders.includes(key)) {
        fetchOps.headers[key] = value;
      }
    }

    // check body
    if (["POST", "PUT", "PATCH", "DELETE"].indexOf(request.method) >= 0) {
      const ct = (reqHeaders.get("content-type") || "").toLowerCase();
      if (ct.includes("application/json")) {
        fetchOps.body = JSON.stringify(await request.json());
      } else if (ct.includes("application/text") || ct.includes("text/html")) {
        fetchOps.body = await request.text();
        fetchOps.body = fetchOps.body ? fetchOps.body.replaceAll(serverDomain, actualUrlStr).replaceAll(serverHost, fetchUrl.host) : fetchOps.body;
      } else if (ct.includes("form")) {
        fetchOps.body = await request.formData();
      } else {
        fetchOps.body = await request.blob();
      }
    }

    // fetching
    const fetchRes = await fetch(fetchUrl, fetchOps);
    outCt = fetchRes.headers.get("Content-Type");
    outStatus = fetchRes.status;
    outStatusText = fetchRes.statusText;
    outBody = fetchRes.body;
    // content-type
    if(outCt && outCt !== "") outHeaders.set("content-type", outCt);

    // out headers
    // for (let [key, value] of fetchRes.headers.entries()) {
    //   if(!outHeaders.has(key)){
    //     outHeaders.set(key, value);
    //   }
    // }
    // console.log("Content-Type: " + outCt);

    // redirect
    if (fetchRes.status === 301 || fetchRes.status === 302) {
      if (fetchRes.headers.get("Location") != null) {
        return Response.redirect(serverDomain + new URL(fetchRes.headers.get("Location"), actualUrlStr).href, 301);
      } else {
        return getHTMLResponse("the redirect url:" + response.headers.get("Location") + "<br>the url you are now at:" + actualUrlStr);
      }
    }

    // fetching response
    let outResponse = new Response(outBody, {
      status: outStatus,
      statusText: outStatusText,
      headers: outHeaders,
    });

    //#region try save cookie
    // try save cookie
    /*
    try {
      let headers = outResponse.headers;
      let resstatus = outResponse.status;
      let contentType = outCt;
      let cookieHeaders = [];
      if (contentType && contentType.includes("text/html") && resstatus == 200) {
        //如果是HTML再加cookie，因为有些网址会通过不同的链接添加CSS等文件
        let cookieValue = proxyCookie + "=" + fetchUrl.origin + "; Path=/; Domain=" + serverHost;
        console.log("cookieValue " + cookieValue)
        //origin末尾不带/
        //例如：console.log(new URL("https://www.baidu.com/w/s?q=2#e"));
        //origin: "https://www.baidu.com"
        headers.append("Set-Cookie", cookieValue);
      }
      // Collect all 'Set-Cookie' headers regardless of case
      for (let [key, value] of headers.entries()) {
        if (key.toLowerCase() === "set-cookie") {
          cookieHeaders.push({ headerName: key, headerValue: value });
        }
      }
      if (cookieHeaders.length > 0) {
        cookieHeaders.forEach((cookieHeader) => {
          let cookies = cookieHeader.headerValue.split(",").map((cookie) => cookie.trim());

          for (let i = 0; i < cookies.length; i++) {
            let parts = cookies[i].split(";").map((part) => part.trim());
            //console.log(parts);

            // Modify Path
            let pathIndex = parts.findIndex((part) => part.toLowerCase().startsWith("path="));
            let originalPath;
            if (pathIndex !== -1) {
              originalPath = parts[pathIndex].substring("path=".length);
            }
            let absolutePath = "/" + new URL(originalPath, actualUrlStr).href;

            if (pathIndex !== -1) {
              parts[pathIndex] = `Path=${absolutePath}`;
            } else {
              parts.push(`Path=${absolutePath}`);
            }

            // Modify Domain
            let domainIndex = parts.findIndex((part) => part.toLowerCase().startsWith("domain="));

            if (domainIndex !== -1) {
              parts[domainIndex] = `domain=${serverHost}`;
            } else {
              parts.push(`domain=${serverHost}`);
            }

            cookies[i] = parts.join("; ");
          }

          // Re-join cookies and set the header
          headers.set(cookieHeader.headerName, cookies.join(", "));
        });
      }
      console.log("contentType " + contentType)
    } catch (err) {
      console.error(err);
    }
    */
    //#endregion

    return outResponse;
  } catch (err) {
    outStatus = 500;
    outHeaders.set("content-type", "application/json");
    outBody = JSON.stringify({
      code: -1,
      msg: JSON.stringify(err.stack) || err,
    });
    return new Response(outBody, {
      status: outStatus,
      statusText: outStatusText,
      headers: outHeaders,
    });
  }
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
//https://stackoverflow.com/questions/5142337/read-a-javascript-cookie-by-name
function genCookie(cookiename, cookies) {
  // Get name followed by anything except a semicolon
  var cookiestring = RegExp(cookiename + "=[^;]+").exec(cookies);
  // Return everything after the equal sign, or an empty string if the cookie name not found
  return decodeURIComponent(!!cookiestring ? cookiestring.toString().replace(/^[^=]+./, "") : "");
}

function getHTMLResponse(html) {
  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}

export default handler;
