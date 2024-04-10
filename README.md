# openai-cf-proxy

_✨ Cloudflare Worker反代，通过标准的 OpenAI API 格式访问所有的大模型 ✨_

利用Cloudflare Worker脚本快速代理OpenAI的官方API请求，支持将各类LLMs接口参数转换为OpenAI接口的标准格式，可无缝替代OpenAI接口。

<a href="./README_en.md">English</a> |
<a href="./README_zh.md">中文</a>

### 初始化Cloudflare Worker

首先你需要准备好 nodejs 环境。

```shell
# 安装wrangler
npm i -g wrangler@latest

# 登录Cloudflare
wrangler login

# 创建kv_namespace，然后在wrangler.toml中更改绑定ID
wrangler kv:namespace create "KV"

# 您可能希望检查kv_namespace列表以获取ID
wrangler kv:namespace list
```

### 部署到Cloudflare Worker

```shell
npm i
npm run deploy
```

### 享受代理的乐趣
