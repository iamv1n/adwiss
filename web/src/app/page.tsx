import { redirect } from "next/navigation";

// The landing page lives in the separate `site/` app; the app root goes straight in.
export default function RootPage() {
  redirect("/app/dashboard");
}
