import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>SEO Automation Platform</h1>
      <p>Phase 1 foundation. Use the internal admin UI to manage organizations, websites and the crawl/audit/opportunities pipeline.</p>
      <p>
        <Link className="btn" href="/admin">
          Open Admin
        </Link>
      </p>
    </main>
  );
}
