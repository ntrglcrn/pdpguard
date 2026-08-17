import { AuditPageTooLargeError, AuditTimeoutError } from "@/lib/audit/engine";
import { AuditBusyError } from "@/lib/audit/exclusive";
import { UnsafeUrlError } from "@/lib/url-safety";

export function publicAuditFailure(error: unknown) {
  if (error instanceof AuditBusyError) {
    return { message: error.message, status: 429, known: true };
  }
  if (error instanceof UnsafeUrlError) {
    return { message: error.message, status: 400, known: true };
  }
  if (error instanceof AuditTimeoutError) {
    return {
      message: "The page took too long to audit. Try again later.",
      status: 504,
      known: true,
    };
  }
  if (error instanceof AuditPageTooLargeError) {
    return {
      message: "The page is too large to capture safely.",
      status: 422,
      known: true,
    };
  }
  return {
    message:
      "The page could not be audited. Confirm it is public and try again.",
    status: 502,
    known: false,
  };
}
