"use client";

import { createContext, useContext } from "react";
import type { UseChatAgentConfig } from "../types";

export interface SuggestedQuestion {
  label: string;
  config?: Partial<UseChatAgentConfig>;
}

const SuggestedQuestionsContext = createContext<SuggestedQuestion[]>([]);

export function SuggestedQuestionsProvider({
  questions,
  children,
}: {
  questions: SuggestedQuestion[];
  children: React.ReactNode;
}) {
  return (
    <SuggestedQuestionsContext value={questions}>
      {children}
    </SuggestedQuestionsContext>
  );
}

export function useSuggestedQuestions() {
  return useContext(SuggestedQuestionsContext);
}
