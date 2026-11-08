(function () {
    try {
      var t = localStorage.getItem("dts_theme");
      if (!t) t = (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", t);
    } catch (_) {}
  })();



const DATA_URL = "https://script.google.com/macros/s/AKfycbzG9WpDIOKBoyABH-mf2JgiEvAuKVQU22iV6Fz39iuP6Snav4pI-8svXjpuJTeW8FFf/exec";
const normDate = v => {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v * 86400000));
    return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 19).replace("T", " ");
  }
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 19).replace("T", " ");
  }
  const text = String(v).trim();
  if (/^\d+(?:\.\d+)?$/.test(text)) return normDate(Number(text));
  const parsed = new Date(text.replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) return text;
  if (/Z$/.test(text)) {
    const d = new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60000);
    return d.toISOString().slice(0, 19).replace("T", " ");
  }
  return text.slice(0, 19).replace("T", " ");
};

/* ---------- Theme ---------- */
const THEME_KEY = "dts_theme";
const themeNow = () => (document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
function applyTheme(t, persist) {
  const light = t === "light";
  document.documentElement.setAttribute("data-theme", light ? "light" : "dark");
  document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
    const icon = btn.querySelector("i");
    if (icon) icon.className = `fa-solid ${light ? "fa-moon" : "fa-sun"}`;
    const long = btn.dataset.themeMode === "long";
    const span = btn.querySelector(".theme-label");
    if (span) span.textContent = light ? (long ? "Dark mode" : "Dark") : (long ? "Light mode" : "Light");
    btn.setAttribute("aria-label", light ? "Switch to dark mode" : "Switch to light mode");
  });
  if (persist) { try { localStorage.setItem(THEME_KEY, t); } catch (_) {} }
  if (persist && typeof window.__reinitCharts === "function") window.__reinitCharts();
}
(function initTheme() {
  let t = null;
  try { t = localStorage.getItem(THEME_KEY); } catch (_) {}
  if (!t) t = (window.matchMedia && matchMedia("(prefers-color-scheme: light)").matches) ? "light" : "dark";
  applyTheme(t, false);
})();
document.querySelectorAll("[data-theme-toggle]").forEach(btn => {
  btn.addEventListener("click", () => applyTheme(themeNow() === "light" ? "dark" : "light", true));
});

function jsonpDashboard(key) {
  return new Promise((resolve, reject) => {
    const cb = "cb" + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
    const s = document.createElement("script");
    const cleanup = () => { clearTimeout(timer); delete window[cb]; s.remove(); };
    const timer = setTimeout(() => { cleanup(); reject(new Error("timeout")); }, 20000);
    window[cb] = data => { cleanup(); resolve(data); };
    s.onerror = () => { cleanup(); reject(new Error("network / script unreachable")); };
    s.src = DATA_URL + "?key=" + encodeURIComponent(key) + "&callback=" + cb;
    document.body.appendChild(s);
  });
}

function transformData(payload) {
  const s = payload.sheets;
  const D = {
    ops:   (s.operations       || []).map(r => ({ id:+r.id, amount:+r.amount, created_at:normDate(r.created_at), user_id:r.user_id })).filter(r => r.created_at),
    log:   (s.operations_log   || []).map(r => ({ id:+r.id, value:+r.value, op_type:r.op_type, created_at:normDate(r.created_at), user_id:r.user_id })),
    users: (s.users            || []).map(r => ({ id:r.id, email:r.email, created_at:normDate(r.created_at) })),
    monthly: [], summary: null
  };
  D.ops.sort((a, b) => a.id - b.id);
  D.log.sort((a, b) => a.id - b.id);
  const agg = {};
  D.ops.forEach(o => { const k = o.created_at.slice(0, 7); const a = agg[k] || (agg[k] = { count: 0, total: 0 }); a.count++; a.total += o.amount; });
  D.monthly = Object.keys(agg).sort().map(k => ({ month: k, count: agg[k].count, total: +agg[k].total.toFixed(2) }));
  const adds = D.log.filter(l => l.op_type === "add").reduce((s, l) => s + l.value, 0);
  const subs = D.log.filter(l => l.op_type === "sub").reduce((s, l) => s + l.value, 0);
  D.summary = {
    totalAmount: +D.ops.reduce((s, o) => s + o.amount, 0).toFixed(2),
    adds: +adds.toFixed(2), subs: +subs.toFixed(2), netLog: +(adds - subs).toFixed(2)
  };
  return D;
}

(async () => {

const state = { sort: {}, view: {}, monthlyGranularity: "month", periodMode: { operations: "all", olog: "all" }, periodValue: { operations: "", olog: "" } };
let sessionKey = "";
let chartInstances = [];

function periodMatches(row, mode, value) {
  if (mode === "all" || !value) return true;
  const date = String(row.created_at || "");
  if (mode === "day") return date.slice(0, 10) === value;
  if (mode === "month") return date.slice(0, 7) === value;
  if (mode === "year") return date.slice(0, 4) === value;
  return true;
}

function periodSummaryRows(ops, mode) {
  const groups = {};
  ops.forEach(o => {
    const key = mode === "day" ? o.created_at.slice(0, 10) : mode === "year" ? o.created_at.slice(0, 4) : o.created_at.slice(0, 7);
    const group = groups[key] || (groups[key] = { period: key, count: 0, total: 0 });
    group.count++;
    group.total += o.amount;
  });
  return Object.keys(groups).sort().map(key => ({ ...groups[key], total: +groups[key].total.toFixed(2) }));
}

const fmtNo = n => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const showLoading = () => {
  document.getElementById("gate").classList.add("hidden");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("hdr").classList.add("hidden");
  document.getElementById("loading").classList.add("loading-visible");
};
const showLogin = () => {
  document.getElementById("loading").classList.remove("loading-visible");
  document.getElementById("hdr").classList.add("hidden");
  document.getElementById("app").classList.add("hidden");
  document.getElementById("gate").classList.remove("hidden");
};
const showDashboard = () => {
  document.getElementById("loading").classList.remove("loading-visible");
  document.getElementById("gate").classList.add("hidden");
  document.getElementById("app").classList.remove("hidden");
  document.getElementById("hdr").classList.remove("hidden");
};
const money = n => (n < 0 ? "-" : "") + fmtNo(Math.abs(n)) + " DH";
const esc = s => String(s).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
}

async function validateKey(key) {
  const payload = await jsonpDashboard(key);
  if (!payload || !payload.access) {
    throw new Error((payload && payload.message) || "Incorrect password.");
  }
  return transformData(payload);
}

/* Safe storage : localStorage is blocked on file:// (Chrome) -> memory fallback */
const store = {
  _mem: {},
  get(k) { try { return localStorage.getItem(k); } catch (_) { return k in this._mem ? this._mem[k] : null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (_) { this._mem[k] = v; } },
  del(k) { try { localStorage.removeItem(k); } catch (_) { delete this._mem[k]; } }
};

function buildApp(D) {
  showDashboard();
/* Refresh & Logout */
  document.getElementById("btnRefresh").addEventListener("click", () => location.reload());
  const settingsButton = document.getElementById("btnSettings");
  const settingsMenu = document.getElementById("settingsMenu");
  settingsButton.addEventListener("click", () => {
    const open = settingsMenu.classList.toggle("hidden") === false;
    settingsButton.setAttribute("aria-expanded", open ? "true" : "false");
  });
  document.getElementById("mobileRefresh").addEventListener("click", () => document.getElementById("btnRefresh").click());
  document.getElementById("mobileLogout").addEventListener("click", () => document.getElementById("btnLogout").click());
  document.addEventListener("click", e => {
    if (!e.target.closest(".settings-wrap")) {
      settingsMenu.classList.add("hidden");
      settingsButton.setAttribute("aria-expanded", "false");
    }
  });
  document.getElementById("btnLogout").addEventListener("click", () => {
    sessionKey = "";
    location.reload();
  });

  /* update tab labels with live counts */
  document.querySelector('button[data-tab="operations"] .tab-count').textContent = D.ops.length;
  document.querySelector('button[data-tab="olog"] .tab-count').textContent = D.log.length;
  document.querySelector('button[data-tab="users"] .tab-count').textContent = D.users.length;
  const footerCounts = document.getElementById("footerCounts");
  if (footerCounts) footerCounts.textContent = `Loaded ${D.ops.length} operations, ${D.log.length} log entries, and ${D.users.length} users.`;

  /* data freshness stamp */
  const ua = document.getElementById("updatedAt");
  if (ua) ua.textContent = "loaded " + new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" });

  /* ---------- Stats cards ---------- */
  const first = D.ops[0], last = D.ops[D.ops.length - 1];
  const rangeHint = first && last
    ? `${first.created_at.slice(0, 10)} &rarr; ${last.created_at.slice(0, 10)}`
    : "No operations in the dataset";
  const yearHint = first && last
    ? `${first.created_at.slice(0, 4)} &rarr; ${last.created_at.slice(0, 4)}`
    : "No data";
  const monthsSpan = (first && last) ? (() => {
    const [fy, fm] = first.created_at.slice(0, 7).split("-").map(Number);
    const [ly, lm] = last.created_at.slice(0, 7).split("-").map(Number);
    return (ly - fy) * 12 + (lm - fm) + 1;
  })() : 0;
  document.getElementById("stats").innerHTML = [
    { label:"Total amount", value:money(D.summary.totalAmount), cls:"money", hint:`sum of ${D.ops.length} operations` },
    { label:"Net from log", value:money(D.summary.netLog), cls:"net", hint:`adds ${fmtNo(D.summary.adds)} &minus; subs ${fmtNo(D.summary.subs)}` },
    { label:"Operations", value:D.ops.length, cls:"", hint:yearHint },
    { label:"Date range", value:monthsSpan ? `${monthsSpan} mo` : "\u2014", cls:"", hint:rangeHint }
  ].map(s => `<div class="stat"><div class="label">${s.label}</div><div class="value ${s.cls}">${s.value}</div><div class="hint">${s.hint}</div></div>`).join("");

  /* ---------- Table renderer ---------- */
  const TABLES = {
    operations: {
      data: () => D.ops,
      cols: [
        { key:"id", label:"ID", num:true },
        { key:"op_type", label:"Type", fmt:(v,r)=>{ const type = v || (Number(r.amount) < 0 ? "sub" : "add"); return `<td><span class="tag ${type === "sub" ? "sub" : "add"}">${type === "sub" ? "sub (-)" : "add (+)"}</span></td>`; } },
        { key:"amount", label:"Amount", num:true, fmt:v=>`<td class="num money">${fmtNo(v)} DH</td>` },
        { key:"created_at", label:"Created at" },
        { key:"user_id", label:"User", num:true },
        { key:"actions", label:"Actions", fmt:(v,r)=>`<td><button type="button" class="tool-btn delete-operation" data-delete-operation="${esc(r.id)}" aria-label="Delete operation ${esc(r.id)}"><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button></td>` }
      ]
    },
    olog: {
      data: () => D.log,
      cols: [
        { key:"id", label:"ID", num:true },
        { key:"value", label:"Value", num:true, fmt:v=>`<td class="num ${v<0?"neg":"money"}">${fmtNo(Math.abs(v))} DH</td>` },
        { key:"op_type", label:"Type", fmt:v=>`<td><span class="tag ${v}">${v}</span></td>` },
        { key:"created_at", label:"Created at" },
        { key:"user_id", label:"User", num:true }
      ]
    },
    monthly: {
      data: () => periodSummaryRows(D.ops, state.monthlyGranularity),
      sort: [["period",1]],
      cols: [
        { key:"period", label:"Period" },
        { key:"count", label:"Count", num:true },
        { key:"total", label:"Total amount", num:true, fmt:v=>`<td class="num money">${fmtNo(v)} DH</td>` }
      ]
    },
    users: {
      data: () => D.users,
      cols: [
        { key:"id", label:"ID", num:true },
        { key:"email", label:"Email" },
        { key:"created_at", label:"Created at" }
      ]
    }
  };

  function renderTable(name) {
    const cfg = TABLES[name], tbl = document.getElementById("tbl-"+name);
    const rows = cfg.data();
    let sorted = rows.slice();
    const sk = state.sort[name];
    if (sk) {
      sorted.sort((a,b) => {
        let x = a[sk.key], y = b[sk.key];
        if (typeof x === "string") { x = x.toLowerCase(); y = String(y).toLowerCase(); }
        return (x < y ? -1 : x > y ? 1 : 0) * sk.dir;
      });
    }
    const searchKey = name === "operations" || name === "olog" ? name : null;
    const q = searchKey ? (document.querySelector(`input[data-filter="${searchKey}"]`)?.value || "").toLowerCase().trim() : "";
    let visible = sorted;
    if (q) visible = visible.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));
    if (name === "operations" || name === "olog") {
      visible = visible.filter(r => periodMatches(r, state.periodMode[name], state.periodValue[name]));
    }
    state.view[name] = visible;

    const sortKey = name !== "monthly" && state.sort[name] ? state.sort[name] : (cfg.sort ? {key:cfg.sort[0][0], dir:1} : null);
    tbl.innerHTML = "<thead><tr>" + cfg.cols.map(c => {
      const active = sortKey && sortKey.key === c.key;
      const aria = active ? (sortKey.dir > 0 ? "ascending" : "descending") : "none";
      const arrow = active ? `<span class="arrow"><i class="fa-solid ${sortKey.dir>0?"fa-caret-up":"fa-caret-down"}" aria-hidden="true"></i></span>` : "";
              return `<th data-t="${name}" data-k="${c.key}" class="${c.num?"num":""}" tabindex="0" aria-sort="${aria}">${c.label}${arrow}</th>`;
    }).join("") + "</tr></thead><tbody>" +
    (visible.length ? visible.map(r => "<tr>" + cfg.cols.map(c => c.fmt ? c.fmt(r[c.key], r) : (r[c.key] === null || r[c.key] === undefined ? "<td class='muted'></td>" : `<td class='${c.num?"num":""}'>${esc(r[c.key])}</td>`)).join("") + "</tr>").join("") : `<tr><td colspan="${cfg.cols.length}" class="empty"><i class="fa-solid fa-magnifying-glass" aria-hidden="true"></i><p>No rows match your search.</p></td></tr>`) + "</tbody>";

    const el = document.getElementById("count-"+name);
    if (el) el.textContent = `${visible.length} of ${rows.length} rows`;
  }

  async function saveOperationToBackend(operation) {
    const response = await fetch(DATA_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action:"createOperation", key:sessionKey, operation })
    });
    let result = null;
    try { result = await response.json(); } catch (_) { throw new Error("The backend returned an invalid response."); }
    if (!response.ok || !result.ok) throw new Error((result && result.message) || "Could not save the operation.");
    return result;
  }

  async function deleteOperationFromBackend(id) {
    const response = await fetch(DATA_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action:"deleteOperation", key:sessionKey, id:Number(id) })
    });
    let result = null;
    try { result = await response.json(); } catch (_) { throw new Error("The backend returned an invalid response."); }
    if (!response.ok || !result.ok) throw new Error((result && result.message) || "Could not delete the operation.");
    return result;
  }

  async function handleLocalAdd(e) {
    e.preventDefault();
    const form = e.currentTarget;
    const opType = form.elements.op_type.value;
    const rawAmount = Number(form.elements.amount.value);
    const amount = opType === "sub" ? -Math.abs(rawAmount) : Math.abs(rawAmount);
    const createdInput = form.elements.created_at.value;
    const error = document.getElementById("addOperationError");
    if (!Number.isFinite(rawAmount) || rawAmount < 0) { error.textContent = "Enter an amount of 0 or greater."; return; }
    if (!createdInput) { error.textContent = "Choose a date and time."; return; }
    const createdAt = createdInput.replace("T", " ") + (createdInput.length === 16 ? ":00" : "");
    const currentUser = D.users[0] && D.users[0].id !== undefined ? D.users[0].id : "current-user";
    const submit = form.querySelector('button[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Saving…";
    try {
      await saveOperationToBackend({ amount:+amount.toFixed(2), op_type:opType, created_at:createdAt, user_id:currentUser });
      document.getElementById("addOperationModal").classList.add("hidden");
      form.reset();
      error.textContent = "";
      showToast("Operation saved successfully");
      setTimeout(() => location.reload(), 350);
    } catch (err) {
      error.textContent = err.message || "Could not save the operation.";
    } finally {
      submit.disabled = false;
      submit.textContent = "Add operation";
    }
  }

  document.getElementById("addOperationForm").addEventListener("submit", handleLocalAdd);
  const addModal = document.getElementById("addOperationModal");
  const closeAddModal = () => { addModal.classList.add("hidden"); document.getElementById("addOperationError").textContent = ""; };
  document.getElementById("btnAddOperation").addEventListener("click", () => {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById("addCreatedAt").value = now.toISOString().slice(0, 16);
    addModal.classList.remove("hidden");
    document.getElementById("addAmount").focus();
  });
  document.getElementById("closeAddOperation").addEventListener("click", closeAddModal);
  document.getElementById("cancelAddOperation").addEventListener("click", closeAddModal);
  addModal.addEventListener("click", e => { if (e.target === addModal) closeAddModal(); });

  function showConfirm(message) {
    const modal = document.getElementById("confirmOperationModal");
    const messageEl = document.getElementById("confirmOperationMessage");
    const accept = document.getElementById("acceptConfirmOperation");
    const cancel = document.getElementById("cancelConfirmOperation");
    const close = document.getElementById("closeConfirmOperation");
    messageEl.textContent = message;
    modal.classList.remove("hidden");
    return new Promise(resolve => {
      const finish = value => {
        modal.classList.add("hidden");
        accept.removeEventListener("click", onAccept);
        cancel.removeEventListener("click", onCancel);
        close.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        resolve(value);
      };
      const onAccept = () => finish(true);
      const onCancel = () => finish(false);
      const onBackdrop = e => { if (e.target === modal) finish(false); };
      accept.addEventListener("click", onAccept);
      cancel.addEventListener("click", onCancel);
      close.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);
      accept.focus();
    });
  }

  /* Sort on header click */
  document.addEventListener("click", async e => {
    const deleteButton = e.target.closest("[data-delete-operation]");
    if (deleteButton) {
      const id = deleteButton.dataset.deleteOperation;
      if (!await showConfirm(`Delete operation ${id}? This cannot be undone.`)) return;
      deleteButton.disabled = true;
      deleteOperationFromBackend(id).then(() => {
        showToast(`Operation ${id} deleted`);
        setTimeout(() => location.reload(), 350);
      }).catch(err => {
        deleteButton.disabled = false;
        showToast(err.message || "Could not delete the operation.");
      });
      return;
    }
    const th = e.target.closest("th[data-t]");
    if (!th) return;
    const {t, k} = th.dataset;
    const cur = state.sort[t];
    state.sort[t] = { key:k, dir: cur && cur.key === k ? -cur.dir : 1 };
    renderTable(t);
  });

  /* Sort on header keyboard (Enter / Space) */
  document.addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const th = e.target.closest("th[data-t]");
    if (!th) return;
    e.preventDefault();
    th.click();
  });

  /* Search filter */
  document.querySelectorAll("input[data-filter]").forEach(inp => {
    inp.addEventListener("input", () => renderTable(inp.dataset.filter));
    inp.addEventListener("keydown", e => {
      if (e.key === "Escape" && inp.value) {
        inp.value = "";
        renderTable(inp.dataset.filter);
      }
    });
  });

  /* Daily / monthly / yearly date filters for read tables */
  function updatePeriodControl(name) {
    const mode = state.periodMode[name];
    const input = document.querySelector(`input[data-period-value="${name}"]`);
    if (!input) return;
    input.hidden = mode === "all";
    input.type = mode === "year" ? "number" : (mode === "month" ? "month" : "date");
    input.min = mode === "year" ? "2000" : "";
    input.max = mode === "year" ? "2100" : "";
    input.placeholder = mode === "year" ? "YYYY" : "";
    input.setAttribute("aria-label", `Filter ${name === "olog" ? "log" : "operations"} by ${mode}`);
    input.value = state.periodValue[name];
  }
  document.querySelectorAll("select[data-period-mode]").forEach(select => {
    select.addEventListener("change", () => {
      const name = select.dataset.periodMode;
      state.periodMode[name] = select.value;
      state.periodValue[name] = "";
      updatePeriodControl(name);
      renderTable(name);
    });
  });
  document.querySelectorAll("input[data-period-value]").forEach(input => {
    input.addEventListener("input", () => {
      const name = input.dataset.periodValue;
      state.periodValue[name] = input.value;
      renderTable(name);
    });
  });
  ["operations", "olog"].forEach(updatePeriodControl);

  document.getElementById("monthlyGranularity").addEventListener("change", e => {
    state.monthlyGranularity = e.target.value;
    state.sort.monthly = { key:"period", dir:1 };
    renderTable("monthly");
  });

  /* Tabs (click + arrow keys, ARIA tabs) */
  const TABS = ["overview", "operations", "olog", "calendar", "monthly", "users"];
  const navBtns = Array.from(document.querySelectorAll("nav button[role=\"tab\"]"));
  const dashboardNav = document.querySelector("nav.dashboard-nav");
  const menuToggle = document.getElementById("dashboardMenuToggle");
  const menuIcon = menuToggle.querySelector(".menu-icon");
  const menuBackdrop = document.getElementById("mobileMenuBackdrop");
  menuToggle.addEventListener("click", () => {
    const open = dashboardNav.classList.toggle("menu-open");
    menuBackdrop.classList.toggle("hidden", !open);
    menuToggle.setAttribute("aria-expanded", open ? "true" : "false");
    menuIcon.className = `fa-solid ${open ? "fa-xmark" : "fa-bars"} menu-icon`;
  });
  menuBackdrop.addEventListener("click", () => {
    dashboardNav.classList.remove("menu-open");
    menuBackdrop.classList.add("hidden");
    menuToggle.setAttribute("aria-expanded", "false");
    menuIcon.className = "fa-solid fa-bars menu-icon";
  });
  function selectTab(name, focus) {
    navBtns.forEach(b => {
      const on = b.dataset.tab === name;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      if (on && focus) b.focus();
    });
    TABS.forEach(t => {
      const panel = document.getElementById("tab-" + t);
      if (panel) panel.classList.toggle("hidden", t !== name);
    });
    dashboardNav.classList.remove("menu-open");
    menuBackdrop.classList.add("hidden");
    menuToggle.setAttribute("aria-expanded", "false");
    menuIcon.className = "fa-solid fa-bars menu-icon";
  }
  navBtns.forEach((btn, i) => {
    btn.addEventListener("click", () => selectTab(btn.dataset.tab));
    btn.addEventListener("keydown", e => {
      let idx = i;
      if (e.key === "ArrowRight") idx = (i + 1) % navBtns.length;
      else if (e.key === "ArrowLeft") idx = (i - 1 + navBtns.length) % navBtns.length;
      else if (e.key === "Home") idx = 0;
      else if (e.key === "End") idx = navBtns.length - 1;
      else return;
      e.preventDefault();
      selectTab(navBtns[idx].dataset.tab, true);
    });
  });
  selectTab("overview");

  ["operations","olog","monthly","users"].forEach(renderTable);

  /* CSV export (exports the currently filtered + sorted view) */
  const csvCell = v => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const EXPORT_NAMES = { operations:"operations", olog:"operations-log", monthly:"monthly-summary", users:"users" };
  function exportCSV(name) {
    const cfg = TABLES[name];
    if (!cfg) return;
    const rows = (state.view && state.view[name]) || cfg.data();
    const lines = [cfg.cols.map(c => c.label)].concat(rows.map(r => cfg.cols.map(c => csvCell(r[c.key]))));
    const csv = "\ufeff" + lines.map(l => l.join(",")).join("\r\n");
    const blob = new Blob([csv], { type:"text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${EXPORT_NAMES[name] || name}-${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(`Exported ${rows.length} row${rows.length === 1 ? "" : "s"} to CSV`);
  }
  document.querySelectorAll("[data-export]").forEach(btn => {
    btn.addEventListener("click", () => exportCSV(btn.dataset.export));
  });

  /* ---------- Calendar ---------- */
  const MONTH_LABEL = d => d.toLocaleString("en-US", { month:"long", year:"numeric" });
  const byDay = {};
  D.ops.forEach(o => { const d = o.created_at.slice(0,10); (byDay[d] = byDay[d] || []).push(o); });

  let calCur = (() => {
    const dates = Object.keys(byDay).sort();
    return dates.length ? new Date(dates[dates.length-1] + "T00:00:00") : new Date();
  })();

  function renderCal(){
    const y = calCur.getFullYear(), m = calCur.getMonth();
    const calEl = document.getElementById("calendar");
    document.getElementById("calLabel").textContent = MONTH_LABEL(calCur);
    document.getElementById("calMonth").value = `${y}-${String(m+1).padStart(2,"0")}`;

    const cells = [`<div class="cal-grid">`];
    ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d => cells.push(`<div class="cal-dow">${d}</div>`));
    const lead = (new Date(y,m,1).getDay() + 6) % 7;
    const dim = new Date(y, m+1, 0).getDate();
    const today = new Date();
    for (let i = 0; i < lead; i++) cells.push(`<div class="cal-day blank"></div>`);
    let mTotal = 0, mCount = 0;
    for (let d = 1; d <= dim; d++) {
      const ds = `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      const arr = byDay[ds] || [];
      const t = arr.reduce((s,o) => s + o.amount, 0);
      mTotal += t; mCount += arr.length;
      const isToday = d === today.getDate() && m === today.getMonth() && y === today.getFullYear();
      const has = arr.length > 0;
      const aria = has ? ` aria-label="${ds}, ${arr.length} operation${arr.length>1?"s":""}, ${fmtNo(t)} DH" tabindex="0" role="button"` : "";
      cells.push(
        `<div class="cal-day${has ? " has" : " nodata"}${isToday ? " today" : ""}" data-date="${ds}"${aria}>` +
        `<div class="dnum">${d}${isToday ? " &bull;" : ""}</div>` +
        (has ? `<div class="dval">${fmtNo(t)} DH</div><div class="dcnt">${arr.length} operation${arr.length>1?"s":""}</div>` : ``) +
        `</div>`
      );
    }
    cells.push(`</div>`);
    calEl.innerHTML = cells.join("");
    document.getElementById("calSummary").innerHTML =
      mCount ? `${mCount} operations this month \u2014 <b>${fmtNo(mTotal)} DH</b>` : "No operations this month";
  }

  function showDay(ds){
    const arr = (byDay[ds] || []).slice().sort((a,b) => a.created_at < b.created_at ? -1 : 1);
    const det = document.getElementById("calDayDetail");
    if (!arr.length) { det.innerHTML = ""; return; }
    const t = arr.reduce((s,o) => s + o.amount, 0);
    const dObj = new Date(ds + "T00:00:00");
    det.innerHTML = `<div class="cal-detail"><h3>${MONTH_LABEL(dObj)} ${dObj.getDate()} &mdash; ${arr.length} operation${arr.length>1?"s":""}</h3>` +
      arr.map(o => `<div class="day-row"><span>#${o.id} &nbsp;&middot;&nbsp; ${o.created_at.slice(11)}</span><span class="money">${fmtNo(o.amount)} DH</span></div>`).join("") +
      `<div class="total-row"><span>Total</span><span>${fmtNo(t)} DH</span></div></div>`;
    det.scrollIntoView({ behavior:"smooth", block:"nearest" });
  }

  document.getElementById("calendar").addEventListener("click", e => {
    const day = e.target.closest(".cal-day.has");
    if (day) showDay(day.dataset.date);
  });
  document.getElementById("calendar").addEventListener("keydown", e => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const day = e.target.closest(".cal-day.has");
    if (!day) return;
    e.preventDefault();
    showDay(day.dataset.date);
  });
  document.getElementById("calPrev").addEventListener("click", () => { calCur = new Date(calCur.getFullYear(), calCur.getMonth()-1, 1); renderCal(); document.getElementById("calDayDetail").innerHTML = ""; });
  document.getElementById("calNext").addEventListener("click", () => { calCur = new Date(calCur.getFullYear(), calCur.getMonth()+1, 1); renderCal(); document.getElementById("calDayDetail").innerHTML = ""; });
  document.getElementById("calToday").addEventListener("click", () => { const n = new Date(); calCur = new Date(n.getFullYear(), n.getMonth(), 1); renderCal(); document.getElementById("calDayDetail").innerHTML = ""; });
  document.getElementById("calMonth").addEventListener("change", e => {
    if (e.target.value) { const [yy,mm] = e.target.value.split("-").map(Number); calCur = new Date(yy, mm-1, 1); renderCal(); document.getElementById("calDayDetail").innerHTML = ""; }
  });
  renderCal();

  /* ---------- Charts ---------- */
  function initCharts() {
    if (typeof Chart === "undefined") return false;
    chartInstances.forEach(c => { try { c.destroy(); } catch (_) {} });
    chartInstances = [];

    const CS = getComputedStyle(document.documentElement);
    const V = n => CS.getPropertyValue(n).trim();
    const gridColor = V("--chart-grid") || "rgba(51,65,85,.4)";
    const tickColor = V("--muted") || "#94a3b8";
    const cardColor = V("--card") || "#1e293b";
    const GRID = { color: gridColor };
    const TICK = { color: tickColor };
    const AXIS_Y = { ticks:{ ...TICK, callback:v=>v.toLocaleString()+" DH" }, grid:GRID };
    const byOps = (base) => ({ responsive: true, maintainAspectRatio: false, ...base });

    /* 1. Monthly bars */
    chartInstances.push(new Chart(document.getElementById("monthlyChart"), {
      type:"bar",
      data:{
        labels: D.monthly.map(m=>m.month),
        datasets:[
          { label:"Total (DH)", data:D.monthly.map(m=>m.total), backgroundColor:"rgba(56,189,248,.75)", borderRadius:5 },
          { label:"Count", data:D.monthly.map(m=>m.count), backgroundColor:"rgba(74,222,128,.6)", borderRadius:5, yAxisID:"y2" }
        ]
      },
      options: byOps({
        interaction:{ intersect:false, mode:"index" },
        plugins:{ legend:{ labels:{ color:tickColor } },
          tooltip:{ callbacks:{ label: c => `${c.dataset.label}: ${c.parsed.y.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}${c.dataset.yAxisID==="y2"?"":" DH"}` } } },
        scales:{
          x:{ ticks:{ ...TICK, maxRotation:90, autoSkip:true }, grid:GRID },
          y:AXIS_Y,
          y2:{ position:"right", grid:{ drawOnChartArea:false }, ticks:TICK }
        }
      })
    }));

    /* 2. Doughnut per year */
    const byYear = {};
    D.ops.forEach(o => { const y = o.created_at.slice(0,4); byYear[y] = (byYear[y]||0) + o.amount; });
    const PALETTE = ["#38bdf8","#4ade80","#fbbf24","#f87171","#a78bfa","#fb923c","#2dd4bf"];
    chartInstances.push(new Chart(document.getElementById("yearChart"), {
      type:"doughnut",
      data:{
        labels: Object.keys(byYear),
        datasets:[{ data:Object.values(byYear).map(v=>+v.toFixed(2)), backgroundColor:PALETTE, borderColor:cardColor, borderWidth:2 }]
      },
      options: byOps({
        cutout:"58%",
        plugins:{ legend:{ position:"right", labels:{ color:tickColor } },
          tooltip:{ callbacks:{ label: c => ` ${c.label}: ${c.parsed.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} DH` } } }
      })
    }));

    /* 3. Cumulative line */
    let run = 0;
    const cum = D.monthly.map(m => +(run += m.total).toFixed(2));
    chartInstances.push(new Chart(document.getElementById("cumChart"), {
      type:"line",
      data:{
        labels: D.monthly.map(m=>m.month),
        datasets:[{ label:"Cumulative (DH)", data:cum, borderColor:"#4ade80", backgroundColor:"rgba(74,222,128,.12)", fill:true, tension:.25, pointRadius:2, pointHoverRadius:5 }]
      },
      options: byOps({
        interaction:{ intersect:false, mode:"index" },
        plugins:{ legend:{ labels:{ color:tickColor } },
          tooltip:{ callbacks:{ label: c => ` ${c.dataset.label}: ${c.parsed.y.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} DH` } } },
        scales:{ x:{ ticks:{ ...TICK, maxRotation:90, autoSkip:true }, grid:GRID }, y:AXIS_Y }
      })
    }));

    /* 4. By weekday */
    const dowTotal = [0,0,0,0,0,0,0], dowCount = [0,0,0,0,0,0,0];
    D.ops.forEach(o => {
      const d = new Date(o.created_at.replace(" ", "T"));
      const idx = (d.getDay() + 6) % 7; /* Monday = 0 */
      dowTotal[idx] += o.amount; dowCount[idx]++;
    });
    chartInstances.push(new Chart(document.getElementById("dowChart"), {
      type:"bar",
      data:{
        labels:["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"],
        datasets:[{ label:"Total (DH)", data:dowTotal.map(v=>+v.toFixed(2)), backgroundColor:"rgba(251,191,36,.7)", borderRadius:5 }]
      },
      options: byOps({
        plugins:{ legend:{ display:false },
          tooltip:{ callbacks:{ label: c => ` ${c.parsed.y.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} DH (${dowCount[c.dataIndex]} operations)` } } },
        scales:{ x:{ ticks:TICK, grid:{ drawOnChartArea:false } }, y:AXIS_Y }
      })
    }));

    /* 5. Top 10 days */
    const topDays = Object.entries(byDay)
      .map(([d, arr]) => ({ d, total: arr.reduce((s,o) => s + o.amount, 0), n: arr.length }))
      .sort((a,b) => b.total - a.total)
      .slice(0, 10);
    chartInstances.push(new Chart(document.getElementById("topChart"), {
      type:"bar",
      data:{
        labels: topDays.map(x => x.d.slice(5) + "'" + x.d.slice(2,4)),
        datasets:[{ label:"Total (DH)", data:topDays.map(x=>+x.total.toFixed(2)), backgroundColor:"rgba(167,139,250,.7)", borderRadius:5 }]
      },
      options: byOps({
        indexAxis:"y",
        plugins:{ legend:{ display:false },
          tooltip:{ callbacks:{ label: c => ` ${c.parsed.x.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})} DH (${topDays[c.dataIndex].n} operations)` } } },
        scales:{
          x:AXIS_Y,
          y:{ ticks:TICK, grid:{ drawOnChartArea:false } }
        }
      })
    }));
    return true;
  }
  window.__reinitCharts = initCharts;
  if (!initCharts()) {
    let tries = 0;
    const timer = setInterval(() => {
      if (initCharts()) { clearInterval(timer); return; }
      if (++tries > 40) {
        clearInterval(timer);
        document.querySelectorAll(".chart-wrap canvas").forEach(c =>
          c.parentElement.innerHTML = `<div class="empty">Chart library unavailable (no internet) &mdash; totals are also shown in the Summary tab.</div>`);
      }
    }, 250);
  }
}

/* Password visibility toggle */
const passInput = document.getElementById("gatePass");
const passToggle = document.getElementById("passToggle");
passToggle.addEventListener("click", () => {
  const show = passInput.type === "password";
  passInput.type = show ? "text" : "password";
  passToggle.innerHTML = `<i class="fa-solid ${show ? "fa-eye-slash" : "fa-eye"}" aria-hidden="true"></i>`;
  passToggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  passInput.focus();
});

document.getElementById("gateForm").addEventListener("submit", async e => {
  e.preventDefault();
  const btn = document.getElementById("gateBtn");
  const inp = document.getElementById("gatePass");
  const msg = document.getElementById("gateMsg");
  msg.textContent = "";
  btn.disabled = true;
  btn.textContent = "Checking\u2026";
  try {
    const D = await validateKey(inp.value);
    sessionKey = inp.value;
    document.getElementById("gate").classList.add("hidden");
    inp.value = "";
    buildApp(D);
  } catch (err) {
    msg.textContent = err.message + "";
    const box = document.querySelector(".lock-box");
    box.classList.remove("shake");
    void box.offsetWidth;
    box.classList.add("shake");
    inp.focus();
  }
  btn.disabled = false;
  btn.textContent = "Log in";
});

(async () => {
  showLogin();
})();

})();

