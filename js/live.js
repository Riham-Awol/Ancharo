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
      return Promise.allSettled([nav(sb), statsP, supporters(sb), banner(sb), news(sb), gallery(sb), spending(sb, statsP)]);
    })
    .catch((err) => {
      console.error(err);
      A.renderProgress(A.FUNDRAISER);
    });

  /* ---------- helpers ---------- */
  const fmtDate = (d, opts = { day: "numeric", month: "long", year: "numeric" }) =>
    d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("en-GB", opts) : "";
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

  /* ---------- menu: Sign in / My account / Admin ---------- */
  async function nav(sb) {
    const links = document.querySelector(".nav__links");
    if (!links) return;
    const donateLi = links.querySelector(".btn")?.closest("li");
    const li = document.createElement("li");
    li.innerHTML = `<a href="${pageHref("account")}" data-account-link>Sign in</a>`;
    links.insertBefore(li, donateLi);
    if (onPage("account")) li.firstChild.setAttribute("aria-current", "page");

    const update = async (session) => {
      li.firstChild.textContent = session ? "My account" : "Sign in";
      links.querySelector("[data-admin-link]")?.closest("li").remove();
      if (!session) return;
      const { data } = await sb.from("profiles").select("role").eq("id", session.user.id).maybeSingle();
      if (data?.role === "admin") {
        const a = document.createElement("li");
        a.innerHTML = `<a href="${pageHref("admin")}" data-admin-link>Admin</a>`;
        if (onPage("admin")) a.firstChild.setAttribute("aria-current", "page");
        links.insertBefore(a, donateLi);
      }
    };
    const { data } = await sb.auth.getSession();
    await update(data.session);
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT") update(session);
    });
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
      .select("id,title")
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
        <a href="${pageHref("news")}#post-${post.id}">${esc(post.title)} <span class="announce-bar__more">Read more →</span></a>
        <button type="button" aria-label="Dismiss announcement">×</button>
      </div>`;
    bar.querySelector("button").addEventListener("click", () => {
      bar.remove();
      try { localStorage.setItem("ancharo-banner-dismissed", String(post.id)); } catch {}
    });
    header.after(bar);
  }

  /* ---------- news (news page + latest news on home) ---------- */
  async function news(sb) {
    const list = document.querySelector("[data-news-list]");
    const latest = document.querySelector("[data-latest-news]");
    if (!list && !latest) return;
    const { data, error } = await sb
      .from("announcements")
      .select("id,title,body,tag,image_url,pinned,created_at")
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
            const paras = String(p.body || "").trim().split(/\n\s*\n/);
            const first = paras.shift() || "";
            const rest = paras.join("\n\n");
            return `<article class="news-item reveal" id="post-${p.id}">
              <img src="${esc(safeUrl(imgFor(p, i)))}" alt="" loading="lazy" />
              <div class="news-item__body">
                <div class="card__meta"><span class="tag">${esc(p.tag || "News")}</span>${p.pinned ? '<span class="tag tag--progress">Pinned</span>' : ""}<time datetime="${esc(p.created_at)}">${fmtDate(p.created_at)}</time></div>
                <h2>${esc(p.title)}</h2>
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
                <h3>${esc(p.title)}</h3>
                <p>${esc(String(p.body || "").trim().split(/\n\s*\n/)[0].slice(0, 160))}${String(p.body || "").length > 160 ? "…" : ""}</p>
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
