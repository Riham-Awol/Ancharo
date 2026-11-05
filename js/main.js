/* ==========================================================
   ✏️  EDIT THESE — everything you'll update regularly is here.
   ========================================================== */

/* Fundraising numbers (home page progress card). */
const FUNDRAISER = {
  raised: 1250000,          // amount collected so far
  goal: 5000000,            // target amount
  donors: 342,              // number of people who have given
  currency: "ETB",
  updated: "November 2026", // when you last updated these numbers
  deadline: "2027-06-30",   // campaign end date (YYYY-MM-DD) for the countdown, or "" to hide it
};

/* Supporters wall on the home page. Newest first.
   Only add people who agreed to be listed. Use "Anonymous" for anyone else.
   Leave the list empty [] to hide the section. These are SAMPLE entries, replace them. */
const SUPPORTERS = [
  { name: "Anonymous", amount: 5000 },
  { name: "A friend in Addis Ababa", amount: 2000 },
  { name: "Family in Dessie", amount: 10000 },
  { name: "Anonymous", amount: 1000 },
  { name: "Supporter in Dubai", amount: 7500 },
  { name: "Supporter in Washington DC", amount: 15000 },
  { name: "Anonymous", amount: 500 },
  { name: "A teacher from Ancharo", amount: 1500 },
];

/* Impact calculator: what one unit of each thing costs (in the currency above). */
const IMPACT = [
  { cost: 250,   one: "set of textbooks for a student", many: "sets of textbooks for students", icon: "book" },
  { cost: 500,   one: "new school desk",                many: "new school desks",               icon: "desk" },
  { cost: 2000,  one: "metre of road drainage",         many: "metres of road drainage",        icon: "road" },
  { cost: 15000, one: "solar street light",             many: "solar street lights",            icon: "light" },
];

/* Escape text before putting it into HTML. */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ---------- Mobile menu ---------- */
const toggle = document.querySelector(".nav__toggle");
const links = document.querySelector(".nav__links");
/* ---------- Header: clear over the big picture, frosted once you scroll ---------- */
const header = document.querySelector(".site-header");
const firstSection = document.querySelector("main > :first-child");
if (firstSection && firstSection.matches(".hero, .page-hero, .admin-top")) document.body.classList.add("has-overlay");
const updateHeader = () =>
  header && header.classList.toggle("is-scrolled", window.scrollY > 24 || (links && links.classList.contains("is-open")));
window.addEventListener("scroll", updateHeader, { passive: true });
updateHeader();

if (toggle && links) {
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open);
    updateHeader();
  });
}

/* ---------- Footer year ---------- */
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

/* ---------- Fundraising progress (with count-up animation) ---------- */
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function countUp(el, target, suffix = "") {
  if (reduceMotion) { el.textContent = fmt(target) + suffix; return; }
  const from = Number(el.dataset.shown || 0), start = performance.now(), dur = 1600;
  el.dataset.shown = target;
  const tick = (now) => {
    const t = Math.min(1, (now - start) / dur);
    el.textContent = fmt(from + (target - from) * (1 - Math.pow(1 - t, 3))) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

// Draws the progress card. Called with the numbers above, and again with live
// numbers from the database once the site is connected to Supabase.
function renderProgress(f) {
  const pct = f.goal > 0 ? Math.min(100, Math.round((f.raised / f.goal) * 100)) : 0;
  const cur = " " + f.currency;
  document.querySelectorAll("[data-raised]").forEach((el) => countUp(el, f.raised, cur));
  document.querySelectorAll("[data-goal]").forEach((el) => (el.textContent = fmt(f.goal) + cur));
  document.querySelectorAll("[data-donors]").forEach((el) => countUp(el, f.donors));
  document.querySelectorAll("[data-percent]").forEach((el) => (el.textContent = pct + "%"));
  document.querySelectorAll("[data-updated]").forEach((el) => (el.textContent = f.updated));
  document.querySelectorAll(".bar__fill").forEach((bar) => setTimeout(() => (bar.style.width = pct + "%"), 150));
  document.querySelectorAll("[data-currency]").forEach((el) => (el.textContent = f.currency));
  // Countdown to campaign deadline
  document.querySelectorAll("[data-countdown]").forEach((el) => {
    const days = f.deadline ? Math.ceil((new Date(f.deadline + "T23:59:59") - new Date()) / 86400000) : -1;
    el.hidden = days < 0;
    if (days >= 0) el.textContent = days === 0 ? "⏳ Last day!" : `⏳ ${fmt(days)} day${days === 1 ? "" : "s"} left`;
  });
}
// With Supabase connected (js/config.js), js/live.js draws the real numbers instead.
const LIVE = Boolean(window.ANCHARO_CONFIG && window.ANCHARO_CONFIG.supabaseUrl && window.ANCHARO_CONFIG.supabaseAnonKey);
if (!LIVE) renderProgress(FUNDRAISER);

/* ---------- Supporters wall ---------- */
function renderSupporters(list) {
  document.querySelectorAll("[data-supporters]").forEach((wrap) => {
    const section = wrap.closest("section");
    if (section) section.hidden = !list.length;
    if (!list.length) return;
    const initials = (n) => n === "Anonymous" ? "♥" : n.split(/\s+/).filter((w) => /^\p{Lu}/u.test(w)).slice(0, 2).map((w) => w[0]).join("") || "♥";
    const pill = (d) =>
      `<div class="supporter"><span class="supporter__avatar">${esc(initials(d.name))}</span>` +
      `<span class="supporter__name">${esc(d.name)}</span>` +
      (d.amount ? `<span class="supporter__amt">${fmt(d.amount)} ${esc(FUNDRAISER.currency)}</span>` : "") + `</div>`;
    const items = list.map(pill).join("");
    // The list is repeated once so the scrolling loop is seamless.
    wrap.innerHTML = `<div class="supporters__track">${items}<div style="display:contents" aria-hidden="true">${items}</div></div>`;
  });
}
renderSupporters(LIVE ? [] : SUPPORTERS);

/* ---------- Impact calculator ---------- */
const ICONS = {
  book: '<path d="M4 19.5V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 22h14"/>',
  desk: '<path d="M3 8h18M5 8v12M19 8v12M5 14h14"/>',
  road: '<path d="M4 21 9 3M20 21 15 3M12 5v2M12 11v2M12 17v2"/>',
  light: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.7.7 1 1.5 1 2.5h6c0-1 .3-1.8 1-2.5A6 6 0 0 0 12 3Z"/>',
};
document.querySelectorAll("[data-impact]").forEach((box) => {
  const input = box.querySelector(".impact__amount input");
  const range = box.querySelector(".impact__range");
  const list = box.querySelector(".impact__list");
  const presets = box.querySelectorAll("[data-amount]");
  const render = (amount) => {
    amount = Math.max(0, Number(amount) || 0);
    list.innerHTML = IMPACT.map((it) => {
      const n = amount / it.cost;
      const whole = Math.floor(n);
      const text = whole >= 1
        ? `<div class="impact__num">${fmt(whole)}</div><div class="impact__label">${whole === 1 ? it.one : it.many}</div>`
        : `<div class="impact__num">${Math.round(n * 100)}%</div><div class="impact__label">of a ${it.one}</div>`;
      return `<li class="impact__item"><span class="impact__icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[it.icon] || ""}</svg></span>` +
        `<div>${text}${whole < 1 ? `<div class="mini-bar"><span style="width:${Math.round(n * 100)}%"></span></div>` : ""}</div></li>`;
    }).join("");
    presets.forEach((b) => b.classList.toggle("is-active", Number(b.dataset.amount) === amount));
  };
  input.addEventListener("input", () => { range.value = input.value; render(input.value); });
  range.addEventListener("input", () => { input.value = range.value; render(range.value); });
  presets.forEach((b) => b.addEventListener("click", () => {
    input.value = range.value = b.dataset.amount;
    render(b.dataset.amount);
  }));
  render(input.value);
});

/* ---------- Before / after slider ---------- */
document.querySelectorAll(".ba").forEach((ba) => {
  const range = ba.querySelector(".ba__range");
  const set = (v) => ba.style.setProperty("--pos", v + "%");
  range.addEventListener("input", () => set(range.value));
  set(range.value);
});

/* ---------- Floating donate button (phones) ---------- */
const fab = document.querySelector(".fab-donate");
if (fab) {
  const onScroll = () => fab.classList.toggle("is-visible", window.scrollY > 400);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

/* ---------- Reveal on scroll ---------- */
const io = "IntersectionObserver" in window
  ? new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add("is-visible"); io.unobserve(e.target); }
      }),
      { threshold: 0.12 }
    )
  : null;
function reveal(root = document) {
  root.querySelectorAll(".reveal:not(.is-visible)").forEach((el) => (io ? io.observe(el) : el.classList.add("is-visible")));
}
reveal();

/* ---------- Toast ---------- */
let toastTimer;
function toast(msg) {
  let t = document.querySelector(".toast");
  if (!t) {
    t = document.createElement("div");
    t.className = "toast";
    t.setAttribute("role", "status");
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-visible"), 2200);
}

/* ---------- Copy account numbers ---------- */
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-copy]");
  if (!btn) return;
  const text = btn.getAttribute("data-copy");
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  const label = btn.dataset.label || (btn.dataset.label = btn.textContent);
  btn.textContent = "Copied ✓";
  btn.classList.add("is-copied");
  toast("Copied to clipboard");
  setTimeout(() => {
    btn.textContent = label;
    btn.classList.remove("is-copied");
  }, 1800);
});

/* ---------- Gallery filters ---------- */
const galleryItems = () => [...document.querySelectorAll(".gallery__item")];
let galleryFilter = "all";
function applyGalleryFilter() {
  galleryItems().forEach((it) => it.classList.toggle("is-hidden", galleryFilter !== "all" && it.dataset.cat !== galleryFilter));
}
const filters = document.querySelectorAll(".filter");
filters.forEach((f) =>
  f.addEventListener("click", () => {
    filters.forEach((x) => x.classList.remove("is-active"));
    f.classList.add("is-active");
    galleryFilter = f.dataset.filter;
    applyGalleryFilter();
  })
);

/* ---------- Gallery lightbox (works for photos added later too) ---------- */
const lb = document.querySelector(".lightbox");
if (lb) {
  const lbImg = lb.querySelector("img");
  const lbCap = lb.querySelector(".lightbox__caption");
  let current = 0;
  const visible = () => galleryItems().filter((it) => !it.classList.contains("is-hidden"));
  const show = (i) => {
    const list = visible();
    current = (i + list.length) % list.length;
    const it = list[current];
    lbImg.src = it.querySelector("img").src;
    lbImg.alt = it.querySelector("img").alt;
    lbCap.textContent = it.querySelector("figcaption")?.textContent || "";
  };
  const open = (it) => {
    show(visible().indexOf(it));
    lb.classList.add("is-open");
    document.body.style.overflow = "hidden";
    lb.querySelector(".lightbox__close").focus();
  };
  const close = () => {
    lb.classList.remove("is-open");
    document.body.style.overflow = "";
  };
  document.addEventListener("click", (e) => {
    const it = e.target.closest(".gallery__item");
    if (it) open(it);
  });
  document.addEventListener("keydown", (e) => {
    const it = e.target.closest?.(".gallery__item");
    if (it && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(it); }
  });
  const makeFocusable = () => galleryItems().forEach((it) => (it.tabIndex = 0));
  makeFocusable();
  lb.querySelector(".lightbox__close").addEventListener("click", close);
  lb.querySelector(".lightbox__prev").addEventListener("click", () => show(current - 1));
  lb.querySelector(".lightbox__next").addEventListener("click", () => show(current + 1));
  lb.addEventListener("click", (e) => e.target === lb && close());
  document.addEventListener("keydown", (e) => {
    if (!lb.classList.contains("is-open")) return;
    if (e.key === "Escape") close();
    if (e.key === "ArrowLeft") show(current - 1);
    if (e.key === "ArrowRight") show(current + 1);
  });
  window.__galleryChanged = () => { makeFocusable(); applyGalleryFilter(); };
}

/* ---------- Share buttons ---------- */
const SITE_URL = location.protocol.startsWith("http") ? location.origin + "/" : location.href;
document.querySelectorAll("[data-share]").forEach((box) => {
  const text = box.dataset.share || "Help rebuild Ancharo!";
  const url = encodeURIComponent(SITE_URL), msg = encodeURIComponent(text);
  const links = {
    whatsapp: `https://wa.me/?text=${msg}%20${url}`,
    telegram: `https://t.me/share/url?url=${url}&text=${msg}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${url}`,
    x: `https://twitter.com/intent/tweet?text=${msg}&url=${url}`,
  };
  box.querySelectorAll("[data-share-to]").forEach((a) => {
    a.href = links[a.dataset.shareTo];
    a.target = "_blank";
    a.rel = "noopener";
  });
  box.querySelectorAll("[data-share-copy]").forEach((b) => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(SITE_URL); toast("Link copied, now paste it anywhere!"); }
    catch { prompt("Copy this link:", SITE_URL); }
  }));
  box.querySelectorAll("[data-share-native]").forEach((b) => {
    if (!navigator.share) return b.remove();
    b.addEventListener("click", () => navigator.share({ title: document.title, text, url: SITE_URL }).catch(() => {}));
  });
});

/* ---------- QR code (donate page) — uses js/vendor/qrcode.js ---------- */
const qrBox = document.querySelector("[data-qr]");
if (qrBox && window.qrcode) {
  const qr = qrcode(0, "M");
  qr.addData(SITE_URL);
  qr.make();
  const n = qr.getModuleCount(), cell = 12, margin = 2, size = (n + margin * 2) * cell;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#1f2a24";
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (qr.isDark(r, c)) ctx.fillRect((c + margin) * cell, (r + margin) * cell, cell, cell);
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", "QR code linking to " + SITE_URL);
  qrBox.appendChild(canvas);
  document.querySelector("[data-qr-download]")?.addEventListener("click", () => {
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = "ancharo-donate-qr.png";
    a.click();
  });
} else if (qrBox) {
  qrBox.closest(".qr")?.remove();
}

/* Shared helpers used by js/live.js, js/account.js and js/admin.js */
window.Ancharo = {
  FUNDRAISER, fmt, esc, toast, reveal, renderProgress, renderSupporters,
  galleryChanged: () => window.__galleryChanged && window.__galleryChanged(),
};
