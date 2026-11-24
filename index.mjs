/**
 * CloudBase provider for OpenCode / magpie.
 *
 * 提供 `cloudbase` 供应商，模型走腾讯云开发（CloudBase）的 OpenAI 兼容网关。
 *
 * 登录提供两种方式：
 *   1. oauth + prompts —— 分两步问「环境 ID」和「密钥」，最友好（默认）
 *   2. api —— 一行填 `环境ID:密钥`，作为纯 OpenCode 等 prompts 不渲染时的后备
 *
 * loader 从两种凭据里都解析出 { baseURL, apiKey } 交给 magpie。
 */

const ID = "cloudbase"

/** 网关不可解析时的占位地址；正常登录后会被 loader 覆盖 */
const BASE_FALLBACK = "https://YOUR-ENV-ID.service.tcloudbase.com/v1"

/** 暴露的模型。字段与 OpenCode 的 model 结构对齐 */
const MODELS = [
  { id: "deepseek-v4.1-flash", name: "DeepSeek V4.1 Flash", context: 128000, output: 32000, reasoning: false },
  { id: "deepseek-v4.1-flash-1017", name: "DeepSeek V4.1 Flash 1017", context: 128000, output: 32000, reasoning: false },
  { id: "hy4", name: "Hunyuan 4", context: 128000, output: 16000, reasoning: false },
  { id: "hy4-flash", name: "Hunyuan 4 Flash", context: 128000, output: 16000, reasoning: false },
  { id: "hy3", name: "Hunyuan 3", context: 32000, output: 8000, reasoning: false },
]

/**
 * 把「环境ID:密钥」或「完整地址|密钥」解析成 { baseURL, apiKey }。
 * 解析不出来返回 undefined。
 */
function parseCredential(raw) {
  const s = String(raw ?? "").trim()
  if (!s) return undefined

  // 完整地址|密钥
  const pipe = s.indexOf("|")
  if (pipe > 0) {
    const url = s.slice(0, pipe).trim()
    const key = s.slice(pipe + 1).trim()
    if (!/^https?:\/\//i.test(url) || !key) return undefined
    return { baseURL: url.replace(/\/+$/, ""), apiKey: key }
  }

  // 环境ID:密钥（兼容中文冒号）
  const m = /^(txcloud-[A-Za-z0-9]+)\s*[:：]\s*(.+)$/.exec(s)
  if (m) {
    return { baseURL: `https://${m[1]}.service.tcloudbase.com/v1`, apiKey: m[2].trim() }
  }

  return undefined
}

/** 从 envId + key 组装出与 parseCredential 兼容的字符串 */
function joinCredential(envId, apiKey) {
  return `${String(envId).trim()}:${String(apiKey).trim()}`
}

/** 环境 ID 的输入校验 */
function validateEnvId(value) {
  const s = String(value ?? "").trim()
  if (!s) return "环境 ID 不能为空"
  if (!/^[A-Za-z0-9-]+$/.test(s)) return "环境 ID 只能包含字母、数字和连字符"
  return undefined
}

/** 密钥的输入校验 */
function validateKey(value) {
  return String(value ?? "").trim() ? undefined : "密钥不能为空，直接从网关部署结果里复制过来"
}

/** OpenCode / magpie 的插件入口 */
export async function CloudBasePlugin({ client, magpie } = {}) {
  return {
    auth: {
      provider: ID,

      methods: [
        // 主路径：分两步问答，最不容易填错
        {
          type: "oauth",
          label: "CloudBase（分步填写环境 ID 和密钥）",
          prompts: [
            {
              type: "text",
              key: "envId",
              message: "云开发环境 ID（控制台环境详情里可以看到）",
              placeholder: "txcloud-xxxxxxxx",
              validate: validateEnvId,
            },
            {
              type: "text",
              key: "apiKey",
              message: "网关密钥（自建网关的 GATEWAY_API_KEY）",
              placeholder: "sk-cbg-xxxxxxxx",
              validate: validateKey,
            },
          ],
          authorize: (inputs) => ({
            url: "",
            instructions: "凭据已收到，正在保存。",
            method: "auto",
            callback: async () => {
              const envId = String(inputs?.envId ?? "").trim()
              const apiKey = String(inputs?.apiKey ?? "").trim()
              if (!envId || !apiKey) {
                return { type: "failed", error: "环境 ID 和密钥都不能为空" }
              }
              return {
                type: "success",
                provider: ID,
                access: joinCredential(envId, apiKey),
                refresh: "",
                expires: 0,
                accountId: envId,
              }
            },
          }),
        },

        // 后备：纯 OpenCode 等不渲染 prompts 的环境，一行填完
        {
          type: "api",
          label: "CloudBase（一行填 环境ID:密钥）",
          placeholder: "例如 txcloud-abc123:sk-cbg-xxxx",
        },
      ],

      /**
       * 每次请求前由 magpie / OpenCode 调用。
       * oauth 的凭据在 auth.access，api 的在 auth.key，两者格式一致。
       */
      async loader(getAuth) {
        const auth = await getAuth()
        const raw =
          auth?.type === "oauth" && auth.access
            ? auth.access
            : auth?.type === "api" && auth.key
              ? auth.key
              : undefined
        if (!raw) return {}

        const parsed = parseCredential(raw)
        if (!parsed) return {}

        return { baseURL: parsed.baseURL, apiKey: parsed.apiKey }
      },
    },

    /** 在 OpenCode / magpie 的配置里声明这个供应商 */
    async config(config) {
      config.provider ??= {}
      config.provider[ID] = {
        name: "CloudBase",
        // 协议实现包：OpenAI 兼容接口用这个（magpie 内置支持）。
        // 少了这个字段，OpenCode 不知道该用什么协议发请求。
        npm: "@ai-sdk/openai-compatible",
        api: BASE_FALLBACK,
        models: Object.fromEntries(
          MODELS.map((m) => [
            m.id,
            { name: m.name, limit: { context: m.context, output: m.output } },
          ])
        ),
      }
    },
  }
}

/** 供测试使用 */
export const _internal = { parseCredential, joinCredential, validateEnvId, validateKey, MODELS, ID, BASE_FALLBACK }
