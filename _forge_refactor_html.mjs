import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "index.html");
let s = fs.readFileSync(p, "utf8");

const m = s.match(
  /(<section id="forgePanelToday"[\s\S]*?)<\/section>\s*\n\s*<section id="forgePanelWeekPlan"/
);
if (!m) throw new Error("forgePanelToday not found");
const oldTodayFull = m[1];

const mindM = oldTodayFull.match(
  /(<div class="forge-sub-card forge-mind-card">[\s\S]*?)(<div class="forge-sub-card forge-body-card">[\s\S]*?<\/div>\s*<\/div>\s*<\/div>\s*<\/div>)/
);
if (!mindM) throw new Error("mind/body not found");
const mindCard = mindM[1];
const bodyCard = mindM[2];

const stdSec = s.match(/<section id="forgePanelStandards"[\s\S]*?<\/section>/);
if (!stdSec) throw new Error("standards not found");
const stdHtml = stdSec[0];

const kbM = stdHtml.match(
  /<div class="forge-kb-standards-grid">([\s\S]*?)<\/div>\s*<\/div>\s*<div class="forge-cc-standards-block">/
);
const ccM = stdHtml.match(
  /<div class="forge-cc-standards-block">([\s\S]*?)<\/div>\s*<\/div>\s*<p class="forge-placeholder-note"/
);
if (!kbM || !ccM) throw new Error("kb/cc extract failed");

const newToday = `<section id="forgePanelToday" class="collapsed" aria-labelledby="forgeTodayHeading">
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
${kbM[1]}
              </div>
            </div>
            <div class="forge-cc-standards-block">
${ccM[1]}
            </div>
            </div>
            </div>
          </section>

          <section id="forgePanelMind" class="collapsed" aria-labelledby="forgeMindSectionHeading">
            <h2 id="forgeMindSectionHeading" class="section-title" style="margin: 0 0 12px; font-size: 1.05rem;">Mind</h2>
${mindCard}
          </section>

          <section id="forgePanelBody" class="collapsed" aria-labelledby="forgeBodySectionHeading">
            <h2 id="forgeBodySectionHeading" class="section-title" style="margin: 0 0 12px; font-size: 1.05rem;">Body</h2>
${bodyCard}
          </section>`;

const rm = s.match(
  /\s*<section id="forgePanelWeekPlan"[\s\S]*?<section id="forgePanelHistory"[\s\S]*?<\/section>/
);
if (!rm) throw new Error("week/history not found");

const oldBlock = oldTodayFull + "</section>" + rm[0];
if (!s.includes(oldBlock)) throw new Error("oldBlock not found");

s = s.replace(oldBlock, newToday);
fs.writeFileSync(p, s, "utf8");
console.log("OK");
