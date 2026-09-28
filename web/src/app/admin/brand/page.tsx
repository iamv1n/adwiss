import type { Metadata } from "next";
import { BrandKit } from "@/components/admin/brand-kit";

export const metadata: Metadata = { title: "Brand kit" };

export default function Page() {
  return <BrandKit />;
}
