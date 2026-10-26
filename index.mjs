// magpie-workbuddy-growth：发现页入口包（pi-package）。
// magpie 对带 pi-package 关键词的包走 pi 扩展加载路径，只装配 provider、忽略工具，
// 因此真正的 wb_growth 工具在姊妹包 magpie-workbuddy-growth-core 里。
export default async function WorkbuddyGrowthEntry() {
  console.log(
    "[magpie-workbuddy-growth] 本包是发现页入口。请执行: magpie plugin add npm:magpie-workbuddy-growth-core 来启用 wb_growth 工具",
  )
  return {}
}
