import { Link } from "react-router-dom";
import { ArrowLeftIcon } from "./icons";

/** The one "← back" style used above page titles. */
export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link className="back-link" to={to}>
      <ArrowLeftIcon size={16} />
      {children}
    </Link>
  );
}
