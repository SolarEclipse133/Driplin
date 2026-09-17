import { redirect } from "next/navigation";

// The root URL just forwards to the dashboard; the middleware sends
// logged-out visitors to /login instead.
export default function Home() {
  redirect("/dashboard");
}
