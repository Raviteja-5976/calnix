// One-off: copies images already stored in Supabase Storage into Cloudflare R2,
// under the same keys, so existing covers and doc images keep working.
//
//   node --env-file=.env.local scripts/copy-storage-to-r2.mjs            # dry run
//   node --env-file=.env.local scripts/copy-storage-to-r2.mjs --apply    # copy
//
// Safe to re-run: objects already in R2 are skipped. Nothing is deleted from
// Supabase; remove the old buckets yourself once everything checks out.
import { createClient } from "@supabase/supabase-js";
import { AwsClient } from "aws4fetch";

const apply = process.argv.includes("--apply");
const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};

const supabase = createClient(env("NEXT_PUBLIC_SUPABASE_URL"), env("SUPABASE_SECRET_KEY"), {
  auth: { persistSession: false },
});
const r2 = new AwsClient({
  accessKeyId: env("R2_ACCESS_KEY_ID"),
  secretAccessKey: env("R2_SECRET_ACCESS_KEY"),
  service: "s3",
  region: "auto",
});
const base = `https://${env("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com/${env("R2_BUCKET")}`;
const url = (bucket, key) => `${base}/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;

async function keys(table, column) {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(column).not(column, "is", null).range(from, from + 999);
    if (error) throw error;
    all.push(...data.map((row) => row[column]));
    if (data.length < 1000) return all;
  }
}

const jobs = [
  ...(await keys("items", "image_key")).map((key) => ({ bucket: "item-images", key })),
  ...(await keys("doc_files", "storage_key")).map((key) => ({ bucket: "doc-files", key })),
];
console.log(`${jobs.length} files referenced by the database${apply ? "" : " (dry run, add --apply to copy)"}`);

let copied = 0;
let skipped = 0;
let failed = 0;
for (const { bucket, key } of jobs) {
  const target = url(bucket, key);
  const head = await r2.fetch(target, { method: "HEAD" });
  if (head.ok) {
    skipped++;
    continue;
  }
  if (!apply) {
    console.log(`would copy ${bucket}/${key}`);
    continue;
  }
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error || !data) {
    failed++;
    console.error(`missing in Supabase: ${bucket}/${key}`);
    continue;
  }
  const body = new Uint8Array(await data.arrayBuffer());
  const put = await r2.fetch(target, {
    method: "PUT",
    body,
    headers: { "Content-Type": data.type || "image/webp", "Cache-Control": "private, max-age=31536000, immutable" },
  });
  if (put.ok) copied++;
  else {
    failed++;
    console.error(`upload failed (${put.status}): ${bucket}/${key}`);
  }
}
console.log(`copied ${copied}, already in R2 ${skipped}, failed ${failed}`);
process.exit(failed ? 1 : 0);
