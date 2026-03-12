// Root layout: Apollo provider, tooltip provider, Geist fonts, and sidebar Shell wrapper.
import type { Metadata } from "next";
import { Suspense } from "react";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ApolloWrapper } from "@/lib/apollo-wrapper";
import { Shell } from "@/components/layout/shell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NOS Dashboard",
  description: "NOS Developer Platform Dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <ApolloWrapper>
          <TooltipProvider>
            <Suspense>
              <Shell>{children}</Shell>
            </Suspense>
          </TooltipProvider>
        </ApolloWrapper>
      </body>
    </html>
  );
}
