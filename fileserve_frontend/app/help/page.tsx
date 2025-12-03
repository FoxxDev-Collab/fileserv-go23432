"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/layout/header";
import { Sidebar } from "@/components/layout/sidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/lib/auth-context";
import {
  BookOpen,
  Rocket,
  Users,
  Shield,
  ChevronRight,
  Clock,
  AlertCircle,
} from "lucide-react";

interface DocCard {
  title: string;
  description: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  badgeVariant?: "default" | "secondary" | "outline";
  readTime?: string;
}

const guides: DocCard[] = [
  {
    title: "Quick Start Guide",
    description: "Get up and running with FileServ in just a few minutes.",
    href: "/docs/quick-start",
    icon: Rocket,
    badge: "Start Here",
    badgeVariant: "default",
    readTime: "5 min",
  },
  {
    title: "User Guide",
    description: "Complete guide to file management, sharing, and storage zones.",
    href: "/docs/user-guide",
    icon: Users,
    readTime: "15 min",
  },
];

const adminGuides: DocCard[] = [
  {
    title: "Administrator Guide",
    description: "System administration: users, storage, permissions, and network shares.",
    href: "/docs/admin-guide",
    icon: Shield,
    badge: "Admin",
    badgeVariant: "secondary",
    readTime: "30 min",
  },
];

function GuideCard({ doc }: { doc: DocCard }) {
  const Icon = doc.icon;
  return (
    <Link href={doc.href}>
      <Card className="h-full hover:bg-accent/50 transition-colors cursor-pointer group">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
              <Icon className="h-5 w-5 text-primary" />
            </div>
            {doc.badge && (
              <Badge variant={doc.badgeVariant || "outline"}>{doc.badge}</Badge>
            )}
          </div>
          <CardTitle className="text-lg mt-3 flex items-center gap-2">
            {doc.title}
            <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
          </CardTitle>
          <CardDescription>{doc.description}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          {doc.readTime && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {doc.readTime} read
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function HelpPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      router.replace("/");
    }
  }, [authLoading, isAuthenticated, router]);

  if (authLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex h-screen">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header title="Help & Documentation" />

        <main className="flex-1 overflow-y-auto p-6">
          <div className="max-w-4xl mx-auto space-y-8">
            {/* Header */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                  <BookOpen className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Help & Documentation</h1>
                  <p className="text-muted-foreground">
                    Guides to help you get the most out of FileServ
                  </p>
                </div>
              </div>
            </div>

            {/* User Guides */}
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Guides</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {guides.map((doc, index) => (
                  <GuideCard key={index} doc={doc} />
                ))}
              </div>
            </section>

            {/* Admin Guides */}
            {isAdmin && (
              <section className="space-y-4">
                <h2 className="text-lg font-semibold">Administration</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  {adminGuides.map((doc, index) => (
                    <GuideCard key={index} doc={doc} />
                  ))}
                </div>
              </section>
            )}

            {/* Quick Troubleshooting */}
            <Card className="bg-muted/30">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  Common Issues
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <p className="font-medium">&quot;No Storage Zones Available&quot;</p>
                  <p className="text-muted-foreground">
                    {isAdmin
                      ? "Create a storage pool and zone in Storage settings."
                      : "Contact your administrator to request access."}
                  </p>
                </div>
                <div>
                  <p className="font-medium">&quot;Upload Failed&quot;</p>
                  <p className="text-muted-foreground">
                    Check file type restrictions, size limits, and your permissions.
                  </p>
                </div>
                <div>
                  <p className="font-medium">&quot;Permission Denied&quot;</p>
                  <p className="text-muted-foreground">
                    You may need additional permissions. Contact your administrator.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Footer */}
            <div className="text-center text-sm text-muted-foreground pt-4">
              <p>FileServ v1.0</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
