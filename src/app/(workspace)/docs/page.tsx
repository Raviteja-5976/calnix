import { redirect } from "next/navigation";

/** Docs and whiteboards live inside projects now; old links land on the project list. */
export default function DocsPage() {
  redirect("/projects");
}
