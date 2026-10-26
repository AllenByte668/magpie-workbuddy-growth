/**
 * daily.mjs — WorkBuddy 国内版每日自动化 CLI（无 magpie 依赖）
 *
 * 对 plugin-auth.json 里每个 workbuddy 国内个人账号跑一遍完整签到链：
 *   billing 每日签到 → 每日活跃上报（点亮成长中心连登）
 *   → 连登（补签/档位兑换/抽奖）→ 猫猫旅行推进一步
 *
 * 用法：
 *   bun F:\aiagent\magpie\workbuddy-growth\daily.mjs          # 全部账号
 *   bun F:\aiagent\magpie\workbuddy-growth\daily.mjs 0dca7d0d  # 指定 uid 前缀
 *
 * 配 Windows 计划任务（示例，每天 09:05）：
 *   schtasks /Create /TN "WorkBuddyGrowthDaily" /SC DAILY /ST 09:05 /TR ^
 *     "\"C:\Program Files\bun\bun.exe\" F:\aiagent\magpie\workbuddy-growth\daily.mjs"
 *
 * 退出码：任一账号 outcome=failed → 1，其余 → 0。
 */

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import { growthAccountOf, checkinAccount, sleep } from "./growth.mjs"

const uidPrefix = process.argv[2] ?? ""
const home = process.env.USERPROFILE ?? homedir()
const auth = JSON.parse(
  readFileSync(join(home, ".config", "magpie", "plugin-auth.json"), "utf8"),
)
const accounts = []
for (const [k, v] of Object.entries(auth.accounts ?? auth)) {
  const key = String(k)
  if (!key.startsWith("workbuddy") || key.startsWith("workbuddy-ai")) continue
  const a = v?.auth ?? v
  if (!a?.access || a.enterpriseId) continue
  const acct = growthAccountOf({ id: "workbuddy" }, a)
  if (!acct.uid || !acct.token) continue
  if (uidPrefix && !acct.uid.startsWith(uidPrefix)) continue
  accounts.push({ key, ...acct })
}

console.log(`[${new Date().toISOString()}] WorkBuddy growth daily: ${accounts.length} account(s)`)
let failed = 0
for (const acct of accounts) {
  process.stdout.write(`${acct.key} (${acct.uid.slice(0, 8)}…) → `)
  try {
    const r = await checkinAccount(acct)
    console.log(`${r.outcome}: ${r.message}`)
    if (r.outcome === "failed") failed++
  } catch (e) {
    console.log(`error: ${e.message}`)
    failed++
  }
  await sleep(800)
}
console.log(`[${new Date().toISOString()}] done, failed=${failed}`)
process.exit(failed > 0 ? 1 : 0)
