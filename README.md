# openai-cf-proxy

Utilize Cloudflare Worker scripts to swiftly proxy official API requests from OpenAI, with support for an adapter that enables seamless integration of projects already integrated with OpenAI into Azure OpenAI.

<a href="./README.md">English</a> |
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
