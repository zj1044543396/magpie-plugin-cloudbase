<p align="center">[English](README.md) | **简体中文**</p>

# CloudBase provider for magpie

Bring Tencent CloudBase models into magpie as an ordinary provider. Sign in once with two fields, then any agent can pick `cloudbase-plugin/deepseek-v4.1-flash`.

## One thing you must know first

**The growth-plan gift quota only pays out on CloudBase SDK channels.** Calling CloudBase's model endpoints directly is rejected:

```
403 AI_CHANNEL_NOT_ALLOWED
```

So this plugin **cannot** connect to the official model endpoints. You have to deploy a gateway cloud function in your own environment; that function calls the model with `@cloudbase/node-sdk` from inside the function, which is allowed and does draw on the gift quota.

```
Agent ─► magpie ─► this plugin ──HTTP──► your gateway function ──SDK──► model
```

## Verified

Full flow exercised on a real magpie install:

```
magpie plugin add <this dir>           ✓ added
magpie plugin login cloudbase          two questions, ✓ signed in
magpie plugin list                     cloudbase-plugin (CloudBase, 5 models)  signed in as txcloud-xxxx
magpie provider test cloudbase-plugin  ✓ chat  1487 ms · deepseek-v4.1-flash
npm test                               22 unit tests, all passing
```

## Install

```bash
# from npm
magpie plugin add npm:@zxx9527/magpie-plugin-cloudbase

# from GitHub (use this when npm is unreachable in your region)
magpie plugin add github:zj1044543396/magpie-plugin-cloudbase

# from a local checkout
magpie plugin add /path/to/magpie-plugin-cloudbase
```

## Sign in

```bash
magpie plugin login cloudbase
```

It first asks which way you want to sign in:

```
How do you sign in to CloudBase?
  1. CloudBase（分步填写环境 ID 和密钥）     ← recommended, asks one field at a time
  2. CloudBase（一行填 环境ID:密钥）          ← fallback for plain OpenCode, where prompts may not render
```

Pick `1`, then fill two fields:

```
云开发环境 ID（控制台环境详情里可以看到） (txcloud-xxxxxxxx): txcloud-your-env-id
网关密钥（自建网关的 GATEWAY_API_KEY） (sk-cbg-xxxxxxxx): sk-cbg-your-key
```

Then:

```bash
magpie plugin list                    # shows: signed in as <your env id>
magpie models                         # shows cloudbase-plugin/deepseek-v4.1-flash and friends
magpie claude cloudbase-plugin/deepseek-v4.1-flash
```

Sign out with `magpie plugin logout cloudbase`.

> With option `2` you type `envId:key` on one line (e.g. `txcloud-abc123:sk-cbg-xxxx`); `full-url|key` also works.
> **Pressing Enter on an empty line gives `magpie: the key is empty`** — that is magpie's own check, not a plugin error.

## Prerequisite: deploy the gateway

The plugin only tells magpie that a provider exists. **It does not contain the gateway.** You deploy that separately into **your own** environment, so usage is billed to you:

| You need | Notes |
|---|---|
| A CloudBase environment | Personal plan is enough, with AI enabled |
| A gateway cloud function | See the `cloudbase-openai-gateway` project; gives you `https://<env-id>.service.tcloudbase.com/v1` |

Deploy essentials: HTTP cloud function + a `/v1` route + your own `GATEWAY_API_KEY`. Full steps are in that project's README.

## Models

| Model | Context |
|---|---|
| `deepseek-v4.1-flash` | 128K |
| `deepseek-v4.1-flash-1017` | 128K |
| `hy4` | 128K |
| `hy4-flash` | 128K |
| `hy3` | 32K |

To add or remove models, edit the `MODELS` array in `index.mjs`.

## Troubleshooting

Errors come back in OpenAI shape: `{ error: { message, code } }`.

| Symptom | Cause / fix |
|---|---|
| `magpie: the key is empty` | You pressed Enter without typing. Sign in again and paste the value. |
| `provider test` → 401 `gateway_not_configured` | The gateway function has no `GATEWAY_API_KEY` env var |
| 401 `invalid_api_key` | The key you typed differs from the one in the gateway env vars |
| 404 `INVALID_PATH` | Base URL is missing `/v1`, or the HTTP gateway route is not bound to `/v1` |
| 404 page not found | Function name is not `openai-gateway`, or the deploy did not succeed |
| 502 `upstream_error` mentioning quota/model | Gift quota exhausted, or the model is not enabled in the console |
| 403 `AI_CHANNEL_NOT_ALLOWED` | **You bypassed the gateway** and hit CloudBase's official endpoints directly; go through your own gateway |
| Streaming arrives in one burst | A proxy or CDN is buffering; the gateway already sends `X-Accel-Buffering: no` |
| Model list empty after sign-in | Credential format wrong; `magpie plugin logout cloudbase` and start over |

## Development

```bash
npm test        # 22 unit tests: credential parsing, validation, plugin shape; no network
```

## Implementation notes

The plugin is an OpenCode provider plugin exporting `auth` and `config`:

```js
export async function CloudBasePlugin({ client, magpie } = {}) {
  return {
    auth: {
      provider: 'cloudbase',
      methods: [
        { type: 'oauth', prompts: [envIdPrompt, keyPrompt], authorize },  // step by step
        { type: 'api', label, placeholder },                              // one line, fallback
      ],
      async loader(getAuth) {
        const auth = await getAuth()
        // oauth credential lives in auth.access, api one in auth.key
        return { baseURL, apiKey }   // handed to magpie before every request
      },
    },
    async config(config) {
      config.provider.cloudbase = {
        name: 'CloudBase',
        npm: '@ai-sdk/openai-compatible',   // required, or no request can be sent
        api: BASE_FALLBACK,
        models: { ... },
      }
    },
  }
}
```

Three things that bite:

1. **The `npm` field is mandatory.** Without it magpie loads the provider but cannot send a request, so even a successful sign-in is useless.
2. **Step-by-step prompts require the `oauth` method.** `prompts` is only supported there; the `api` type has a single key input. Return `{ url: "", method: "auto", callback }` from `authorize`, and let `callback` resolve to `{ type: "success", provider, access, ... }` — no real browser round trip needed.
3. **Unify both credential paths.** `loader` must parse `auth.access` (oauth) and `auth.key` (api) into the same `{ baseURL, apiKey }`.

## Publishing

### npm

```bash
npm config set registry https://registry.npmjs.org   # mirrors cannot publish
npm login
npm publish --access public --otp=CODE                # required when 2FA is on
npm config set registry https://registry.npmmirror.com   # switch back afterwards
```

### Into the official magpie marketplace (short name)

Short names like `magpie plugin add cloudbase` come from packages under the official `@magpie-community/*` scope:

```
https://github.com/magpie-community/plugins
```

Add a directory under `packages/` (follow `packages/kiro`) and open a PR.

## Related

- Gateway deployment: the `cloudbase-openai-gateway` project
- Official model API reference: `https://docs.cloudbase.net/ai/model/openai-sdk-access`

## License

MIT
