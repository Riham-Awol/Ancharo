# Turning on accounts, receipt uploads and the admin panel

The website works on its own as a normal site. To let people **create accounts with their phone number**, **upload receipt screenshots**, **vote**, **volunteer** and **adopt projects**, and to give you an **admin panel** for all of it, connect it to **Supabase**, a free online database with logins and file storage.

It takes about 10 minutes, and you only do it once.

---

## 1. Create a Supabase project

1. Go to **https://supabase.com** and sign up (signing in with GitHub is easiest).
2. Click **New project**.
   - **Name:** `ancharo`
   - **Database password:** click *Generate* and save it somewhere safe (you'll rarely need it).
   - **Region:** pick the one closest to most of your visitors (for example *Central EU (Frankfurt)*).
3. Click **Create new project** and wait a minute until it's ready.

## 2. Create the database tables

1. In the left menu open **SQL Editor** and click **New query**.
2. Open the file [`supabase/schema.sql`](supabase/schema.sql) from this project, copy **everything**, and paste it in.
3. Click **Run**. You should see *"Success. No rows returned"*.

This creates the tables, the private storage for receipts, and the security rules
(donors can only see their own receipts; only admins can approve donations or post content).

## 3. Turn on simple phone sign-in

People sign in with **phone number + password**, with no email and no SMS codes.
For that, Supabase must not ask for email confirmation:

1. Open **Authentication → Sign In / Providers** (on some accounts: **Authentication → Providers → Email**).
2. Make sure **Email** is enabled, and turn **OFF** "**Confirm email**". Save.
3. In **Authentication → URL Configuration**, set **Site URL** to `https://ancharo.vercel.app`.

> ⚠️ If "Confirm email" stays on, sign-ups fail with **"email rate limit exceeded"** (Supabase tries to email the
> placeholder address). If anyone signed up while it was on, activate them after turning it off by running this in the SQL Editor:
>
> ```sql
> update auth.users set email_confirmed_at = now()
> where email like '%@phone.ancharo.app' and email_confirmed_at is null;
> ```

> Behind the scenes, each phone number gets a private placeholder login address (`251911223344@phone.ancharo.app`).
> Nobody sees it and no emails are ever sent to it.

## 4. Connect the website

1. In Supabase open **Project Settings → API Keys** (on some accounts it's **Project Settings → API**).
2. Copy the **Project URL** (looks like `https://abcdefgh.supabase.co`) and the **anon / public** key
   (a long text starting with `eyJ…`, or a *publishable* key starting with `sb_publishable_…`; either works).
3. Open [`js/config.js`](js/config.js) and paste them in:

   ```js
   window.ANCHARO_CONFIG = {
     supabaseUrl: "https://abcdefgh.supabase.co",
     supabaseAnonKey: "eyJhbGciOi...",
   };
   ```

4. Commit and push. Vercel redeploys automatically, and a **Sign in** link appears in the menu.

> The anon/publishable key is designed to be public. **Never** put the `service_role` or *secret* key in the website.

## 5. Make yourself the admin

1. On your website, click the round person icon at the top right → **Create account**, and sign up with your name, phone number and a password.
2. In Supabase **SQL Editor**, run this with **your** phone number written in international form without `+` or spaces
   (for example `09 11 22 33 44` becomes `251911223344`):

   ```sql
   update public.profiles set role = 'admin' where phone = '251911223344';
   ```

3. Refresh the website: your initials appear in a circle at the top right. Tap it and choose **Admin panel**.
   From the **Users** tab you can make other people admins too.

### Forgotten passwords

There are no reset emails. If someone forgets their password, an admin opens **Admin → Users** and taps **Reset to 123456**.
The person signs in with `123456` and the site immediately asks them to choose a new password.

## 6. Before you announce the site (recommended)

- **Starting numbers:** in **Admin → Settings**, set your goal, end date, and any money already collected before the website
  (cash, events…). The site's progress bar then shows real numbers. The sample numbers in `js/main.js` are only used while Supabase isn't connected.
- **News:** your first announcement in **Admin → Announcements** automatically replaces the sample news on the site.
- **Projects:** add real projects in **Admin → Projects**. They appear on the home page (replacing the sample "featured works")
  and on the **Get involved** page, where people can adopt them.
- **Amharic:** every form in the admin panel has an optional **🇪🇹 Amharic version**. Fill it in and Amharic visitors see that text.

### If you already ran an older version of `schema.sql`

Just run the new file again the same way (SQL Editor → paste everything → Run). It adds the new parts and keeps your data.

---

## How it works (for the curious)

| What | Where it's stored | Who can see it |
|------|-------------------|----------------|
| Accounts, names, phone numbers | Supabase Auth + `profiles` table | The person themselves and admins |
| Votes | `votes` table | Each person sees only their own vote; everyone sees the totals (`proposal_results`) |
| Volunteers | `volunteers` table | The volunteer and admins; everyone sees counts per profession only |
| Project pledges | `project_adoptions` table | The person and admins; confirmed adopter names are public if they chose so |
| Donation submissions | `donations` table | The donor and admins |
| Receipt screenshots | Private `receipts` storage | The donor and admins (temporary links only) |
| Totals, supporters wall | `public_stats` / `public_supporters` functions | Everyone. A donor's name is shown **only** if they ticked "show my name" |
| Announcements, gallery, spending | `announcements`, `gallery_photos`, `expenses` tables + public `media` storage | Everyone (drafts: admins only) |

All the rules live in the database (`supabase/schema.sql`), so they apply no matter how someone tries to access the data.

**Free plan note:** Supabase pauses free projects after a week with no visits at all. Normal website traffic keeps it awake;
if it ever pauses, click **Restore** in the Supabase dashboard.
