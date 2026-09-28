import { redirect } from "next/navigation";

// Unknown routes go to the dashboard; the proxy bounces signed-out visitors to /login.
export default function UnknownRoute() {
  redirect("/app/dashboard");
}
