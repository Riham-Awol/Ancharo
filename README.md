# Rebuild Ancharo

A simple website for the campaign to raise money and renew the city of Ancharo.
It is plain HTML, CSS and JavaScript, with no build step, so you can open `index.html` in a browser or host it anywhere (for example GitHub Pages).

## Pages

| File | What it shows |
|------|---------------|
| `index.html`   | Home: hero landscape, fundraising progress, where money goes, featured works, latest news |
| `gallery.html` | Photo gallery with filters (Landscapes / City life / Projects) and a full-screen viewer |
| `news.html`    | News and updates, each with an expandable full story |
| `about.html`   | The city's story, how the campaign works, goals |
| `donate.html`  | Bank accounts with copy buttons, mobile money, international transfer, how to give |

## Before you publish: things to replace

1. **Bank accounts** in `donate.html`. The numbers shown (`1000 0000 0000 0` etc.) are placeholders.
   For each account, change **both** the number on screen **and** the `data-copy="..."` value on its Copy button.
   Check that the bank names, branch and SWIFT code match your real accounts.
2. **Fundraising numbers**: edit the `FUNDRAISER` block at the top of `js/main.js` (raised, goal, donors, currency, last updated).
3. **Contact details**: `info@example.com` and `+251 00 000 0000` appear in the footer and on several pages. Find and replace them across all `.html` files.
4. **News and featured works**: the sample stories are examples. Edit or replace them with real updates.
5. **Photos**: the images in `images/` are illustrated placeholders. Add real photos (e.g. `images/market-day.jpg`) and update the `src="..."` paths.
   The big home banner is set in `css/styles.css` under `.hero` (`url("../images/hero.svg")`).

## Changing the look

All colors are defined at the top of `css/styles.css` under `:root`.

## Publishing on GitHub Pages

In the repository on GitHub: **Settings → Pages → Build and deployment → Deploy from a branch**, select your branch and `/ (root)`, then save.
