# openai-cf-proxy

利用Cloudflare Worker脚本快速代理OpenAI的官方API请求，并支持适配器，实现已接入OpenAI接口的项目无缝集成Azure OpenAI。

<a href="./README.md">English</a> |
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
