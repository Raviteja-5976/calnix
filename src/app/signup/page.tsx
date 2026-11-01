import { AuthForm } from "@/components/AuthForm";

export const metadata = { title: "Create your Calnix account" };

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
