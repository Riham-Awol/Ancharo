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
      const { data } = await sb.from("profiles").select("id,full_name,role").eq("id", session.user.id).maybeSingle();
      if (!data || data.role !== "admin") {
        show("denied");
        $("[data-denied-msg]").textContent = "Your account doesn't have admin access. Ask an existing admin to give you the admin role.";
        return;
      }
      me = { ...data, email: session.user.email };
      $("[data-admin-who]").textContent = "Signed in as " + (me.full_name || me.email);
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
      const [stats, pending] = await Promise.all([sb.rpc("public_stats"), sb.rpc("admin_list_donations", { status_filter: "pending" })]);
      const s = stats.data || {};
      const p = pending.data || [];
      setBadge(p.length);
      const pct = s.goal ? Math.round((Number(s.raised) / Number(s.goal)) * 100) : 0;
      $("[data-kpis]").innerHTML = [
        ["Raised", `${fmt(s.raised || 0)} ${esc(s.currency || "")}`, `${pct}% of ${fmt(s.goal || 0)}`],
        ["Donors", fmt(s.donors || 0), "approved donations + offline"],
        ["Waiting for review", fmt(p.length), p.length ? "needs your attention" : "all caught up ✓"],
        ["Spent", `${fmt(s.spent || 0)} ${esc(s.currency || "")}`, `${fmt(Math.max(0, (s.raised || 0) - (s.spent || 0)))} available`],
      ]
        .map(([k, v, sub]) => `<div class="kpi"><div class="kpi__label">${k}</div><div class="kpi__value">${v}</div><div class="kpi__sub">${sub}</div></div>`)
        .join("");
      $("[data-overview-pending]").innerHTML = p.length
        ? `<div class="admin-list">${p.slice(0, 6).map((d) => `<div class="admin-row"><div><strong>${fmt(d.amount)} ${esc(cur())}</strong> from ${esc(d.donor_name || d.donor_email || "Unknown")}<div class="muted">${esc(d.method)} · submitted ${fmtDate(d.created_at)}</div></div></div>`).join("")}</div>`
        : `<div class="empty">Nothing to review right now 🎉</div>`;
    };
    const setBadge = (n) => { const b = $("[data-pending-badge]"); b.hidden = !n; b.textContent = n; };

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
      const rows = donations.filter((d) => !q || [d.donor_name, d.donor_email, d.donor_phone, d.reference, d.method, d.message].join(" ").toLowerCase().includes(q));
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
                  <div><strong>${esc(d.donor_name || "(no name)")}</strong> <span class="muted">${esc(d.donor_email || "")}${d.donor_phone ? " · " + esc(d.donor_phone) : ""}</span></div>
                </div>
                <span class="tag ${cls}">${label}</span>
              </div>
              <dl class="review__facts">
                <div><dt>Method</dt><dd>${esc(d.method || "–")}</dd></div>
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
      const cols = ["id", "created_at", "status", "amount", "method", "reference", "donated_on", "donor_name", "donor_email", "donor_phone", "show_name", "display_name", "message", "admin_note", "reviewed_at"];
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
      const rows = users.filter((u) => !q || [u.full_name, u.email, u.phone].join(" ").toLowerCase().includes(q));
      $("[data-user-rows]").innerHTML = rows.length
        ? rows
            .map(
              (u) => `<tr data-id="${u.id}">
                <td data-label="Name">${esc(u.full_name || "–")}</td>
                <td data-label="Email">${esc(u.email)}</td>
                <td data-label="Phone">${esc(u.phone || "–")}</td>
                <td data-label="Joined">${fmtDate(u.created_at)}</td>
                <td data-label="Confirmed" class="num">${fmt(u.approved_total)} ${esc(cur())} <span class="muted">(${u.donations})</span></td>
                <td data-label="Role">
                  <span class="tag ${u.role === "admin" ? "tag--done" : ""}">${u.role}</span>
                  ${u.id === me.id ? "" : `<button class="link-btn" type="button" data-act="role">${u.role === "admin" ? "Remove admin" : "Make admin"}</button>`}
                </td>
              </tr>`
            )
            .join("")
        : '<tr><td colspan="6" class="muted">No users found.</td></tr>';
    }
    $("[data-user-rows]").addEventListener("click", async (e) => {
      const btn = e.target.closest('[data-act="role"]');
      if (!btn) return;
      const u = users.find((x) => x.id === btn.closest("[data-id]").dataset.id);
      const role = u.role === "admin" ? "user" : "admin";
      if (!confirm(role === "admin" ? `Give ${u.email} full admin access?` : `Remove admin access from ${u.email}?`)) return;
      const { error } = await sb.from("profiles").update({ role }).eq("id", u.id);
      if (error) return toast(error.message);
      toast("Role updated");
      loaders.users();
    });
  });
})();
