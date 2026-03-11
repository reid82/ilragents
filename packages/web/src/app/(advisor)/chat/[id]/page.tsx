"use client";

import { useParams, useSearchParams } from "next/navigation";
import AdvisorChatPanel from "@/components/AdvisorChatPanel";

export default function ChatPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const prompt = searchParams.get("prompt") || undefined;

  return <AdvisorChatPanel conversationId={id} initialPrompt={prompt} />;
}
