import { createClient } from "@supabase/supabase-js";
import { Client as PgClient } from "pg";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.env.RESTORE_BACKUP_DIR;
const supabaseUrl = process.env.LOCAL_SUPABASE_URL;
const serviceKey = process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY;
const dbUrl = process.env.LOCAL_SUPABASE_DB_URL;
if (!root || !supabaseUrl || !serviceKey || !dbUrl) {
  throw new Error("Restore test environment is incomplete.");
}

const pg = new PgClient({ connectionString: dbUrl });
await pg.connect();
try {
  const authPath = path.join(root, "auth-users-metadata.json");
  let users = [];
  try {
    const metadata = JSON.parse(await readFile(authPath, "utf8"));
    users = Array.isArray(metadata.users) ? metadata.users : [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (users.length) {
    const columnsResult = await pg.query(
      "select column_name from information_schema.columns where table_schema='auth' and table_name='users'"
    );
    const available = new Set(columnsResult.rows.map((row) => row.column_name));
    const candidates = [
      ["id", (u) => u.id],
      ["aud", (u) => u.aud || "authenticated"],
      ["role", (u) => u.role || "authenticated"],
      ["email", (u) => u.email || null],
      ["encrypted_password", () => ""],
      ["email_confirmed_at", (u) => u.email_confirmed_at || null],
      ["phone", (u) => u.phone || null],
      ["phone_confirmed_at", (u) => u.phone_confirmed_at || null],
      ["created_at", (u) => u.created_at || new Date().toISOString()],
      ["updated_at", (u) => u.updated_at || new Date().toISOString()],
      ["raw_app_meta_data", (u) => JSON.stringify(u.app_metadata || {})],
      ["raw_user_meta_data", (u) => JSON.stringify(u.user_metadata || {})],
      ["is_sso_user", () => false],
      ["is_anonymous", () => false]
    ].filter(([name]) => available.has(name));
    if (!available.has("id")) throw new Error("Local Auth schema has no auth.users.id column.");
    const names = candidates.map(([name]) => '"' + name + '"').join(",");
    const placeholders = candidates.map((_, i) => "$" + (i + 1)).join(",");
    await pg.query("begin");
    try {
      await pg.query("set local session_replication_role = replica");
      for (const user of users) {
        const values = candidates.map(([, value]) => value(user));
        await pg.query(
          "insert into auth.users (" + names + ") values (" + placeholders + ") on conflict (id) do nothing",
          values
        );
      }
      await pg.query("commit");
    } catch (error) {
      await pg.query("rollback");
      throw error;
    }
  }

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  const bucketPath = path.join(root, "storage-buckets.json");
  let buckets = [];
  try {
    const parsed = JSON.parse(await readFile(bucketPath, "utf8"));
    buckets = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  let restoredObjects = 0;
  const objectsRoot = path.join(root, "storage-objects");
  for (const bucket of buckets) {
    const bucketId = bucket.id || bucket.name;
    if (!bucketId) continue;
    const { error: bucketError } = await supabase.storage.createBucket(bucketId, {
      public: !!bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? undefined,
      allowedMimeTypes: bucket.allowed_mime_types ?? undefined
    });
    if (bucketError && !/already exists|duplicate/i.test(bucketError.message || "")) {
      throw new Error("Could not restore Storage bucket " + bucketId + ": " + bucketError.message);
    }

    const bucketDir = path.join(objectsRoot, bucket.name || bucketId);
    async function walk(directory, prefix = "") {
      let entries;
      try { entries = await readdir(directory, { withFileTypes: true }); }
      catch (error) { if (error.code === "ENOENT") return; throw error; }
      for (const entry of entries) {
        const full = path.join(directory, entry.name);
        const relative = prefix ? prefix + "/" + entry.name : entry.name;
        if (entry.isDirectory()) {
          await walk(full, relative);
        } else if (entry.isFile()) {
          const bytes = await readFile(full);
          const ext = path.extname(entry.name).toLowerCase();
          const mime = ({
            ".jpg":"image/jpeg",".jpeg":"image/jpeg",".png":"image/png",".webp":"image/webp",
            ".gif":"image/gif",".mp4":"video/mp4",".webm":"video/webm",".pdf":"application/pdf",
            ".txt":"text/plain",".json":"application/json"
          })[ext] || "application/octet-stream";
          const { error } = await supabase.storage.from(bucketId).upload(relative, bytes, {
            contentType: mime, upsert: true
          });
          if (error) throw new Error("Could not restore Storage object " + bucketId + "/" + relative + ": " + error.message);
          restoredObjects++;
        }
      }
    }
    await walk(bucketDir);
  }

  const userCount = await pg.query("select count(*)::int as count from auth.users");
  const bucketCount = await pg.query("select count(*)::int as count from storage.buckets");
  console.log(JSON.stringify({
    restoredAuthUsers: users.length,
    localAuthUsers: userCount.rows[0].count,
    restoredBuckets: buckets.length,
    localBuckets: bucketCount.rows[0].count,
    restoredStorageObjects: restoredObjects
  }));
} finally {
  await pg.end();
}
