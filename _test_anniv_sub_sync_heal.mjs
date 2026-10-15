/**
 * 十二周年子任务同步愈合：远端较新时丢弃本机独有旧子任务、文案以远端为准。
 * 不依赖浏览器；内联精简 merge 语义对照。
 */
function mergeTwSubsForSync(remSubs, locSubs, preferRemote) {
  const R = Array.isArray(remSubs) ? remSubs : [];
  const L = Array.isArray(locSubs) ? locSubs : [];
  const map = new Map();
  function packSub(s) {
    const out = { id: s.id, text: typeof s.text === "string" ? s.text : "", done: Boolean(s.done) };
    const u = Number(s.updatedAt);
    if (Number.isFinite(u) && u > 0) out.updatedAt = u;
    return out;
  }
  R.forEach(function (s) {
    if (!s || !s.id) return;
    map.set(s.id, packSub(s));
  });
  L.forEach(function (s) {
    if (!s || !s.id) return;
    const loc = packSub(s);
    const ex = map.get(loc.id);
    if (!ex) {
      map.set(loc.id, loc);
      return;
    }
    const rt = ex.text;
    const lt = loc.text;
    const rU = Number(ex.updatedAt) || 0;
    const lU = Number(loc.updatedAt) || 0;
    let text = lt;
    if (rt !== lt) {
      if (rU > lU) text = rt || lt;
      else if (lU > rU) text = lt || rt;
      else text = preferRemote ? rt || lt : lt || rt;
    }
    const out = { id: loc.id, text: text, done: Boolean(ex.done) || Boolean(loc.done) };
    const u = Math.max(rU, lU);
    if (u > 0) out.updatedAt = u;
    map.set(loc.id, out);
  });
  const order = [];
  const seen = new Set();
  R.forEach(function (s) {
    if (s && s.id && !seen.has(s.id)) {
      order.push(s.id);
      seen.add(s.id);
    }
  });
  L.forEach(function (s) {
    if (s && s.id && !seen.has(s.id)) {
      order.push(s.id);
      seen.add(s.id);
    }
  });
  return order.map((id) => map.get(id)).filter(Boolean);
}

function healSubsPreferRemote(remote, local, rTs, preferRemote) {
  const merged = {
    id: remote.id,
    text: remote.text,
    updatedAt: Math.max(rTs, Number(local && local.updatedAt) || 0),
    subs: mergeTwSubsForSync(remote.subs || [], (local && local.subs) || [], preferRemote)
  };
  if (!preferRemote || !Array.isArray(remote.subs)) return merged;
  const remIds = new Set(remote.subs.filter((s) => s && s.id != null).map((s) => String(s.id)));
  const nextSubs = [];
  const seen = new Set();
  for (const rs of remote.subs) {
    if (!rs || rs.id == null) continue;
    const sid = String(rs.id);
    let picked = merged.subs.find((ms) => ms && String(ms.id) === sid);
    if (!picked) {
      picked = { id: rs.id, text: rs.text || "", done: Boolean(rs.done) };
      if (rs.updatedAt) picked.updatedAt = rs.updatedAt;
    } else {
      const rU = Number(rs.updatedAt) || 0;
      const lU = Number(picked.updatedAt) || 0;
      if (rU > lU || (rU === lU && String(rs.text || "") !== String(picked.text || ""))) {
        picked.text = typeof rs.text === "string" ? rs.text : picked.text;
        if (rU > 0 || lU > 0) picked.updatedAt = Math.max(rU, lU);
      }
    }
    nextSubs.push(picked);
    seen.add(sid);
  }
  for (const ms of merged.subs) {
    if (!ms || ms.id == null) continue;
    const sid = String(ms.id);
    if (seen.has(sid) || remIds.has(sid)) continue;
    const msTs = Math.max(Number(ms.updatedAt) || 0, Number(ms.createdAt) || 0);
    if (msTs > rTs) nextSubs.push(ms);
  }
  merged.subs = nextSubs;
  return merged;
}

const remote = {
  id: "task1",
  text: "完成周运动最低标准",
  updatedAt: 2000,
  subs: [
    { id: "s1", text: "5公里慢跑", updatedAt: 2000 },
    { id: "s2", text: "150下腹肌轮", updatedAt: 2000 },
    { id: "s3", text: "100下壶铃深蹲 (24kg)", updatedAt: 2000 },
    { id: "s4", text: "100个跪姿俯卧撑", updatedAt: 2000 },
    { id: "s5", text: "2分钟单杠垂悬", updatedAt: 2000 },
    { id: "s6", text: "3分钟双杠撑（静态）", updatedAt: 2000 }
  ]
};

const local = {
  id: "task1",
  text: "完成周运动最低标准",
  updatedAt: 1000,
  subs: [
    { id: "s1", text: "5公里慢跑", updatedAt: 0 },
    { id: "s2", text: "15下腹肌轮", updatedAt: 0 },
    { id: "s3", text: "300下壶铃深蹲 (24kg)", updatedAt: 0 },
    { id: "s4", text: "100个标准俯卧撑", updatedAt: 0 },
    { id: "s5", text: "2分钟单杠垂悬", updatedAt: 0 },
    { id: "s6", text: "3分钟双杠撑（静态）", updatedAt: 0 },
    { id: "s7", text: "壶铃深蹲100下 (24kg)", updatedAt: 0 }
  ]
};

const healed = healSubsPreferRemote(remote, local, 2000, true);
const texts = healed.subs.map((s) => s.text);
const ids = healed.subs.map((s) => s.id);

const checks = [
  ["count=6", healed.subs.length === 6],
  ["no s7", !ids.includes("s7")],
  ["150", texts[1] === "150下腹肌轮"],
  ["100kg", texts[2] === "100下壶铃深蹲 (24kg)"],
  ["跪姿", texts[3] === "100个跪姿俯卧撑"]
];

let ok = true;
for (const [name, pass] of checks) {
  if (!pass) {
    ok = false;
    console.error("FAIL", name, texts, ids);
  } else {
    console.log("PASS", name);
  }
}

/* 本机刚新增的子任务（updatedAt > rTs）应保留 */
const localWithNew = {
  ...local,
  subs: local.subs.concat([{ id: "sNew", text: "本机新子任务", updatedAt: 3000 }])
};
const healed2 = healSubsPreferRemote(remote, localWithNew, 2000, true);
if (healed2.subs.length !== 7 || !healed2.subs.some((s) => s.id === "sNew")) {
  ok = false;
  console.error("FAIL keep-new-local-sub", healed2.subs.map((s) => s.id));
} else {
  console.log("PASS keep-new-local-sub");
}

if (!ok) process.exit(1);
console.log("OK anniv sub sync heal");
