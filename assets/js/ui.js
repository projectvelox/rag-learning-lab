// Tiny DOM helpers shared by every view.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export const $ = (sel, root = document) => root.querySelector(sel);

export function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

let toastTimer;
export function toast(message, kind = "xp") {
  let el = document.getElementById("toast");
  if (!el) {
    el = h("div", { id: "toast", role: "status", "aria-live": "polite" });
    document.body.append(el);
  }
  el.className = `toast show ${kind}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2400);
}

export function xpToast(xp, why) {
  if (xp > 0) toast(`+${xp} XP · ${why}`);
}

export function card(title, ...children) {
  return h("section", { class: "card" }, title ? h("h2", {}, title) : null, ...children);
}

// Render a chunk of markdown-ish text: tables become <table>, the rest stays as lines.
export function renderText(text) {
  const wrap = h("div", { class: "doc-text" });
  let table = null;
  for (const line of text.split("\n")) {
    if (line.trim().startsWith("|")) {
      if (/^\|?\s*:?-{3,}/.test(line.trim())) continue;
      const cells = line.trim().replace(/^\||\|$/g, "").split("|");
      if (!table) { table = h("table", { class: "mini-table" }); wrap.append(table); table.append(h("tr", {}, cells.map((c) => h("th", {}, c)))); }
      else table.append(h("tr", {}, cells.map((c) => h("td", {}, c))));
    } else {
      table = null;
      if (line.trim()) wrap.append(h("p", {}, line));
    }
  }
  return wrap;
}

export function download(filename, text, type = "text/markdown") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = h("a", { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export const pct = (x) => `${Math.round(x * 100)}%`;
export const fmt = (x, d = 3) => Number(x).toFixed(d);
