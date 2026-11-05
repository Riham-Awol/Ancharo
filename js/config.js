/* ==========================================================
   CONNECT THE SITE TO SUPABASE
   (user accounts, receipt uploads, admin panel, live news & gallery)

   Fill in both values from: Supabase dashboard → Project Settings → API
   - Project URL           → supabaseUrl
   - Project API keys: "anon" / "public"  → supabaseAnonKey

   The anon key is MEANT to be public: the database security rules in
   supabase/schema.sql decide what each visitor can see and do.
   NEVER put the "service_role" key here.

   While these are empty, the site works as a normal static website.
   Full step-by-step guide: SETUP.md
   ========================================================== */
window.ANCHARO_CONFIG = {
  supabaseUrl: "https://aglutzsncgjdpvibbwbz.supabase.co",
  supabaseAnonKey: "sb_publishable_UWFMXARQ6cZ7XUwbz9qyCw_TJLVftBp",
};
