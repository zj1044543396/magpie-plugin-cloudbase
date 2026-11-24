/**
 * CloudBase provider for OpenCode / magpie.
 *
 * 提供 `cloudbase` 供应商，模型走腾讯云开发（CloudBase）的 OpenAI 兼容网关。
 *
 * 认证方式：API Key。因为 api 类型只有一个输入框，环境 ID 编码进密钥里，
 * 支持两种写法（登录时填到 API Key 输入框）：
 *
 *   1. txcloud-xxxxxxxx:sk-cbg-xxxxxxxx        → 自建网关
 *      https://txcloud-xxxxxxxx.service.tcloudbase.com/v1
 *
 *   2. https://完整地址/v1|sk-cbg-xxxxxxxx      → 任意地址（官方网关也用它）
 *      官方网关形如 https://<ENV_ID>.api.tcloudbasegateway.com/v1/ai/cloudbase
 *
 * loader 解析出真正的 baseURL 与 apiKey 交给 magpie，因此同一个插件能同时
 * 适配「官方网关（零部署）」和「自建网关（可消耗成长计划额度）」。
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
 * 把用户填的凭据解析成 { baseURL, apiKey }。
 * 解析不出来时返回 undefined，让 magpie 按「未登录」处理。
 */
function parseCredential(raw) {
  const s = String(raw ?? "").trim()
  if (!s) return undefined

  // 形式二：完整地址|密钥
  const pipe = s.indexOf("|")
  if (pipe > 0) {
    const url = s.slice(0, pipe).trim()
    const key = s.slice(pipe + 1).trim()
    if (!/^https?:\/\//i.test(url) || !key) return undefined
    return { baseURL: url.replace(/\/+$/, ""), apiKey: key }
  }

  // 形式一：环境ID:密钥（兼容中文冒号）
  const m = /^(txcloud-[A-Za-z0-9]+)\s*[:：]\s*(.+)$/.exec(s)
  if (m) {
    return {
      baseURL: `https://${m[1]}.service.tcloudbase.com/v1`,
      apiKey: m[2].trim(),
    }
  }

  return undefined
}

/** OpenCode / magpie 的插件入口 */
export async function CloudBasePlugin({ client, magpie } = {}) {
  return {
    auth: {
      provider: ID,

      // api 类型：一个密钥输入框。环境 ID 编码在里面，见文件头说明。
      // 提示语要写清楚「必须粘贴」，否则用户会直接回车 → magpie 报 "the key is empty"。
      methods: [
        {
          type: "api",
          label: "CloudBase - 粘贴凭据后回车，不能空着",
          placeholder: "例如 txcloud-abc123:sk-cbg-xxxx",
        },
      ],

      /**
       * 每次请求前由 magpie / OpenCode 调用，拿到本次要用的 baseURL 与 apiKey。
       * 解析失败返回空对象，agent 会显示该供应商未登录。
       */
      async loader(getAuth) {
        const auth = await getAuth()
        if (auth?.type !== "api" || !auth.key) return {}

        const parsed = parseCredential(auth.key)
        if (!parsed) return {}

        return {
          baseURL: parsed.baseURL,
          apiKey: parsed.apiKey,
        }
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
export const _internal = { parseCredential, MODELS, ID, BASE_FALLBACK }
