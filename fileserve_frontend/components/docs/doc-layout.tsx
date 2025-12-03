"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { MarkdownRenderer } from "@/components/docs/markdown-renderer";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  ChevronLeft,
  ChevronRight,
  List,
  ArrowUp,
  Printer,
  BookOpen,
} from "lucide-react";

interface TocItem {
  id: string;
  text: string;
  level: number;
}

interface DocLayoutProps {
  title: string;
  content: string;
  prevDoc?: { title: string; href: string };
  nextDoc?: { title: string; href: string };
  requireAdmin?: boolean;
}

function extractToc(content: string): TocItem[] {
  const headingRegex = /^(#{1,3})\s+(.+)$/gm;
  const toc: TocItem[] = [];
  let match;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    // Create slug similar to rehype-slug
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-");
    
    toc.push({ id, text, level });
  }

  return toc;
}

export function DocLayout({
  title,
  content,
  prevDoc,
  nextDoc,
  requireAdmin = false,
}: DocLayoutProps) {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [activeSection, setActiveSection] = useState<string>("");
  const [showToc, setShowToc] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);

  const toc = extractToc(content);

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/login");
    } else if (requireAdmin && user?.role !== "admin") {
      router.replace("/docs");
    }
  }, [authLoading, isAuthenticated, user, router, requireAdmin]);

  // Track scroll position for active section and scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setShowScrollTop(scrollY > 400);

      // Find active section
      const sections = toc.map((item) => document.getElementById(item.id));
      const scrollPosition = scrollY + 100;

      for (let i = sections.length - 1; i >= 0; i--) {
        const section = sections[i];
        if (section && section.offsetTop <= scrollPosition) {
          setActiveSection(toc[i].id);
          break;
        }
      }
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, [toc]);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      const offset = 80;
      const elementPosition = element.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - offset;
      window.scrollTo({ top: offsetPosition, behavior: "smooth" });
    }
  };

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated || (requireAdmin && user?.role !== "admin")) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title={title} />

        <div className="flex-1 flex overflow-hidden">
          {/* Main Content */}
          <main className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-6 py-8">
              {/* Breadcrumb */}
              <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
                <Link href="/docs" className="hover:text-foreground transition-colors">
                  Documentation
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span className="text-foreground font-medium">{title}</span>
              </nav>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 mb-6 print:hidden">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowToc(!showToc)}
                  className="lg:hidden"
                >
                  <List className="h-4 w-4 mr-2" />
                  {showToc ? "Hide" : "Show"} Contents
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                >
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
              </div>

              {/* Mobile TOC */}
              {showToc && (
                <div className="lg:hidden mb-6 p-4 bg-muted/50 rounded-lg">
                  <h3 className="font-semibold mb-3 flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Table of Contents
                  </h3>
                  <nav className="space-y-1">
                    {toc.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => scrollToSection(item.id)}
                        className={cn(
                          "block w-full text-left text-sm py-1 hover:text-primary transition-colors",
                          item.level === 1 && "font-medium",
                          item.level === 2 && "pl-4",
                          item.level === 3 && "pl-8 text-muted-foreground",
                          activeSection === item.id && "text-primary font-medium"
                        )}
                      >
                        {item.text}
                      </button>
                    ))}
                  </nav>
                </div>
              )}

              {/* Markdown Content */}
              <article className="prose-container">
                <MarkdownRenderer content={content} />
              </article>

              {/* Navigation */}
              <nav className="flex items-center justify-between mt-12 pt-6 border-t print:hidden">
                {prevDoc ? (
                  <Link href={prevDoc.href}>
                    <Button variant="outline" className="gap-2">
                      <ChevronLeft className="h-4 w-4" />
                      <div className="text-left">
                        <div className="text-xs text-muted-foreground">Previous</div>
                        <div className="font-medium">{prevDoc.title}</div>
                      </div>
                    </Button>
                  </Link>
                ) : (
                  <div />
                )}
                {nextDoc ? (
                  <Link href={nextDoc.href}>
                    <Button variant="outline" className="gap-2">
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">Next</div>
                        <div className="font-medium">{nextDoc.title}</div>
                      </div>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </Link>
                ) : (
                  <div />
                )}
              </nav>

              {/* Footer */}
              <div className="text-center text-sm text-muted-foreground mt-8 pt-6 border-t">
                <p>FileServ Documentation • Last updated December 2024</p>
              </div>
            </div>
          </main>

          {/* Desktop Table of Contents Sidebar */}
          <aside className="hidden lg:block w-64 border-l bg-muted/30 print:hidden">
            <ScrollArea className="h-full">
              <div className="p-4 sticky top-0">
                <h3 className="font-semibold mb-4 flex items-center gap-2 text-sm">
                  <BookOpen className="h-4 w-4" />
                  On This Page
                </h3>
                <nav className="space-y-1">
                  {toc.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => scrollToSection(item.id)}
                      className={cn(
                        "block w-full text-left text-sm py-1.5 px-2 rounded-md hover:bg-muted transition-colors",
                        item.level === 1 && "font-medium",
                        item.level === 2 && "pl-4",
                        item.level === 3 && "pl-6 text-muted-foreground",
                        activeSection === item.id && "bg-primary/10 text-primary font-medium"
                      )}
                    >
                      {item.text}
                    </button>
                  ))}
                </nav>
              </div>
            </ScrollArea>
          </aside>
        </div>

        {/* Scroll to Top Button */}
        {showScrollTop && (
          <Button
            variant="outline"
            size="icon"
            className="fixed bottom-6 right-6 rounded-full shadow-lg z-50 print:hidden"
            onClick={scrollToTop}
          >
            <ArrowUp className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
