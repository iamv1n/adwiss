import Link from "next/link";
import { Plug } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ConnectCta({ secondary }: { secondary?: React.ReactNode }) {
  return (
    <>
      <Button asChild>
        <Link href="/app/integrations">
          <Plug aria-hidden="true" /> Connect Meta or Google
        </Link>
      </Button>
      {secondary}
    </>
  );
}
