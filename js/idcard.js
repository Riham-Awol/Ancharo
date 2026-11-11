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
  // Code 128 (B) barcode of the card number, as crisp SVG. Any ordinary barcode scanner reads it.
  const C128 = ("212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 " +
    "123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 " +
    "111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 " +
    "231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 " +
    "141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 " +
    "124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 " +
    "311141 411131 211412 211214 211232 2331112").split(" ");
  function code128(text) {
    const vals = [104]; // Start B
    for (const ch of String(text)) { const c = ch.charCodeAt(0); vals.push(c >= 32 && c <= 126 ? c - 32 : 0); }
    vals.push(vals.reduce((sum, v, i) => sum + v * (i || 1), 0) % 103, 106); // checksum, stop
    let x = 10, bars = ""; // 10-module quiet zone
    for (const v of vals) [...C128[v]].forEach((w, i) => { if (i % 2 === 0) bars += `M${x},0h${w}v40h-${w}z`; x += +w; });
    return `<svg viewBox="0 0 ${x + 10} 40" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true"><rect width="${x + 10}" height="40" fill="#fff"/><path d="${bars}" fill="#14201a"/></svg>`;
  }
  const verifyUrl = (card) => (card.sample ? `${SITE}/verify?c=sample` : `${SITE}/verify?c=${encodeURIComponent(card.verify_code || "")}`);

  // Ancharo & Surrounding Development Association logo
  const LOGO_IMG = (location.pathname.split("/").length > 2 ? "/" : "") + "images/logo-128.png";
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

  // First / middle / last name (English + Amharic). Older cards only have full_name: split it.
  function nameParts(card) {
    const split = (s) => { const w = String(s || "").trim().split(/\s+/).filter(Boolean); return [w[0] || "", w[1] || "", w.slice(2).join(" ")]; };
    const [f, m, l] = split(card.full_name), [fa, ma, la] = split(card.full_name_am);
    const has = card.first_name || card.middle_name || card.last_name;
    const hasAm = card.first_name_am || card.middle_name_am || card.last_name_am;
    return {
      first: has ? card.first_name || "" : f, middle: has ? card.middle_name || "" : m, last: has ? card.last_name || "" : l,
      first_am: hasAm ? card.first_name_am || "" : fa, middle_am: hasAm ? card.middle_name_am || "" : ma, last_am: hasAm ? card.last_name_am || "" : la,
    };
  }
  // "riham AWOL hassen" → "Riham Awol Hassen" (Amharic is left as it is)
  const titleCase = (s) => String(s || "").toLowerCase().replace(/(^|[\s'’-])(\p{Ll})/gu, (_, a, b) => a + b.toUpperCase());
  const joinName = (...parts) => parts.map((x) => String(x || "").trim()).filter(Boolean).join(" ");

  function front(card) {
    const [roleAm, color] = ROLES[card.role] || ROLES.Member;
    const st = status(card);
    const sex = SEX[card.sex];
    const n = nameParts(card);
    const nameEn = titleCase(joinName(n.first, n.middle, n.last)) || "—";
    const nameAm = joinName(n.first_am, n.middle_am, n.last_am);
    return `<div class="idc idc--front" translate="no" style="--role:${color}" data-status="${st}">
      <div class="idc__bg"></div>
      <header class="idc__head">
        <span class="idc__logo"><img src="${LOGO_IMG}" alt="" /></span>
        <span class="idc__org"><strong>REBUILD ANCHARO</strong><span>አንቻሮን እንገንባ</span></span>
        <span class="idc__title">COMMUNITY MEMBER CARD<span>የአባልነት መታወቂያ</span></span>
      </header>
      <div class="idc__body">
        <div class="idc__photo">${photo(card)}</div>
        <dl class="idc__fields">
          <div class="idc__f idc__f--name"><dt>Full name · ሙሉ ስም</dt><dd><span class="idc__en">${esc(nameEn)}</span>${nameAm ? `<span class="idc__am">${esc(nameAm)}</span>` : ""}</dd></div>
          <div class="idc__f"><dt>Sex · ጾታ</dt><dd>${sex ? `${sex[0]} · ${sex[1]}` : "—"}</dd></div>
          <div class="idc__f"><dt>Date of birth · የትውልድ ቀን</dt><dd>${gc(card.date_of_birth)}</dd></div>
          <div class="idc__f idc__f--wide"><dt>Role · ሚና</dt><dd>${esc(card.role || "Member")} · ${esc(roleAm)}</dd></div>
          <div class="idc__f"><dt>Issued · የተሰጠበት</dt><dd>${gc(card.issued_on)}<small>${ec(card.issued_on)}</small></dd></div>
          <div class="idc__f"><dt>Expires · የሚያበቃበት</dt><dd>${gc(card.expires_on)}<small>${ec(card.expires_on)}</small></dd></div>
        </dl>
        <div class="idc__side">
          <div class="idc__no"><span>CARD NO. · የካርድ ቁጥር</span><b class="idc__mono">${esc(card.card_number || "ANC-··-·····")}</b></div>
          <div class="idc__seal"><span><img src="${LOGO_IMG}" alt="" /></span></div>
          <div class="idc__ghost">${photo(card)}</div>
        </div>
      </div>
      <footer class="idc__foot">
        <span class="idc__role-band">${esc((card.role || "Member").toUpperCase())}</span>
        <span class="idc__barcode" title="${esc(card.card_number || "")}">${card.card_number ? code128(card.card_number) : ""}</span>
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
    sample: true, full_name: "Abebe Kebede Tessema", full_name_am: "አበበ ከበደ ተሰማ", card_number: "ANC-26-00001", role: "Volunteer",
    first_name: "Abebe", middle_name: "Kebede", last_name: "Tessema", first_name_am: "አበበ", middle_name_am: "ከበደ", last_name_am: "ተሰማ",
    sex: "M", date_of_birth: "1996-03-14", city: "Ancharo", subcity: "Kalu", woreda: "Kalu", kebele: "Kebele 01", house_no: "1245", blood_type: "O+",
    emergency_name: "Almaz Kebede", emergency_phone: "+251 91 000 0000", fayda_verified: true,
    issued_on: "2026-11-09", expires_on: "2029-11-08", status: "active",
  };

  window.IDCard = { front, back, verifyUrl, ROLES, SAMPLE, SITE, status, qrSvg, ec, gc, nameParts, joinName, titleCase, code128 };
})();
