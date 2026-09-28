import type { Metadata } from "next";
import { AlertSettings } from "@/components/app/alerts/alert-settings";

export const metadata: Metadata = { title: "Alerts" };

export default function AlertSettingsPage() {
  return <AlertSettings />;
}
