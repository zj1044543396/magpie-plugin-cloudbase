# CloudBase provider for magpie

把腾讯云开发（CloudBase）的模型接进 magpie。装上之后登录一次，任何 agent 都能选 `cloudbase-plugin/deepseek-v4.1-flash`。

## 已验证

在本机 magpie 上完整跑通过：

```
magpie plugin add <本目录>
  ✓ added

magpie plugin login cloudbase
  ✓ signed in to CloudBase · its models are cloudbase-plugin/<model>

magpie plugin list
  cloudbase-plugin (CloudBase, 5 models)  signed in

magpie provider test cloudbase-plugin
  ✓ chat  163 ms · deepseek-v4.1-flash
```

## 安装

```bash
# 从 npm（发布后）
magpie plugin add npm:@zxx9527/magpie-plugin-cloudbase

# 从本地目录
magpie plugin add /path/to/magpie-plugin-cloudbase

# 从 git
magpie plugin add github:zj1044543396/magpie-plugin-cloudbase
```

## 登录

```bash
magpie plugin login cloudbase
```

提示会显示：

```
CloudBase - 粘贴凭据后回车，不能空着 (例如 txcloud-abc123:sk-cbg-xxxx):
```

**必须粘贴内容再回车**，空着回车会报 `magpie: the key is empty`。

粘贴的格式二选一：

| 格式 | 例子 | 什么时候用 |
|---|---|---|
| `环境ID:密钥` | `txcloud-abc123:sk-cbg-xxxx` | 自建网关，自动拼成 `https://txcloud-abc123.service.tcloudbase.com/v1` |
| `完整地址\|密钥` | `https://x.com/v1\|sk-cbg-xxxx` | 地址不规律时，官方网关也用它 |

> 为什么合成一个输入框：OpenCode 的 `api` 认证类型只给一个密钥输入框，多字段的 `prompts` 只有 `oauth` 类型才支持。

登录后切换模型：

```bash
magpie models                                   # 看 cloudbase-plugin/ 下有哪些
magpie claude cloudbase-plugin/deepseek-v4.1-flash
magpie codex  cloudbase-plugin/deepseek-v4.1-flash
```

## 前置条件：你需要一个网关

这个插件只负责「告诉 magpie 有这么个供应商」，**它不含网关**。网关要另外部署一次：

| 方式 | 地址形态 | 密钥 |
|---|---|---|
| 自建网关（推荐，吃小程序成长计划免费额度） | `https://<环境ID>.service.tcloudbase.com/v1` | 网关的 `GATEWAY_API_KEY` |
| 官方网关（零部署，走套餐额度） | `https://<环境ID>.api.tcloudbasegateway.com/v1/ai/cloudbase` | 控制台创建的 API Key |

自建网关的部署见 `cloudbase-openai-gateway` 项目（一个 HTTP 云函数 + 一条 `/v1` 路由）。

## 暴露的模型

| 模型 | 说明 |
|---|---|
| `deepseek-v4.1-flash` | 默认，快、便宜 |
| `deepseek-v4.1-flash-1017` | 固定版本 |
| `hy4` / `hy4-flash` / `hy3` | 混元系 |

要增删模型，改 `index.mjs` 里的 `MODELS` 数组。

## 实现要点

插件就是一个 OpenCode provider plugin，导出 `auth` 和 `config`：

```js
export async function CloudBasePlugin({ client, magpie } = {}) {
  return {
    auth: {
      provider: 'cloudbase',
      methods: [{ type: 'api', label, placeholder }],
      async loader(getAuth) {
        const auth = await getAuth()
        const { baseURL, apiKey } = parseCredential(auth.key)  // 解析 envId:key
        return { baseURL, apiKey }                              // 每次请求前交给 magpie
      },
    },
    async config(config) {
      config.provider.cloudbase = {
        name: 'CloudBase',
        npm: '@ai-sdk/openai-compatible',   // ← 必须，否则 magpie 不知道用什么协议
        api: BASE_FALLBACK,
        models: { ... },
      }
    },
  }
}
```

两个容易踩的点：

1. **`npm` 字段必须写**。少了它，magpie 加载出的 provider 无法发出请求，登录也白搭。
2. **`magpie: the key is empty`** 是 magpie 自己的空输入校验，不是插件报错。

## 发布

### 发到 npm

```bash
# 1. 改 package.json 的 name 为你自己的 scope
#    "name": "@your-npm-name/opencode-cloudbase-auth"

# 2. 登录并发布
npm login
npm publish --access public
```

别人就能装：

```bash
magpie plugin add npm:@zxx9527/magpie-plugin-cloudbase
```

### 进 magpie 官方市场（能用短名）

`magpie plugin add cloudbase` 这种短名来自官方维护的 `@magpie-community/*` 包：

```
https://github.com/magpie-community/plugins
```

往该仓库 `packages/` 下加一个目录（参照 `packages/kiro`：`package.json` + `opencode.mjs` + `index.mjs` + `README.md`），提 PR 等合并。

> magpie 的 `about.json` / `skills.json` 是 **Skills 目录**（`owner/repo/skill` 格式），和插件市场不是一回事，插件不从那里分发。

## 文件

- `index.mjs` — 插件实现（provider 声明、凭据解析、loader）
- `opencode.mjs` — OpenCode 1.x 入口，只导出插件函数
- `package.json`
- `README.md`

## 许可

MIT
