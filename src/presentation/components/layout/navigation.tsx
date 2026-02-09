"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/presentation/providers/auth-provider";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/groups", label: "Groups" },
  { href: "/upload", label: "Upload" },
  { href: "/settings", label: "Settings" },
];

export function Navigation() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-background border-t border-gray-200 dark:border-gray-800 sm:relative sm:border-t-0 sm:border-b">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-around sm:justify-start sm:gap-8 h-14">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors",
                pathname === item.href || pathname.startsWith(item.href + "/")
                  ? "text-foreground bg-gray-100 dark:bg-gray-800"
                  : "text-gray-600 dark:text-gray-400 hover:text-foreground hover:bg-gray-50 dark:hover:bg-gray-900"
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
