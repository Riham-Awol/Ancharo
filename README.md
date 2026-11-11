# Rebuild Ancharo

A simple website for the campaign to raise money and renew the city of Ancharo.
It is plain HTML, CSS and JavaScript, with no build step. It's hosted on **Vercel**: every push to GitHub redeploys it automatically.
You can also just open `index.html` in a browser to preview it.

## Pages

| File | What it shows |
|------|---------------|
| `index.html`   | Home: hero landscape, fundraising progress, where money goes, featured works, latest news |
| `gallery.html` | Photo gallery with filters (Landscapes / City life / Projects) and a full-screen viewer |
| `news.html`    | News and updates, each with an expandable full story |
| `about.html`   | The city's story, how the campaign works, goals |
| `donate.html`  | Bank accounts with copy buttons, mobile money, international transfer, how to give, where the money went |
| `community.html` | Get involved: community votes, volunteering with your profession, adopt a project |
| `account.html` | Sign in with phone number, upload receipt screenshots, follow their status, thank-you certificate, change password |
| `admin.html`   | Admin panel: donations, projects & pledges, votes, volunteers, announcements, gallery, spending, settings, users |

## Features

- **Fundraising progress** with animated counters and a countdown to the campaign end date
- **Impact calculator**: visitors type an amount and see what it pays for (desks, textbooks, drainage, street lights)
- **Before / after slider** to show a project's results
- **Supporters wall**: a scrolling thank-you list of donors
- **Share buttons** (WhatsApp, Telegram, Facebook, X, copy link) and a **QR code** on the donate page that can be downloaded for posters
- **Link previews**: a picture and title appear when the link is shared in chats and social media
- **Campaign timeline** on the About page
- **Floating Donate button** on phones, a friendly **404 page**, and a hero banner that always fits the screen (also at 125% / 150% display scaling)
- **Menu bar over the hero**: clear at the top of the page, frosted and slightly see-through once you scroll

## English and Amharic

Every page works in **English and Amharic (አማርኛ)**. The **EN / አማ** button in the menu switches language, and the choice is remembered.
Phones set to Amharic open the site in Amharic automatically.

- All Amharic text is in **`js/i18n-am.js`**: English on the left, Amharic on the right. To improve a translation, edit the right side.
- Please have a native speaker read it before launch.
- Content added in the admin panel (news, projects, votes) can have its own Amharic version in each form.

## Accounts, receipts and the admin panel

These need a free **Supabase** project. Follow **[SETUP.md](SETUP.md)** (about 10 minutes). Until then, the site works as a normal static website.

Once connected:
- People **sign in with their phone number and a password** (just name + phone + password to create an account).
  Their initials appear in a circle at the right end of the menu. A forgotten password is reset by an admin to `123456`,
  and the person must choose a new one when they sign in.
- **Donors** upload a screenshot of their transfer receipt (optionally for a specific project) and see it go from *Waiting for review* to *Approved*.
  Approved donors can download a **thank-you certificate** to share.
- **Let the community decide:** admins ask a question with choices; everyone with an account votes once (and can change their vote until it closes).
  Results appear after voting, and only totals are public.
- **Volunteer without money:** people offer their profession, skills and free time. Admins see the list with phone numbers;
  the public sees how many people of each profession signed up.
- **Adopt a project:** a family, group or diaspora community pledges to fund a whole project or part of it.
  Once an admin confirms, their name shows on the project.
- **Admins** get a panel to:
  - review each receipt, correct the amount, approve or reject it with a note, and export everything to CSV
  - post **announcements** (with photo; *pin* one to show it as a banner on every page)
  - upload **gallery** photos (they're shrunk automatically for fast loading)
  - record **spending**, shown publicly on the donate page under "Where the money went"
  - set the **goal, end date, and money collected offline**
  - add **projects**, confirm **pledges**, start **votes**, follow up with **volunteers**
  - make other people admins, and reset forgotten passwords
- The **progress bar** and **supporters wall** update automatically from approved donations.
  Donors are shown as "Anonymous" unless they tick *Show my name*.

## Community member cards (digital ID)

A printable **Rebuild Ancharo community member card** with photo and QR code. It is a campaign membership card and says
**"Not a government ID"** on it in English and Amharic.

- **Admin → ID cards**: register a person at the campaign desk (photo from file or the laptop/phone camera, name in English
  and Amharic, sex, date of birth, kebele, role, blood type, emergency contact, Fayda number), see a live preview of the
  front and back, then **print**: on an ID-card printer (PVC, 85.6 × 54 mm, one side per page) or on A4 paper (front and back
  side by side with cut lines). Approve online applications, revoke lost cards, see how often each card was printed.
- **Members** apply from **My account** (photo from their phone camera) and, once approved, see their card on their phone
  (tap to turn it over, or show it full screen).
- **QR code** → `/verify?c=…`: anyone who scans it sees whether the card is **valid, expired, revoked or not issued**, with the
  name, photo, role and valid-until date, never phone numbers, Fayda numbers, birth dates or emergency contacts.
  The code is random, so cards can't be guessed.
- **Fayda**: admins can record a person's Fayda number (12 or 16 digits; visible only to admins and the person, never printed)
  and tick *"I checked their Fayda card in person"*, which prints **✓ Fayda verified** on the card. A live "Verify with Fayda"
  sign-in needs the campaign to be approved as a relying party by Ethiopia's National ID Program (they issue a client ID and
  keys, and the check must run on a server). Once you have that access, it can be added on top.
- The card design is in `js/idcard.js` (layout) and `css/styles.css` (look). The phone number and "issued by" name on the back
  are set in **Admin → Settings**. If the site moves to another domain, add `siteUrl: "https://your-domain"` in `js/config.js`
  *before* printing cards, because the QR codes contain the web address.

## Where to edit things

Without Supabase, the numbers are set at the **top of `js/main.js`**. With Supabase connected, use **Admin → Settings** instead:

| What | Setting |
|------|---------|
| Money raised, goal, donor count, last-updated date | `FUNDRAISER` |
| Countdown end date | `FUNDRAISER.deadline` (set to `""` to hide) |
| Names on the supporters wall | `SUPPORTERS`: only list people who agreed, use "Anonymous" otherwise. The current entries are **samples**. |
| Prices used by the impact calculator | `IMPACT`: set these to real local costs |

## Before you publish: things to replace

1. **Bank accounts** in `donate.html`: CBE `1000811094572` and Abay Bank `13396080002` are filled in.
   Still to check: the **account name** ("Rebuild Ancharo Fund") and **branch** ("Ancharo Branch") shown on each card should match
   exactly what the bank shows, and the **telebirr** card is hidden until its number is known (see the comment in `donate.html`).
   When you change a number, change **both** the number on screen **and** the `data-copy="..."` value on its Copy button.
2. **Fundraising numbers**: with Supabase connected, set them in **Admin → Settings**.
3. **Contact details**: asda201819@gmail.com and +251 97 256 7654 (footer and several pages).
4. **News and featured works**: the sample stories are examples. Edit or replace them with real updates.
5. **Photos**: the images in `images/` are illustrated placeholders. Add real photos (e.g. `images/market-day.jpg`) and update the `src="..."` paths.
   The big home banner is `images/hero.jpg` (set in `css/styles.css` under `.hero`). Replace that file to change it.
   The before/after slider on the home page uses `images/road-before.svg` and `images/roadwork.svg`. Use two photos taken from the same spot.
   Keep photos under about 300 KB each (resize to ~1600 px wide) so the site loads fast on mobile data.
6. **Link preview image**: `images/og-image.jpg`, linked in each page's `<head>` as `https://ancharo.vercel.app/images/og-image.jpg`.
   If you move to your own domain, update that address.
7. **Payment methods** in the receipt form (`account.html`, the "Sent with" list) should match the accounts on `donate.html`.

## Changing the look

All colors are defined at the top of `css/styles.css` under `:root`.

## Hosting on Vercel

`vercel.json` turns on clean URLs (`/donate` instead of `/donate.html`), adds basic security headers, and keeps the account and admin pages out of search engines.
CSS and JavaScript links carry a version code (`styles.css?v=…`), so visitors always get the newest version after you push.
`404.html` is shown automatically for pages that don't exist.
In Vercel, the project's **Framework Preset** should be **Other**, with no build command and the output directory left empty (the repository root).

## Credits

Accounts and data use [supabase-js](https://github.com/supabase/supabase-js) (MIT license), bundled in `js/vendor/supabase.js`
and only downloaded once Supabase is configured.
QR codes are generated with [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) by Kazuhiko Arase (MIT license), bundled in `js/vendor/qrcode.js`.
