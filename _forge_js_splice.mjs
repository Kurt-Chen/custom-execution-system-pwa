import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "index.html");
let s = fs.readFileSync(p, "utf8");

const startMark = "    function refreshForgeWeekPlanTaskNameDatalist() {";
const endMark = "    function bindForgeSubCardCollapse() {";
const i0 = s.indexOf(startMark);
const i1 = s.indexOf(endMark);
if (i0 === -1 || i1 === -1 || i1 <= i0) throw new Error("markers not found");

const insert = `
    function aggregateForgeCheckinsWeekByNormalizedLabel(weekSundayKey) {
      const map = Object.create(null);
      for (let dow = 0; dow <= 6; dow++) {
        const dateKey = forgeWeekPlanDateKeyForDow(weekSundayKey, dow);
        const dayMap = aggregateForgeCheckinsByNormalizedLabel(dateKey);
        Object.keys(dayMap).forEach(function (k) {
          const e = dayMap[k];
          if (!map[k]) map[k] = { sum: 0, unit: e.unit || "" };
          map[k].sum += e.sum;
          if (!map[k].unit && e.unit) map[k].unit = e.unit;
        });
      }
      return map;
    }

    function forgeGetThisWeekSundayKeyFromSelectedOrToday() {
      const dateKey = selectedDoneDate || formatDateInputValue(new Date());
      const base = parseDateInputToLocalNoon(dateKey);
      if (!base) return formatDateInputValue(new Date());
      const { sunday } = getSundayToSaturdayWeek(base);
      return formatDateInputValue(sunday);
    }

    function ensureForgeWeeklyMinimumsState() {
      if (!state.forge || typeof state.forge !== "object") state.forge = {};
      if (!Array.isArray(state.forge.weeklyMinimums)) state.forge.weeklyMinimums = [];
    }

    function refreshForgeWeeklyMinTaskDatalist() {
      const dl = document.getElementById("forgeWeeklyMinTaskDatalist");
      if (!dl) return;
      const seen = Object.create(null);
      function add(t) {
        const x = String(t || "")
          .replace(/\\s+/g, " ")
          .replace(/\\s*\\/\\s*/g, " / ")
          .trim();
        if (!x || seen[x]) return;
        seen[x] = true;
        const opt = document.createElement("option");
        opt.value = x;
        dl.appendChild(opt);
      }
      dl.innerHTML = "";
      const mod = document.getElementById("forgeModule");
      if (mod) {
        mod.querySelectorAll(".forge-task-text").forEach((el) => {
          const raw = (el.textContent || "").replace(/\\s+/g, " ").trim();
          if (!raw) return;
          const beforeSlash = raw.split("/")[0].trim();
          if (beforeSlash) add(beforeSlash);
        });
      }
      FORGE_WP_TASK_NAME_EXTRAS.forEach(add);
    }

    function renderForgeWeeklyMinRows() {
      const wrap = document.getElementById("forgeWeeklyMinRows");
      if (!wrap) return;
      ensureForgeWeeklyMinimumsState();
      refreshForgeWeeklyMinTaskDatalist();
      const weekKey = forgeGetThisWeekSundayKeyFromSelectedOrToday();
      const weekAgg = aggregateForgeCheckinsWeekByNormalizedLabel(weekKey);
      wrap.innerHTML = "";
      state.forge.weeklyMinimums.forEach(function (row) {
        const id = row.id;
        const label = String(row.label || "").trim();
        const nKey = forgeWpNormalizeTaskKey(label);
        const minN = parseFloat(String(row.weeklyMin || "").trim());
        const unitHint = inferForgeWpGoalUnit(label);
        const agg = nKey ? weekAgg[nKey] : null;
        const cur = agg && typeof agg.sum === "number" && !Number.isNaN(agg.sum) ? agg.sum : 0;
        const target = !Number.isNaN(minN) && minN > 0 ? minN : 0;
        const pct = target > 0 ? Math.min(100, Math.round((cur / target) * 1000) / 10) : 0;
        const unitDisp = String(row.unit || unitHint || "").trim() || "min";
        const el = document.createElement("div");
        el.className = "forge-weekly-min-row";
        el.setAttribute("data-forge-wm-id", id);
        el.innerHTML =
          '<div class="forge-weekly-min-row-top">' +
          '<label class="forge-weekly-min-label">动作 <input type="text" class="forge-weekly-min-name" list="forgeWeeklyMinTaskDatalist" autocomplete="off" /></label>' +
          '<label class="forge-weekly-min-label">本周最低 <input type="number" class="forge-weekly-min-target" min="0" step="0.1" /></label>' +
          '<span class="forge-weekly-min-unit-hint" aria-live="polite"></span>' +
          '<button type="button" class="btn forge-weekly-min-remove">移除</button>' +
          "</div>" +
          '<div class="forge-weekly-min-progress-meta"></div>' +
          '<div class="forge-weekly-min-track" aria-hidden="true"><div class="forge-weekly-min-fill"></div></div>';
        const nameInp = el.querySelector(".forge-weekly-min-name");
        const tgtInp = el.querySelector(".forge-weekly-min-target");
        const unitEl = el.querySelector(".forge-weekly-min-unit-hint");
        const metaEl = el.querySelector(".forge-weekly-min-progress-meta");
        const fill = el.querySelector(".forge-weekly-min-fill");
        if (nameInp) nameInp.value = label;
        if (tgtInp) tgtInp.value = target > 0 ? String(row.weeklyMin) : "";
        if (unitEl) unitEl.textContent = unitDisp ? "单位：" + unitDisp : "";
        if (metaEl) {
          metaEl.textContent =
            forgeWpFormatProgressNum(cur) + " / " + forgeWpFormatProgressNum(target) + " " + unitDisp;
        }
        if (fill) fill.style.width = pct + "%";
        function pushRowState() {
          row.label = nameInp ? nameInp.value.trim() : "";
          row.unit = inferForgeWpGoalUnit(row.label);
          row.weeklyMin = tgtInp ? tgtInp.value.trim() : "";
          saveState();
        }
        nameInp.addEventListener("change", function () {
          pushRowState();
          renderForgeWeeklyMinRows();
          refreshAllForgeTodayTaskRowsFromDone();
        });
        tgtInp.addEventListener("change", function () {
          pushRowState();
          renderForgeWeeklyMinRows();
        });
        el.querySelector(".forge-weekly-min-remove").addEventListener("click", function () {
          state.forge.weeklyMinimums = state.forge.weeklyMinimums.filter(function (x) {
            return x.id !== id;
          });
          saveState();
          renderForgeWeeklyMinRows();
        });
        wrap.appendChild(el);
      });
    }

    function bindForgeWeeklyMinAddButton() {
      const btn = document.getElementById("forgeWeeklyMinAddBtn");
      if (!btn || btn.dataset.forgeWmBound === "1") return;
      btn.dataset.forgeWmBound = "1";
      btn.addEventListener("click", function () {
        ensureForgeWeeklyMinimumsState();
        const nid =
          Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        state.forge.weeklyMinimums.push({
          id: nid,
          label: "",
          weeklyMin: "",
          unit: "min"
        });
        saveState();
        renderForgeWeeklyMinRows();
      });
    }

    function renderForgeTodaysForgeList() {
      const ul = document.getElementById("forgeTodaysForgeList");
      const empty = document.getElementById("forgeTodaysForgeEmpty");
      if (!ul) return;
      const dateKey = selectedDoneDate || formatDateInputValue(new Date());
      ul.innerHTML = "";
      let n = 0;
      if (state.done && Array.isArray(state.done)) {
        state.done.forEach(function (task) {
          if (!getForgeDoneLineInfo(task)) return;
          const meta = task.forgeMindMeta || task.forgeBodyMeta;
          if (!meta || meta.dateKey !== dateKey) return;
          n++;
          const li = document.createElement("li");
          li.className = "forge-todays-forge-item";
          const pill = document.createElement("span");
          const isMind = !!task.forgeMindMeta;
          pill.className = "done-entry-pill done-entry-pill--" + (isMind ? "forge-mind" : "forge-body");
          pill.textContent = isMind ? "Mind" : "Body";
          const txt = document.createElement("span");
          txt.className = "forge-todays-forge-text";
          txt.textContent = task.text || "";
          li.appendChild(pill);
          li.appendChild(txt);
          ul.appendChild(li);
        });
      }
      if (empty) empty.classList.toggle("hidden", n > 0);
    }

`;

s = s.slice(0, i0) + insert + s.slice(i1);
fs.writeFileSync(p, s, "utf8");
console.log("spliced OK");
