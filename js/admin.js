/* ==========================================================
   ADMIN PANEL: review donation receipts, post announcements,
   manage gallery & spending, campaign settings, user roles.
   Security is enforced by the database rules (supabase/schema.sql);
   this page only shows the tools.
   ========================================================== */
(() => {
  const A = window.Ancharo;
  const live = window.AncharoLive;
  const { esc, fmt, toast } = A;
  const T = window.T;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const views = {};
  $$("[data-view]").forEach((el) => (views[el.dataset.view] = el));
  const show = (name) => Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));
  const say = (el, text, kind = "") => {
    el.textContent = text;
    el.className = "form-msg" + (kind ? " form-msg--" + kind : "");
  };
  const busy = (form, on) => $$("button, input, select, textarea", form).forEach((b) => (b.disabled = on));
  const forms = {};
  $$("form[data-form]").forEach((f) => (forms[f.dataset.form] = f));

  if (!live || !live.enabled) return show("setup");

  live.ready.then(async (sb) => {
    const fmtDate = (d) => live.fmtDate(d, { day: "numeric", month: "short", year: "numeric" });
    const cur = () => A.FUNDRAISER.currency;
    let me = null;

    /* ---------- access check ---------- */
    async function start(session) {
      if (!session) {
        show("denied");
        $("[data-denied-msg]").textContent = "Please sign in with an admin account.";
        return;
      }
      const data = await live.getProfile(sb, session.user);
      if (!data || data.role !== "admin") {
        show("denied");
        $("[data-denied-msg]").textContent = "Your account doesn't have admin access. Ask an existing admin to give you the admin role.";
        return;
      }
      me = { ...data, email: session.user.email };
      $("[data-admin-who]").textContent = T("Signed in as {name}", { name: me.full_name || live.formatPhone(data.phone) });
      show("admin");
      await loadSettings();
      openTab(location.hash.slice(1) || "overview");
    }
    const { data } = await sb.auth.getSession();
    start(data.session);
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") start(null);
    });

    /* ---------- tabs ---------- */
    const loaders = {};
    function openTab(name) {
      if (!$(`[data-pane="${name}"]`)) name = "overview";
      $$(".admin-tab").forEach((t) => t.classList.toggle("is-active", t.dataset.tab === name));
      $$(".admin-pane").forEach((p) => (p.hidden = p.dataset.pane !== name));
      history.replaceState(null, "", "#" + name);
      loaders[name] && loaders[name]();
    }
    $$(".admin-tab").forEach((t) => t.addEventListener("click", () => openTab(t.dataset.tab)));
    document.addEventListener("click", (e) => {
      const g = e.target.closest("[data-goto]");
      if (g) openTab(g.dataset.goto);
    });

    /* ---------- receipt viewer ---------- */
    const modal = $("[data-modal]");
    const closeModal = () => { modal.hidden = true; $("[data-modal-body]").innerHTML = ""; };
    $("[data-modal-close]").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => e.target === modal && closeModal());
    document.addEventListener("keydown", (e) => e.key === "Escape" && !modal.hidden && closeModal());
    async function viewReceipt(path) {
      const { data, error } = await sb.storage.from("receipts").createSignedUrl(path, 600);
      if (error) return toast("Could not open receipt: " + error.message);
      const url = data.signedUrl;
      const isImg = /\.(jpe?g|png|webp)$/i.test(path);
      $("[data-modal-body]").innerHTML = isImg
        ? `<img src="${esc(url)}" alt="Receipt" /><p><a href="${esc(url)}" target="_blank" rel="noopener">Open full size ↗</a></p>`
        : `<p>This receipt is a ${esc(path.split(".").pop().toUpperCase())} file.</p><a class="btn btn--green" href="${esc(url)}" target="_blank" rel="noopener">Open receipt ↗</a>`;
      modal.hidden = false;
    }

    /* ---------- uploads to the public "media" bucket ---------- */
    async function uploadMedia(file, folder) {
      const small = await live.compressImage(file, 1600, 0.82);
      const path = `${folder}/${live.randomId()}.${live.extOf(small)}`;
      const { error } = await sb.storage.from("media").upload(path, small, { contentType: small.type, cacheControl: "31536000" });
      if (error) throw error;
      return sb.storage.from("media").getPublicUrl(path).data.publicUrl;
    }
    const mediaPath = (url) => {
      const m = String(url || "").match(/\/object\/public\/media\/(.+)$/);
      return m ? decodeURIComponent(m[1]) : null;
    };
    const removeMedia = (url) => { const p = mediaPath(url); return p ? sb.storage.from("media").remove([p]) : null; };

    /* ======================= OVERVIEW ======================= */
    loaders.overview = async () => {
      const [stats, pending, pledges, vols] = await Promise.all([
        sb.rpc("public_stats"), sb.rpc("admin_list_donations", { status_filter: "pending" }), sb.rpc("admin_list_adoptions"), sb.rpc("admin_list_volunteers"),
      ]);
      const newPledges = (pledges.data || []).filter((x) => x.status === "pending").length;
      const newVols = (vols.data || []).filter((x) => x.status === "new").length;
      sb.from("member_cards").select("id").eq("status", "pending").then(({ data }) => setCount("[data-card-badge]", (data || []).length));
      setCount("[data-pledge-badge]", newPledges);
      setCount("[data-volunteer-badge]", newVols);
      const s = stats.data || {};
      const p = pending.data || [];
      setBadge(p.length);
      const pct = s.goal ? Math.round((Number(s.raised) / Number(s.goal)) * 100) : 0;
      $("[data-kpis]").innerHTML = [
        ["Raised", `${fmt(s.raised || 0)} ${esc(s.currency || "")}`, `${pct}% of ${fmt(s.goal || 0)}`],
        ["Donors", fmt(s.donors || 0), "approved donations + offline"],
        ["Waiting for review", fmt(p.length), p.length ? "needs your attention" : "all caught up ✓"],
        ["Spent", `${fmt(s.spent || 0)} ${esc(s.currency || "")}`, `${fmt(Math.max(0, (s.raised || 0) - (s.spent || 0)))} available`],
        ["Volunteers", fmt((vols.data || []).length), newVols ? `${newVols} new to call` : "all contacted ✓"],
        ["Project pledges", fmt((pledges.data || []).length), newPledges ? `${newPledges} to confirm` : "all confirmed ✓"],
      ]
        .map(([k, v, sub]) => `<div class="kpi"><div class="kpi__label">${k}</div><div class="kpi__value">${v}</div><div class="kpi__sub">${sub}</div></div>`)
        .join("");
      $("[data-overview-pending]").innerHTML = p.length
        ? `<div class="admin-list">${p.slice(0, 6).map((d) => `<div class="admin-row"><div><strong>${fmt(d.amount)} ${esc(cur())}</strong> · ${esc(d.donor_name || "Unknown")}<div class="muted">${esc(d.method)} · submitted ${fmtDate(d.created_at)}</div></div></div>`).join("")}</div>`
        : `<div class="empty">Nothing to review right now 🎉</div>`;
    };
    const setCount = (sel, n) => { const b = $(sel); b.hidden = !n; b.textContent = n; };
    const setBadge = (n) => setCount("[data-pending-badge]", n);

    /* ======================= DONATIONS ======================= */
    let donations = [];
    let statusFilter = "pending";
    loaders.donations = async () => {
      const list = $("[data-donation-list]");
      list.innerHTML = '<p class="muted">Loading…</p>';
      const { data, error } = await sb.rpc("admin_list_donations", { status_filter: statusFilter || null });
      if (error) return (list.innerHTML = `<p class="form-msg form-msg--error">${esc(error.message)}</p>`);
      donations = data || [];
      if (statusFilter === "pending") setBadge(donations.length);
      renderDonations();
    };
    $$(".seg__btn[data-status]").forEach((b) =>
      b.addEventListener("click", () => {
        $$(".seg__btn[data-status]").forEach((x) => x.classList.toggle("is-active", x === b));
        statusFilter = b.dataset.status;
        loaders.donations();
      })
    );
    $("[data-donation-search]").addEventListener("input", () => renderDonations());

    function renderDonations() {
      const q = $("[data-donation-search]").value.trim().toLowerCase();
      const rows = donations.filter((d) => !q || [d.donor_name, d.donor_phone, d.reference, d.method, d.message, d.project_title].join(" ").toLowerCase().includes(q));
      const list = $("[data-donation-list]");
      if (!rows.length) return (list.innerHTML = `<div class="empty">${statusFilter === "pending" ? "No receipts waiting for review 🎉" : "Nothing here."}</div>`);
      const STATUS = { pending: ["Pending", "tag--progress"], approved: ["Approved", "tag--done"], rejected: ["Rejected", "tag--planned"] };
      list.innerHTML = rows
        .map((d) => {
          const [label, cls] = STATUS[d.status] || [d.status, ""];
          return `<article class="review" data-id="${d.id}">
            <button class="review__thumb" type="button" data-act="receipt" title="View receipt">
              <span>🧾</span><small>View receipt</small>
            </button>
            <div class="review__body">
              <div class="review__top">
                <div>
                  <div class="review__amount">${fmt(d.amount)} ${esc(cur())}</div>
                  <div><strong>${esc(d.donor_name || "(no name)")}</strong> <a class="muted" href="tel:+${esc(d.donor_phone || "")}">${esc(live.formatPhone(d.donor_phone))}</a></div>
                </div>
                <span class="tag ${cls}">${label}</span>
              </div>
              <dl class="review__facts">
                <div><dt>Method</dt><dd>${esc(d.method || "–")}</dd></div>
                <div><dt>For</dt><dd>${esc(d.project_title || "General fund")}</dd></div>
                <div><dt>Sent on</dt><dd>${d.donated_on ? fmtDate(d.donated_on) : "–"}</dd></div>
                <div><dt>Reference</dt><dd>${esc(d.reference || "–")}</dd></div>
                <div><dt>Submitted</dt><dd>${fmtDate(d.created_at)}</dd></div>
                <div><dt>Supporters wall</dt><dd>${d.show_name ? "Show “" + esc(d.display_name || d.donor_name || "") + "”" : "Anonymous"}</dd></div>
              </dl>
              ${d.message ? `<p class="review__msg">“${esc(d.message)}”</p>` : ""}
              <div class="review__actions">
                <label>Confirmed amount<input type="number" min="0.01" step="any" value="${Number(d.amount)}" data-field="amount" /></label>
                <label class="grow">Note to donor <span class="opt">(optional, they can see it)</span><input type="text" maxlength="1000" value="${esc(d.admin_note || "")}" data-field="note" placeholder="${d.status === "pending" ? "e.g. Amount didn't match the receipt" : ""}" /></label>
                <div class="review__btns">
                  ${d.status !== "approved" ? '<button class="btn btn--green btn--small" type="button" data-act="approve">✓ Approve</button>' : ""}
                  ${d.status !== "rejected" ? '<button class="btn btn--ghost btn--small" type="button" data-act="reject">✕ Reject</button>' : ""}
                  ${d.status !== "pending" ? '<button class="link-btn" type="button" data-act="pending">Move back to pending</button>' : ""}
                  <button class="link-btn link-btn--danger" type="button" data-act="delete">Delete</button>
                </div>
              </div>
            </div>
          </article>`;
        })
        .join("");
    }

    $("[data-donation-list]").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const card = btn.closest(".review");
      const d = donations.find((x) => String(x.id) === card.dataset.id);
      const act = btn.dataset.act;
      if (act === "receipt") return viewReceipt(d.screenshot_path);
      if (act === "delete") {
        if (!confirm("Delete this donation and its receipt permanently?")) return;
        const { error } = await sb.from("donations").delete().eq("id", d.id);
        if (error) return toast(error.message);
        await sb.storage.from("receipts").remove([d.screenshot_path]);
        toast("Deleted");
        return loaders.donations();
      }
      const amount = Number($('[data-field="amount"]', card).value);
      if (!(amount > 0)) return toast("Enter a valid amount");
      const note = $('[data-field="note"]', card).value.trim() || null;
      const status = { approve: "approved", reject: "rejected", pending: "pending" }[act];
      btn.disabled = true;
      const { error } = await sb.from("donations").update({ status, amount, admin_note: note }).eq("id", d.id);
      if (error) { btn.disabled = false; return toast(error.message); }
      toast(status === "approved" ? "Approved ✓ Added to the total" : status === "rejected" ? "Marked as rejected" : "Moved back to pending");
      card.classList.add("is-done");
      setTimeout(loaders.donations, 350);
    });

    $("[data-export]").addEventListener("click", () => {
      const cols = ["id", "created_at", "status", "amount", "project_title", "method", "reference", "donated_on", "donor_name", "donor_phone", "show_name", "display_name", "message", "admin_note", "reviewed_at"];
      const cell = (v) => {
        let s = v == null ? "" : String(v);
        if (/^[=+\-@]/.test(s)) s = "'" + s; // stop spreadsheet formulas
        return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [cols.join(","), ...donations.map((d) => cols.map((c) => cell(d[c])).join(","))].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
      a.download = `ancharo-donations-${statusFilter || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    });

    /* ======================= ANNOUNCEMENTS ======================= */
    let posts = [];
    loaders.news = async () => {
      const { data, error } = await sb.from("announcements").select("*").order("created_at", { ascending: false });
      const list = $("[data-post-list]");
      if (error) return (list.innerHTML = `<p class="form-msg form-msg--error">${esc(error.message)}</p>`);
      posts = data || [];
      list.innerHTML = posts.length
        ? posts
            .map(
              (p) => `<div class="admin-row" data-id="${p.id}">
                ${p.image_url ? `<img class="admin-row__img" src="${esc(p.image_url)}" alt="" />` : ""}
                <div class="grow">
                  <strong>${esc(p.title)}</strong>
                  <div class="muted">${esc(p.tag)} · ${fmtDate(p.created_at)} ${p.pinned ? "· 📌 pinned" : ""} ${p.published ? "" : '· <span class="tag">Draft</span>'}</div>
                </div>
                <div class="admin-row__btns">
                  <button class="link-btn" type="button" data-act="edit">Edit</button>
                  <button class="link-btn link-btn--danger" type="button" data-act="delete">Delete</button>
                </div>
              </div>`
            )
            .join("")
        : '<div class="empty">No announcements yet. Your first one will replace the sample news on the site.</div>';
    };
    const postForm = forms.post;
    const resetPost = () => {
      postForm.reset();
      postForm.id.value = "";
      postForm.tag.value = "News";
      $("[data-post-heading]").textContent = "New announcement";
      $("button[type=submit]", postForm).textContent = "Publish";
      $("[data-post-cancel]").hidden = true;
      $("[data-current-img]").hidden = true;
    };
    $("[data-post-cancel]").addEventListener("click", resetPost);
    $("[data-post-list]").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const p = posts.find((x) => String(x.id) === btn.closest("[data-id]").dataset.id);
      if (btn.dataset.act === "edit") {
        postForm.id.value = p.id;
        postForm.title.value = p.title;
        postForm.tag.value = p.tag;
        postForm.body.value = p.body;
        postForm.title_am.value = p.title_am || "";
        postForm.body_am.value = p.body_am || "";
        postForm.querySelector(".am-fields").open = !!(p.title_am || p.body_am);
        postForm.pinned.checked = p.pinned;
        postForm.published.checked = p.published;
        postForm.remove_image.checked = false;
        $("[data-current-img]").hidden = !p.image_url;
        if (p.image_url) $("[data-current-img] img").src = p.image_url;
        $("[data-post-heading]").textContent = "Edit announcement";
        $("button[type=submit]", postForm).textContent = "Save changes";
        $("[data-post-cancel]").hidden = false;
        postForm.scrollIntoView({ behavior: "smooth" });
      }
      if (btn.dataset.act === "delete") {
        if (!confirm(`Delete “${p.title}”?`)) return;
        const { error } = await sb.from("announcements").delete().eq("id", p.id);
        if (error) return toast(error.message);
        if (p.image_url) await removeMedia(p.image_url);
        toast("Deleted");
        if (postForm.id.value === String(p.id)) resetPost();
        loaders.news();
      }
    });
    postForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(postForm);
      const id = f.get("id");
      const old = posts.find((x) => String(x.id) === id);
      const msg = $("[data-post-msg]");
      busy(postForm, true);
      say(msg, "Saving…");
      try {
        const row = {
          title: f.get("title").trim(),
          tag: f.get("tag").trim() || "News",
          body: f.get("body"),
          title_am: f.get("title_am").trim() || null,
          body_am: f.get("body_am").trim() || null,
          pinned: f.get("pinned") === "on",
          published: f.get("published") === "on",
        };
        const file = postForm.image.files[0];
        if (file) row.image_url = await uploadMedia(file, "news");
        else if (old && f.get("remove_image") === "on") row.image_url = null;
        if (old && old.image_url && "image_url" in row) await removeMedia(old.image_url);
        const res = id
          ? await sb.from("announcements").update({ ...row, updated_at: new Date().toISOString() }).eq("id", id)
          : await sb.from("announcements").insert(row);
        if (res.error) throw res.error;
        say(msg, id ? "Saved ✓" : row.published ? "Published ✓ It's live on the News page." : "Saved as draft ✓", "ok");
        resetPost();
        loaders.news();
      } catch (err) {
        say(msg, err.message, "error");
      } finally {
        busy(postForm, false);
      }
    });

    /* ======================= GALLERY ======================= */
    let photos = [];
    loaders.gallery = async () => {
      const { data, error } = await sb.from("gallery_photos").select("*").order("created_at", { ascending: false });
      const grid = $("[data-photo-grid]");
      if (error) return (grid.innerHTML = `<p class="form-msg form-msg--error">${esc(error.message)}</p>`);
      photos = data || [];
      grid.innerHTML = photos.length
        ? photos
            .map(
              (p) => `<figure class="photo-card" data-id="${p.id}">
                <img src="${esc(p.image_url)}" alt="" loading="lazy" />
                <figcaption>
                  <input value="${esc(p.caption)}" maxlength="200" placeholder="Caption" data-field="caption" />
                  <select data-field="category">
                    ${["landscape", "city", "projects"].map((c) => `<option value="${c}" ${c === p.category ? "selected" : ""}>${{ landscape: "Landscapes", city: "City life", projects: "Projects" }[c]}</option>`).join("")}
                  </select>
                  <div class="photo-card__btns">
                    <button class="link-btn" type="button" data-act="save">Save</button>
                    <button class="link-btn link-btn--danger" type="button" data-act="delete">Delete</button>
                  </div>
                </figcaption>
              </figure>`
            )
            .join("")
        : '<div class="empty">No photos uploaded yet. Photos you add appear first in the public gallery.</div>';
    };
    forms.photos.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = forms.photos;
      const files = [...form.files.files];
      const msg = $("[data-photos-msg]");
      busy(form, true);
      let done = 0;
      try {
        for (const file of files) {
          say(msg, `Uploading ${done + 1} of ${files.length}…`);
          const url = await uploadMedia(file, "gallery");
          const { error } = await sb.from("gallery_photos").insert({ image_url: url, caption: form.caption.value.trim(), category: form.category.value });
          if (error) throw error;
          done++;
        }
        say(msg, `${done} photo${done === 1 ? "" : "s"} added ✓`, "ok");
        form.reset();
      } catch (err) {
        say(msg, `${done} uploaded, then an error: ${err.message}`, "error");
      } finally {
        busy(form, false);
        loaders.gallery();
      }
    });
    $("[data-photo-grid]").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const card = btn.closest("[data-id]");
      const p = photos.find((x) => String(x.id) === card.dataset.id);
      if (btn.dataset.act === "save") {
        const { error } = await sb.from("gallery_photos").update({ caption: $('[data-field="caption"]', card).value.trim(), category: $('[data-field="category"]', card).value }).eq("id", p.id);
        toast(error ? error.message : "Saved ✓");
      }
      if (btn.dataset.act === "delete") {
        if (!confirm("Delete this photo?")) return;
        const { error } = await sb.from("gallery_photos").delete().eq("id", p.id);
        if (error) return toast(error.message);
        await removeMedia(p.image_url);
        card.remove();
        toast("Deleted");
      }
    });

    /* ======================= SPENDING ======================= */
    let expenses = [];
    loaders.spending = async () => {
      if (!forms.expense.spent_on.value) forms.expense.spent_on.value = new Date().toISOString().slice(0, 10);
      const { data, error } = await sb.from("expenses").select("*").order("spent_on", { ascending: false });
      const list = $("[data-expense-list]");
      if (error) return (list.innerHTML = `<p class="form-msg form-msg--error">${esc(error.message)}</p>`);
      expenses = data || [];
      $("[data-spent-total]").textContent = expenses.length ? `Total: ${fmt(expenses.reduce((s, x) => s + Number(x.amount), 0))} ${cur()}` : "";
      list.innerHTML = expenses.length
        ? expenses
            .map(
              (x) => `<div class="admin-row" data-id="${x.id}">
                <div class="grow"><strong>${fmt(x.amount)} ${esc(cur())}</strong> · ${esc(x.description)}
                  <div class="muted">${fmtDate(x.spent_on)}${x.project ? " · " + esc(x.project) : ""}${x.receipt_url ? ` · <a href="${esc(x.receipt_url)}" target="_blank" rel="noopener">receipt</a>` : ""}</div>
                </div>
                <button class="link-btn link-btn--danger" type="button" data-act="delete">Delete</button>
              </div>`
            )
            .join("")
        : '<div class="empty">Nothing recorded yet.</div>';
    };
    forms.expense.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = forms.expense;
      const f = new FormData(form);
      const msg = $("[data-expense-msg]");
      busy(form, true);
      try {
        const file = form.receipt.files[0];
        const row = {
          spent_on: f.get("spent_on"),
          amount: Number(f.get("amount")),
          project: f.get("project").trim(),
          description: f.get("description").trim(),
          receipt_url: file ? await uploadMedia(file, "expenses") : null,
        };
        const { error } = await sb.from("expenses").insert(row);
        if (error) throw error;
        say(msg, "Added ✓", "ok");
        form.reset();
        loaders.spending();
      } catch (err) {
        say(msg, err.message, "error");
      } finally {
        busy(form, false);
      }
    });
    $("[data-expense-list]").addEventListener("click", async (e) => {
      const btn = e.target.closest('[data-act="delete"]');
      if (!btn) return;
      const x = expenses.find((y) => String(y.id) === btn.closest("[data-id]").dataset.id);
      if (!confirm(`Delete “${x.description}”?`)) return;
      const { error } = await sb.from("expenses").delete().eq("id", x.id);
      if (error) return toast(error.message);
      if (x.receipt_url) await removeMedia(x.receipt_url);
      loaders.spending();
    });

    /* ======================= SETTINGS ======================= */
    async function loadSettings() {
      const { data } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
      if (!data) return;
      A.FUNDRAISER.currency = data.currency;
      $$("[data-currency]").forEach((el) => (el.textContent = data.currency));
      const f = forms.settings;
      f.goal.value = Number(data.goal);
      f.currency.value = data.currency;
      f.deadline.value = data.deadline || "";
      f.offline_raised.value = Number(data.offline_raised);
      f.offline_donors.value = data.offline_donors;
      f.card_phone.value = data.card_phone || "";
      f.card_issuer.value = data.card_issuer || "";
      cardOpts = { phone: data.card_phone || "", issuer: data.card_issuer || "" };
    }
    loaders.settings = loadSettings;
    forms.settings.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(forms.settings);
      busy(forms.settings, true);
      const { error } = await sb
        .from("settings")
        .update({
          goal: Number(f.get("goal")),
          currency: f.get("currency").trim(),
          deadline: f.get("deadline") || null,
          offline_raised: Number(f.get("offline_raised")),
          offline_donors: Number(f.get("offline_donors")),
          card_phone: f.get("card_phone").trim() || null,
          card_issuer: f.get("card_issuer").trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);
      busy(forms.settings, false);
      say($("[data-settings-msg]"), error ? error.message : "Saved ✓ The website now shows the new numbers.", error ? "error" : "ok");
      if (!error) loadSettings();
    });

    /* ======================= USERS ======================= */
    let users = [];
    loaders.users = async () => {
      const { data, error } = await sb.rpc("admin_list_users");
      if (error) return ($("[data-user-rows]").innerHTML = `<tr><td colspan="6" class="form-msg form-msg--error">${esc(error.message)}</td></tr>`);
      users = data || [];
      renderUsers();
    };
    $("[data-user-search]").addEventListener("input", () => renderUsers());
    function renderUsers() {
      const q = $("[data-user-search]").value.trim().toLowerCase();
      const rows = users.filter((u) => !q || [u.full_name, u.phone, live.formatPhone(u.phone)].join(" ").toLowerCase().includes(q));
      $("[data-user-rows]").innerHTML = rows.length
        ? rows
            .map(
              (u) => `<tr data-id="${u.id}">
                <td data-label="Name">${esc(u.full_name || "–")}</td>
                <td data-label="Phone"><a href="tel:+${esc(u.phone || "")}">${esc(live.formatPhone(u.phone) || "–")}</a></td>
                <td data-label="Joined">${fmtDate(u.created_at)}</td>
                <td data-label="Confirmed" class="num">${fmt(u.approved_total)} ${esc(cur())} <span class="muted">(${u.donations})</span></td>
                <td data-label="Role">
                  <span class="tag ${u.role === "admin" ? "tag--done" : ""}">${u.role}</span>
                  ${u.id === me.id ? "" : `<button class="link-btn" type="button" data-act="role">${u.role === "admin" ? "Remove admin" : "Make admin"}</button>`}
                </td>
                <td data-label="Password">${u.id === me.id ? "" : '<button class="link-btn" type="button" data-act="resetpw">Reset to 123456</button>'}</td>
              </tr>`
            )
            .join("")
        : '<tr><td colspan="6" class="muted">No users found.</td></tr>';
    }
    $("[data-user-rows]").addEventListener("click", async (e) => {
      const btn = e.target.closest('[data-act="role"], [data-act="resetpw"]');
      if (!btn) return;
      const u = users.find((x) => x.id === btn.closest("[data-id]").dataset.id);
      if (btn.dataset.act === "resetpw") {
        if (!confirm(T("Reset the password of {name} to 123456? They will have to choose a new one when they sign in.", { name: u.full_name || live.formatPhone(u.phone) }))) return;
        const { error } = await sb.rpc("admin_reset_password", { target: u.id });
        return toast(error ? error.message : T("Done. Tell {name} to sign in with 123456.", { name: u.full_name || live.formatPhone(u.phone) }));
      }
      const role = u.role === "admin" ? "user" : "admin";
      const who = u.full_name || live.formatPhone(u.phone);
      if (!confirm(role === "admin" ? T("Give {name} full admin access?", { name: who }) : T("Remove admin access from {name}?", { name: who }))) return;
      const { error } = await sb.from("profiles").update({ role }).eq("id", u.id);
      if (error) return toast(error.message);
      toast("Role updated");
      loaders.users();
    });

    /* ======================= PROJECTS + PLEDGES ======================= */
    let projectsList = [];
    let pledgesList = [];
    const projectForm = forms.project;
    const PSTATUS = { open: ["Needs funding", "tag--planned"], in_progress: ["In progress", "tag--progress"], completed: ["Completed", "tag--done"] };
    loaders.projects = async () => {
      const [pr, pl] = await Promise.all([sb.rpc("public_projects"), sb.rpc("admin_list_adoptions")]);
      projectsList = pr.data || [];
      pledgesList = pl.data || [];
      setCount("[data-pledge-badge]", pledgesList.filter((x) => x.status === "pending").length);
      $("[data-project-list]").innerHTML = projectsList.length
        ? projectsList.map((p) => {
            const pct = Math.min(100, Math.round((Number(p.raised) / Number(p.goal)) * 100));
            return `<div class="admin-row" data-id="${p.id}">
              ${p.image_url ? `<img class="admin-row__img" src="${esc(p.image_url)}" alt="" />` : ""}
              <div class="grow"><strong>${esc(p.title)}</strong> <span class="tag ${PSTATUS[p.status][1]}">${PSTATUS[p.status][0]}</span>
                <div class="mini-bar"><span style="width:${pct}%"></span></div>
                <div class="muted">${fmt(p.raised)} / ${fmt(p.goal)} ${esc(cur())} raised · ${fmt(p.pledged)} pledged${p.adopters.length ? " · ♥ " + p.adopters.map(esc).join(", ") : ""}</div>
              </div>
              <div class="admin-row__btns"><button class="link-btn" type="button" data-act="edit">Edit</button><button class="link-btn link-btn--danger" type="button" data-act="delete">Delete</button></div>
            </div>`;
          }).join("")
        : '<div class="empty">No projects yet. Add the first one with the form.</div>';
      const PL = { pending: ["Waiting", "tag--progress"], confirmed: ["Confirmed", "tag--done"], cancelled: ["Cancelled", "tag--planned"] };
      $("[data-pledge-list]").innerHTML = pledgesList.length
        ? pledgesList.map((x) => `<div class="admin-row" data-id="${x.id}">
            <div class="grow"><strong>${fmt(x.pledge)} ${esc(cur())}</strong> → ${esc(x.project_title)} <span class="tag ${PL[x.status][1]}">${PL[x.status][0]}</span>
              <div class="muted">“${esc(x.display_name)}”${x.show_public ? "" : " (private)"} · ${esc(x.full_name || "")} · <a href="tel:+${esc(x.phone || "")}">${esc(live.formatPhone(x.phone))}</a> · ${fmtDate(x.created_at)}</div>
              ${x.message ? `<div class="muted">💬 ${esc(x.message)}</div>` : ""}
            </div>
            <div class="admin-row__btns">
              ${x.status !== "confirmed" ? '<button class="link-btn" type="button" data-act="confirm">Confirm</button>' : ""}
              ${x.status !== "cancelled" ? '<button class="link-btn link-btn--danger" type="button" data-act="cancel">Cancel</button>' : ""}
            </div>
          </div>`).join("")
        : '<div class="empty">No pledges yet.</div>';
    };
    const resetProject = () => {
      projectForm.reset();
      projectForm.id.value = "";
      $("[data-project-heading]").textContent = "New project";
      $("[data-project-cancel]").hidden = true;
    };
    $("[data-project-cancel]").addEventListener("click", resetProject);
    $("[data-project-list]").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const p = projectsList.find((x) => String(x.id) === btn.closest("[data-id]").dataset.id);
      if (btn.dataset.act === "edit") {
        for (const k of ["id", "title", "title_am", "description", "description_am", "goal", "status"]) projectForm[k].value = p[k] ?? "";
        const { data } = await sb.from("projects").select("sort").eq("id", p.id).maybeSingle();
        projectForm.sort.value = data ? data.sort : 0;
        projectForm.querySelector(".am-fields").open = !!(p.title_am || p.description_am);
        $("[data-project-heading]").textContent = "Edit project";
        $("[data-project-cancel]").hidden = false;
        projectForm.scrollIntoView({ behavior: "smooth" });
      }
      if (btn.dataset.act === "delete") {
        if (!confirm(T("Delete “{title}”? Its pledges are deleted too; donations stay but are no longer linked to it.", { title: p.title }))) return;
        const { error } = await sb.from("projects").delete().eq("id", p.id);
        if (error) return toast(error.message);
        if (p.image_url) await removeMedia(p.image_url);
        loaders.projects();
      }
    });
    projectForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(projectForm);
      const id = f.get("id");
      const msg = $("[data-project-msg]");
      busy(projectForm, true);
      try {
        const row = {
          title: f.get("title").trim(), title_am: f.get("title_am").trim() || null,
          description: f.get("description").trim(), description_am: f.get("description_am").trim() || null,
          goal: Number(f.get("goal")), status: f.get("status"), sort: Number(f.get("sort")) || 0,
        };
        const file = projectForm.image.files[0];
        if (file) {
          row.image_url = await uploadMedia(file, "projects");
          const old = projectsList.find((x) => String(x.id) === id);
          if (old && old.image_url) await removeMedia(old.image_url);
        }
        const res = id ? await sb.from("projects").update(row).eq("id", id) : await sb.from("projects").insert(row);
        if (res.error) throw res.error;
        say(msg, "Saved ✓ It's on the Get involved page.", "ok");
        resetProject();
        loaders.projects();
      } catch (err) {
        say(msg, err.message, "error");
      } finally {
        busy(projectForm, false);
      }
    });
    $("[data-pledge-list]").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const id = btn.closest("[data-id]").dataset.id;
      const status = btn.dataset.act === "confirm" ? "confirmed" : "cancelled";
      const { error } = await sb.from("project_adoptions").update({ status }).eq("id", id);
      toast(error ? error.message : status === "confirmed" ? "Pledge confirmed ✓ The name now shows on the project." : "Pledge cancelled");
      loaders.projects();
    });

    /* ======================= VOTES ======================= */
    let proposalsList = [];
    loaders.votes = async () => {
      const [pr, res] = await Promise.all([sb.from("proposals").select("*").order("created_at", { ascending: false }), sb.rpc("proposal_results")]);
      proposalsList = pr.data || [];
      const counts = {};
      (res.data || []).forEach((r) => ((counts[r.proposal_id] ||= {})[r.choice] = Number(r.votes)));
      $("[data-proposal-list]").innerHTML = proposalsList.length
        ? proposalsList.map((p) => {
            const c = counts[p.id] || {};
            const total = Object.values(c).reduce((a, b) => a + b, 0);
            const open = p.is_open && (!p.closes_at || new Date(p.closes_at) > new Date());
            return `<div class="admin-row admin-row--block" data-id="${p.id}">
              <div class="admin-row__top"><strong>${esc(p.title)}</strong> <span class="tag ${open ? "tag--progress" : ""}">${open ? "Open" : "Closed"}</span></div>
              <div class="muted">${esc(T(total === 1 ? "{n} vote" : "{n} votes", { n: total }))}${p.closes_at ? " · " + esc(T("Voting closes {date}", { date: fmtDate(p.closes_at) })) : ""}</div>
              <div class="results">${p.options.map((o, i) => {
                const pct = total ? Math.round(((c[i] || 0) / total) * 100) : 0;
                return `<div class="result"><span class="result__label">${esc(o)}</span><span class="result__bar"><span style="width:${pct}%"></span></span><span class="result__n">${c[i] || 0} · ${pct}%</span></div>`;
              }).join("")}</div>
              <div class="admin-row__btns">
                <button class="link-btn" type="button" data-act="toggle">${p.is_open ? "Close voting" : "Reopen voting"}</button>
                <button class="link-btn link-btn--danger" type="button" data-act="delete">Delete</button>
              </div>
            </div>`;
          }).join("")
        : '<div class="empty">No votes yet. Ask the community a question with the form.</div>';
    };
    forms.proposal.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = forms.proposal;
      const f = new FormData(form);
      const lines = (v) => String(v || "").split("\n").map((x) => x.trim()).filter(Boolean);
      const options = lines(f.get("options"));
      const optionsAm = lines(f.get("options_am"));
      const msg = $("[data-proposal-msg]");
      if (options.length < 2 || options.length > 10) return say(msg, "Please write 2 to 10 choices, one per line.", "error");
      if (optionsAm.length && optionsAm.length !== options.length) return say(msg, "The Amharic choices must be the same number as the English ones.", "error");
      busy(form, true);
      try {
        const file = form.image.files[0];
        const row = {
          title: f.get("title").trim(), title_am: f.get("title_am").trim() || null,
          description: f.get("description").trim(), description_am: f.get("description_am").trim() || null,
          options, options_am: optionsAm.length ? optionsAm : null,
          closes_at: f.get("closes_at") ? new Date(f.get("closes_at") + "T23:59:59").toISOString() : null,
          image_url: file ? await uploadMedia(file, "votes") : null,
        };
        const { error } = await sb.from("proposals").insert(row);
        if (error) throw error;
        say(msg, "Vote started ✓ It's on the Get involved page.", "ok");
        form.reset();
        loaders.votes();
      } catch (err) {
        say(msg, err.message, "error");
      } finally {
        busy(form, false);
      }
    });
    $("[data-proposal-list]").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const p = proposalsList.find((x) => String(x.id) === btn.closest("[data-id]").dataset.id);
      if (btn.dataset.act === "toggle") {
        const { error } = await sb.from("proposals").update({ is_open: !p.is_open }).eq("id", p.id);
        if (error) return toast(error.message);
      }
      if (btn.dataset.act === "delete") {
        if (!confirm(T("Delete “{title}” and all its votes?", { title: p.title }))) return;
        const { error } = await sb.from("proposals").delete().eq("id", p.id);
        if (error) return toast(error.message);
        if (p.image_url) await removeMedia(p.image_url);
      }
      loaders.votes();
    });

    /* ======================= VOLUNTEERS ======================= */
    let volunteersList = [];
    const VSTATUS = { new: "New", contacted: "Contacted", active: "Active" };
    loaders.volunteers = async () => {
      const { data, error } = await sb.rpc("admin_list_volunteers");
      if (error) return ($("[data-volunteer-list]").innerHTML = `<p class="form-msg form-msg--error">${esc(error.message)}</p>`);
      volunteersList = data || [];
      setCount("[data-volunteer-badge]", volunteersList.filter((v) => v.status === "new").length);
      renderVolunteers();
    };
    $("[data-volunteer-search]").addEventListener("input", () => renderVolunteers());
    function renderVolunteers() {
      const q = $("[data-volunteer-search]").value.trim().toLowerCase();
      const rows = volunteersList.filter((v) => !q || [v.full_name, v.phone, v.profession, v.skills, v.location].join(" ").toLowerCase().includes(q));
      $("[data-volunteer-list]").innerHTML = rows.length
        ? rows.map((v) => `<article class="vol-card" data-id="${v.id}">
            <div class="vol-card__top">
              <span class="avatar avatar--static">${esc(live.initials(v.full_name))}</span>
              <div class="grow"><strong>${esc(v.full_name || "–")}</strong><div class="muted">${esc(T(v.profession))}</div></div>
              <select data-field="status" aria-label="Status">${Object.entries(VSTATUS).map(([k, l]) => `<option value="${k}" ${k === v.status ? "selected" : ""}>${l}</option>`).join("")}</select>
            </div>
            <a class="vol-card__phone" href="tel:+${esc(v.phone || "")}">📞 ${esc(live.formatPhone(v.phone))}</a>
            ${v.skills ? `<p>${esc(v.skills)}</p>` : ""}
            <div class="muted">${esc([v.availability, v.location].filter(Boolean).map((x) => T(x)).join(" · "))} · ${fmtDate(v.created_at)}</div>
            ${v.message ? `<p class="review__msg">“${esc(v.message)}”</p>` : ""}
          </article>`).join("")
        : '<div class="empty">No volunteers yet.</div>';
    }
    $("[data-volunteer-list]").addEventListener("change", async (e) => {
      const sel = e.target.closest('[data-field="status"]');
      if (!sel) return;
      const { error } = await sb.from("volunteers").update({ status: sel.value }).eq("id", sel.closest("[data-id]").dataset.id);
      toast(error ? error.message : "Saved ✓");
      loaders.volunteers();
    });
    $("[data-volunteer-export]").addEventListener("click", () => {
      const cols = ["full_name", "phone", "profession", "skills", "availability", "location", "message", "status", "created_at"];
      const cell = (v) => { let s = v == null ? "" : String(v); if (/^[=+\-@]/.test(s)) s = "'" + s; return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const csv = [cols.join(","), ...volunteersList.map((v) => cols.map((c) => cell(c === "phone" ? live.formatPhone(v.phone) : v[c])).join(","))].join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv" }));
      a.download = `ancharo-volunteers-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
    });

    /* ======================= MEMBER CARDS (digital ID) ======================= */
    let cardOpts = { phone: "", issuer: "" };
    let cards = [];
    let cardFilter = "";
    const selected = new Set();
    const IDC = window.IDCard;
    const today = () => new Date().toISOString().slice(0, 10);
    const plusYears = (n) => { const d = new Date(); d.setFullYear(d.getFullYear() + n); d.setDate(d.getDate() - 1); return d.toISOString().slice(0, 10); };
    const cardState = (c) => IDC.status(c); // active | pending | revoked | expired
    const addressOf = (c) => [c.city, c.subcity && "Sub-city " + c.subcity, c.woreda && "Woreda " + c.woreda, c.kebele && "Kebele " + c.kebele, c.house_no && "House " + c.house_no].filter(Boolean).join(", ");
    const STATE = { active: ["Active", "tag--done"], pending: ["Application", "tag--progress"], revoked: ["Revoked", "tag--planned"], expired: ["Expired", "tag--planned"] };

    loaders.cards = async () => {
      const { data, error } = await sb.from("member_cards").select("*").order("created_at", { ascending: false });
      const box = $("[data-card-list]");
      if (error) return (box.innerHTML = `<p class="form-msg form-msg--error">${esc(error.message)}</p>`);
      cards = data || [];
      setCount("[data-card-badge]", cards.filter((c) => c.status === "pending").length);
      renderCards();
    };
    $$("[data-card-status]").forEach((b) => b.addEventListener("click", () => {
      $$("[data-card-status]").forEach((x) => x.classList.toggle("is-active", x === b));
      cardFilter = b.dataset.cardStatus;
      renderCards();
    }));
    $("[data-card-search]").addEventListener("input", () => renderCards());

    function renderCards() {
      const q = $("[data-card-search]").value.trim().toLowerCase();
      const rows = cards.filter((c) => (!cardFilter || c.status === cardFilter) &&
        (!q || [c.full_name, c.full_name_am, c.card_number, c.phone, c.city, c.subcity, c.woreda, c.kebele, c.house_no, c.role].join(" ").toLowerCase().includes(q)));
      const box = $("[data-card-list]");
      if (!rows.length) {
        box.innerHTML = `<div class="empty">${cards.length ? "No cards match." : "No cards yet. Click “＋ Register a person” to make the first one."}</div>`;
      } else {
        box.innerHTML = rows.map((c) => {
          const st = cardState(c);
          const [label, cls] = STATE[st];
          return `<article class="card-row" data-id="${c.id}">
            <label class="card-row__pick"><input type="checkbox" data-select ${selected.has(String(c.id)) ? "checked" : ""} aria-label="Select for printing" /></label>
            <div class="card-row__mini" style="--idc-w:170px">${IDC.front(c)}</div>
            <div class="grow">
              <div class="admin-row__top"><strong>${esc(c.full_name)}</strong> <span class="tag ${cls}">${label}</span>${c.fayda_verified ? ' <span class="tag tag--done">✓ Fayda</span>' : ""}</div>
              <div class="muted">${esc(c.card_number)} · ${esc(c.role)}${c.phone ? " · " + esc(c.phone) : ""}${addressOf(c) ? " · " + esc(addressOf(c)) : ""}</div>
              <div class="muted">${c.expires_on ? "Valid until " + fmtDate(c.expires_on) + " · " : ""}${c.printed_count ? `Printed ${c.printed_count}× (last ${fmtDate(c.last_printed_at)})` : "Not printed yet"}${c.user_id ? " · linked to an account" : ""}</div>
            </div>
            <div class="admin-row__btns admin-row__btns--wrap">
              ${c.status === "pending" ? '<button class="btn btn--green btn--small" type="button" data-act="approve">✓ Approve</button>' : ""}
              <button class="link-btn" type="button" data-act="edit">Edit</button>
              <button class="link-btn" type="button" data-act="print">🖨 Print</button>
              ${c.status === "revoked" ? '<button class="link-btn" type="button" data-act="reactivate">Reactivate</button>' : c.status === "active" ? '<button class="link-btn link-btn--danger" type="button" data-act="revoke">Revoke</button>' : ""}
              <button class="link-btn link-btn--danger" type="button" data-act="delete">Delete</button>
            </div>
          </article>`;
        }).join("");
      }
      $("[data-card-print-selected]").disabled = !selected.size;
      $("[data-card-print-selected]").textContent = selected.size ? `🖨 Print selected (${selected.size})` : "🖨 Print selected";
    }

    $("[data-card-list]").addEventListener("change", (e) => {
      const cb = e.target.closest("[data-select]");
      if (!cb) return;
      const id = cb.closest("[data-id]").dataset.id;
      cb.checked ? selected.add(id) : selected.delete(id);
      renderCards();
    });
    const idPhotoPath = (url) => { const m = String(url || "").match(/\/object\/public\/id-photos\/(.+)$/); return m ? decodeURIComponent(m[1]) : null; };

    $("[data-card-list]").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const c = cards.find((x) => String(x.id) === btn.closest("[data-id]").dataset.id);
      const act = btn.dataset.act;
      if (act === "edit") return openEditor(c);
      if (act === "print") return askPrint([c]);
      if (act === "delete") {
        if (!confirm(T("Delete the card of {name}? This cannot be undone. Its QR code will stop working.", { name: c.full_name }))) return;
        const { error } = await sb.from("member_cards").delete().eq("id", c.id);
        if (error) return toast(error.message);
        const p = idPhotoPath(c.photo_url);
        if (p) await sb.storage.from("id-photos").remove([p]);
        selected.delete(String(c.id));
        toast("Deleted");
        return loaders.cards();
      }
      const upd = act === "approve" ? { status: "active", issued_on: c.issued_on || today(), expires_on: c.expires_on || plusYears(3) }
        : act === "revoke" ? { status: "revoked" } : { status: "active" };
      if (act === "revoke" && !confirm(T("Revoke the card of {name}? Scanning it will show “revoked”.", { name: c.full_name }))) return;
      const { error } = await sb.from("member_cards").update(upd).eq("id", c.id);
      if (error) return toast(error.message);
      toast(act === "approve" ? "Approved ✓ Ready to print" : act === "revoke" ? "Card revoked" : "Card active again");
      loaders.cards();
    });

    /* ---------- editor ---------- */
    const cardModal = $("[data-card-modal]");
    const cardForm = forms.card;
    let editing = null, newPhoto = null, newPhotoUrl = "", stream = null;
    const stopCamera = () => { stream && stream.getTracks().forEach((t) => t.stop()); stream = null; $("[data-camera-box]").hidden = true; };
    const closeEditor = () => { stopCamera(); cardModal.hidden = true; };
    $("[data-card-close]").addEventListener("click", closeEditor);
    cardModal.addEventListener("click", (e) => e.target === cardModal && closeEditor());

    const formCard = () => {
      const f = new FormData(cardForm);
      const v = (k) => String(f.get(k) || "").trim();
      return {
        ...(editing || {}),
        first_name: v("first_name") || "First", middle_name: v("middle_name"), last_name: v("last_name"),
        first_name_am: v("first_name_am"), middle_name_am: v("middle_name_am"), last_name_am: v("last_name_am"),
        full_name: IDC.joinName(v("first_name"), v("middle_name"), v("last_name")) || "Full name",
        full_name_am: IDC.joinName(v("first_name_am"), v("middle_name_am"), v("last_name_am")), sex: v("sex"), date_of_birth: v("date_of_birth"),
        phone: v("phone"), city: v("city"), subcity: v("subcity"), woreda: v("woreda"), kebele: v("kebele"), house_no: v("house_no"),
        role: v("role") || "Member", blood_type: v("blood_type"),
        emergency_name: v("emergency_name"), emergency_phone: v("emergency_phone"),
        fayda_verified: f.get("fayda_verified") === "on", issued_on: v("issued_on"), expires_on: v("expires_on"), status: v("status"),
        photo_url: newPhotoUrl || (editing && editing.photo_url) || "",
        card_number: (editing && editing.card_number) || "ANC-··-·····", verify_code: (editing && editing.verify_code) || "preview-only",
      };
    };
    const preview = () => {
      const c = formCard();
      $("[data-card-preview]").innerHTML = `<div style="--idc-w:100%">${IDC.front(c)}</div><div style="--idc-w:100%">${IDC.back(c, cardOpts)}</div>`;
      $("[data-photo-preview]").innerHTML = c.photo_url ? `<img src="${esc(c.photo_url)}" alt="" />` : '<span>No photo yet</span>';
    };
    cardForm.addEventListener("input", preview);
    cardForm.addEventListener("change", preview);

    function openEditor(c) {
      editing = c || null;
      newPhoto = null; newPhotoUrl = "";
      cardForm.reset();
      const d = c || { role: "Member", status: "active", issued_on: today(), expires_on: plusYears(3) };
      const n = IDC.nameParts(d);
      for (const k of ["first", "middle", "last", "first_am", "middle_am", "last_am"]) cardForm[k.replace(/(_am)?$/, "_name$1")].value = n[k] || "";
      for (const k of ["id", "sex", "date_of_birth", "phone", "city", "subcity", "woreda", "kebele", "house_no", "role", "blood_type", "emergency_name", "emergency_phone", "fayda_number", "issued_on", "expires_on", "status"])
        if (cardForm[k]) cardForm[k].value = d[k] ?? "";
      cardForm.fayda_verified.checked = !!d.fayda_verified;
      $("[data-card-heading]").textContent = c ? `Card ${c.card_number}` : "Register a person";
      say($("[data-card-msg]"), "");
      preview();
      cardModal.hidden = false;
      cardForm.first_name.focus();
    }
    $("[data-card-new]").addEventListener("click", () => openEditor(null));

    const usePhoto = async (src) => {
      newPhoto = await live.cropPortrait(src);
      if (newPhotoUrl) URL.revokeObjectURL(newPhotoUrl);
      newPhotoUrl = URL.createObjectURL(newPhoto);
      preview();
    };
    cardForm.photo.addEventListener("change", () => cardForm.photo.files[0] && usePhoto(cardForm.photo.files[0]));
    $("[data-camera]").addEventListener("click", async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
        const video = $("[data-camera-box] video");
        video.srcObject = stream;
        $("[data-camera-box]").hidden = false;
      } catch (err) {
        toast(T("Camera not available. Use “Choose photo” instead."));
      }
    });
    $("[data-camera-stop]").addEventListener("click", stopCamera);
    $("[data-snap]").addEventListener("click", async () => { await usePhoto($("[data-camera-box] video")); stopCamera(); });

    async function saveCard() {
      const f = new FormData(cardForm);
      const v = (k) => String(f.get(k) || "").trim();
      const msg = $("[data-card-msg]");
      if (!v("first_name")) return say(msg, T("Please enter the first name."), "error"), null;
      const fayda = v("fayda_number").replace(/\D/g, "");
      if (fayda && fayda.length !== 12 && fayda.length !== 16) return say(msg, T("A Fayda number has 12 or 16 digits."), "error"), null;
      const digits = live.normalizePhone(v("phone"));
      busy(cardForm, true);
      say(msg, "Saving…");
      try {
        const row = {
          first_name: IDC.titleCase(v("first_name")), middle_name: IDC.titleCase(v("middle_name")) || null, last_name: IDC.titleCase(v("last_name")) || null,
          first_name_am: v("first_name_am") || null, middle_name_am: v("middle_name_am") || null, last_name_am: v("last_name_am") || null,
          full_name: IDC.titleCase(IDC.joinName(v("first_name"), v("middle_name"), v("last_name"))),
          full_name_am: IDC.joinName(v("first_name_am"), v("middle_name_am"), v("last_name_am")) || null,
          sex: v("sex") || null, date_of_birth: v("date_of_birth") || null,
          phone: digits ? live.formatPhone(digits) : v("phone") || null, role: v("role") || "Member",
          city: v("city") || null, subcity: v("subcity") || null, woreda: v("woreda") || null, kebele: v("kebele") || null, house_no: v("house_no") || null,
          blood_type: v("blood_type") || null, emergency_name: v("emergency_name") || null, emergency_phone: v("emergency_phone") || null,
          fayda_number: fayda || null, fayda_verified: f.get("fayda_verified") === "on", status: v("status") || "active",
          issued_on: v("issued_on") || null, expires_on: v("expires_on") || null,
        };
        if (row.status === "active") { row.issued_on ||= today(); row.expires_on ||= plusYears(3); }
        if (newPhoto) {
          const path = `cards/${live.randomId()}.jpg`;
          const up = await sb.storage.from("id-photos").upload(path, newPhoto, { contentType: "image/jpeg", cacheControl: "31536000" });
          if (up.error) throw up.error;
          row.photo_url = sb.storage.from("id-photos").getPublicUrl(path).data.publicUrl;
          const old = editing && idPhotoPath(editing.photo_url);
          if (old) await sb.storage.from("id-photos").remove([old]);
        }
        // link to the person's website account when the phone number matches one
        if (digits && !(editing && editing.user_id)) {
          const { data: prof } = await sb.from("profiles").select("id").eq("phone", digits).maybeSingle();
          if (prof) row.user_id = prof.id;
        }
        const res = editing
          ? await sb.from("member_cards").update(row).eq("id", editing.id).select()
          : await sb.from("member_cards").insert(row).select();
        if (res.error) throw res.error;
        const saved = (res.data && res.data[0]) || { ...editing, ...row };
        toast(editing ? "Saved ✓" : T("Card {number} created ✓", { number: saved.card_number || "" }));
        closeEditor();
        loaders.cards();
        return saved;
      } catch (err) {
        say(msg, err.message, "error");
        return null;
      } finally {
        busy(cardForm, false);
      }
    }
    cardForm.addEventListener("submit", (e) => { e.preventDefault(); saveCard(); });
    $("[data-save-print]").addEventListener("click", async () => { const c = await saveCard(); if (c) askPrint([c]); });

    /* ---------- printing ---------- */
    const printModal = $("[data-print-modal]");
    let toPrint = [];
    const printArea = $("#print-area");
    document.body.appendChild(printArea); // must sit directly in <body> for printing
    $("[data-print-close]").addEventListener("click", () => (printModal.hidden = true));
    function askPrint(list) {
      toPrint = list;
      $("[data-print-count]").textContent = list.length === 1 ? list[0].full_name : T("{n} cards", { n: list.length });
      printModal.hidden = false;
    }
    $("[data-card-print-selected]").addEventListener("click", () => askPrint(cards.filter((c) => selected.has(String(c.id)))));
    forms.print.addEventListener("submit", async (e) => {
      e.preventDefault();
      const layout = forms.print.layout.value;
      const withBack = forms.print.back.checked;
      printModal.hidden = true;
      printArea.className = "print-" + layout;
      printArea.innerHTML = toPrint.map((c) =>
        layout === "a4"
          ? `<div class="print-row">${IDC.front(c)}${withBack ? IDC.back(c, cardOpts) : ""}</div>`
          : IDC.front(c) + (withBack ? IDC.back(c, cardOpts) : "")
      ).join("");
      let pageCss = document.getElementById("print-page-size");
      if (!pageCss) { pageCss = document.createElement("style"); pageCss.id = "print-page-size"; document.head.appendChild(pageCss); }
      pageCss.textContent = layout === "a4" ? "@page { size: A4; margin: 10mm; }" : "@page { size: 85.6mm 54mm; margin: 0; }";
      await Promise.all([...printArea.querySelectorAll("img")].map((img) => (img.complete ? 0 : new Promise((r) => (img.onload = img.onerror = r)))));
      document.body.classList.add("printing");
      const done = async () => {
        document.body.classList.remove("printing");
        window.removeEventListener("afterprint", done);
        await sb.rpc("mark_cards_printed", { ids: toPrint.map((c) => c.id).filter(Boolean) });
        loaders.cards();
      };
      window.addEventListener("afterprint", done);
      window.print();
    });
  });
})();
