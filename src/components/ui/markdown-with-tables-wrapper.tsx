"use client";

import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const REMARK_PLUGINS = [remarkGfm];

export const MarkdownWithTablesWrapper = memo(
  ({ children }: { children: string }) => {
    // memo-ized to prevent re-rendering as parsing markdown is really slow!!
    // the Remark-GFM plugin will convert markdown text tables into proper <table> elements in-line
    // they still need to be styled to look good though - CSS generated using Claude LLM
    return (
      <div
        className="
          markdown block
          [&_table]:w-full [&_table]:border-collapse
          [&_th]:border [&_th]:border-gray-300 [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:font-semibold [&_th]:bg-gray-50
          [&_td]:border [&_td]:border-gray-300 [&_td]:px-3 [&_td]:py-2
          [&_h1]:text-3xl [&_h1]:font-bold [&_h1]:mb-4
          [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mb-3
          [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:mb-2
          [&_p]:mb-3 [&_p]:leading-relaxed
          [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-3
          [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-3
          [&_li]:mb-1
          [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_code]:font-mono
          [&_pre]:bg-gray-100 [&_pre]:p-4 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:mb-3
          [&_pre_code]:bg-transparent [&_pre_code]:p-0
          [&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-gray-600
          [&_a]:text-blue-600 [&_a]:underline [&_a]:hover:text-blue-800
          [&_hr]:border-gray-200 [&_hr]:my-4
        "
      >
        <Markdown remarkPlugins={REMARK_PLUGINS}>{children}</Markdown>
      </div>
    );
  },
);
