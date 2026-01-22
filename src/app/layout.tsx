import { Provider } from "jotai";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "@/components/ui/sonner";
import { TRPCReactProvider } from "@/trpc/client";

import "./globals.css";

export const metadata: Metadata = {
  title: "Viper VMP",
  description: "Viper VMP by the ARPA-H PATCH Team.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TRPCReactProvider>
            <NuqsAdapter>
              <Provider>
                {children}
                <Toaster />
              </Provider>
            </NuqsAdapter>
          </TRPCReactProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
