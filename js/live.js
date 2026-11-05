/* ==========================================================
   LIVE DATA: connects the public pages to Supabase when it is
   configured in js/config.js. Does nothing otherwise.
   - account / admin links in the menu
   - live fundraising totals and supporters wall
   - pinned announcement banner
   - news posts, gallery photos and spending records from the admin panel
   ========================================================== */
(() => {
  const cfg = window.ANCHARO_CONFIG || {};
  const A = window.Ancharo;
  const enabled = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const scriptBase = document.currentScript ? document.currentScript.src.replace(/[^/]*$/, "") : "js/";
  const live = (window.AncharoLive = { enabled, ready: null });
  if (!enabled) return;

  const { esc, fmt } = A;

  // Pages may be served from "/" (404 page) or as "page.html"; build links the same way the menu does.
  const homeHref = document.querySelector(".nav__links a")?.getAttribute("href") || "index.html";
  const pageHref = (name) => (homeHref.startsWith("/") ? "/" + name : name + ".html");
  const onPage = (name) => new RegExp(`/${name}(\\.html)?$`).test(location.pathname);

  const loadScript = (src) =>
    new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error("Could not load " + src));
      document.head.appendChild(s);
    });

  live.ready = (window.supabase ? Promise.resolve() : loadScript(scriptBase + "vendor/supabase.js")).then(() => {
    live.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    return live.sb;
  });

  live.ready
    .then((sb) => {
      const statsP = stats(sb);
      return Promise.allSettled([nav(sb), statsP, supporters(sb), banner(sb), news(sb), gallery(sb), spending(sb, statsP), projectsHome(sb)]);
    })
    .catch((err) => {
      console.error(err);
      A.renderProgress(A.FUNDRAISER);
    });

  /* ---------- helpers ---------- */
  // Pick the Amharic version of a field when the site is in Amharic and one was written.
  const isAm = () => (window.I18N && window.I18N.lang) === "am";
  const L = (row, field) => (isAm() && row[field + "_am"]) || row[field] || "";
  live.L = L;
  // "1,000 ETB" in English, "1,000 ብር" in Amharic
  live.money = (n) => `${fmt(n)} ${isAm() && A.FUNDRAISER.currency === "ETB" ? "ብር" : A.FUNDRAISER.currency}`;
  live.isAm = isAm;
  live.pageHref = pageHref;
  const fmtDate = (d, opts = { day: "numeric", month: "long", year: "numeric" }) =>
    d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString(isAm() ? "am-ET" : "en-GB", opts) : "";
  live.fmtDate = fmtDate;

  // Plain text → paragraphs, with links made clickable. Text is escaped first.
  const richText = (text) =>
    String(text || "")
      .trim()
      .split(/\n\s*\n/)
      .filter(Boolean)
      .map((p) => "<p>" + esc(p).replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>') + "</p>")
      .join("");
  live.richText = richText;

  // Shrink a photo before upload (max side `maxSide` px, JPEG). Returns the original
  // file for PDFs, HEIC and anything the browser can't draw.
  live.compressImage = async (file, maxSide = 1600, quality = 0.82) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
      if (scale === 1 && file.size < 600 * 1024) return file;
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", quality));
      return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" }) : file;
    } catch {
      return file;
    }
  };
  live.extOf = (file) => (file.type === "application/pdf" ? "pdf" : (file.type.split("/")[1] || "bin").replace("jpeg", "jpg").replace(/[^a-z0-9]/g, ""));
  live.randomId = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  const FALLBACK_IMAGES =["hero.jpg", "valley.svg", "dawn.svg", "market.svg", "highlands.svg", "dusk.svg"];
  const imgFor = (post, i) => post.image_url || (homeHref.startsWith("/") ? "/" : "") + "images/" + FALLBACK_IMAGES[i % FALLBACK_IMAGES.length];
  const safeUrl = (u) => (/^(https?:)?\/\//.test(u) || /^[\w/.-]+$/.test(u) ? u : "");

  /* ---------- phone numbers ----------
     People sign in with phone + password. Behind the scenes Supabase needs an
     email address, so each phone number gets a private placeholder address. */
  live.normalizePhone = (raw) => {
    const s = String(raw || "").trim();
    let d = s.replace(/\D/g, "");
    if (/^(\+|00)/.test(s)) d = s.startsWith("00") ? d.slice(2) : d;
    else if (d.length === 10 && d.startsWith("0")) d = "251" + d.slice(1); // 09xx… / 07xx…
    else if (/^[79]\d{8}$/.test(d)) d = "251" + d;                          // 9xx…
    return /^\d{9,15}$/.test(d) ? d : null;
  };
  live.phoneEmail = (digits) => `${digits}@phone.ancharo.app`;
  live.formatPhone = (d) =>
    !d ? "" : /^251\d{9}$/.test(d) ? `+251 ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8)}` : "+" + d;
  live.initials = (name) =>
    String(name || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => [...w][0]).join("").toUpperCase() || "?";

  // Load the signed-in person's profile; create it if it's missing
  // (accounts made before the database was fully set up).
  const inflight = {};
  live.getProfile = (sb, user) => {
    if (inflight[user.id]) return inflight[user.id];
    const cols = "id,full_name,phone,role,must_change_password";
    const load = async () => {
      const { data } = await sb.from("profiles").select(cols).eq("id", user.id).maybeSingle();
      if (data) return data;
      const meta = user.user_metadata || {};
      const fromEmail = /^(\d+)@phone\.ancharo\.app$/.exec(user.email || "");
      const row = { id: user.id, full_name: String(meta.full_name || "").slice(0, 120), phone: meta.phone || (fromEmail && fromEmail[1]) || null };
      await sb.from("profiles").insert(row);
      const again = await sb.from("profiles").select(cols).eq("id", user.id).maybeSingle();
      return again.data || { ...row, role: "user", must_change_password: false };
    };
    inflight[user.id] = load().finally(() => setTimeout(() => delete inflight[user.id], 1000));
    return inflight[user.id];
  };

  /* ---------- account circle at the right end of the menu ---------- */
  const ICON_USER = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>';
  async function nav(sb) {
    const navEl = document.querySelector(".nav");
    if (!navEl) return;
    const box = document.createElement("div");
    box.className = "nav-user";
    navEl.insertBefore(box, navEl.querySelector(".nav__toggle"));

    const render = async (session) => {
      if (!session) {
        live.profile = null;
        box.innerHTML = `<a class="avatar avatar--guest" href="${pageHref("account")}" title="Sign in" aria-label="Sign in" data-signin-link>${ICON_USER}</a>`;
        return;
      }
      const p = (live.profile = await live.getProfile(sb, session.user));
      box.innerHTML = `
        <button class="avatar" type="button" aria-haspopup="true" aria-expanded="false" aria-label="My account" data-avatar>${esc(live.initials(p.full_name))}</button>
        <div class="user-menu" hidden>
          <div class="user-menu__head"><strong>${esc(p.full_name)}</strong><span>${esc(live.formatPhone(p.phone))}</span></div>
          <a href="${pageHref("account")}">My account</a>
          <a href="${pageHref("community")}">Get involved</a>
          ${p.role === "admin" ? `<a href="${pageHref("admin")}" data-admin-link>Admin panel</a>` : ""}
          <button type="button" data-menu-signout>Sign out</button>
        </div>`;
      const btn = box.querySelector("[data-avatar]");
      const menu = box.querySelector(".user-menu");
      const setOpen = (open) => { menu.hidden = !open; btn.setAttribute("aria-expanded", open); };
      btn.addEventListener("click", (e) => { e.stopPropagation(); setOpen(menu.hidden); });
      document.addEventListener("click", (e) => !box.contains(e.target) && setOpen(false));
      document.addEventListener("keydown", (e) => e.key === "Escape" && setOpen(false));
      box.querySelector("[data-menu-signout]").addEventListener("click", () => sb.auth.signOut());
      // Someone whose password was reset to 123456 must choose a new one first.
      if (p.must_change_password && !onPage("account")) location.href = pageHref("account") + "#password";
    };
    const { data } = await sb.auth.getSession();
    await render(data.session);
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") render(session);
    });
    live.refreshNav = async () => render((await sb.auth.getSession()).data.session);
  }

  /* ---------- live totals ---------- */
  async function stats(sb) {
    if (!document.querySelector("[data-raised], [data-spending]")) return;
    const { data, error } = await sb.rpc("public_stats");
    if (error || !data) {
      A.renderProgress(A.FUNDRAISER);
      throw error;
    }
    const f = Object.assign(A.FUNDRAISER, {
      raised: Number(data.raised) || 0,
      donors: Number(data.donors) || 0,
      goal: Number(data.goal) || A.FUNDRAISER.goal,
      currency: data.currency || A.FUNDRAISER.currency,
      deadline: data.deadline || "",
      updated: fmtDate(data.updated, { day: "numeric", month: "short", year: "numeric" }) || "today",
      spent: Number(data.spent) || 0,
    });
    A.renderProgress(f);
    live.stats = f;
    document.dispatchEvent(new CustomEvent("ancharo:stats", { detail: f }));
  }

  /* ---------- supporters wall ---------- */
  async function supporters(sb) {
    if (!document.querySelector("[data-supporters]")) return;
    const { data, error } = await sb.rpc("public_supporters", { lim: 30 });
    if (error) {
      A.renderSupporters([]);
      throw error;
    }
    A.renderSupporters((data || []).map((d) => ({ name: d.name, amount: Number(d.amount) })));
  }

  /* ---------- pinned announcement banner ---------- */
  async function banner(sb) {
    const header = document.querySelector(".site-header");
    if (!header || onPage("admin")) return;
    const { data } = await sb
      .from("announcements")
      .select("id,title,title_am")
      .eq("pinned", true)
      .eq("published", true)
      .order("created_at", { ascending: false })
      .limit(1);
    const post = data && data[0];
    if (!post) return;
    let dismissed = null;
    try { dismissed = localStorage.getItem("ancharo-banner-dismissed"); } catch {}
    if (dismissed === String(post.id)) return;
    const bar = document.createElement("div");
    bar.className = "announce-bar";
    bar.innerHTML = `<div class="container announce-bar__inner">
        <span class="announce-bar__icon" aria-hidden="true">📢</span>
        <a href="${pageHref("news")}#post-${post.id}">${esc(L(post, "title"))} <span class="announce-bar__more">Read more →</span></a>
        <button type="button" aria-label="Dismiss announcement">×</button>
      </div>`;
    bar.querySelector("button").addEventListener("click", () => {
      bar.remove();
      try { localStorage.setItem("ancharo-banner-dismissed", String(post.id)); } catch {}
    });
    header.append(bar);
  }

  /* ---------- news (news page + latest news on home) ---------- */
  async function news(sb) {
    const list = document.querySelector("[data-news-list]");
    const latest = document.querySelector("[data-latest-news]");
    if (!list && !latest) return;
    const { data, error } = await sb
      .from("announcements")
      .select("id,title,title_am,body,body_am,tag,image_url,pinned,created_at")
      .eq("published", true)
      .order("pinned", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(list ? 100 : 3);
    if (error) throw error;
    if (!data || !data.length) return; // keep the sample posts until the first real one

    if (list) {
      list.querySelectorAll("[data-sample]").forEach((el) => el.remove());
      list.insertAdjacentHTML(
        "afterbegin",
        data
          .map((p, i) => {
            const paras = String(L(p, "body")).trim().split(/\n\s*\n/);
            const first = paras.shift() || "";
            const rest = paras.join("\n\n");
            return `<article class="news-item reveal" id="post-${p.id}">
              <img src="${esc(safeUrl(imgFor(p, i)))}" alt="" loading="lazy" />
              <div class="news-item__body">
                <div class="card__meta"><span class="tag">${esc(p.tag || "News")}</span>${p.pinned ? '<span class="tag tag--progress">Pinned</span>' : ""}<time datetime="${esc(p.created_at)}">${fmtDate(p.created_at)}</time></div>
                <h2>${esc(L(p, "title"))}</h2>
                ${richText(first)}
                ${rest ? `<details><summary><span class="more">Read full story →</span><span class="less">Show less ↑</span></summary>${richText(rest)}</details>` : ""}
              </div>
            </article>`;
          })
          .join("")
      );
      A.reveal(list);
      // Open a post linked from the banner
      if (location.hash.startsWith("#post-")) {
        const el = document.querySelector(location.hash);
        el?.querySelector("details")?.setAttribute("open", "");
        el?.scrollIntoView();
      }
    }

    if (latest) {
      latest.querySelectorAll("[data-sample]").forEach((el) => el.remove());
      latest.insertAdjacentHTML(
        "afterbegin",
        data
          .slice(0, 3)
          .map(
            (p, i) => `<article class="card reveal">
              <img class="card__img" src="${esc(safeUrl(imgFor(p, i)))}" alt="" loading="lazy" />
              <div class="card__body">
                <div class="card__meta"><span class="tag">${esc(p.tag || "News")}</span><time datetime="${esc(p.created_at)}">${fmtDate(p.created_at, { day: "numeric", month: "short", year: "numeric" })}</time></div>
                <h3>${esc(L(p, "title"))}</h3>
                <p>${esc(String(L(p, "body")).trim().split(/\n\s*\n/)[0].slice(0, 160))}${String(L(p, "body")).length > 160 ? "…" : ""}</p>
                <div class="card__foot"><a href="${pageHref("news")}#post-${p.id}">Read more →</a></div>
              </div>
            </article>`
          )
          .join("")
      );
      A.reveal(latest);
    }
  }

  /* ---------- gallery photos added by admins ---------- */
  async function gallery(sb) {
    const grid = document.querySelector("[data-gallery]");
    if (!grid) return;
    const { data, error } = await sb.from("gallery_photos").select("id,image_url,caption,category").order("created_at", { ascending: false });
    if (error) throw error;
    if (!data || !data.length) return;
    grid.insertAdjacentHTML(
      "afterbegin",
      data
        .map(
          (p) => `<figure class="gallery__item" data-cat="${esc(p.category)}">
            <img src="${esc(safeUrl(p.image_url))}" alt="${esc(p.caption || "Photo of Ancharo")}" loading="lazy" />
            ${p.caption ? `<figcaption>${esc(p.caption)}</figcaption>` : ""}
          </figure>`
        )
        .join("")
    );
    A.galleryChanged();
  }

  /* ---------- projects (home "featured works" + Get involved page) ---------- */
  const T = window.T || ((k, v = {}) => k.replace(/\{(\w+)\}/g, (_, x) => v[x]));
  const PROJECT_STATUS = { open: ["Needs funding", "tag--planned"], in_progress: ["In progress", "tag--progress"], completed: ["Completed", "tag--done"] };
  live.projectCard = (p, { adopt = false } = {}) => {
    const raised = Number(p.raised) || 0, goal = Number(p.goal) || 1, pledged = Number(p.pledged) || 0;
    const pct = p.status === "completed" ? 100 : Math.min(100, Math.round((raised / goal) * 100));
    const [label, cls] = PROJECT_STATUS[p.status] || PROJECT_STATUS.open;
    const adopters = p.adopters || [];
    const desc = String(L(p, "description"));
    return `<article class="card project-card reveal" data-project="${p.id}">
      <img class="card__img" src="${esc(safeUrl(p.image_url || imgFor({}, p.id)))}" alt="" loading="lazy" />
      <div class="card__body">
        <div class="card__meta"><span class="tag ${cls}">${label}</span>${adopters.length ? '<span class="tag tag--adopted">♥ Adopted</span>' : ""}</div>
        <h3>${esc(L(p, "title"))}</h3>
        <p>${esc(desc.slice(0, 180))}${desc.length > 180 ? "…" : ""}</p>
        <div class="card__foot">
          <div class="mini-bar"><span style="width:${pct}%"></span></div>
          <div class="mini-bar__label">${esc(T("{raised} of {goal} raised", { raised: fmt(raised), goal: live.money(goal) }))}</div>
          ${pledged ? `<div class="mini-bar__label">${esc(T("{amount} pledged", { amount: live.money(pledged) }))}</div>` : ""}
          ${adopters.length ? `<div class="adopters">${esc(T("Adopted by"))} <strong>${adopters.map(esc).join(", ")}</strong></div>` : ""}
          ${adopt && p.status !== "completed" ? `<button class="btn btn--gold btn--small adopt-btn" type="button" data-adopt="${p.id}">♥ ${esc(T("Adopt this project"))}</button>` : ""}
        </div>
      </div>
    </article>`;
  };
  live.loadProjects = async (sb) => {
    const { data, error } = await sb.rpc("public_projects");
    if (error) throw error;
    return data || [];
  };
  async function projectsHome(sb) {
    const grid = document.querySelector("[data-projects-home]");
    if (!grid) return;
    const list = (await live.loadProjects(sb)).slice(0, 3);
    if (!list.length) return; // keep the sample cards until the first real project
    grid.querySelectorAll("[data-sample]").forEach((el) => el.remove());
    grid.insertAdjacentHTML("afterbegin", list.map((p) => live.projectCard(p)).join(""));
    A.reveal(grid);
  }

  /* ---------- where the money went (donate page) ---------- */
  async function spending(sb, statsP) {
    const box = document.querySelector("[data-spending]");
    if (!box) return;
    await statsP.catch(() => {});
    const { data, error } = await sb.from("expenses").select("spent_on,project,description,amount,receipt_url").order("spent_on", { ascending: false }).limit(200);
    if (error) throw error;
    if (!data || !data.length) return;
    const cur = A.FUNDRAISER.currency;
    const spent = data.reduce((s, e) => s + Number(e.amount), 0);
    const render = (raised) => {
      box.querySelector("[data-spending-summary]").innerHTML = `
        <div><div class="stat__value">${fmt(raised)} ${esc(cur)}</div><div class="stat__label">raised</div></div>
        <div><div class="stat__value">${fmt(spent)} ${esc(cur)}</div><div class="stat__label">spent on projects</div></div>
        <div><div class="stat__value">${fmt(Math.max(0, raised - spent))} ${esc(cur)}</div><div class="stat__label">available for next projects</div></div>`;
    };
    render(A.FUNDRAISER.raised);
    box.querySelector("tbody").innerHTML = data
      .map(
        (e) => `<tr>
          <td data-label="Date">${fmtDate(e.spent_on, { day: "numeric", month: "short", year: "numeric" })}</td>
          <td data-label="Project">${esc(e.project)}</td>
          <td data-label="What">${esc(e.description)}${e.receipt_url ? ` · <a href="${esc(safeUrl(e.receipt_url))}" target="_blank" rel="noopener">receipt</a>` : ""}</td>
          <td data-label="Amount" class="num">${fmt(e.amount)} ${esc(cur)}</td>
        </tr>`
      )
      .join("");
    box.hidden = false;
  }
})();
