import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Providers } from "@/lib/providers";
import { AuthProvider } from "@/lib/auth-context";
import { Toaster } from "@/components/ui/sonner";
import { UploadQueueWrapper } from "@/components/upload-queue-wrapper";

export const metadata: Metadata = {
  title: "FileServ - Secure File Management",
  description: "A secure, user-friendly file management system built with Next.js and Go",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className="antialiased min-h-screen bg-background"
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <Providers>
            <AuthProvider>
              {children}
              <UploadQueueWrapper />
              <Toaster position="top-right" />
            </AuthProvider>
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
