/**
 * 单元测试：凭据解析、输入校验、插件结构。
 * 跑法：npm test   （等价于 node --test test/）
 * 不联网、不需要真实凭据。
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CloudBasePlugin, _internal } from '../index.mjs'

const { parseCredential, joinCredential, validateEnvId, validateKey, MODELS, ID } = _internal

// ---------- parseCredential ----------

test('解析 环境ID:密钥', () => {
  const r = parseCredential('txcloud-d0gdt6vu0158db2e5:sk-cbg-abc123')
  assert.equal(r.baseURL, 'https://txcloud-d0gdt6vu0158db2e5.service.tcloudbase.com/v1')
  assert.equal(r.apiKey, 'sk-cbg-abc123')
})

test('解析 中文冒号', () => {
  const r = parseCredential('txcloud-abc：sk-cbg-xyz')
  assert.equal(r.baseURL, 'https://txcloud-abc.service.tcloudbase.com/v1')
  assert.equal(r.apiKey, 'sk-cbg-xyz')
})

test('解析两端多余空格', () => {
  const r = parseCredential('  txcloud-abc  :  sk-cbg-xyz  ')
  assert.equal(r.baseURL, 'https://txcloud-abc.service.tcloudbase.com/v1')
  assert.equal(r.apiKey, 'sk-cbg-xyz')
})

test('解析 完整地址|密钥', () => {
  const r = parseCredential('https://example.com/v1|sk-cbg-abc')
  assert.equal(r.baseURL, 'https://example.com/v1')
  assert.equal(r.apiKey, 'sk-cbg-abc')
})

test('完整地址末尾斜杠被去掉', () => {
  const r = parseCredential('https://example.com/v1///|sk-cbg-abc')
  assert.equal(r.baseURL, 'https://example.com/v1')
})

test('拒绝纯密钥（不知道是哪个环境）', () => {
  assert.equal(parseCredential('sk-cbg-abc123'), undefined)
})

test('拒绝空输入', () => {
  for (const v of ['', '   ', null, undefined]) {
    assert.equal(parseCredential(v), undefined)
  }
})

test('拒绝非 http 的 pipe 形式', () => {
  assert.equal(parseCredential('example.com/v1|sk-abc'), undefined)
})

test('拒绝 pipe 形式但密钥为空', () => {
  assert.equal(parseCredential('https://example.com/v1|'), undefined)
})

// ---------- joinCredential ----------

test('join 后再 parse 能还原', () => {
  const joined = joinCredential('txcloud-abc', 'sk-cbg-xyz')
  const r = parseCredential(joined)
  assert.equal(r.baseURL, 'https://txcloud-abc.service.tcloudbase.com/v1')
  assert.equal(r.apiKey, 'sk-cbg-xyz')
})

// ---------- 输入校验 ----------

test('环境 ID 校验', () => {
  assert.equal(validateEnvId('txcloud-abc123'), undefined)
  assert.equal(validateEnvId(''), '环境 ID 不能为空')
  assert.equal(validateEnvId('txcloud_abc'), '环境 ID 只能包含字母、数字和连字符')
  assert.ok(validateEnvId('有中文'))
})

test('密钥校验', () => {
  assert.equal(validateKey('sk-cbg-abc'), undefined)
  assert.ok(validateKey(''))
  assert.ok(validateKey('   '))
})

// ---------- 插件结构 ----------

test('插件导出 auth.provider 与两种登录方式', async () => {
  const p = await CloudBasePlugin({})
  assert.equal(p.auth.provider, ID)
  const types = p.auth.methods.map((m) => m.type)
  assert.deepEqual(types, ['oauth', 'api'])
})

test('oauth 方法带两步 prompts 和 authorize', async () => {
  const p = await CloudBasePlugin({})
  const oauth = p.auth.methods.find((m) => m.type === 'oauth')
  assert.equal(oauth.prompts.length, 2)
  assert.deepEqual(oauth.prompts.map((x) => x.key), ['envId', 'apiKey'])
  assert.equal(typeof oauth.authorize, 'function')
})

test('oauth authorize 的 callback 能返回可用凭据', async () => {
  const p = await CloudBasePlugin({})
  const oauth = p.auth.methods.find((m) => m.type === 'oauth')
  const flow = oauth.authorize({ envId: 'txcloud-abc', apiKey: 'sk-cbg-xyz' })
  assert.equal(flow.url, '')
  const result = await flow.callback()
  assert.equal(result.type, 'success')
  assert.equal(result.provider, ID)
  assert.equal(result.access, 'txcloud-abc:sk-cbg-xyz')
})

test('oauth authorize 缺字段时失败', async () => {
  const p = await CloudBasePlugin({})
  const oauth = p.auth.methods.find((m) => m.type === 'oauth')
  const result = await oauth.authorize({ envId: '', apiKey: '' }).callback()
  assert.equal(result.type, 'failed')
  assert.ok(result.error)
})

test('loader 从 oauth 凭据解析出 baseURL 和 apiKey', async () => {
  const p = await CloudBasePlugin({})
  const out = await p.auth.loader(async () => ({ type: 'oauth', access: 'txcloud-abc:sk-cbg-xyz' }))
  assert.equal(out.baseURL, 'https://txcloud-abc.service.tcloudbase.com/v1')
  assert.equal(out.apiKey, 'sk-cbg-xyz')
})

test('loader 从 api 凭据解析出 baseURL 和 apiKey', async () => {
  const p = await CloudBasePlugin({})
  const out = await p.auth.loader(async () => ({ type: 'api', key: 'txcloud-abc:sk-cbg-xyz' }))
  assert.equal(out.baseURL, 'https://txcloud-abc.service.tcloudbase.com/v1')
  assert.equal(out.apiKey, 'sk-cbg-xyz')
})

test('未登录时 loader 返回空对象（magpie 显示 not signed in）', async () => {
  const p = await CloudBasePlugin({})
  assert.deepEqual(await p.auth.loader(async () => undefined), {})
  assert.deepEqual(await p.auth.loader(async () => ({ type: 'api' })), {})
})

test('凭据格式不对时 loader 返回空对象', async () => {
  const p = await CloudBasePlugin({})
  assert.deepEqual(await p.auth.loader(async () => ({ type: 'api', key: 'sk-only' })), {})
})

// ---------- config ----------

test('config 写入 provider，含有 npm 协议字段', async () => {
  const p = await CloudBasePlugin({})
  const cfg = {}
  await p.config(cfg)
  const prov = cfg.provider[ID]
  assert.equal(prov.name, 'CloudBase')
  assert.equal(prov.npm, '@ai-sdk/openai-compatible') // 缺了它 magpie 发不出请求
  assert.equal(typeof prov.api, 'string')
  assert.equal(Object.keys(prov.models).length, MODELS.length)
})

test('每个模型都有 name 和 context limit', async () => {
  const p = await CloudBasePlugin({})
  const cfg = {}
  await p.config(cfg)
  for (const m of MODELS) {
    const entry = cfg.provider[ID].models[m.id]
    assert.ok(entry, `缺少模型 ${m.id}`)
    assert.ok(entry.name)
    assert.equal(entry.limit.context, m.context)
  }
})
