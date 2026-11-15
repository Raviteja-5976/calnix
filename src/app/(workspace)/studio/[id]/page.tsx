import { Suspense } from "react";
import { ProjectStudio } from "@/components/docs/ProjectStudio";

export const metadata = { title: "Docs & boards · DTA-Cal" };

/** A project's docs and whiteboards, full screen. */
export default async function StudioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={<p className="muted studio-loading">Loading…</p>}>
      <ProjectStudio projectId={id} />
    </Suspense>
  );
}
