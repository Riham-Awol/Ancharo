/* ==========================================================
   LANGUAGES: English (written in the pages) and Amharic (js/i18n-am.js).
   - Remembers the visitor's choice; Amharic phones default to Amharic.
   - In Amharic it translates the page by looking up each English text in
     the dictionary, including text added later by the scripts.
   - To fix or add a translation, edit js/i18n-am.js.
   ========================================================== */
(function () {
  const KEY = "ancharo-lang";
  let lang = "";
  try { lang = localStorage.getItem(KEY) || ""; } catch {}
  if (lang !== "en" && lang !== "am") lang = /^am\b/i.test(navigator.language || "") ? "am" : "en";

  const I = (window.I18N = { lang, dict: Object.create(null), patterns: [] });
  document.documentElement.lang = lang;

  const fill = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ""));
  // T("Hello {name}", {name}) → translated text with values filled in
  window.T = (key, vars) => fill((I.lang === "am" && I.dict[key]) || key, vars);
  I.add = (entries, patterns = []) => {
    Object.assign(I.dict, entries);
    I.patterns.push(...patterns);
  };
  I.set = (l) => {
    try { localStorage.setItem(KEY, l); } catch {}
    location.reload();
  };

  /* ---------- language switch in the menu bar ---------- */
  function addSwitch() {
    const nav = document.querySelector(".nav");
    if (!nav || nav.querySelector(".lang-switch")) return;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "lang-switch";
    b.setAttribute("translate", "no");
    b.setAttribute("aria-label", lang === "am" ? "Switch to English" : "ወደ አማርኛ ቀይር");
    b.innerHTML = lang === "am" ? '<span>EN</span>' : '<span lang="am">አማ</span>';
    b.addEventListener("click", () => I.set(lang === "am" ? "en" : "am"));
    nav.insertBefore(b, nav.querySelector(".nav__toggle"));
  }

  if (lang !== "am") {
    document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", addSwitch) : addSwitch();
    return;
  }

  /* ---------- Amharic: load the dictionary, then translate ---------- */
  const root = document.documentElement;
  root.classList.add("i18n-loading");
  const reveal = () => root.classList.remove("i18n-loading");
  setTimeout(reveal, 2500); // never leave the page hidden if something goes wrong

  const SKIP = "script,style,svg,textarea,code,[translate=no],[data-no-i18n]";
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  const lookup = (text) => {
    const k = norm(text);
    if (!k || !/[A-Za-z]/.test(k)) return null;
    if (k in I.dict) return I.dict[k];
    for (const [re, rep] of I.patterns) if (re.test(k)) return k.replace(re, rep);
    return null;
  };

  function translateText(node) {
    const v = lookup(node.nodeValue);
    if (v == null) return;
    const lead = node.nodeValue.match(/^\s*/)[0], trail = node.nodeValue.match(/\s*$/)[0];
    node.nodeValue = lead + v + trail;
  }
  function translateAttrs(el) {
    for (const a of ["placeholder", "aria-label", "title", "alt"]) {
      const val = el.getAttribute && el.getAttribute(a);
      if (val) { const v = lookup(val); if (v != null) el.setAttribute(a, v); }
    }
  }
  function translate(rootNode) {
    if (!rootNode) return;
    if (rootNode.nodeType === 3) {
      if (!rootNode.parentElement || !rootNode.parentElement.closest(SKIP)) translateText(rootNode);
      return;
    }
    if (rootNode.nodeType !== 1 || rootNode.closest(SKIP)) return;
    // 1) whole elements with inline markup, e.g. "Tap <strong>Copy</strong> to copy…"
    const els = [rootNode, ...rootNode.querySelectorAll("*")];
    for (const el of els) {
      if (!el.isConnected && el !== rootNode) continue;
      if (el.children.length && !el.closest(SKIP)) {
        const k = norm(el.innerHTML);
        if (k in I.dict) el.innerHTML = I.dict[k];
      }
      translateAttrs(el);
    }
    // 2) remaining text
    const w = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentElement && n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const texts = [];
    while (w.nextNode()) texts.push(w.currentNode);
    texts.forEach(translateText);
  }
  I.translate = translate;

  const start = () => {
    addSwitch();
    translate(document.body);
    const t = lookup(document.title.split(" — ")[0]);
    if (t) document.title = t + " — " + (I.dict["Ancharo"] || "Ancharo");
    new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") translateText(m.target);
        else m.addedNodes.forEach(translate);
      }
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
    reveal();
  };

  const s = document.createElement("script");
  s.src = (document.currentScript ? document.currentScript.src : "js/i18n.js").replace(/i18n\.js(\?v=)?/, "i18n-am.js$1");
  s.onload = () => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start());
  s.onerror = () => { reveal(); document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", addSwitch) : addSwitch(); };
  document.head.appendChild(s);
})();
