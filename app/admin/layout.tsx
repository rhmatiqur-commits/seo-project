import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site row" style={{ justifyContent: "space-between" }}>
        <Link href="/admin">SEO Platform Admin</Link>
        <Link href="/admin/automation">Automation</Link>
      </header>
      <main>{children}</main>
    </>
  );
}
