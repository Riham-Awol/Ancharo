/* ==========================================================
   ANCHARO COMMUNITY MEMBER CARD
   Draws the front and back of a member card (always English + Amharic).
   Used by the admin panel (preview + printing), the member's account,
   the sample on the Get involved page.
   This is a campaign membership card, NOT a government ID.
   ========================================================== */
(() => {
  const SITE = ((window.ANCHARO_CONFIG && window.ANCHARO_CONFIG.siteUrl) || "https://ancharo.vercel.app").replace(/\/$/, "");

  const ROLES = {
    Member: ["አባል", "#2f5d46"],
    Volunteer: ["በጎ ፈቃደኛ", "#b07a17"],
    Donor: ["ለጋሽ", "#2a6fb0"],
    "Committee member": ["የኮሚቴ አባል", "#b4532a"],
    Elder: ["የሀገር ሽማግሌ", "#6b4fa0"],
    Youth: ["ወጣት", "#1f8a85"],
    "Diaspora member": ["በውጭ ያለ አባል", "#8a3d6b"],
  };
  const SEX = { M: ["M", "ወ"], F: ["F", "ሴ"] };

  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const day = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00") : null);
  const gc = (d) => (d ? day(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase() : "—");
  // Ethiopian calendar date, e.g. "ጥቅም 30 2019"
  const ec = (d) => {
    if (!d) return "";
    try { return new Intl.DateTimeFormat("am-ET-u-ca-ethiopic", { day: "numeric", month: "short", year: "numeric" }).format(day(d)).replace(/\s*ዓ\/ም$/, ""); }
    catch { return ""; }
  };

  // QR code as crisp SVG (uses js/vendor/qrcode.js)
  function qrSvg(text) {
    if (!window.qrcode) return "";
    const qr = qrcode(0, "M");
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount();
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c},${r}h1v1h-1z`;
    return `<svg viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges" aria-hidden="true"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/><path d="${d}" fill="#14201a"/></svg>`;
  }
  const verifyUrl = (card) => (card.sample ? `${SITE}/verify?c=sample` : `${SITE}/verify?c=${encodeURIComponent(card.verify_code || "")}`);

  const LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="15" cy="8" r="3.2" fill="#d9a441"/><path d="M1 20 L8 11 L12 15 L16 12 L23 20 Z" fill="#fff"/></svg>';
  const photo = (card) =>
    card.photo_url
      ? `<img src="${esc(card.photo_url)}" alt="" />`
      : `<svg viewBox="0 0 30 40" aria-hidden="true"><rect width="30" height="40" fill="#dfe8e2"/><circle cx="15" cy="15" r="7" fill="#9fb3a7"/><path d="M3 40c1-9 6-13 12-13s11 4 12 13z" fill="#9fb3a7"/></svg>`;

  function status(card) {
    if (card.sample) return "sample";
    if (card.status === "revoked") return "revoked";
    if (card.status === "pending") return "pending";
    if (card.expires_on && day(card.expires_on) < new Date(new Date().toDateString())) return "expired";
    return "active";
  }
  const STAMP = { sample: "SAMPLE · ናሙና", pending: "NOT YET ISSUED · ገና ያልተሰጠ", revoked: "REVOKED · ተሰርዟል", expired: "EXPIRED · ጊዜው ያለፈበት" };

  function front(card) {
    const [roleAm, color] = ROLES[card.role] || ROLES.Member;
    const st = status(card);
    const sex = SEX[card.sex];
    return `<div class="idc idc--front" translate="no" style="--role:${color}" data-status="${st}">
      <div class="idc__bg"></div>
      <header class="idc__head">
        <span class="idc__logo">${LOGO}</span>
        <span class="idc__org"><strong>REBUILD ANCHARO</strong><span>አንቻሮን እንገንባ</span></span>
        <span class="idc__title">COMMUNITY MEMBER CARD<span>የአባልነት መታወቂያ</span></span>
      </header>
      <div class="idc__body">
        <div class="idc__photo">${photo(card)}</div>
        <dl class="idc__fields">
          <div class="idc__f idc__f--name"><dt>Full name · ሙሉ ስም</dt><dd>${esc((card.full_name || "—").toUpperCase())}${card.full_name_am ? `<span class="idc__am">${esc(card.full_name_am)}</span>` : ""}</dd></div>
          <div class="idc__f"><dt>Card No. · የካርድ ቁጥር</dt><dd class="idc__mono">${esc(card.card_number || "ANC-··-·····")}</dd></div>
          <div class="idc__f"><dt>Role · ሚና</dt><dd>${esc(card.role || "Member")} · ${esc(roleAm)}</dd></div>
          <div class="idc__f"><dt>Sex · ጾታ</dt><dd>${sex ? `${sex[0]} · ${sex[1]}` : "—"}</dd></div>
          <div class="idc__f"><dt>Date of birth · የትውልድ ቀን</dt><dd>${gc(card.date_of_birth)}</dd></div>
          <div class="idc__f"><dt>Issued · የተሰጠበት</dt><dd>${gc(card.issued_on)}<small>${ec(card.issued_on)}</small></dd></div>
          <div class="idc__f"><dt>Expires · የሚያበቃበት</dt><dd>${gc(card.expires_on)}<small>${ec(card.expires_on)}</small></dd></div>
        </dl>
        <div class="idc__side">
          <div class="idc__seal"><span>${LOGO}</span></div>
          <div class="idc__ghost">${photo(card)}</div>
          <div class="idc__qr idc__qr--small">${qrSvg(verifyUrl(card))}</div>
        </div>
      </div>
      <footer class="idc__foot">
        <span class="idc__role-band">${esc((card.role || "Member").toUpperCase())}</span>
        <span class="idc__foot-url">${esc(SITE.replace(/^https?:\/\//, ""))}</span>
      </footer>
      ${STAMP[st] ? `<div class="idc__stamp idc__stamp--${st}">${STAMP[st]}</div>` : ""}
    </div>`;
  }

  function back(card, opts = {}) {
    const st = status(card);
    const phone = opts.phone || "";
    const issuer = opts.issuer || "Rebuild Ancharo Committee";
    return `<div class="idc idc--back" translate="no" data-status="${st}" style="--role:${(ROLES[card.role] || ROLES.Member)[1]}">
      <div class="idc__bg"></div>
      <div class="idc__back">
        <div class="idc__qr idc__qr--big">${qrSvg(verifyUrl(card))}<span>SCAN TO VERIFY<br>ለማረጋገጥ ይቃኙ</span></div>
        <div class="idc__info">
          <p><strong>This card shows that the holder is a registered member of the Rebuild Ancharo community campaign.</strong></p>
          <p class="idc__am-p">ይህ ካርድ ያዡ የአንቻሮን እንገንባ የማህበረሰብ ዘመቻ የተመዘገበ አባል መሆኑን ያሳያል።</p>
          <dl class="idc__address">
            <div><dt>City<br>ከተማ</dt><dd>${esc(card.city || "—")}</dd></div>
            <div><dt>Sub-city<br>ክፍለ ከተማ</dt><dd>${esc(card.subcity || "—")}</dd></div>
            <div><dt>Woreda<br>ወረዳ</dt><dd>${esc(card.woreda || "—")}</dd></div>
            <div><dt>Kebele<br>ቀበሌ</dt><dd>${esc(card.kebele || "—")}</dd></div>
            <div><dt>House No.<br>የቤት ቁጥር</dt><dd>${esc(card.house_no || "—")}</dd></div>
          </dl>
          <dl class="idc__extra">
            <div><dt>Blood type · የደም ዓይነት</dt><dd>${esc(card.blood_type || "—")}</dd></div>
            <div><dt>Emergency contact · የአደጋ ጊዜ ተጠሪ</dt><dd>${esc(card.emergency_name || "—")}${card.emergency_phone ? ` · ${esc(card.emergency_phone)}` : ""}</dd></div>
          </dl>
          <p class="idc__found">If found, please return it to the campaign${phone ? ` or call <b>${esc(phone)}</b>` : ""}. · ካገኙት እባክዎ ይመልሱ።</p>
          <p class="idc__issuer">Issued by · የሰጠው: <b>${esc(issuer)}</b></p>
        </div>
      </div>
      <div class="idc__strip">
        <span class="idc__sign">Holder's signature · የያዡ ፊርማ</span>
        <span class="idc__mono">${esc(card.card_number || "")}</span>
        <span class="idc__url">${esc(SITE.replace(/^https?:\/\//, ""))}</span>
      </div>
      ${STAMP[st] ? `<div class="idc__stamp idc__stamp--${st}">${STAMP[st]}</div>` : ""}
    </div>`;
  }

  // A sample card for the Get involved page and empty previews
  const SAMPLE = {
    sample: true, full_name: "Abebe Kebede", full_name_am: "አበበ ከበደ", card_number: "ANC-26-00001", role: "Volunteer",
    sex: "M", date_of_birth: "1996-03-14", city: "Ancharo", subcity: "01", woreda: "02", kebele: "03", house_no: "1245", blood_type: "O+",
    emergency_name: "Almaz Kebede", emergency_phone: "+251 91 000 0000", fayda_verified: true,
    issued_on: "2026-11-09", expires_on: "2029-11-08", status: "active",
  };

  window.IDCard = { front, back, verifyUrl, ROLES, SAMPLE, SITE, status, qrSvg, ec, gc };
})();
