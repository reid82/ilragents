"use client";

import { useState } from "react";
import type { AgentDef } from "@/lib/agents";

const SIZE_CLASSES = {
  sm: "w-10 h-10 text-sm",
  md: "w-12 h-12 sm:w-16 sm:h-16 text-lg sm:text-xl",
  lg: "w-16 h-16 text-xl",
  xl: "w-24 h-24 text-3xl",
} as const;

interface AgentAvatarProps {
  agent: AgentDef;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

export default function AgentAvatar({
  agent,
  size = "sm",
  className = "",
}: AgentAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const sizeClass = SIZE_CLASSES[size];
  const initials = agent.name
    .split(" ")
    .map((w) => w[0])
    .join("");

  if (imgError || !agent.avatarUrl) {
    return (
      <div
        className={`rounded-full flex items-center justify-center text-white font-bold ${sizeClass} ${className}`}
        style={{ backgroundColor: agent.color }}
      >
        {initials}
      </div>
    );
  }

  return (
    <img
      src={agent.avatarUrl}
      alt={agent.name}
      onError={() => setImgError(true)}
      className={`rounded-full object-cover ${sizeClass} ${className}`}
    />
  );
}
