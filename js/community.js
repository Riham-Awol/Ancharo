/* ==========================================================
   GET INVOLVED PAGE: community votes, volunteering, adopt a project
   ========================================================== */
(() => {
  const A = window.Ancharo;
  const live = window.AncharoLive;
  const T = window.T;
  const { esc, fmt, toast } = A;
  const $ = (sel, root = document) => root.querySelector(sel);
  const say = (el, text, kind = "") => {
    el.textContent = text;
    el.className = "form-msg" + (kind ? " form-msg--" + kind : "");
  };

  // Sample member card (works with or without Supabase)
  const sample = document.querySelector("[data-sample-card]");
  if (sample && window.IDCard) {
    const c = { ...IDCard.SAMPLE, photo_url: (live && live.pageHref && live.pageHref("index").startsWith("/") ? "/" : "") + "images/sample-member.jpg" };
    sample.querySelector(".idc-flip__inner").innerHTML = IDCard.front(c) + IDCard.back(c, { phone: "+251 97 256 7654" });
    const flip = () => sample.classList.toggle("is-flipped");
    sample.addEventListener("click", flip);
    sample.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), flip()));
  }

  if (!live || !live.enabled) {
    $("[data-proposals]").innerHTML = `<div class="empty">${esc(T("Voting will open here soon."))}</div>`;
    $("[data-projects]").innerHTML = `<div class="empty">${esc(T("Projects will be open for adoption here soon."))}</div>`;
    $("[data-volunteer-offline]").hidden = false;
    return;
  }

  live.ready.then(async (sb) => {
    let session = (await sb.auth.getSession()).data.session;
    const signIn = (anchor) => live.pageHref("account") + "?next=" + encodeURIComponent(live.pageHref("community") + "#" + anchor);
    sb.auth.onAuthStateChange((ev, s) => {
      if (ev === "SIGNED_IN" || ev === "SIGNED_OUT") { session = s; loadProposals(); loadVolunteer(); }
    });
    const fmtDate = (d) => live.fmtDate(d, { day: "numeric", month: "long", year: "numeric" });
    const cur = () => A.FUNDRAISER.currency;

    /* ======================= VOTES ======================= */
    let proposals = [];
    async function loadProposals() {
      const box = $("[data-proposals]");
      const [pr, res, mine] = await Promise.all([
        sb.from("proposals").select("*").order("created_at", { ascending: false }),
        sb.rpc("proposal_results"),
        session ? sb.from("votes").select("proposal_id,choice").eq("user_id", session.user.id) : Promise.resolve({ data: [] }),
      ]);
      if (pr.error) { console.warn(pr.error); return (box.innerHTML = `<div class="empty">${esc(T("Couldn't load right now. Please try again later."))}</div>`); }
      const counts = {};
      (res.data || []).forEach((r) => ((counts[r.proposal_id] ||= {})[r.choice] = Number(r.votes)));
      const my = {};
      (mine.data || []).forEach((v) => (my[v.proposal_id] = v.choice));
      const isOpen = (p) => p.is_open && (!p.closes_at || new Date(p.closes_at) > new Date());
      proposals = (pr.data || []).sort((a, b) => isOpen(b) - isOpen(a));
      if (!proposals.length) return (box.innerHTML = `<div class="empty">${esc(T("No votes right now. New questions for the community will appear here."))}</div>`);

      box.innerHTML = proposals
        .map((p) => {
          const open = isOpen(p);
          const c = counts[p.id] || {};
          const total = Object.values(c).reduce((a, b) => a + b, 0);
          const mineChoice = my[p.id];
          const showResults = !open || mineChoice !== undefined;
          const labels = p.options.map((o, i) => (live.isAm() && p.options_am && p.options_am[i]) || o);
          const max = Math.max(0, ...Object.values(c));
          const opts = labels
            .map((label, i) => {
              const n = c[i] || 0;
              const pct = total ? Math.round((n / total) * 100) : 0;
              const chosen = mineChoice === i;
              const winner = !open && total && n === max;
              return `<button class="vote-opt ${chosen ? "is-mine" : ""} ${winner ? "is-winner" : ""}" type="button" data-choice="${i}" ${open && session ? "" : "disabled"} aria-pressed="${chosen}">
                ${showResults ? `<span class="vote-opt__bar" style="width:${pct}%"></span>` : ""}
                <span class="vote-opt__label">${chosen ? "✓ " : ""}${esc(label)}</span>
                ${showResults ? `<span class="vote-opt__pct">${pct}%</span>` : ""}
              </button>`;
            })
            .join("");
          const when = open
            ? p.closes_at ? esc(T("Voting closes {date}", { date: fmtDate(p.closes_at) })) : esc(T("Voting is open"))
            : esc(T("Voting closed"));
          return `<article class="proposal reveal" data-id="${p.id}">
            ${p.image_url ? `<img class="proposal__img" src="${esc(p.image_url)}" alt="" loading="lazy" />` : ""}
            <div class="proposal__body">
              <div class="card__meta"><span class="tag ${open ? "tag--progress" : ""}">${open ? "Open" : "Closed"}</span><span>${when}</span></div>
              <h3>${esc(live.L(p, "title"))}</h3>
              ${p.description ? live.richText(live.L(p, "description")) : ""}
              <div class="vote-opts">${opts}</div>
              <div class="proposal__foot">
                <span class="muted">${esc(T(total === 1 ? "{n} vote" : "{n} votes", { n: fmt(total) }))}</span>
                ${open && !session ? `<a class="btn btn--green btn--small" href="${signIn("decide")}">${esc(T("Sign in to vote"))}</a>` : ""}
                ${open && session && mineChoice === undefined ? `<span class="muted">${esc(T("Tap your choice to vote. Results appear after you vote."))}</span>` : ""}
                ${open && mineChoice !== undefined ? `<span class="muted">${esc(T("You voted. You can change your vote until it closes."))}</span>` : ""}
              </div>
            </div>
          </article>`;
        })
        .join("");
      A.reveal(box);
    }
    $("[data-proposals]").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-choice]");
      if (!b || b.disabled || !session) return;
      const id = Number(b.closest("[data-id]").dataset.id);
      b.closest(".vote-opts").querySelectorAll("button").forEach((x) => (x.disabled = true));
      const { error } = await sb.from("votes").upsert({ proposal_id: id, user_id: session.user.id, choice: Number(b.dataset.choice) }, { onConflict: "proposal_id,user_id" });
      if (error) toast(error.message);
      else toast(T("Thank you for voting! ✓"));
      loadProposals();
    });

    /* ======================= VOLUNTEER ======================= */
    const vform = document.querySelector('[data-form="volunteer"]');
    const OTHER = "__other";
    const knownProfessions = [...vform.profession.options].map((o) => o.value).filter((v) => v && v !== OTHER);
    vform.profession.addEventListener("change", () => ($("[data-other-profession]").hidden = vform.profession.value !== OTHER));
    let myVolunteer = null;

    async function loadVolunteer() {
      const { data: stats } = await sb.rpc("volunteer_stats");
      const list = stats || [];
      const total = list.reduce((a, r) => a + Number(r.people), 0);
      $("[data-volunteer-stats]").innerHTML = total
        ? `<p><strong>${esc(T(total === 1 ? "{n} person has already signed up:" : "{n} people have already signed up:", { n: fmt(total) }))}</strong></p>
           <div class="chips">${list.map((r) => `<span class="chip"><span>${esc(T(r.profession))}</span> <b>${fmt(r.people)}</b></span>`).join("")}</div>`
        : "";
      $("[data-volunteer-signin]").hidden = !!session;
      vform.hidden = !session;
      if (!session) return;
      const { data } = await sb.from("volunteers").select("*").eq("user_id", session.user.id).maybeSingle();
      myVolunteer = data;
      $("[data-volunteer-title]").textContent = T(data ? "My volunteer details" : "I want to volunteer");
      $("[data-volunteer-submit]").textContent = T(data ? "Save changes" : "Sign me up as a volunteer");
      say($("[data-volunteer-status]"), data ? T("You're signed up as a volunteer. Thank you! 🙏") : "", "ok");
      if (data) {
        const known = knownProfessions.includes(data.profession);
        vform.profession.value = known ? data.profession : OTHER;
        vform.profession_other.value = known ? "" : data.profession;
        $("[data-other-profession]").hidden = known;
        vform.skills.value = data.skills || "";
        if (data.availability) vform.availability.value = data.availability;
        if (data.location) vform.location.value = data.location;
        vform.message.value = data.message || "";
      }
    }
    vform.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(vform);
      const profession = f.get("profession") === OTHER ? f.get("profession_other").trim() : f.get("profession");
      const msg = $("[data-volunteer-msg]");
      if (!profession) return say(msg, T("Please tell us your profession."), "error");
      const row = { profession, skills: f.get("skills").trim() || null, availability: f.get("availability"), location: f.get("location"), message: f.get("message").trim() || null };
      const res = myVolunteer
        ? await sb.from("volunteers").update(row).eq("user_id", session.user.id)
        : await sb.from("volunteers").insert({ ...row, user_id: session.user.id });
      if (res.error) return say(msg, res.error.message, "error");
      say(msg, T(myVolunteer ? "Saved ✓" : "Thank you for volunteering! 🙏 We'll call you when there's work that fits."), "ok");
      loadVolunteer();
    });

    /* ======================= ADOPT A PROJECT ======================= */
    let projects = [];
    async function loadProjects() {
      const grid = $("[data-projects]");
      try { projects = await live.loadProjects(sb); } catch (err) { console.warn(err); grid.innerHTML = `<div class="empty">${esc(T("Couldn't load right now. Please try again later."))}</div>`; return; }
      grid.innerHTML = projects.length
        ? projects.map((p) => live.projectCard(p, { adopt: true })).join("")
        : `<div class="empty">${esc(T("Projects will be open for adoption here soon."))}</div>`;
      A.reveal(grid);
    }

    const modal = $("[data-adopt-modal]");
    const aform = document.querySelector('[data-form="adopt"]');
    const remainingOf = (p) => Math.max(0, Number(p.goal) - Number(p.raised) - Number(p.pledged)) || Number(p.goal);
    const closeModal = () => (modal.hidden = true);
    modal.querySelector("[data-modal-close]").addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => e.target === modal && closeModal());
    document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal());
    aform.querySelectorAll("[name=kind]").forEach((r) => r.addEventListener("change", () => ($("[data-adopt-amount]").hidden = aform.kind.value !== "part")));

    $("[data-projects]").addEventListener("click", async (e) => {
      const b = e.target.closest("[data-adopt]");
      if (!b) return;
      if (!session) {
        toast(T("Please sign in first"));
        location.href = signIn("adopt");
        return;
      }
      const p = projects.find((x) => String(x.id) === b.dataset.adopt);
      aform.reset();
      aform.project_id.value = p.id;
      $("[data-adopt-title]").textContent = live.L(p, "title");
      $("[data-adopt-remaining]").textContent = live.money(remainingOf(p));
      $("[data-adopt-amount]").hidden = true;
      if (live.profile && live.profile.full_name) aform.display_name.value = live.profile.full_name;
      say($("[data-adopt-msg]"), "");
      aform.hidden = false;
      $("[data-adopt-done]").hidden = true;
      modal.hidden = false;
      aform.display_name.focus();
    });

    aform.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(aform);
      const p = projects.find((x) => String(x.id) === f.get("project_id"));
      const pledge = f.get("kind") === "part" ? Number(f.get("amount")) : remainingOf(p);
      const msg = $("[data-adopt-msg]");
      if (!(pledge > 0)) return say(msg, T("Please enter an amount."), "error");
      const { error } = await sb.from("project_adoptions").insert({
        project_id: p.id,
        user_id: session.user.id,
        display_name: f.get("display_name").trim(),
        pledge,
        message: f.get("message").trim() || null,
        show_public: f.get("show_public") === "on",
      });
      if (error) return say(msg, error.message, "error");
      aform.hidden = true;
      $("[data-adopt-done]").hidden = false;
      $("[data-adopt-receipt]").href = live.pageHref("account") + "?project=" + p.id + "#submit";
    });

    loadProposals();
    loadVolunteer();
    loadProjects();
    if (location.hash) setTimeout(() => document.querySelector(location.hash)?.scrollIntoView(), 400);
  });
})();
