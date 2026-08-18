/**
 * Fallback for /dashboard itself (the organisation picker/redirect) — kept
 * intentionally lighter than OrganizationDashboardLoading's full page
 * skeleton, since this route never renders more than a short redirect or a
 * small picker card.
 */
export default function DashboardRootLoading() {
  return (
    <div className="dash-auth-page">
      <div className="dash-skel dash-skel-card" style={{ width: "100%", maxWidth: 480 }} aria-hidden="true" />
    </div>
  );
}
