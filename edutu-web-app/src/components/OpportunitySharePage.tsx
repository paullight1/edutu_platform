import { Navigate, useLocation, useParams } from "react-router-dom";

/** Old shared links open the full opportunity without generating a share image. */
export default function OpportunitySharePage() {
  const { id } = useParams<{ id: string }>();
  const location = useLocation();

  return (
    <Navigate
      to={id ? {
        pathname: `/opportunity/${encodeURIComponent(id)}`,
        search: location.search,
        hash: location.hash,
      } : "/opportunities"}
      state={location.state}
      replace
    />
  );
}
