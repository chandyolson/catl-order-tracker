import { useParams } from "react-router-dom";

export default function OrderDetail() {
  const { id } = useParams();
  return (
    <div>
      <h1 className="text-2xl font-bold text-foreground">Order Detail</h1>
      <p className="text-muted-foreground mt-2">Order {id} — detail view coming soon.</p>
    </div>
  );
}
