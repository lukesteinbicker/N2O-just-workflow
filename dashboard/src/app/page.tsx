// Root page: redirects to /tasks as the default landing page.
import { redirect } from "next/navigation";

export default function RootPage() {
  redirect("/tasks");
}
