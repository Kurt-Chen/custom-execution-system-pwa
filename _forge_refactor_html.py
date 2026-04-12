# -*- coding: utf-8 -*-
import re
from pathlib import Path

path = Path(__file__).resolve().parent / "index.html"
s = path.read_text(encoding="utf-8")

m = re.search(
    r'(<section id="forgePanelToday"[\s\S]*?)</section>\s*\n\s*<section id="forgePanelWeekPlan"',
    s,
)
if not m:
    raise SystemExit("forgePanelToday block not found")
old_today_full = m.group(1)

mind_m = re.search(
    r'(<div class="forge-sub-card forge-mind-card">[\s\S]*?)(<div class="forge-sub-card forge-body-card">[\s\S]*?</div>\s*</div>\s*</div>\s*</div>)',
    old_today_full,
)
if not mind_m:
    raise SystemExit("mind/body cards not found")
mind_card = mind_m.group(1)
body_card = mind_m.group(2)

std_sec = re.search(
    r'<section id="forgePanelStandards"[\s\S]*?</section>',
    s,
)
if not std_sec:
    raise SystemExit("forgePanelStandards not found")
std_html = std_sec.group(0)

kb_m = re.search(
    r'<div class="forge-kb-standards-grid">([\s\S]*?)</div>\s*</div>\s*<div class="forge-cc-standards-block">',
    std_html,
)
cc_m = re.search(
    r'<div class="forge-cc-standards-block">([\s\S]*?)</div>\s*</div>\s*<p class="forge-placeholder-note"',
    std_html,
)
if not kb_m or not cc_m:
    raise SystemExit("kb/cc extract failed")
kb_grid_inner = kb_m.group(1)
cc_block_inner = cc_m.group(1)

new_today = """<section id="forgePanelToday" class="collapsed" aria-labelledby="forgeTodayHeading">
            <h2 id="forgeTodayHeading" class="section-title" style="margin: 0 0 12px;">今日训练</h2>
            <div class="forge-today-inner-wrap">
            <div id="moduleSubTabPanel-forge-today-forge" class="forge-today-sub-panel" role="tabpanel" aria-labelledby="moduleSubTabBtn-forge-today-forge">
            <p class="forge-todays-forge-lead">与 My Done 共用同一条记录；此处仅展示 Forge 打卡（无时间分块）。</p>
            <ul id="forgeTodaysForgeList" class="forge-todays-forge-list" aria-live="polite"></ul>
            <p id="forgeTodaysForgeEmpty" class="forge-placeholder-note hidden">所选日期暂无 Forge 记录。</p>
            </div>
            <div id="moduleSubTabPanel-forge-today-standards" class="forge-today-sub-panel" role="tabpanel" aria-labelledby="moduleSubTabBtn-forge-today-standards" hidden>
            <p class="forge-standards-lead" style="margin-top:0">为自选动作设定<strong>本周最低</strong>；进度条为本周累计相对该标准。壶铃与囚徒全局设定如下。</p>
            <datalist id="forgeWeeklyMinTaskDatalist"></datalist>
            <div id="forgeWeeklyMinRows" class="forge-weekly-min-rows"></div>
            <button type="button" class="btn-primary forge-weekly-min-add-btn" id="forgeWeeklyMinAddBtn" style="margin-bottom:14px">添加动作标准</button>
            <div class="forge-kb-standards-block">
              <div class="forge-kb-standards-grid">
""" + kb_grid_inner + """
              </div>
            </div>
            <div class="forge-cc-standards-block">
""" + cc_block_inner + """
            </div>
            </div>
            </div>
          </section>

          <section id="forgePanelMind" class="collapsed" aria-labelledby="forgeMindSectionHeading">
            <h2 id="forgeMindSectionHeading" class="section-title" style="margin: 0 0 12px; font-size: 1.05rem;">Mind</h2>
""" + mind_card + """
          </section>

          <section id="forgePanelBody" class="collapsed" aria-labelledby="forgeBodySectionHeading">
            <h2 id="forgeBodySectionHeading" class="section-title" style="margin: 0 0 12px; font-size: 1.05rem;">Body</h2>
""" + body_card + """
          </section>"""

remove_m = re.search(
    r'\s*<section id="forgePanelWeekPlan"[\s\S]*?<section id="forgePanelHistory"[\s\S]*?</section>',
    s,
)
if not remove_m:
    raise SystemExit("week/history block not found")

old_block = old_today_full + "</section>" + remove_m.group(0)
if old_block not in s:
    raise SystemExit("composite old_block not found — check newlines")

s2 = s.replace(old_block, new_today, 1)
path.write_text(s2, encoding="utf-8")
print("OK")
