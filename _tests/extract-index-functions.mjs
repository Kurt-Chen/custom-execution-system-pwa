#!/usr/bin/env node
/**
 * 从 index.html 抽取具名 function（与线上同源），供同步回归测试使用。
 * 不修改运行时；只读解析源码。
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const INDEX_HTML_PATH = path.resolve(__dirname, "..", "index.html");

const REQUIRED_FNS = [
  "coerceCloudUpdatedAt",
  "recordTieTimestampForSync",
  "recordVersionForSync",
  "appendCloudSyncConflictLog",
  "mergeIdRecordArraysPreferLocalOnTie",
  "hasExplicitDoneOutcomeKind",
  "isValidDoneOutcomeScoreForKind",
  "doneTaskUsesPowerBadgeOnly",
  "forgeDoneMetaNumericAmount",
  "mergeForgeDoneMetaForSync",
  "mergeHabitMetaForSync",
  "pickHabitDoneCompletedAtForSync",
  "mergeDoneItemOutcomeFields",
  "mergeDoneItemDerivedFieldsForSync",
  "mergeDoneArraysForSync",
  "parseClosedListSubStepStored",
  "serializeClosedListSubStepEntry",
  "mergeClosedListSubStepsForSync",
  "fillClosedListMergedItemFromSides",
  "normalizeDeadlineAtMs",
  "applyDeadlineMergeToItem",
  "mergeDeadlineFieldsForSync",
  "mergeClosedListArraysForSync",
  "mergeSyncTombstoneMaps",
  "omitTombstonedIdRecords",
  "omitTombstonedWeeklyPlanMicros",
  "weeklyPlanMicroTombstoneId",
  "mergeHabitCheckinEntrySyncScore",
  "isHabitCheckinValueChecked",
  "sumSanitizedHabitNumericBatches",
  "sanitizeHabitNumericCheckinValue",
  "mergeHabitCheckinValueForSync",
  "mergeHabitCheckinsForSync",
  "mergeForgeShallowMapsForSync",
  "isDoneMoveHourlyKindId",
  "getDoneMoveHourlyKindIndex",
  "getDoneMoveHourlyKind",
  "emptyMoveBreakKindByHour",
  "normalizeMoveBreakKindByHour",
  "normalizeMoveBreakDayValue",
  "mergeSameDayMoveBreakDay",
  "mergeMoveBreakDayForSync",
  "mergeStickyCloudSyncPulseState",
  "normalizeWeeklyPlanLane",
  "normalizeWeeklyPlanCompletedAtMs",
  "normalizeWeeklyPlanTask",
  "getWeeklyPlanMainStatusAt",
  "mergeWeeklyPlanMainDoneForSync",
  "mergeWeeklyPlanMicroTasksForSync",
  "applyWeeklyPlanMainDoneFromMicros",
  "stampWeeklyPlanMainDone",
  "mergeWeeklyPlanOneTaskForSync",
  "mergeWeeklyPlanPulseSliceForSync",
  "mergeWeeklyPlanBucketsForSync",
  "cloudSyncDonePulseSignature",
  "closedListPulseSignature",
  "getClosedListSubStepsNormalized",
  "mergeCloudSyncClosedListPulseIntoState",
  "mergeCloudSyncWeeklyPlanPulseIntoState",
  "mergeCloudSyncPulseIntoState",
  "countAnniversaryWeekTasksInModule",
  "countAnniversaryWeekTasksInState",
  "countBusinessRecordsInState",
  "newTw020Id",
  "cloneTwTaskForMerge",
  "mergeTwSubsForSync",
  "mergeTwOneTask",
  "mergeTwWeekTasksForSync",
  "mergeTw020WeeksMapsForSync",
  "mergeTwDisjointString",
  "mergeAnniversaryWeekGoalsForSync",
  "mergeAnniversaryTwUiOverlay",
  "mergeAnniversaryProgressBands",
  "mergeAnniversaryTwReviewForSync",
  "normalizeAnniversaryTwReviewShape",
  "normalizeAnniversaryWeekGoalEntry",
  "normalizeProgressBandsOnModule",
  "clampAnniversaryPctInt",
  "normalizeDeepTimeDayEntry",
  "mergeAnniversaryDeepTimeDaysForSync",
  "mergeAnniversaryDeepTimeDaysForSync",
  "mergeAnniversaryTw020ModuleForSync",
  "mergeAnniversaryTwAnchorModuleForSync",
  "mergeAnniversaryTwKeyResultsForSync",
  "listAnniversaryTwStateKeysForSync",
  "anniversaryTwStateKeyFromModuleKey",
  "materializePayloadDoneForMerge",
  "applyCloudPayloadWithMerge",
  "mergeLocalStateWithRemotePayloadBeforePush",
  "mergeReadingPlanBooksForSync",
  "mergeReadingPlanOneBookForSync",
  "mergeReadingPlanChaptersForSync",
  "mergeFuelScoresForSync",
  "mergeFuelScoresForSync",
  "mergeDailyWinTomorrowRefForSync",
  "filterDailyWinTomorrowRefByTombstones",
  "mergeWeeklyPlanDoneRefItemsForSync",
  "mergeWeeklyPlanDoneRefForSync",
  "mergeWeeklyPlanDoneSuppressForSync",
  "mergeAnniversaryDoneRefItemsForSync",
  "mergeAnniversaryDoneRefForSync",
  "mergeProjectTasksForSync",
  "mergeRuleOf100ObjectForSync",
  "mergeRule100DayEntryForSync",
  "mergeRule100UnitEntryForSync",
  "mergeRule100KeyArrays",
  "isRule100DayKey",
  "isRule100UnitKey",
  "omitTombstonedRuleOf100Keys",
  "filterRule100ProjectKeysAfterSyncMerge",
  "rule100CardKeyTombstoneId",
  "mergeCloudSyncForgePulseIntoState",
  "mergeCloudSyncReadingPlanPulseIntoState",
  "mergeCloudSyncAnniversaryModulePulseIntoState",
  "runDataRetentionPass",
  "purgeExpiredTrash",
  "pruneTrashEntryCount",
  "compactStateForLocalStorage",
  "stableHeavyDepJson",
  "collectAnniversaryHeavyDepPayload",
  "collectForgeMinsHeavyDepPayload",
  "getHeavyModuleDependencySnapshot",
  "allHeavyModuleSlicesDirty",
  "diffHeavyModuleDependencies",
  "planHeavyModuleRenders",
  "projectWeeklyPlanTaskForUi",
  "projectReadingPlanBookForUi",
  "collectWeeklyPlanUiClosedListGate",
  "collectWeeklyPlanUiDepPayload",
  "getWeeklyPlanUiDependencySnapshot",
  "shouldRenderWeeklyPlanUI"
];

const OPTIONAL_FNS = [];

function skipStringAndComment(src, i) {
  const c = src[i];
  const n = src[i + 1];
  if (c === "/" && n === "/") {
    const end = src.indexOf("\n", i + 2);
    return end < 0 ? src.length : end + 1;
  }
  if (c === "/" && n === "*") {
    const end = src.indexOf("*/", i + 2);
    return end < 0 ? src.length : end + 2;
  }
  if (c === "'" || c === '"' || c === "`") {
    const quote = c;
    i += 1;
    while (i < src.length) {
      if (src[i] === "\\") {
        i += 2;
        continue;
      }
      if (quote === "`" && src[i] === "$" && src[i + 1] === "{") {
        i += 2;
        let depth = 1;
        while (i < src.length && depth > 0) {
          if (src[i] === "'" || src[i] === '"' || src[i] === "`") {
            i = skipStringAndComment(src, i);
            continue;
          }
          if (src[i] === "{") depth += 1;
          else if (src[i] === "}") depth -= 1;
          i += 1;
        }
        continue;
      }
      if (src[i] === quote) return i + 1;
      i += 1;
    }
    return src.length;
  }
  return i;
}

function extractFunctionSource(src, name) {
  const re = new RegExp("function\\s+" + name + "\\s*\\(");
  const m = re.exec(src);
  if (!m) return null;
  let i = m.index + m[0].length - 1;
  while (i < src.length && src[i] !== "{") {
    if (src[i] === "'" || src[i] === '"' || src[i] === "`" || src[i] === "/") {
      const next = skipStringAndComment(src, i);
      if (next !== i) {
        i = next;
        continue;
      }
    }
    i += 1;
  }
  if (src[i] !== "{") return null;
  const start = m.index;
  let depth = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"' || c === "`" || (c === "/" && (src[i + 1] === "/" || src[i + 1] === "*"))) {
      i = skipStringAndComment(src, i);
      continue;
    }
    if (c === "{") depth += 1;
    else if (c === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
    i += 1;
  }
  return null;
}

function createLocalStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(String(k)) ? map.get(String(k)) : null;
    },
    setItem(k, v) {
      map.set(String(k), String(v));
    },
    removeItem(k) {
      map.delete(String(k));
    }
  };
}

export function loadSyncFns(indexPath) {
  const htmlPath = indexPath || INDEX_HTML_PATH;
  const html = fs.readFileSync(htmlPath, "utf8");
  const missing = [];
  const chunks = [];
  REQUIRED_FNS.concat(OPTIONAL_FNS).forEach(function (name) {
    const src = extractFunctionSource(html, name);
    if (!src) {
      if (REQUIRED_FNS.indexOf(name) >= 0) missing.push(name);
      return;
    }
    chunks.push(src);
  });
  if (missing.length) {
    throw new Error("未能从 index.html 抽取函数: " + missing.join(", "));
  }

  const localStorage = createLocalStorage();
  const sandbox = {
    console,
    Date,
    Math,
    JSON,
    Object,
    Array,
    Map,
    Set,
    String,
    Number,
    Boolean,
    parseInt,
    isFinite,
    Infinity,
    NaN,
    undefined,
    localStorage,
    document: {
      getElementById: function () {
        return null;
      },
      querySelector: function () {
        return null;
      },
      querySelectorAll: function () {
        return [];
      }
    },
    performance: { now: function () { return Date.now(); } },
    state: {
      done: [],
      memo: [],
      closedList: [],
      stopDoing: [],
      notToDo: [],
      dailyWin: [],
      kineticCountdowns: [],
      habitCheckins: {},
      weeklyPlan: {},
      syncTombstones: {},
      readingPlan: { books: [] }
    },
    cloudSyncSuppressPush: false,
    cloudSyncLastErrorMsg: "",
    cloudSyncLastFullPushAt: 0,
    isCloudSyncPerfEnabled: function () {
      return false;
    },
    cloudSyncPerfCounters: {
      cloudMergeCount: 0,
      cloudPullCount: 0,
      cloudPushCount: 0
    },
    beginCloudSyncPerf: function () {
      return null;
    },
    addCloudSyncPerf: function () {},
    cloudSyncPerfJsonStringify: function (value) {
      return JSON.stringify(value);
    },
    CLOUD_SYNC_CONFLICT_LOG_KEY: "todo-app-cloud-conflict-log-v1",
    CLOUD_SYNC_CONFLICT_LOG_MAX: 40,
    ANNIVERSARY_PROGRESS_BAND_DEFAULTS: Object.freeze({ okMinPct: 85, cautionMinPct: 40 }),
    DONE_MOVE_HOURLY_KINDS: Object.freeze([
      Object.freeze({ id: "mind", label: "Mind Training" }),
      Object.freeze({ id: "body", label: "Body Training" }),
      Object.freeze({ id: "sex", label: "Sex Training" })
    ]),
    DONE_MOVE_ALERT_HOUR_MIN: 5,
    DONE_MOVE_ALERT_HOUR_MAX: 22,
    ANNIVERSARY_TW_OKR_MAX_KEY_RESULTS: 4,
    TRASH_RETENTION_MS: 7 * 24 * 60 * 60 * 1000,
    DATA_RETENTION: {
      trashMaxCount: 500,
      aggressiveTrashMaxCount: 80
    },
    hygieneDoneCalls: 0,
    hygieneClosedCalls: 0
  };
  sandbox.window = sandbox;
  sandbox.global = sandbox;
  sandbox.self = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(chunks.join("\n;\n"), sandbox, { filename: "index.html#sync-fns" });

  const stubs = {
    findWeeklyPlanCompletionTimestampFromEvidence: "function findWeeklyPlanCompletionTimestampFromEvidence() { return null; }",
    reconcileDerivedCheckinsOnStateObject: "function reconcileDerivedCheckinsOnStateObject() {}",
    enforceCloudSyncLifetimeMaxOnStateObject: "function enforceCloudSyncLifetimeMaxOnStateObject() {}",
    setCloudSyncLifetimeEnforceSides: "function setCloudSyncLifetimeEnforceSides() {}",
    clearCloudSyncLifetimeEnforceSides: "function clearCloudSyncLifetimeEnforceSides() {}",
    applyRemoteState: "function applyRemoteState() { return false; }",
    applyMergedCloudStateInMemory:
      "function applyMergedCloudStateInMemory(merged) { if (!merged) return { ok: false }; state = merged; return { ok: true }; }",
    setCloudSyncStatus: "function setCloudSyncStatus() {}",
    getCloudLastSeenUpdatedAt: "function getCloudLastSeenUpdatedAt() { return 0; }",
    pushCloudSyncPulseOnly: "function pushCloudSyncPulseOnly() {}",
    scheduleCloudSyncFullPushDeferred: "function scheduleCloudSyncFullPushDeferred() {}",
    persistStateToLocalStorage: "function persistStateToLocalStorage() { return { ok: true }; }",
    render: "function render() {}",
    dedupeWeeklyPlanDuplicateIdsAcrossBuckets: "function dedupeWeeklyPlanDuplicateIdsAcrossBuckets() {}",
    reconcileWeeklyPlanTasksToDeadlineWeeks: "function reconcileWeeklyPlanTasksToDeadlineWeeks() { return false; }",
    getAnniversaryTwStateModule:
      "function getAnniversaryTwStateModule(moduleKey) { var sk = anniversaryTwStateKeyFromModuleKey(moduleKey); if (!state[sk] || typeof state[sk] !== 'object') state[sk] = { weeks: {} }; return state[sk]; }",
    normalizeAnniversaryTwModuleStateByKey: "function normalizeAnniversaryTwModuleStateByKey() {}",
    mergeForgeForSync:
      "function mergeForgeForSync(localForge, remoteForge, preferRemote) { var lo = localForge && typeof localForge === 'object' ? localForge : {}; var ro = remoteForge && typeof remoteForge === 'object' ? remoteForge : {}; return preferRemote ? Object.assign({}, lo, ro) : Object.assign({}, ro, lo); }",
    getForgeDoneLineInfo: "function getForgeDoneLineInfo() { return null; }",
    ensureAnniversaryTwWeekGoalsOnModule: "function ensureAnniversaryTwWeekGoalsOnModule() {}",
    formatDateInputValue:
      "function formatDateInputValue(date) { var d = date instanceof Date ? date : new Date(date); if (!Number.isFinite(d.getTime())) return ''; var m = String(d.getMonth() + 1).padStart(2, '0'); var day = String(d.getDate()).padStart(2, '0'); return d.getFullYear() + '-' + m + '-' + day; }",
    pruneRedundantDoneEntriesInState:
      "function pruneRedundantDoneEntriesInState() { hygieneDoneCalls += 1; return false; }",
    dedupeClosedListWeeklyPlanMirrorsInState:
      "function dedupeClosedListWeeklyPlanMirrorsInState() { hygieneClosedCalls += 1; return false; }",
    pruneDoneHistoryByRetention: "function pruneDoneHistoryByRetention() { return false; }",
    stripEmptyDoneJournalsOnOldEntries: "function stripEmptyDoneJournalsOnOldEntries() { return false; }",
    pruneOldHabitCheckinDays: "function pruneOldHabitCheckinDays() { return false; }",
    pruneOldFuelScores: "function pruneOldFuelScores() { return false; }",
    pruneOldMemos: "function pruneOldMemos() { return false; }"
  };
  Object.keys(stubs).forEach(function (name) {
    if (typeof sandbox[name] !== "function") {
      vm.runInContext(stubs[name], sandbox);
    }
  });

  return sandbox;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const ctx = loadSyncFns();
  const loaded = REQUIRED_FNS.filter(function (n) {
    return typeof ctx[n] === "function";
  });
  console.log("extracted", loaded.length + "/" + REQUIRED_FNS.length, "functions");
}
