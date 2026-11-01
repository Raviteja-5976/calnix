import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { supabaseServer } from "@/lib/supabase/server";
import type { Member, Organization, Profile, Role, Team } from "@/lib/types";

export default async function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data: memberships } = await supabase
    .from("org_members")
    .select("role, organizations(id, name)")
    .eq("user_id", auth.user.id)
    .order("joined_at");

  const orgs = (memberships ?? []).map((m) => m.organizations as unknown as Organization);
  if (!orgs.length) redirect("/onboarding");

  const store = await cookies();
  const org = orgs.find((o) => o.id === store.get("calnix-org")?.value) ?? orgs[0];

  const [{ data: teams }, { data: orgMembers }, { data: teamMembers }] = await Promise.all([
    supabase.from("teams").select("id, org_id, name").eq("org_id", org.id).order("name"),
    supabase.from("org_members").select("role, profiles(id, full_name, color)").eq("org_id", org.id),
    supabase.from("team_members").select("team_id, user_id").eq("org_id", org.id),
  ]);

  const members: Member[] = (orgMembers ?? [])
    .map((m) => {
      const profile = m.profiles as unknown as Profile;
      return {
        ...profile,
        role: m.role as Role,
        teamIds: (teamMembers ?? []).filter((t) => t.user_id === profile.id).map((t) => t.team_id),
      };
    })
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  return (
    <WorkspaceShell
      userId={auth.user.id}
      org={org}
      orgs={orgs}
      teams={(teams ?? []) as Team[]}
      members={members}
    >
      {children}
    </WorkspaceShell>
  );
}
