import { createClient } from "@supabase/supabase-js";
import pgModule from "pg";
const { Client: PgClient } = pgModule;
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

  const userIds = users.map((user) => user.id).filter(Boolean);
  if (userIds.length) {
    const restoredUsers = await pg.query("select id from auth.users where id = any($1::uuid[])", [userIds]);
    const restoredIds = new Set(restoredUsers.rows.map((row) => row.id));
    const missingUsers = userIds.filter((id) => !restoredIds.has(id));
    if (missingUsers.length) throw new Error("Database data dump did not restore " + missingUsers.length + " Auth user IDs.");
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
  const expectedBucketIds = buckets.map((bucket) => bucket.id || bucket.name).filter(Boolean);
  const existingBuckets = await pg.query("select id from storage.buckets where id = any($1::text[])", [expectedBucketIds]);
  const existingBucketIds = new Set(existingBuckets.rows.map((row) => row.id));
  for (const bucket of buckets) {
    const bucketId = bucket.id || bucket.name;
    if (!bucketId) continue;
    if (!existingBucketIds.has(bucketId)) {
      const { error: bucketError } = await supabase.storage.createBucket(bucketId, {
        public: !!bucket.public,
        fileSizeLimit: bucket.file_size_limit ?? undefined,
        allowedMimeTypes: bucket.allowed_mime_types ?? undefined
      });
      if (bucketError) throw new Error("Could not restore Storage bucket " + bucketId + ": " + bucketError.message);
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
  const objectCount = await pg.query("select count(*)::int as count from storage.objects");
  console.log(JSON.stringify({
    verifiedAuthUserIds: userIds.length,
    localAuthUsers: userCount.rows[0].count,
    verifiedBuckets: buckets.length,
    localBuckets: bucketCount.rows[0].count,
    restoredStorageObjects: restoredObjects,
    localStorageObjects: objectCount.rows[0].count
  }));
} finally {
  await pg.end();
}
