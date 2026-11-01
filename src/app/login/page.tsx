import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Sign in to Calnix" };

export default function LoginPage() {
  return <AuthForm mode="login" />;
}
