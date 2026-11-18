import { Navigate, useParams } from "react-router-dom";
import { uuid } from "./model";
/** P9's confirmation emails currently use /orders/:id and /tickets. */
export function EmailOrderLink() {
  const { orderId } = useParams();
  return (
    <Navigate
      replace
      to={
        uuid(orderId)
          ? `/account/orders/${encodeURIComponent(orderId)}`
          : "/account/orders"
      }
    />
  );
}
export function EmailTicketsLink() {
  return <Navigate replace to="/account/tickets" />;
}
