import { AuthForm } from "@/components/AuthForm";
import { authErrorMessage } from "@/lib/auth-errors";

export const metadata = { title: "Sign in to Calnix" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return <AuthForm mode="login" initialError={authErrorMessage(error)} />;
}
