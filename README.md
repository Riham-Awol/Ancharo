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
| `account.html` | Donors sign in, upload receipt screenshots, follow their status, download a thank-you certificate |
| `admin.html`   | Admin panel: approve donations, post announcements, gallery, spending, settings, users |

## Features

- **Fundraising progress** with animated counters and a countdown to the campaign end date
- **Impact calculator**: visitors type an amount and see what it pays for (desks, textbooks, drainage, street lights)
- **Before / after slider** to show a project's results
- **Supporters wall**: a scrolling thank-you list of donors
- **Share buttons** (WhatsApp, Telegram, Facebook, X, copy link) and a **QR code** on the donate page that can be downloaded for posters
- **Link previews**: a picture and title appear when the link is shared in chats and social media
- **Campaign timeline** on the About page
- **Floating Donate button** on phones, a friendly **404 page**, and a hero banner that always fits the screen (also at 125% / 150% display scaling)

## Accounts, receipts and the admin panel

These need a free **Supabase** project. Follow **[SETUP.md](SETUP.md)** (about 10 minutes). Until then, the site works as a normal static website.

Once connected:
- **Donors** create an account, upload a screenshot of their transfer receipt, and see it go from *Waiting for review* to *Approved*.
  Approved donors can download a **thank-you certificate** to share.
- **Admins** get a panel to:
  - review each receipt, correct the amount, approve or reject it with a note, and export everything to CSV
  - post **announcements** (with photo; *pin* one to show it as a banner on every page)
  - upload **gallery** photos (they're shrunk automatically for fast loading)
  - record **spending**, shown publicly on the donate page under "Where the money went"
  - set the **goal, end date, and money collected offline**
  - make other people admins
- The **progress bar** and **supporters wall** update automatically from approved donations.
  Donors are shown as "Anonymous" unless they tick *Show my name*.

## Where to edit things

Without Supabase, the numbers are set at the **top of `js/main.js`**. With Supabase connected, use **Admin → Settings** instead:

| What | Setting |
|------|---------|
| Money raised, goal, donor count, last-updated date | `FUNDRAISER` |
| Countdown end date | `FUNDRAISER.deadline` (set to `""` to hide) |
| Names on the supporters wall | `SUPPORTERS`: only list people who agreed, use "Anonymous" otherwise. The current entries are **samples**. |
| Prices used by the impact calculator | `IMPACT`: set these to real local costs |

## Before you publish: things to replace

1. **Bank accounts** in `donate.html`. The numbers shown (`1000 0000 0000 0` etc.) are placeholders.
   For each account, change **both** the number on screen **and** the `data-copy="..."` value on its Copy button.
   Check that the bank names, branch and SWIFT code match your real accounts.
2. **Fundraising numbers**: edit the `FUNDRAISER` block at the top of `js/main.js` (raised, goal, donors, currency, last updated).
3. **Contact details**: `info@example.com` and `+251 00 000 0000` appear in the footer and on several pages. Find and replace them across all `.html` files.
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
