import { Suspense } from "react";
import { ProfileView } from "@/components/ProfileView";

export const metadata = { title: "Profile · DTA-Cal" };

export default function ProfilePage() {
  return (
    <Suspense fallback={<p className="muted page">Loading profile…</p>}>
      <ProfileView />
    </Suspense>
  );
}
