/**
 * 3 天冲刺 microTasks 同步愈合：远端较新时丢弃本机独有旧子步骤、文案以远端为准。
 */
function mergeWeeklyPlanMicroDoneForSync(locMicro, remMicro, preferRemote) {
  const l = locMicro && locMicro.id ? locMicro : null;
  const r = remMicro && remMicro.id ? remMicro : null;
  if (!l) return r ? Object.assign({}, r) : null;
  if (!r) return Object.assign({}, l);
  const lTextU = Number(l.updatedAt) || 0;
  const rTextU = Number(r.updatedAt) || 0;
  let text = String((l.text != null ? l.text : "") || "");
  const rtText = String((r.text != null ? r.text : "") || "");
  if (rtText !== text) {
    if (rTextU > lTextU) text = rtText || text;
    else if (lTextU > rTextU) text = text || rtText;
    else text = preferRemote ? rtText || text : text || rtText;
  }
  return Object.assign({}, l, r, {
    id: l.id,
    text: text,
    done: Boolean(l.done) || Boolean(r.done),
    updatedAt: Math.max(lTextU, rTextU) || undefined
  });
}

function mergeWeeklyPlanMicroTasksForSync(locMicros, remMicros, preferRemote) {
  const L = Array.isArray(locMicros) ? locMicros : [];
  const R = Array.isArray(remMicros) ? remMicros : [];
  const map = new Map();
  L.forEach((m) => {
    if (m && m.id) map.set(m.id, m);
  });
  R.forEach((m) => {
    if (!m || !m.id) return;
    if (!map.has(m.id)) {
      map.set(m.id, m);
      return;
    }
    map.set(m.id, mergeWeeklyPlanMicroDoneForSync(map.get(m.id), m, preferRemote));
  });
  return Array.from(map.values());
}

function microTs(m) {
  return Math.max(Number(m && m.updatedAt) || 0, Number(m && m.createdAt) || 0);
}

function healMicrosPreferRemote(remote, local, rTs, preferRemote) {
  const merged = {
    id: remote.id,
    microTasks: mergeWeeklyPlanMicroTasksForSync(
      (local && local.microTasks) || [],
      remote.microTasks || [],
      preferRemote
    )
  };
  if (!preferRemote || !Array.isArray(remote.microTasks)) return merged;
  const remIds = new Set(
    remote.microTasks.filter((m) => m && m.id != null).map((m) => String(m.id))
  );
  const next = [];
  const seen = new Set();
  for (const rm of remote.microTasks) {
    if (!rm || rm.id == null) continue;
    const mid = String(rm.id);
    let picked = merged.microTasks.find((m) => m && String(m.id) === mid);
    if (!picked) picked = Object.assign({}, rm);
    else {
      const rU = Number(rm.updatedAt) || 0;
      const lU = Number(picked.updatedAt) || 0;
      if (rU > lU || (rU === lU && String(rm.text || "") !== String(picked.text || ""))) {
        picked.text = rm.text != null ? String(rm.text) : picked.text;
        if (rU > 0 || lU > 0) picked.updatedAt = Math.max(rU, lU);
      }
    }
    next.push(picked);
    seen.add(mid);
  }
  for (const lm of merged.microTasks) {
    if (!lm || lm.id == null) continue;
    const mid = String(lm.id);
    if (seen.has(mid) || remIds.has(mid)) continue;
    if (microTs(lm) > rTs) next.push(lm);
  }
  merged.microTasks = next;
  return merged;
}

const remote = {
  id: "t1",
  updatedAt: 2000,
  microTasks: [
    { id: "m1", text: "子A-新", updatedAt: 2000 },
    { id: "m2", text: "子B-新", updatedAt: 2000 }
  ]
};
const local = {
  id: "t1",
  updatedAt: 1000,
  microTasks: [
    { id: "m1", text: "子A-旧", updatedAt: 0 },
    { id: "m2", text: "子B-旧", updatedAt: 0 },
    { id: "m3", text: "本机旧多余", updatedAt: 0 }
  ]
};

const healed = healMicrosPreferRemote(remote, local, 2000, true);
const texts = healed.microTasks.map((m) => m.text);
const ids = healed.microTasks.map((m) => m.id);

let ok = true;
const checks = [
  ["count=2", healed.microTasks.length === 2],
  ["no m3", !ids.includes("m3")],
  ["textA", texts[0] === "子A-新"],
  ["textB", texts[1] === "子B-新"]
];
for (const [name, pass] of checks) {
  if (!pass) {
    ok = false;
    console.error("FAIL", name, texts, ids);
  } else console.log("PASS", name);
}

const localNew = {
  ...local,
  microTasks: local.microTasks.concat([{ id: "mNew", text: "刚加", updatedAt: 3000 }])
};
const healed2 = healMicrosPreferRemote(remote, localNew, 2000, true);
if (healed2.microTasks.length !== 3 || !healed2.microTasks.some((m) => m.id === "mNew")) {
  ok = false;
  console.error("FAIL keep-new", healed2.microTasks.map((m) => m.id));
} else console.log("PASS keep-new");

/* preferRemote 持平取远端文案 */
const tied = mergeWeeklyPlanMicroDoneForSync(
  { id: "m1", text: "本机", updatedAt: 0 },
  { id: "m1", text: "远端", updatedAt: 0 },
  true
);
if (tied.text !== "远端") {
  ok = false;
  console.error("FAIL tie-prefer-remote", tied);
} else console.log("PASS tie-prefer-remote");

if (!ok) process.exit(1);
console.log("OK sprint micro sync heal");
