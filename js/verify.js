/* ==========================================================
   CARD CHECK PAGE: opened by scanning the QR code on a member card.
   Shows only what is needed to check the card (never phone numbers,
   Fayda numbers, birth dates or emergency contacts).
   ========================================================== */
(() => {
  const A = window.Ancharo, live = window.AncharoLive, T = window.T;
  const box = document.querySelector("[data-verify]");
  const code = (new URLSearchParams(location.search).get("c") || "").trim();
  const { esc } = A;
  const fmt = (d) => (d ? live.fmtDate(d, { day: "numeric", month: "long", year: "numeric" }) : "—");
  const RESULT = {
    valid: ["✓", "Valid member card", "This card is real and currently valid.", "ok"],
    expired: ["!", "Expired card", "This card was real, but it is no longer valid. The holder can ask the campaign team for a new one.", "warn"],
    revoked: ["✕", "Revoked card", "This card has been cancelled and is not valid.", "bad"],
    pending: ["…", "Card not issued yet", "This application has not been approved yet.", "warn"],
    sample: ["i", "This is a sample card", "Sample cards are only examples and do not belong to a real member.", "warn"],
    missing: ["?", "Card not found", "We couldn't find a card for this code. The card may not be genuine. Please contact the campaign team.", "bad"],
  };
  const show = (key, card) => {
    const [icon, title, text, tone] = RESULT[key];
    box.innerHTML = `
      <div class="verify__result verify__result--${tone}">
        <span class="verify__icon" aria-hidden="true">${icon}</span>
        <div><h2>${esc(T(title))}</h2><p>${esc(T(text))}</p></div>
      </div>
      ${card ? `
      <div class="verify__card">
        ${card.photo_url ? `<img class="verify__photo" src="${esc(card.photo_url)}" alt="" />` : ""}
        <dl class="verify__facts" translate="no">
          <div><dt>Name · ስም</dt><dd>${esc(card.full_name)}${card.full_name_am ? `<span>${esc(card.full_name_am)}</span>` : ""}</dd></div>
          <div><dt>Role · ሚና</dt><dd>${esc(card.role)}</dd></div>
          <div><dt>Card No. · የካርድ ቁጥር</dt><dd class="idc__mono">${esc(card.card_number)}</dd></div>
          <div><dt>Valid until · የሚያበቃበት</dt><dd>${fmt(card.expires_on)}</dd></div>
          <div><dt>Fayda · ፋይዳ</dt><dd>${card.fayda_verified ? "✓ Checked by the campaign team · በዘመቻው ቡድን ተረጋግጧል" : "Not checked · አልተረጋገጠም"}</dd></div>
        </dl>
      </div>
      <p class="hint">${esc(T("Make sure the photo matches the person showing the card."))}</p>` : ""}`;
  };

  if (code.toLowerCase() === "sample") return show("sample");
  if (!code) return show("missing");
  if (!live || !live.enabled) {
    box.innerHTML = `<p>${esc(T("Card checking isn't switched on yet."))}</p>`;
    return;
  }
  live.ready.then(async (sb) => {
    const { data, error } = await sb.rpc("verify_card", { code });
    if (error || !data) return show("missing");
    show(data.status, data);
  });
})();
