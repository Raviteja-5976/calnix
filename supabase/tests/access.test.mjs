// Tests the database access rules against a running local Supabase, using real
// signed-in users over the public API, the way a browser would.
//   npx supabase start
//   node --env-file=.env.local --test supabase/tests/access.test.mjs
import assert from "node:assert/strict";
import { before, test } from "node:test";
import { createClient } from "@supabase/supabase-js";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!URL?.includes("127.0.0.1")) throw new Error("These tests only run against a local Supabase");

const run = Date.now();

async function signUp(name) {
  const client = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await client.auth.signUp({
    email: `${name}-${run}@example.com`,
    password: "correct-horse-battery",
    options: { data: { full_name: name } },
  });
  assert.equal(error, null);
  return { client, id: data.user.id };
}

const ok = ({ data, error }) => {
  assert.equal(error, null, error?.message);
  return data;
};

let owner, teammate, otherTeam, outsider, anon;
let org, teamA, teamB, code;
let teamTask, personalTask;

before(async () => {
  [owner, teammate, otherTeam, outsider] = await Promise.all(
    ["owner", "teammate", "otherteam", "outsider"].map(signUp),
  );
  anon = createClient(URL, KEY, { auth: { persistSession: false } });

  org = ok(await owner.client.rpc("create_organization", { p_name: "Acme", p_team_name: "Alpha" }));
  teamA = ok(await owner.client.from("teams").select("id").eq("org_id", org).single()).id;
  teamB = ok(await owner.client.rpc("create_team", { p_org: org, p_name: "Beta" }));
  code = ok(await owner.client.from("team_invites").select("code").eq("team_id", teamA).single()).code;
  const codeB = ok(await owner.client.from("team_invites").select("code").eq("team_id", teamB).single()).code;

  ok(await teammate.client.rpc("join_team", { p_code: code }));
  ok(await otherTeam.client.rpc("join_team", { p_code: codeB }));

  const base = { team_id: teamA, kind: "task", start_date: "2026-11-02", end_date: "2026-11-05" };
  teamTask = ok(await owner.client.from("items").insert({ ...base, scope: "team", title: "Team work" }).select().single());
  personalTask = ok(await owner.client.from("items").insert({ ...base, scope: "personal", title: "My work" }).select().single());
});

test("a teammate sees both team and personal items", async () => {
  const items = ok(await teammate.client.from("items").select("id").eq("team_id", teamA));
  assert.equal(items.length, 2);
});

test("another team in the same organization sees neither", async () => {
  assert.deepEqual(ok(await otherTeam.client.from("items").select("id").eq("team_id", teamA)), []);
});

test("an outsider and an anonymous visitor see nothing", async () => {
  assert.deepEqual(ok(await outsider.client.from("items").select("id")), []);
  assert.deepEqual(ok(await outsider.client.from("organizations").select("id")), []);
  assert.deepEqual(ok(await outsider.client.from("profiles").select("id").neq("id", outsider.id)), []);
  assert.ok((await anon.from("items").select("id")).error, "anon has no table access");
});

test("a teammate can edit a team item but not someone's personal item", async () => {
  const edited = ok(await teammate.client.from("items").update({ status: "done" }).eq("id", teamTask.id).select());
  assert.equal(edited.length, 1);
  const blocked = ok(await teammate.client.from("items").update({ status: "done" }).eq("id", personalTask.id).select());
  assert.equal(blocked.length, 0);
});

test("a teammate cannot delete a team item they don't own", async () => {
  assert.equal(ok(await teammate.client.from("items").delete().eq("id", teamTask.id).select()).length, 0);
});

test("a teammate cannot take over a team item by making it personal", async () => {
  // Would leave the row owned by someone else and marked personal, so RLS refuses.
  const { error } = await teammate.client.from("items").update({ scope: "personal" }).eq("id", teamTask.id).select();
  assert.ok(error);
});

test("an outsider cannot add to a team, and owner_id cannot be forged", async () => {
  const row = { team_id: teamA, kind: "task", start_date: "2026-11-02", end_date: "2026-11-02", title: "x" };
  assert.ok((await outsider.client.from("items").insert(row)).error);
  assert.ok((await teammate.client.from("items").insert({ ...row, owner_id: owner.id })).error);
});

test("clients cannot write image_key or AI fields", async () => {
  // This is what stops someone pointing an item at another organization's file.
  for (const change of [{ image_key: "orgs/other/secret.png" }, { ai_description: "x" }, { ai_status: "ready" }, { owner_id: teammate.id }, { org_id: org }]) {
    const { error } = await owner.client.from("items").update(change).eq("id", teamTask.id);
    assert.ok(error, `update of ${Object.keys(change)[0]} should be refused`);
  }
  const { error } = await owner.client.from("items").insert({
    team_id: teamA, kind: "tool", url: "https://x.dev", title: "x", image_key: "orgs/other/secret.png",
  });
  assert.ok(error);
});

test("bad data is refused", async () => {
  const base = { team_id: teamA, title: "x" };
  const cases = [
    { ...base, kind: "tool", url: "javascript:alert(1)" },
    { ...base, kind: "task" }, // no date
    { ...base, kind: "prompt" }, // no prompt text
    { ...base, kind: "task", start_date: "2026-11-05", end_date: "2026-11-01" }, // reversed
    { ...base, kind: "task", start_date: "2026-11-05", end_date: "2026-11-05", assignee_id: otherTeam.id }, // not on team
  ];
  for (const row of cases) {
    assert.ok((await owner.client.from("items").insert(row)).error, JSON.stringify(row));
  }
});

test("invite codes stay with the team and admins", async () => {
  assert.deepEqual(ok(await otherTeam.client.from("team_invites").select("code").eq("team_id", teamA)), []);
  assert.ok((await outsider.client.rpc("join_team", { p_code: "wrongcode" })).error);
  assert.ok((await teammate.client.rpc("rotate_team_invite", { p_team: teamA })).error);
});

test("members cannot promote themselves or create teams", async () => {
  assert.ok((await teammate.client.rpc("set_member_role", { p_org: org, p_user: teammate.id, p_role: "admin" })).error);
  assert.ok((await teammate.client.rpc("create_team", { p_org: org, p_name: "Rogue" })).error);
  assert.ok((await teammate.client.from("org_members").update({ role: "owner" }).eq("user_id", teammate.id)).error);
});

test("a team chat reaches its members only", async () => {
  const conversation = ok(await owner.client.from("conversations").select("id").eq("team_id", teamA).single()).id;
  ok(await teammate.client.from("messages").insert({ conversation_id: conversation, body: "hello team" }));

  assert.equal(ok(await owner.client.from("messages").select("id").eq("conversation_id", conversation)).length, 1);
  assert.deepEqual(ok(await otherTeam.client.from("messages").select("id").eq("conversation_id", conversation)), []);
  assert.ok((await otherTeam.client.from("messages").insert({ conversation_id: conversation, body: "let me in" })).error);
  assert.ok((await teammate.client.from("messages").insert({ conversation_id: conversation, body: "x", sender_id: owner.id })).error);
});

test("a direct message stays between two people, and repeats reuse the thread", async () => {
  const dm = ok(await owner.client.rpc("start_dm", { p_org: org, p_user: teammate.id }));
  assert.equal(ok(await teammate.client.rpc("start_dm", { p_org: org, p_user: owner.id })), dm);
  ok(await owner.client.from("messages").insert({ conversation_id: dm, body: "private" }));

  assert.equal(ok(await teammate.client.from("messages").select("id").eq("conversation_id", dm)).length, 1);
  assert.deepEqual(ok(await otherTeam.client.from("messages").select("id").eq("conversation_id", dm)), []);
  assert.ok((await outsider.client.rpc("start_dm", { p_org: org, p_user: owner.id })).error);
});

test("a group includes only the people chosen, all from the organization", async () => {
  const group = ok(await owner.client.rpc("create_group", { p_org: org, p_name: "Launch", p_members: [otherTeam.id] }));
  assert.equal(ok(await otherTeam.client.from("conversations").select("id").eq("id", group)).length, 1);
  assert.deepEqual(ok(await teammate.client.from("conversations").select("id").eq("id", group)), []);
  assert.ok((await owner.client.rpc("create_group", { p_org: org, p_name: "Bad", p_members: [outsider.id] })).error);
});

test("unread counts rise for the recipient and clear on read", async () => {
  const dm = ok(await owner.client.rpc("start_dm", { p_org: org, p_user: teammate.id }));
  ok(await owner.client.from("messages").insert({ conversation_id: dm, body: "ping" }));
  const count = async (who) => ok(await who.client.rpc("conversation_overview", { p_org: org })).find((c) => c.id === dm).unread;
  assert.ok((await count(teammate)) >= 1);
  assert.equal(await count(owner), 0);
  ok(await teammate.client.rpc("mark_conversation_read", { p_conversation: dm }));
  assert.equal(await count(teammate), 0);
});

test("AI runs: only editors can start one, and the hourly limit holds", async () => {
  assert.ok((await teammate.client.rpc("claim_item_ai", { p_item: personalTask.id })).error);
  assert.ok((await outsider.client.rpc("claim_item_ai", { p_item: teamTask.id })).error);
  assert.equal(ok(await owner.client.rpc("claim_item_ai", { p_item: teamTask.id })), "started");
  // Already running, so a second request must not start another paid run.
  assert.equal(ok(await owner.client.rpc("claim_item_ai", { p_item: teamTask.id })), "running");
  assert.equal(ok(await owner.client.rpc("claim_item_ai", { p_item: personalTask.id, p_hourly_limit: 1 })), "limited");
  const row = ok(await owner.client.from("items").select("ai_status, ai_error").eq("id", personalTask.id).single());
  assert.equal(row.ai_status, "failed");
  assert.match(row.ai_error, /hourly/);
});

test("anonymous visitors cannot call actions, and ai_runs is closed", async () => {
  assert.ok((await anon.rpc("create_organization", { p_name: "x", p_team_name: "y" })).error);
  assert.ok((await owner.client.from("ai_runs").select("id")).error);
});

test("someone removed from the organization loses access at once", async () => {
  const dm = ok(await owner.client.rpc("start_dm", { p_org: org, p_user: teammate.id }));
  ok(await owner.client.from("org_members").delete().eq("org_id", org).eq("user_id", teammate.id));
  assert.deepEqual(ok(await teammate.client.from("items").select("id").eq("team_id", teamA)), []);
  assert.deepEqual(ok(await teammate.client.from("messages").select("id").eq("conversation_id", dm)), []);
  assert.deepEqual(ok(await teammate.client.from("organizations").select("id").eq("id", org)), []);
});

test("the image bucket is closed to everyone but the server", async () => {
  const secret = process.env.SUPABASE_SECRET_KEY;
  assert.ok(secret, "Set SUPABASE_SECRET_KEY to the local secret key");
  const server = createClient(URL, secret, { auth: { persistSession: false } }).storage.from("item-images");
  const key = `test/${run}.webp`;
  const body = Buffer.from("RIFF");
  assert.equal((await server.upload(key, body, { contentType: "image/webp" })).error, null);

  // Signed in or not, nobody can read, list, overwrite, add or delete directly.
  for (const client of [owner.client, anon]) {
    const bucket = client.storage.from("item-images");
    assert.ok((await bucket.download(key)).error, "download");
    assert.deepEqual((await bucket.list("test")).data ?? [], [], "list");
    assert.ok((await bucket.upload(`test/${run}-x.webp`, body, { contentType: "image/webp" })).error, "upload");
    assert.ok((await bucket.upload(key, body, { contentType: "image/webp", upsert: true })).error, "overwrite");
    assert.ok((await bucket.createSignedUrl(key, 60)).error, "sign");
    assert.deepEqual((await bucket.remove([key])).data ?? [], [], "remove");
  }
  const publicLink = await fetch(server.getPublicUrl(key).data.publicUrl);
  assert.notEqual(publicLink.status, 200, "public link");

  // The object survived those attempts, and a server-signed link does work.
  const { data } = await server.createSignedUrl(key, 60);
  assert.equal((await fetch(data.signedUrl)).status, 200);
  assert.equal((await server.remove([key])).error, null);
});

test("the owner cannot be removed", async () => {
  ok(await owner.client.rpc("set_member_role", { p_org: org, p_user: otherTeam.id, p_role: "admin" }));
  assert.deepEqual(ok(await otherTeam.client.from("org_members").delete().eq("user_id", owner.id).eq("org_id", org).select()), []);
});
