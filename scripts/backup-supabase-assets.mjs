import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const root = process.env.BACKUP_DIR;
if (!url || !key || !root) throw new Error("SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and BACKUP_DIR are required");

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
await mkdir(root, { recursive: true, mode: 0o700 });

const { data: buckets, error: bucketError } = await supabase.storage.listBuckets();
if (bucketError) throw bucketError;
await writeFile(path.join(root, "storage-buckets.json"), JSON.stringify(buckets, null, 2), { mode: 0o600 });

const authUsers = [];
for (let page = 1; ; page += 1) {
  const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
  if (error) throw error;
  const users = data.users ?? [];
  authUsers.push(...users.map((u) => ({
    id: u.id, aud: u.aud, role: u.role, email: u.email,
    email_confirmed_at: u.email_confirmed_at, phone: u.phone,
    phone_confirmed_at: u.phone_confirmed_at, created_at: u.created_at,
    updated_at: u.updated_at, last_sign_in_at: u.last_sign_in_at,
    app_metadata: u.app_metadata, user_metadata: u.user_metadata,
    identities: (u.identities ?? []).map((i) => ({
      id: i.id, user_id: i.user_id, identity_id: i.identity_id,
      provider: i.provider, identity_data: i.identity_data,
      last_sign_in_at: i.last_sign_in_at, created_at: i.created_at, updated_at: i.updated_at
    }))
  })));
  if (users.length < 1000) break;
}
await writeFile(path.join(root, "auth-users-metadata.json"), JSON.stringify({
  exported_at: new Date().toISOString(),
  note: "User metadata only. Password hashes, active sessions, refresh tokens and MFA secrets are not included; users may need password reset/re-invitation on restore.",
  users: authUsers
}, null, 2), { mode: 0o600 });

async function walk(bucket, prefix = "") {
  const collected = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: 1000, offset, sortBy: { column: "name", order: "asc" }
    });
    if (error) throw new Error(`Storage list failed for ${bucket}/${prefix}: ${error.message}`);
    collected.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  for (const item of collected) {
    const name = item.name;
    if (!name || name === "." || name === ".." || name.includes("/") || name.includes("\\") ) {
      throw new Error("Unexpected storage entry name; aborting to avoid unsafe paths");
    }
    const relative = prefix ? `${prefix}/${name}` : name;
    if (item.id == null && item.metadata == null) {
      await walk(bucket, relative);
      continue;
    }
    const { data: blob, error } = await supabase.storage.from(bucket).download(relative);
    if (error || !blob) throw new Error(`Storage download failed for ${bucket}/${relative}: ${error?.message ?? "no data"}`);
    const target = path.join(root, "storage-objects", bucket, ...relative.split("/"));
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, Buffer.from(await blob.arrayBuffer()), { mode: 0o600 });
  }
}

for (const bucket of buckets ?? []) await walk(bucket.name);
await writeFile(path.join(root, "assets-backup-manifest.json"), JSON.stringify({
  exported_at: new Date().toISOString(),
  bucket_count: buckets?.length ?? 0,
  auth_user_count: authUsers.length,
  storage_note: "All bucket objects returned by the Storage API were downloaded recursively."
}, null, 2), { mode: 0o600 });
console.log(`Exported metadata for ${authUsers.length} Auth users and ${buckets?.length ?? 0} Storage buckets.`);
