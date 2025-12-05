"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-context";
import {
  Home,
  FolderOpen,
  Users,
  UsersRound,
  Shield,
  Settings,
  LayoutDashboard,
  HardDrive,
  Database,
  Layers,
  Gauge,
  Server,
  Container,
  FolderTree,
  HelpCircle,
  Share2,
  Disc3,
  Camera,
  Bell,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: Home,
      },
      {
        title: "Files",
        href: "/files",
        icon: FolderOpen,
      },
    ],
  },
  {
    title: "Administration",
    items: [
      {
        title: "Admin Panel",
        href: "/admin",
        icon: LayoutDashboard,
        adminOnly: true,
      },
      {
        title: "Users",
        href: "/admin/system-users",
        icon: Users,
        adminOnly: true,
      },
      {
        title: "Groups",
        href: "/admin/groups",
        icon: UsersRound,
        adminOnly: true,
      },
      {
        title: "Permissions",
        href: "/admin/permissions",
        icon: Shield,
        adminOnly: true,
      },
    ],
  },
  {
    title: "Storage",
    items: [
      {
        title: "Overview",
        href: "/admin/storage",
        icon: HardDrive,
        adminOnly: true,
      },
      {
        title: "Pools",
        href: "/admin/storage/pools",
        icon: Container,
        adminOnly: true,
      },
      {
        title: "Zones",
        href: "/admin/storage/zones",
        icon: FolderTree,
        adminOnly: true,
      },
      {
        title: "Services",
        href: "/admin/storage/services",
        icon: Share2,
        adminOnly: true,
      },
      {
        title: "ZFS",
        href: "/admin/storage/zfs",
        icon: Database,
        adminOnly: true,
      },
      {
        title: "Snapshots",
        href: "/admin/storage/snapshots",
        icon: Camera,
        adminOnly: true,
      },
      {
        title: "RAID",
        href: "/admin/storage/raid",
        icon: Disc3,
        adminOnly: true,
      },
      {
        title: "Alerts",
        href: "/admin/storage/alerts",
        icon: Bell,
        adminOnly: true,
      },
      {
        title: "Disks",
        href: "/admin/storage/disks",
        icon: Database,
        adminOnly: true,
      },
      {
        title: "Volumes",
        href: "/admin/storage/volumes",
        icon: Layers,
        adminOnly: true,
      },
      {
        title: "Filesystems",
        href: "/admin/storage/filesystems",
        icon: FolderOpen,
        adminOnly: true,
      },
      {
        title: "Quotas",
        href: "/admin/storage/quotas",
        icon: Gauge,
        adminOnly: true,
      },
      {
        title: "Server",
        href: "/admin/storage/server",
        icon: Server,
        adminOnly: true,
      },
    ],
  },
  {
    items: [
      {
        title: "Settings",
        href: "/settings",
        icon: Settings,
      },
      {
        title: "Help",
        href: "/help",
        icon: HelpCircle,
      },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  return (
    <div className="flex h-full w-64 flex-col border-r bg-card">
      {/* Logo */}
      <div className="p-6">
        <Link href="/dashboard" className="flex items-center space-x-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FolderOpen className="h-5 w-5" />
          </div>
          <span className="text-xl font-bold">FileServ</span>
        </Link>
      </div>

      <Separator />

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-4 space-y-4">
        {navSections.map((section, sectionIndex) => {
          // Filter items based on admin status
          const visibleItems = section.items.filter(
            (item) => !item.adminOnly || isAdmin
          );

          // Skip section if no visible items
          if (visibleItems.length === 0) return null;

          return (
            <div key={sectionIndex}>
              {section.title && (
                <h3 className="px-3 mb-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {section.title}
                </h3>
              )}
              <div className="space-y-1">
                {visibleItems.map((item) => {
                  const Icon = item.icon;
                  // Normalize paths by removing trailing slashes for comparison
                  const normalizedPathname = pathname.replace(/\/$/, "") || "/";
                  const normalizedHref = item.href.replace(/\/$/, "") || "/";
                  const isActive = normalizedPathname === normalizedHref;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        "flex items-center space-x-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* User info */}
      <div className="p-4">
        <Separator className="mb-4" />
        <div className="flex items-center space-x-3 text-sm">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
            {user?.username?.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate font-medium">{user?.username}</p>
            <p className="truncate text-xs text-muted-foreground">
              {user?.role}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
