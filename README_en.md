# openai-cf-proxy

Utilize Cloudflare Worker scripts to swiftly proxy official API requests from OpenAI, while also supporting other LLMs interface adapters, converting various LLMs interface parameters into the standard format of the OpenAI interface, seamlessly replacing the OpenAI interface.

Currently supported adapters include:
Azure、gemini、

<a href="./README_en.md">English</a> |
<a href="./README_zh.md">中文</a>

### To initialize Cloudflare Worker

```shell
# install wrangler
npm i -g wrangler@latest

# login Cloudflare.
wrangler login

# create a kv_namespace then change binding ID in wrangler.toml
wrangler kv:namespace create "KV"

# you may want to check the kv_namespace list to obtain the ID
wrangler kv:namespace list
```

### To deploy Cloudflare Worker

```shell
npm i
npm run deploy
```

### To enjoy proxy
