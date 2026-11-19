import { Suspense } from "react";
import { ChatView } from "@/components/ChatView";

export const metadata = { title: "Chat · DTA-Cal" };

export default function ChatPage() {
  return (
    <Suspense fallback={<p className="muted thread-empty">Loading chat…</p>}>
      <ChatView />
    </Suspense>
  );
}
