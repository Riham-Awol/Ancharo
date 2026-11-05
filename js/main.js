/* ==========================================================
   FUNDRAISING NUMBERS — update these as donations come in.
   They show on the home page progress bar.
   ========================================================== */
const FUNDRAISER = {
  raised: 1250000,      // amount collected so far
  goal: 5000000,        // target amount
  donors: 342,          // number of people who have given
  currency: "ETB",
  updated: "November 2026",
};

/* ---------- Mobile menu ---------- */
const toggle = document.querySelector(".nav__toggle");
const links = document.querySelector(".nav__links");
if (toggle && links) {
  toggle.addEventListener("click", () => {
    const open = links.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", open);
  });
}

/* ---------- Footer year ---------- */
document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

/* ---------- Fundraising progress ---------- */
const fmt = (n) => n.toLocaleString("en-US");
const pct = Math.min(100, Math.round((FUNDRAISER.raised / FUNDRAISER.goal) * 100));
const setText = (sel, val) => document.querySelectorAll(sel).forEach((el) => (el.textContent = val));
setText("[data-raised]", `${fmt(FUNDRAISER.raised)} ${FUNDRAISER.currency}`);
setText("[data-goal]", `${fmt(FUNDRAISER.goal)} ${FUNDRAISER.currency}`);
setText("[data-donors]", fmt(FUNDRAISER.donors));
setText("[data-percent]", `${pct}%`);
setText("[data-updated]", FUNDRAISER.updated);
document.querySelectorAll(".bar__fill").forEach((bar) => {
  requestAnimationFrame(() => setTimeout(() => (bar.style.width = pct + "%"), 150));
});

/* ---------- Reveal on scroll ---------- */
const revealEls = document.querySelectorAll(".reveal");
if ("IntersectionObserver" in window) {
  const io = new IntersectionObserver(
    (entries) =>
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("is-visible");
          io.unobserve(e.target);
        }
      }),
    { threshold: 0.12 }
  );
  revealEls.forEach((el) => io.observe(el));
} else {
  revealEls.forEach((el) => el.classList.add("is-visible"));
}

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
document.querySelectorAll("[data-copy]").forEach((btn) => {
  btn.addEventListener("click", async () => {
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
    const label = btn.textContent;
    btn.textContent = "Copied ✓";
    btn.classList.add("is-copied");
    toast("Copied to clipboard");
    setTimeout(() => {
      btn.textContent = label;
      btn.classList.remove("is-copied");
    }, 1800);
  });
});

/* ---------- Gallery filters ---------- */
const filters = document.querySelectorAll(".filter");
const items = document.querySelectorAll(".gallery__item");
filters.forEach((f) =>
  f.addEventListener("click", () => {
    filters.forEach((x) => x.classList.remove("is-active"));
    f.classList.add("is-active");
    const cat = f.dataset.filter;
    items.forEach((it) => it.classList.toggle("is-hidden", cat !== "all" && it.dataset.cat !== cat));
  })
);

/* ---------- Gallery lightbox ---------- */
const lb = document.querySelector(".lightbox");
if (lb && items.length) {
  const lbImg = lb.querySelector("img");
  const lbCap = lb.querySelector(".lightbox__caption");
  let current = 0;
  const visible = () => [...items].filter((it) => !it.classList.contains("is-hidden"));
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
  items.forEach((it) => {
    it.tabIndex = 0;
    it.addEventListener("click", () => open(it));
    it.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), open(it)));
  });
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
}
