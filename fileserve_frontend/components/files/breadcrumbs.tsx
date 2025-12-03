"use client";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Home, HardDrive } from "lucide-react";

interface FileBreadcrumbsProps {
  path: string;
  onNavigate?: (path: string) => void;
  rootLabel?: string; // Optional custom label for root (e.g., zone name)
}

export function FileBreadcrumbs({ path, onNavigate, rootLabel }: FileBreadcrumbsProps) {
  // Split path and filter out empty strings
  const segments = path.split("/").filter(Boolean);

  // Build breadcrumb items with actual paths for navigation
  const breadcrumbs = [
    { name: rootLabel || "Home", navPath: "/", isRoot: true },
    ...segments.map((segment, index) => ({
      name: segment,
      navPath: "/" + segments.slice(0, index + 1).join("/"),
      isRoot: false,
    })),
  ];

  const handleClick = (navPath: string, e: React.MouseEvent) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate(navPath);
    }
  };

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          const Icon = rootLabel ? HardDrive : Home;

          return (
            <div key={crumb.navPath} className="flex items-center">
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage className="flex items-center gap-2">
                    {crumb.isRoot && <Icon className="h-4 w-4" />}
                    {crumb.name}
                  </BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <a
                      href="#"
                      onClick={(e) => handleClick(crumb.navPath, e)}
                      className="flex items-center gap-2 cursor-pointer"
                    >
                      {crumb.isRoot && <Icon className="h-4 w-4" />}
                      {crumb.name}
                    </a>
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </div>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
