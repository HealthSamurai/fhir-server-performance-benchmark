"use client";

import Link from "next/link";
import { useRouter } from "next/router";
import { Github } from "lucide-react";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/infrastructure", label: "Infrastructure" },
  { href: "/tests", label: "Tests" },
];

export function Header() {
  const router = useRouter();
  const pathname = router.pathname;

  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <nav className="flex items-center space-x-6">
            {NAV_LINKS.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-base font-medium hover:underline ${
                    active
                      ? "text-gray-900"
                      : "text-blue-600 hover:text-blue-700"
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <a
            href="https://github.com/HealthSamurai/fhir-server-performance-benchmark"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-gray-700 transition-colors"
            title="View source on GitHub (new tab)"
          >
            <Github className="w-5 h-5" />
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </header>
  );
}
