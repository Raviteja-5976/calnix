import { redirect } from "next/navigation";

/** Docs moved to the full-screen studio; keep old links (and ?doc=) working. */
export default async function ProjectDocsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ doc?: string }>;
}) {
  const { id } = await params;
  const { doc } = await searchParams;
  redirect(`/studio/${id}${doc ? `?doc=${encodeURIComponent(doc)}` : ""}`);
}
