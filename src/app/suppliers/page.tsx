
import { redirect } from "next/navigation";

export default function SuppliersPage() {
    redirect('/clients?relationType=supplier');
}
