# সাকছিপাড়া শায়লা আকরাম কেন্দ্রীয় জামে মসজিদ

বাংলা ও মোবাইল-রেসপনসিভ পাবলিক ওয়েবসাইট। Hosting: GitHub Pages via GitHub Actions. Railway is intentionally not used.

## পৃথক ব্যবস্থাপনা লিংক
- Admin Panel: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/admin.html
- Accounts: https://itdaynamic96-hub.github.io/shayla-akram-central-jame-mosque/accounts.html

## Backend
Accounts ও Admin-এর authentication এবং persistent data storage-এর জন্য Supabase ব্যবহার করা হয়েছে। SQL schema: `supabase/schema.sql`; connection config: `supabase-config.js`. Supabase project URL ও anon/public key না বসানো পর্যন্ত login ও database operation চালু হবে না। সেটআপের পূর্ণ নির্দেশিকা: `SUPABASE_SETUP.md`.

**গুরুত্বপূর্ণ:** service_role key কখনো browser code বা GitHub-এ রাখবেন না। Public sign-up বন্ধ রাখুন। প্রথম Super Admin তৈরি ও role assignment Supabase Dashboard থেকে করতে হবে। RLS policy মসজিদ ও ফাউন্ডেশনের হিসাব আলাদা রাখে।

## যাচাইকৃত তথ্যনীতি
নামাজের সময়, কমিটির সদস্য, ফোন নম্বর, আর্থিক পরিমাণ ও প্রকল্পের অগ্রগতি দায়িত্বশীল কর্তৃপক্ষ যাচাই না করা পর্যন্ত চূড়ান্ত তথ্য হিসেবে প্রকাশ করা যাবে না।
