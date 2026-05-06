"use client";

import { createContext, useContext } from "react";

export interface SuggestedQuestion {
  label: string;
  onClick?: (q: string) => void;
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
