/* ==========================================================
   ACCOUNT PAGE: sign in / sign up, submit donation receipts,
   see their status, download a thank-you certificate.
   ========================================================== */
(() => {
  const A = window.Ancharo;
  const live = window.AncharoLive;
  const { esc, fmt, toast } = A;
  const $ = (sel, root = document) => root.querySelector(sel);
  const views = {};
  document.querySelectorAll("[data-view]").forEach((el) => (views[el.dataset.view] = el));
  const show = (name) => Object.entries(views).forEach(([k, el]) => (el.hidden = k !== name));

  if (!live || !live.enabled) return show("setup");

  const authMsg = $("[data-auth-msg]");
  const say = (el, text, kind = "") => {
    el.textContent = text;
    el.className = "form-msg" + (kind ? " form-msg--" + kind : "");
  };
  const busy = (form, on) => form.querySelectorAll("button, input, select, textarea").forEach((b) => (b.disabled = on));

  /* ---------- auth tabs ---------- */
  const forms = {};
  document.querySelectorAll("[data-form]").forEach((f) => (forms[f.dataset.form] = f));
  const authTab = (name) => {
    ["signin", "signup", "forgot", "reset"].forEach((k) => (forms[k].hidden = k !== name));
    document.querySelectorAll(".tab[data-auth-tab]").forEach((t) => {
      const on = t.dataset.authTab === name;
      t.classList.toggle("is-active", on);
      t.setAttribute("aria-selected", on);
    });
    $(".tabs").hidden = name === "reset" || name === "forgot";
    say(authMsg, "");
  };
  document.querySelectorAll("[data-auth-tab]").forEach((b) => b.addEventListener("click", () => authTab(b.dataset.authTab)));

  live.ready.then(async (sb) => {
    const here = location.origin + location.pathname;
    let user = null;
    let recovering = false;

    sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        recovering = true;
        show("auth");
        authTab("reset");
        return;
      }
      if (recovering) return;
      if (event === "SIGNED_IN" && session && (!user || user.id !== session.user.id)) enter(session.user);
      if (event === "SIGNED_OUT") { user = null; show("auth"); authTab("signin"); }
    });

    const { data } = await sb.auth.getSession();
    if (recovering) return;
    if (data.session) enter(data.session.user);
    else { show("auth"); if (location.hash === "#signup") authTab("signup"); }

    /* ---------- sign in / up / reset ---------- */
    forms.signin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(forms.signin);
      busy(forms.signin, true);
      say(authMsg, "Signing in…");
      const { error } = await sb.auth.signInWithPassword({ email: f.get("email").trim(), password: f.get("password") });
      busy(forms.signin, false);
      if (error) say(authMsg, error.message === "Invalid login credentials" ? "Wrong email or password." : error.message, "error");
    });

    forms.signup.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(forms.signup);
      busy(forms.signup, true);
      say(authMsg, "Creating your account…");
      const { data, error } = await sb.auth.signUp({
        email: f.get("email").trim(),
        password: f.get("password"),
        options: { data: { full_name: f.get("full_name").trim(), phone: f.get("phone").trim() }, emailRedirectTo: here },
      });
      busy(forms.signup, false);
      if (error) return say(authMsg, error.message, "error");
      if (!data.session) {
        forms.signup.reset();
        say(authMsg, "Almost done! We sent you an email. Click the link in it to confirm your account, then sign in.", "ok");
      }
    });

    forms.forgot.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = new FormData(forms.forgot).get("email").trim();
      busy(forms.forgot, true);
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: here });
      busy(forms.forgot, false);
      say(authMsg, error ? error.message : "If that email has an account, a reset link is on its way. Check your inbox.", error ? "error" : "ok");
    });

    forms.reset.addEventListener("submit", async (e) => {
      e.preventDefault();
      busy(forms.reset, true);
      const { data, error } = await sb.auth.updateUser({ password: new FormData(forms.reset).get("password") });
      busy(forms.reset, false);
      if (error) return say(authMsg, error.message, "error");
      recovering = false;
      toast("Password updated");
      history.replaceState(null, "", location.pathname);
      enter(data.user);
    });

    $("[data-signout]").addEventListener("click", () => sb.auth.signOut());

    /* ---------- dashboard ---------- */
    let profile = null;
    async function enter(u) {
      user = u;
      show("dash");
      $("[data-user-email]").textContent = u.email || "";
      const { data } = await sb.from("profiles").select("full_name,phone,role").eq("id", u.id).maybeSingle();
      profile = data || { full_name: "", phone: "", role: "user" };
      $("[data-user-name]").textContent = (profile.full_name || u.email || "").split(" ")[0];
      $("[data-admin-only]").hidden = profile.role !== "admin";
      forms.profile.full_name.value = profile.full_name || "";
      forms.profile.phone.value = profile.phone || "";
      if (!forms.donation.donated_on.value) forms.donation.donated_on.value = new Date().toISOString().slice(0, 10);
      loadMine();
      if (location.hash === "#submit") $("#submit").scrollIntoView();
    }

    /* receipt picker with preview */
    const drop = $("[data-drop]");
    const fileInput = forms.donation.screenshot;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files[0];
      const prev = $(".drop__preview", drop);
      $(".drop__empty", drop).hidden = !!file;
      prev.hidden = !file;
      if (!file) return;
      $(".drop__name", drop).textContent = file.name;
      const img = $("img", prev);
      if (file.type.startsWith("image/") && !/hei[cf]/.test(file.type)) {
        img.hidden = false;
        img.src = URL.createObjectURL(file);
      } else img.hidden = true;
    });
    ["dragover", "dragenter"].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add("is-over"); }));
    ["dragleave", "drop"].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove("is-over")));
    drop.addEventListener("drop", (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) {
        fileInput.files = e.dataTransfer.files;
        fileInput.dispatchEvent(new Event("change"));
      }
    });
    forms.donation.show_name.addEventListener("change", (e) => ($("[data-display-name]").hidden = !e.target.checked));

    /* submit a donation */
    const donationMsg = $("[data-donation-msg]");
    forms.donation.addEventListener("submit", async (e) => {
      e.preventDefault();
      const form = forms.donation;
      const f = new FormData(form);
      const original = fileInput.files[0];
      if (!original) return say(donationMsg, "Please add your receipt screenshot.", "error");
      if (original.size > 6 * 1024 * 1024 && !original.type.startsWith("image/")) return say(donationMsg, "That file is too big (max 6 MB).", "error");
      busy(form, true);
      say(donationMsg, "Uploading your receipt…");
      const file = await live.compressImage(original, 2000, 0.85);
      if (file.size > 6 * 1024 * 1024) { busy(form, false); return say(donationMsg, "That file is too big (max 6 MB).", "error"); }
      const path = `${user.id}/${live.randomId()}.${live.extOf(file)}`;
      const up = await sb.storage.from("receipts").upload(path, file, { contentType: file.type || "application/octet-stream" });
      if (up.error) { busy(form, false); return say(donationMsg, "Upload failed: " + up.error.message, "error"); }
      const showName = f.get("show_name") === "on";
      const { error } = await sb.from("donations").insert({
        user_id: user.id,
        amount: Number(f.get("amount")),
        method: f.get("method"),
        reference: f.get("reference").trim() || null,
        donated_on: f.get("donated_on") || null,
        screenshot_path: path,
        message: f.get("message").trim() || null,
        show_name: showName,
        display_name: showName ? f.get("display_name").trim() || null : null,
      });
      busy(form, false);
      if (error) {
        await sb.storage.from("receipts").remove([path]);
        return say(donationMsg, "Could not save: " + error.message, "error");
      }
      form.reset();
      form.donated_on.value = new Date().toISOString().slice(0, 10);
      fileInput.dispatchEvent(new Event("change"));
      $("[data-display-name]").hidden = true;
      say(donationMsg, "Thank you! 🎉 We received your receipt. You'll see it marked “Approved” here once our team has checked it.", "ok");
      loadMine();
    });

    /* my donations list */
    const STATUS = { pending: ["Waiting for review", "tag--progress"], approved: ["Approved", "tag--done"], rejected: ["Not approved", "tag--planned"] };
    let mine = [];
    async function loadMine() {
      const box = $("[data-my-donations]");
      const { data, error } = await sb.from("donations").select("*").order("created_at", { ascending: false });
      if (error) return (box.innerHTML = `<p class="form-msg form-msg--error">${esc(error.message)}</p>`);
      mine = data || [];
      const cur = A.FUNDRAISER.currency;
      const approved = mine.filter((d) => d.status === "approved").reduce((s, d) => s + Number(d.amount), 0);
      $("[data-my-total]").textContent = approved ? `${fmt(approved)} ${cur} confirmed` : "";
      if (!mine.length) {
        box.innerHTML = `<div class="empty">No donations yet. When you've sent one, upload the receipt with the form${window.innerWidth < 900 ? " above" : ""}.</div>`;
        return;
      }
      box.innerHTML = mine
        .map((d) => {
          const [label, cls] = STATUS[d.status] || [d.status, ""];
          return `<div class="my-item" data-id="${d.id}">
            <div class="my-item__top">
              <strong>${fmt(d.amount)} ${esc(cur)}</strong>
              <span class="tag ${cls}">${label}</span>
            </div>
            <div class="my-item__meta">${esc(d.method)}${d.donated_on ? " · " + live.fmtDate(d.donated_on, { day: "numeric", month: "short", year: "numeric" }) : ""}${d.reference ? " · Ref " + esc(d.reference) : ""}</div>
            ${d.admin_note ? `<div class="my-item__note"><strong>Note from the team:</strong> ${esc(d.admin_note)}</div>` : ""}
            <div class="my-item__actions">
              <button class="link-btn" type="button" data-act="receipt">View receipt</button>
              ${d.status === "approved" ? '<button class="link-btn" type="button" data-act="cert">🏅 Thank-you certificate</button>' : ""}
              ${d.status === "pending" ? '<button class="link-btn link-btn--danger" type="button" data-act="delete">Delete</button>' : ""}
            </div>
          </div>`;
        })
        .join("");
    }

    $("[data-my-donations]").addEventListener("click", async (e) => {
      const btn = e.target.closest("[data-act]");
      if (!btn) return;
      const d = mine.find((x) => String(x.id) === btn.closest(".my-item").dataset.id);
      if (!d) return;
      if (btn.dataset.act === "receipt") {
        const win = window.open("", "_blank");
        const { data, error } = await sb.storage.from("receipts").createSignedUrl(d.screenshot_path, 300);
        if (error) { win && win.close(); return toast("Could not open receipt"); }
        if (win) win.location = data.signedUrl; else location.href = data.signedUrl;
      }
      if (btn.dataset.act === "delete") {
        if (!confirm("Delete this submission?")) return;
        const { error } = await sb.from("donations").delete().eq("id", d.id);
        if (error) return toast(error.message);
        await sb.storage.from("receipts").remove([d.screenshot_path]);
        toast("Deleted");
        loadMine();
      }
      if (btn.dataset.act === "cert") certificate(d);
    });

    /* thank-you certificate (PNG download) */
    async function certificate(d) {
      const name = (d.show_name && d.display_name) || profile.full_name || "Our friend";
      try { await document.fonts.load('700 64px "Fraunces"'); await document.fonts.load('500 30px "Inter"'); } catch {}
      const W = 1600, H = 1130;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const x = c.getContext("2d");
      x.fillStyle = "#faf6ef"; x.fillRect(0, 0, W, H);
      x.strokeStyle = "#2f5d46"; x.lineWidth = 18; x.strokeRect(40, 40, W - 80, H - 80);
      x.strokeStyle = "#d9a441"; x.lineWidth = 4; x.strokeRect(78, 78, W - 156, H - 156);
      // hills
      x.fillStyle = "#e9dcc3";
      x.beginPath(); x.moveTo(82, H - 82); x.bezierCurveTo(400, H - 260, 700, H - 140, 900, H - 210); x.bezierCurveTo(1150, H - 290, 1350, H - 160, W - 82, H - 230); x.lineTo(W - 82, H - 82); x.fill();
      x.fillStyle = "#d9a441"; x.beginPath(); x.arc(W - 300, 250, 60, 0, Math.PI * 2); x.fill();
      x.textAlign = "center";
      x.fillStyle = "#c4683f"; x.font = '600 26px "Inter", sans-serif';
      x.fillText("R E B U I L D   A N C H A R O", W / 2, 210);
      x.fillStyle = "#1f2a24"; x.font = '700 76px "Fraunces", Georgia, serif';
      x.fillText("Certificate of Thanks", W / 2, 320);
      x.fillStyle = "#4b5750"; x.font = '400 30px "Inter", sans-serif';
      x.fillText("This certificate is gratefully presented to", W / 2, 420);
      x.fillStyle = "#2f5d46"; x.font = '700 68px "Fraunces", Georgia, serif';
      x.fillText(name.slice(0, 40), W / 2, 520);
      x.fillStyle = "#4b5750"; x.font = '400 30px "Inter", sans-serif';
      x.fillText(`for donating ${fmt(d.amount)} ${A.FUNDRAISER.currency} to rebuild our city, Ancharo.`, W / 2, 600);
      x.fillText("Every road, school and light we build carries your kindness.", W / 2, 648);
      x.font = '500 26px "Inter", sans-serif'; x.fillStyle = "#1f2a24";
      const when = live.fmtDate(d.reviewed_at || d.created_at);
      x.fillText(when, 450, 820); x.fillText("Rebuild Ancharo Committee", W - 450, 820);
      x.strokeStyle = "#1f2a24"; x.lineWidth = 2;
      [[450, 780], [W - 450, 780]].forEach(([cx, y]) => { x.beginPath(); x.moveTo(cx - 190, y); x.lineTo(cx + 190, y); x.stroke(); });
      x.font = '400 22px "Inter", sans-serif'; x.fillStyle = "#4b5750";
      x.fillText("Date", 450, 856); x.fillText("With gratitude", W - 450, 856);
      const a = document.createElement("a");
      a.href = c.toDataURL("image/png");
      a.download = `ancharo-thank-you-${d.id}.png`;
      a.click();
      toast("Certificate downloaded. Share it to inspire others!");
    }

    /* profile */
    forms.profile.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(forms.profile);
      const upd = { full_name: f.get("full_name").trim(), phone: f.get("phone").trim() || null };
      const { error } = await sb.from("profiles").update(upd).eq("id", user.id);
      say($("[data-profile-msg]"), error ? error.message : "Saved ✓", error ? "error" : "ok");
      if (!error) { profile = { ...profile, ...upd }; $("[data-user-name]").textContent = upd.full_name.split(" ")[0]; }
    });
  });
})();
