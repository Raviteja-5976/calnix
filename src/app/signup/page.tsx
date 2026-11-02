import { AuthForm } from "@/components/AuthForm";
import { authErrorMessage } from "@/lib/auth-errors";

export const metadata = { title: "Create your Calnix account" };

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <AuthForm mode="signup" initialError={authErrorMessage(error)} />;
}
