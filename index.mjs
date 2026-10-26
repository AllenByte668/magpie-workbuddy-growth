/**
 * magpie 插件：WorkBuddy 国内版成长中心管家（workbuddy-growth）
 *
 * ── 它做什么 ─────────────────────────────────────────────────
 * 成长体系全自动：
 *   - 任务树点亮（事件链伪造 + 领取，含 RichMeow 桌面 6 连、Buddy 五连、
 *     小程序任务、灵感库、画布/模板/专家/团队/技能/自动化/皮肤/和平精英皮肤…）
 *   - 猫猫旅行（领养 → 派出 → 到达领奖，一趟一步，领养门槛防抖）
 *   - 连登（昨日漏签补签卡 → 7d/14d/28d 档位兑换 → 抽奖，最多 20 发）
 *   - 每日活跃上报（点亮成长中心连登，按北京日幂等）
 *   - 开学季活动（viewed → 判据上报 → 领奖）+ 大转盘抽奖
 *   - 只读盘点（status）
 *
 * ── 与社区补丁的关系 ─────────────────────────────────────────
 * 账号直接从 %USERPROFILE%\.config\magpie\plugin-auth.json 读取
 * @magpie-community/opencode-workbuddy-auth 的登录态（运行时读盘，
 * 拿到的永远是社区插件续期后写回的最新 token），因此：
 *   - 无需重复登录，不受社区插件更新覆盖（这不是 patch）
 *   - 仅对国内个人账号生效（provider=workbuddy、无 enterpriseId）
 * 每日自动签到钩子仍在社区插件的补丁里（auth.checkin）；本插件的
 * daily.mjs 可配合 Windows 计划任务做无补丁的等价自动化。
 *
 * ── 工具 ─────────────────────────────────────────────────────
 * wb_growth：action=status|task|school|travel|streak|daily
 */

import { readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"
import {
  createGrowth,
  growthAccountOf,
  supportsGrowth,
  sleep,
} from "./growth.mjs"

const PLUGIN_ID = "workbuddy-growth"
const AUTH_FILE = () =>
  join(process.env.USERPROFILE ?? homedir(), ".config", "magpie", "plugin-auth.json")

/** 从磁盘读社区 workbuddy 插件的国内个人账号（运行时最新）。 */
function diskAccounts() {
  let raw
  try {
    raw = readFileSync(AUTH_FILE(), "utf8")
  } catch {
    return []
  }
  let auth
  try {
    auth = JSON.parse(raw)
  } catch {
    return []
  }
  const out = []
  for (const [k, v] of Object.entries(auth.accounts ?? auth)) {
    const key = String(k)
    if (!key.startsWith("workbuddy") || key.startsWith("workbuddy-ai")) continue
    const a = v?.auth ?? v
    if (!a?.access || a.enterpriseId) continue
    out.push({ key, uid: a.uid ?? "", domain: a.domain ?? "", access: a.access })
  }
  return out
}

export const WorkbuddyGrowthPlugin = async () => {
  // 借用 growth.mjs 的工具定义（其执行器面向「捕获的 getAuth」；
  // 这里改写执行器为「每次执行时读盘」，保证 token 永远最新）
  const growth = createGrowth({ id: "workbuddy" })
  const proto = growth.toolBag()?.manage_growth
  const I = growth._internal

  const TOOL = {
    description:
      proto.description +
      "（独立插件版：账号实时读取 workbuddy 插件登录态，工具名 wb_growth）",
    args: proto.args,
    async execute(args = {}) {
      const action = args.action || "status"
      const accounts = diskAccounts()
        .map((a) => growthAccountOf({ id: "workbuddy" }, a))
        .filter((a) => a.uid && a.token)
        .filter((a) => !args.uid || a.uid.startsWith(args.uid))
      if (accounts.length === 0)
        return {
          output:
            "没有可用的 WorkBuddy 国内个人账号（需先在 workbuddy 插件登录，且无 enterpriseId）。",
        }
      const blocks = []
      for (const a of accounts) {
        const head = `账号 ${a.uid.slice(0, 8)}…`
        try {
          if (action === "status") {
            const s = await I.growthStatus(a)
            blocks.push(`${head}\n` + JSON.stringify(s, null, 1))
          } else if (action === "task") {
            const reports = await I.runTaskTree(a, args.code || "")
            const lines = reports.map(
              (r) => `${r.code}: ${r.outcome} ${r.message}${r.credit ? `（+${r.credit}）` : ""}`,
            )
            blocks.push(`${head}\n` + (lines.join("\n") || "（无任务）"))
          } else if (action === "school") {
            const reports = await I.runSchoolAll(a, args.only || "", args.lottery === true)
            blocks.push(
              `${head}\n` + reports.map((r) => `${r.code}: ${r.outcome} ${r.message}`).join("\n"),
            )
          } else if (action === "travel") {
            const r = await I.runTravelOnce(a)
            blocks.push(`${head} 猫猫旅行：${r.outcome} ${r.message}`)
          } else if (action === "streak") {
            const s = await I.runStreakOnce(a)
            blocks.push(`${head}\n` + (s.lines.join("\n") || "（无可做事项）"))
          } else if (action === "daily") {
            const d = await I.reportDailyActivity(a)
            blocks.push(
              `${head} 每日活跃：${d.sent ? "已上报" : "今日已报过"}${d.streakDays ? `（连登 ${d.streakDays} 天）` : ""}`,
            )
          } else {
            return { output: `未知 action：${action}` }
          }
        } catch (e) {
          blocks.push(`${head} 执行失败：${e.message}`)
        }
        await sleep(800)
      }
      return { output: blocks.join("\n\n") }
    },
  }

  return {
    tool: { wb_growth: TOOL },
  }
}

/** 测试辅助（magpie 不会把它当插件调用）。 */
export const _internal = { diskAccounts, PLUGIN_ID }

export default WorkbuddyGrowthPlugin

