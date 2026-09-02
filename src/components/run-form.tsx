"use client";

import { useActionState, useRef } from "react";

import { createRunAction, type FormActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: FormActionState = {};

export function RunForm({
  storeId,
  storeUrl,
}: {
  storeId: string;
  storeUrl: string;
}) {
  const [state, action, pending] = useActionState(
    createRunAction.bind(null, storeId),
    initialState,
  );
  const submitting = useRef(false);

  return (
    <form
      action={action}
      className="space-y-5"
      aria-busy={pending}
      onSubmit={(event) => {
        if (submitting.current) event.preventDefault();
        else submitting.current = true;
      }}
    >
      <div className="space-y-2">
        <label htmlFor="target-url" className="text-sm font-medium">
          Product page URL
        </label>
        <Input
          id="target-url"
          name="targetUrl"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder={`${storeUrl}/products/example`}
          defaultValue={state.values?.targetUrl}
          density="lg"
          required
          disabled={pending}
          aria-invalid={Boolean(state.fieldErrors?.targetUrl)}
          aria-describedby={
            state.fieldErrors?.targetUrl
              ? "target-url-error"
              : "target-url-help"
          }
        />
        <p
          id={
            state.fieldErrors?.targetUrl
              ? "target-url-error"
              : "target-url-help"
          }
          className={
            state.fieldErrors?.targetUrl
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
          role={state.fieldErrors?.targetUrl ? "alert" : undefined}
        >
          {state.fieldErrors?.targetUrl ??
            `The page must use the ${new URL(storeUrl).origin} origin.`}
        </p>
      </div>

      {state.error && (
        <p
          className="rounded-lg bg-[var(--destructive-soft)] p-3 text-sm text-destructive"
          role="alert"
        >
          {state.error}
        </p>
      )}

      <Button type="submit" size="lg" aria-disabled={pending}>
        {pending ? "Running audit…" : "Run audit"}
      </Button>
      {pending && (
        <p className="text-sm text-muted-foreground" role="status">
          Opening the mobile page and collecting evidence. Keep this tab open.
        </p>
      )}
    </form>
  );
}
