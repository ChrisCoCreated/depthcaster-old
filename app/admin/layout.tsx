"use client";

import { useEffect, useState } from "react";
import { useNeynarContext } from "@neynar/react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  BarChart3,
  Users,
  Tag as TagIcon,
  Award,
  Filter,
  Bell,
  Palette,
  Settings,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { AvatarImage } from "@/app/components/AvatarImage";

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  section?: string;
}

const navItems: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, section: "main" },
  { href: "/admin/statistics", label: "Statistics", icon: BarChart3, section: "analytics" },
  { href: "/admin/roles", label: "User Roles", icon: Users, section: "users" },
  { href: "/admin/tags", label: "Cast Tags", icon: TagIcon, section: "content" },
  { href: "/admin/curators-leaderboard", label: "Curators Leaderboard", icon: Award, section: "content" },
  { href: "/admin/quality", label: "Quality Filter", icon: Filter, section: "content" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell, section: "system" },
  { href: "/admin/art-feed", label: "Art Feed", icon: Palette, section: "experimental" },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useNeynarContext();
  const router = useRouter();
  const pathname = usePathname();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const checkAdminAccess = async () => {
      if (!user?.fid) {
        setIsLoading(false);
        return;
      }

      try {
        const response = await fetch(`/api/admin/check?fid=${user.fid}`);
        const data = await response.json();

        if (data.isAdmin) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          router.push("/");
        }
      } catch (error) {
        console.error("Failed to check admin access:", error);
        setIsAdmin(false);
        router.push("/");
      } finally {
        setIsLoading(false);
      }
    };

    checkAdminAccess();
  }, [user, router]);

  if (!user || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (isAdmin === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-black">
        <div className="text-red-600">Access Denied</div>
      </div>
    );
  }

  const getBreadcrumbs = () => {
    if (pathname === "/admin") return [{ label: "Dashboard" }];
    
    const parts = pathname.split("/").filter(Boolean);
    const crumbs = [{ label: "Dashboard", href: "/admin" }];
    
    if (parts.length > 1) {
      const page = navItems.find((item) => item.href === pathname);
      if (page) {
        crumbs.push({ label: page.label });
      }
    }
    
    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <div className="min-h-screen bg-white dark:bg-black flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-0 left-0 h-screen w-64 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 z-50
          transform transition-transform duration-300 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          flex flex-col
        `}
      >
        {/* Sidebar header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              Admin Panel
            </h2>
            <button
              onClick={() => setSidebarOpen(false)}
              className="lg:hidden text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                  ${
                    isActive
                      ? "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                  }
                `}
              >
                <Icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* User info */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800">
            <AvatarImage
              src={user.pfp_url}
              alt={user.username || "User"}
              size={40}
              className="w-10 h-10 rounded-full"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {user.display_name || user.username || `FID: ${user.fid}`}
              </p>
              {user.username && (
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  @{user.username}
                </p>
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Mobile header */}
        <div className="lg:hidden sticky top-0 z-30 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 p-4">
          <button
            onClick={() => setSidebarOpen(true)}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <Menu className="w-6 h-6" />
          </button>
        </div>

        {/* Breadcrumbs */}
        {breadcrumbs.length > 1 && (
          <div className="px-4 lg:px-8 py-3 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-black">
            <nav className="flex items-center gap-2 text-sm overflow-x-auto">
              {breadcrumbs.map((crumb, index) => (
                <div key={index} className="flex items-center gap-2 flex-shrink-0">
                  {index > 0 && (
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  )}
                  {crumb.href ? (
                    <Link
                      href={crumb.href}
                      className="text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span className="text-gray-600 dark:text-gray-400 whitespace-nowrap">
                      {crumb.label}
                    </span>
                  )}
                </div>
              ))}
            </nav>
          </div>
        )}

        {/* Page content */}
        <div className="flex-1 overflow-auto">
          <div className="p-4 lg:p-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
