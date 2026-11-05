# Turning on accounts, receipt uploads and the admin panel

The website works on its own as a normal site. To let donors **create accounts and upload receipt screenshots**, and to give you an **admin panel** (approve donations, post announcements, add gallery photos, record spending), connect it to **Supabase**, a free online database with logins and file storage.

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

## 3. Tell Supabase your website address

Open **Authentication → URL Configuration**:

- **Site URL:** `https://ancharo.vercel.app` (or your own domain later)
- **Redirect URLs:** add `https://ancharo.vercel.app/**`

This makes the "confirm your email" and "reset password" links send people back to your site.

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

1. On your website, click **Sign in → Create account** and sign up with your email.
2. Click the confirmation link in the email Supabase sends you.
3. Back in Supabase **SQL Editor**, run this (with your email):

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'you@example.com');
   ```

4. Refresh the website: an **Admin** link appears in the menu. From the **Users** tab of the admin panel you can make other people admins too.

## 6. Before you announce the site (recommended)

- **Email sending:** Supabase's built-in email only sends a few emails per hour, which is fine for testing but not for launch day.
  Set up free custom email in **Authentication → Emails → SMTP Settings** (e.g. with [Resend](https://resend.com) or [Brevo](https://www.brevo.com)).
- **Starting numbers:** in **Admin → Settings**, set your goal, end date, and any money already collected before the website
  (cash, events…). The site's progress bar then shows real numbers. The sample numbers in `js/main.js` are only used while Supabase isn't connected.
- **News:** your first announcement in **Admin → Announcements** automatically replaces the sample news on the site.

---

## How it works (for the curious)

| What | Where it's stored | Who can see it |
|------|-------------------|----------------|
| Accounts, names, phone numbers | Supabase Auth + `profiles` table | The person themselves and admins |
| Donation submissions | `donations` table | The donor and admins |
| Receipt screenshots | Private `receipts` storage | The donor and admins (temporary links only) |
| Totals, supporters wall | `public_stats` / `public_supporters` functions | Everyone. A donor's name is shown **only** if they ticked "show my name" |
| Announcements, gallery, spending | `announcements`, `gallery_photos`, `expenses` tables + public `media` storage | Everyone (drafts: admins only) |

All the rules live in the database (`supabase/schema.sql`), so they apply no matter how someone tries to access the data.

**Free plan note:** Supabase pauses free projects after a week with no visits at all. Normal website traffic keeps it awake;
if it ever pauses, click **Restore** in the Supabase dashboard.
