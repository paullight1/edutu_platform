import { Home, SearchX } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import "./admin-not-found.css";

export default function AdminNotFound() {
  const location = useLocation();

  return (
    <section className="admin-not-found" aria-labelledby="admin-not-found-title">
      <span className="admin-not-found-icon" aria-hidden="true">
        <SearchX size={28} />
      </span>
      <p className="admin-not-found-eyebrow">Edutu Admin</p>
      <h1 id="admin-not-found-title">Admin page not found</h1>
      <p>
        The protected route <code>{location.pathname}</code> does not exist or
        has moved. No admin data was changed.
      </p>
      <Link to="/" className="admin-not-found-action">
        <Home size={17} aria-hidden="true" />
        Return to dashboard
      </Link>
    </section>
  );
}
