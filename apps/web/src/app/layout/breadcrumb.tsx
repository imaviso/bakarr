import { Link, useLocation } from "@tanstack/react-router";

export function Breadcrumb() {
  const location = useLocation();
  const segments = location.pathname.split("/").filter(Boolean);

  return (
    <nav className="hidden md:flex items-center gap-2">
      {location.pathname === "/" && <span className="text-sm font-medium">Dashboard</span>}
      {location.pathname !== "/" &&
        segments.map((segment, index) => {
          const path = `/${segments.slice(0, index + 1).join("/")}`;
          const isLast = index === segments.length - 1;
          const label = segment.charAt(0).toUpperCase() + segment.slice(1);

          return (
            <span key={path} className="flex items-center gap-2">
              {index > 0 && <span className="text-muted-foreground">/</span>}
              {isLast ? (
                <span className="text-sm font-medium">{label}</span>
              ) : (
                <Link
                  to={path}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {label}
                </Link>
              )}
            </span>
          );
        })}
    </nav>
  );
}
