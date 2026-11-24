# CloudBase provider for magpie

把腾讯云开发（CloudBase）的模型接进 magpie 作为普通 provider。装上之后分两步填一次凭据，任何 agent 都能选 `cloudbase-plugin/deepseek-v4.1-flash`。

## 先说一件必须知道的事

**成长计划赠送的额度只在 CloudBase SDK 通道上生效。** 直接调用 CloudBase 的 `/v1/ai/*` 模型端点会被拒绝：

```
403 AI_CHANNEL_NOT_ALLOWED
```

所以这个插件**不能**直连官方模型端点。必须在自己环境里部署一个网关云函数（见下），由它在云函数内部用 `@cloudbase/node-sdk` 调模型——那条路才被允许，也才吃赠送额度。

```
Agent ─► magpie ─► 本插件 ──HTTP──► 你的网关云函数 ──SDK──► 模型
```

## 已实测

在本机 magpie 上完整跑通：

```
magpie plugin add <本目录>            ✓ added
magpie plugin login cloudbase         分两步问答，✓ signed in
magpie plugin list                    cloudbase-plugin (CloudBase, 5 models)  signed in as txcloud-xxxx
magpie provider test cloudbase-plugin ✓ chat  1487 ms · deepseek-v4.1-flash
npm test                              22 个单元测试全过
```

## 安装

```bash
# 从 npm
magpie plugin add npm:@zxx9527/magpie-plugin-cloudbase

# 从 GitHub（国内 npm 访问不通时用这个）
magpie plugin add github:zj1044543396/magpie-plugin-cloudbase

# 从本地目录
magpie plugin add /path/to/magpie-plugin-cloudbase
```

## 登录

```bash
magpie plugin login cloudbase
```

会先问你用哪种方式：

```
How do you sign in to CloudBase?
  1. CloudBase（分步填写环境 ID 和密钥）     ← 推荐
  2. CloudBase（一行填 环境ID:密钥）          ← 纯 OpenCode 等不渲染 prompts 时用
```

选 `1`，然后分两步填：

```
云开发环境 ID（控制台环境详情里可以看到） (txcloud-xxxxxxxx): txcloud-你的环境ID
网关密钥（自建网关的 GATEWAY_API_KEY） (sk-cbg-xxxxxxxx): sk-cbg-你的密钥
```

登录后：

```bash
magpie plugin list                    # 应显示 signed in as <你的环境ID>
magpie models                         # 出现 cloudbase-plugin/deepseek-v4.1-flash 等
magpie claude cloudbase-plugin/deepseek-v4.1-flash
```

退出登录：`magpie plugin logout cloudbase`

> 选 `2` 时，那一行要填 `环境ID:密钥`（例如 `txcloud-abc123:sk-cbg-xxxx`），也支持 `完整地址|密钥`。
> **空着回车会报 `magpie: the key is empty`**，这是 magpie 自己的校验。

## 前置条件：先部署网关

插件只负责「告诉 magpie 有这么个供应商」，**不含网关**。网关要另外部署一次到**你自己的**环境（这样才消耗你自己的额度）：

| 你需要 | 说明 |
|---|---|
| 云开发环境 | 个人版即可，已开通 AI 能力 |
| 网关云函数 | 见 `cloudbase-openai-gateway` 项目，部署后得到一个 `https://<环境ID>.service.tcloudbase.com/v1` |

部署要点：HTTP 云函数 + `/v1` 路由 + 自己的 `GATEWAY_API_KEY`。完整步骤在那个项目的 README 里。

## 暴露的模型

| 模型 | 上下文 |
|---|---|
| `deepseek-v4.1-flash` | 128K |
| `deepseek-v4.1-flash-1017` | 128K |
| `hy4` | 128K |
| `hy4-flash` | 128K |
| `hy3` | 32K |

要增删模型，改 `index.mjs` 里的 `MODELS` 数组。

## 排查

错误都以 OpenAI 风格返回 `{ error: { message, code } }`。

| 现象 | 原因 / 处理 |
|---|---|
| `magpie: the key is empty` | 登录时没输入就回车了，重新登录并粘贴凭据 |
| `provider test` 401 `gateway_not_configured` | 网关云函数没设 `GATEWAY_API_KEY` 环境变量 |
| 401 `invalid_api_key` | 填的密钥和网关环境变量里的不一致 |
| 404 `INVALID_PATH` | base URL 少了 `/v1`，或 HTTP 网关路由没绑到 `/v1` |
| 404 页面不存在 | 云函数名字不是 `openai-gateway`，或没部署成功 |
| 502 `upstream_error` 提到额度/模型 | 成长计划额度用尽，或模型未在控制台开启 |
| 403 `AI_CHANNEL_NOT_ALLOWED` | **说明绕过了网关**，直连了 CloudBase 官方端点；必须走自建网关 |
| 流式不逐字 | 中间有代理/CDN 缓冲；网关已带 `X-Accel-Buffering: no` |
| 登录后模型列表为空 | 凭据格式不对，`magpie plugin logout cloudbase` 后重来 |

## 开发

```bash
npm test        # 22 个单元测试，覆盖凭据解析、输入校验、插件结构；不联网
```

## 实现要点

插件就是一个 OpenCode provider plugin，导出 `auth` 和 `config`：

```js
export async function CloudBasePlugin({ client, magpie } = {}) {
  return {
    auth: {
      provider: 'cloudbase',
      methods: [
        { type: 'oauth', prompts: [envIdPrompt, keyPrompt], authorize },  // 分步问答
        { type: 'api', label, placeholder },                              // 一行填，后备
      ],
      async loader(getAuth) {
        const auth = await getAuth()
        // oauth 的凭据在 auth.access，api 的在 auth.key
        return { baseURL, apiKey }   // 每次请求前交给 magpie
      },
    },
    async config(config) {
      config.provider.cloudbase = {
        name: 'CloudBase',
        npm: '@ai-sdk/openai-compatible',   // ← 必须，否则发不出请求
        api: BASE_FALLBACK,
        models: { ... },
      }
    },
  }
}
```

三个容易踩的点：

1. **`npm` 字段必须写**。少了它 magpie 加载出的 provider 无法发出请求，登录也白搭。
2. **分步问答要用 `oauth` 类型**。`prompts` 只有 `oauth` 方法支持；`api` 类型只有一个密钥输入框。`authorize` 返回 `{ url: "", method: "auto", callback }`，`callback` 里直接返回 `{ type: "success", provider, access, ... }` 即可，不需要真的跳浏览器。
3. **两种凭据格式统一**。`loader` 要把 `auth.access`（oauth）和 `auth.key`（api）都解析成同一个 `{ baseURL, apiKey }`。

## 发布

### npm

```bash
npm config set registry https://registry.npmjs.org   # 镜像源不能发布
npm login
npm publish --access public --otp=验证码              # 开了 2FA 必须带 otp
npm config set registry https://registry.npmmirror.com   # 发完切回镜像
```

### 进 magpie 官方市场（可用短名）

`magpie plugin add cloudbase` 这种短名来自官方维护的 `@magpie-community/*` 包：

```
https://github.com/magpie-community/plugins
```

往 `packages/` 下加一个目录（参照 `packages/kiro`），提 PR 等合并。

## 相关

- 网关部署：`cloudbase-openai-gateway` 项目
- 官方模型 API 参考：`https://docs.cloudbase.net/ai/model/openai-sdk-access`

## 许可

MIT
