import proxyCors from "./proxy-cors";
import openaiApi from "./proxy-openai-offical";
import azureApi from "./proxy-openai-azure";
import geminiApi from "./proxy-openai-gemini";

const APIPaths = {
  sysctl: "sysctl",
  openai: "openai",
  azure: "azure",
  gemini: "gemini",
  proxy: "proxy",
};

async function listUser(env, params) {
  const users = (await env.KV.get("users", { type: "json" })) || {};
  const list = [];
  const p1 = params && params.length > 0 ? params[0] : null;

  if (p1 && p1.length > 0) {
    for (const u in users) {
      if (u.indexOf(p1) > -1) {
        list.push({ user: u, key: users[u].key });
      }
    }
  } else {
    for (const u in users) {
      list.push({ user: u, key: users[u].key });
    }
  }

  return new Response(
    JSON.stringify({
      data: list,
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

async function signinUser(env, params) {
  const p1 = params && params.length > 0 ? params[0] : null;
  const p2 = params && params.length > 1 ? params[1] : null;
  if (!p1?.length) throw "invalid params";

  let user = p1;
  let key = await generatePKey();
  if (p2?.length > 0) key = p2;

  const users = (await env.KV.get("users", { type: "json" })) || {};
  users[user] = { key };
  await env.KV.put("users", JSON.stringify(users));

  return new Response(
    JSON.stringify({
      data: { user: user, key: key },
    }),
    { headers: { "Content-Type": "application/json" } }
  );
}

async function deleteUser(env, params) {
  const p1 = params && params.length > 0 ? params[0] : null;
  if (!p1?.length) throw "invalid params";

  const users = (await env.KV.get("users", { type: "json" })) || {};
  if (!users[p1]) throw "user not found";

  delete users[p1];
  await env.KV.put("users", JSON.stringify(users));

  return new Response(JSON.stringify({ data: { user: p1 } }), {
    headers: { "Content-Type": "application/json" },
  });
}

async function generatePKey() {
  const characters = "abcdefghijklmnopqrstuvwxyz0123456789";
  let key = "pt-";
  for (let i = 0; i < 32; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    key += characters.charAt(randomIndex);
  }
  return key;
}

//verify user's pkey
async function verifyUrl(request, env) {
  const url = new URL(request.url);
  const [_, p1, p2, ...params] = url.pathname.split("/");

  // match APIPaths
  if (p1 && Object.values(APIPaths).some((prefix) => p1.startsWith(prefix))) {
    const uacpkey = p2 || ""; //pkey
    if (p1 === APIPaths.sysctl) {

      if (!env.SYS_SECRERT || uacpkey !== env.SYS_SECRERT) {
        throw "invalid uac pkey";
      }

      console.log(`pkey: ${uacpkey}`);

      // format pathname
      url.pathname = [_, ...params].join("/");
      return { route: p1, url };
    } else if(env.KV){
      // verify uac
      const users = (await env.KV.get("users", { type: "json" })) || {};
      if (users) {
        const uname = url.host;
        const ulist = Object.keys(users);
        if (ulist.length > 0) {
          if (!users[uname]) throw "invalid uac name";
          if (!uacpkey) throw "invalid uac pkey";
          if (uacpkey.toLowerCase() !== users[uname].key.toLowerCase()) throw "uac pkey required";

          console.log(`name ${uname} acepted, pkey: ${uacpkey}`);

          // format pathname
          url.pathname = [_, ...params].join("/");
          return { route: p1, url };
        }
      } else {
        throw "invalid users";
      }
      
    } else {
      // format pathname
      url.pathname = [_, p2, ...params].join("/");
    }
  }

  return { route: undefined, url };
}

// uac controller api
async function providApi(request, env, url) {
  try {
    const [_, p1, ...params] = url.pathname.split("/");

    if (p1 === "users") {
      return listUser(env, params);
    } else if (p1 === "signin" || p1 === "reset") {
      return signinUser(env, params);
    } else if (p1 === "delete" && request.method === "POST") {
      return deleteUser(env, params);
    }

    return new Response(null, { status: 403, statusText: "invalid action" });
  } catch (error) {
    return new Response(JSON.stringify({ error: error }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}

async function handler(request, env) {
  // match route and verify pkey
  const { route, url } = await verifyUrl(request, env);
  switch (route) {
    case APIPaths.sysctl:
      return providApi(request, env, url);
    case APIPaths.openai:
      return openaiApi(request, env, url);
    case APIPaths.azure:
      return azureApi(request, env, url);
    case APIPaths.gemini:
      return geminiApi(request, env, url);
    case APIPaths.proxy:
      return proxyCors(request, url);
  }

  return new Response(null, { status: 444 });
}

export default handler;
