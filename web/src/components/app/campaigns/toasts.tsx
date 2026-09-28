import Link from "next/link";
import { toast } from "sonner";
import { isApiError } from "@/lib/api";

/**
 * Error toast that shows the API's (provider's) message verbatim. A
 * `reauth_required` error adds a link to reconnect on the Integrations page.
 */
export function errorToast(title: string, e: unknown, suffix?: string) {
  const message = e instanceof Error ? e.message : String(e);
  const reauth = isApiError(e) && e.code === "reauth_required";
  const text = suffix ? `${message} ${suffix}` : message;
  toast.error(title, {
    description: reauth ? (
      <span>
        {text}{" "}
        <Link href="/app/integrations" className="font-medium underline underline-offset-2">
          Reconnect in Integrations
        </Link>
      </span>
    ) : (
      text
    ),
    duration: reauth ? 12000 : 8000,
  });
}
