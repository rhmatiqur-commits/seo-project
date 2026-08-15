import Link from "next/link";
import type { ReactNode } from "react";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <header className="site">
        <Link href="/admin">SEO Platform Admin</Link>
      </header>
      <main>{children}</main>
    </>
  );
}
