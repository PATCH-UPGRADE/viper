export function generateMemoryMarkdown(
  memories: { id: string; content: string | null }[],
): string {
  if (memories.length === 0) return "## Memories\n\n_No memories saved yet._";
  return `## Memories\n\n${memories.map((m) => `- [${m.id}] ${m.content ?? ""}`).join("\n")}`;
}
