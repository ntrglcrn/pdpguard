"use client";

import { useActionState, useRef } from "react";

import { createStoreAction, type FormActionState } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: FormActionState = {};

export function StoreForm() {
  const [state, action, pending] = useActionState(
    createStoreAction,
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
        <label htmlFor="store-url" className="text-sm font-medium">
          Store URL
        </label>
        <Input
          id="store-url"
          name="url"
          type="url"
          inputMode="url"
          autoComplete="url"
          placeholder="https://store.example"
          defaultValue={state.values?.url}
          density="lg"
          required
          disabled={pending}
          aria-invalid={Boolean(state.fieldErrors?.url)}
          aria-describedby={
            state.fieldErrors?.url ? "store-url-error" : "store-url-help"
          }
        />
        <p
          id={state.fieldErrors?.url ? "store-url-error" : "store-url-help"}
          className={
            state.fieldErrors?.url
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
          role={state.fieldErrors?.url ? "alert" : undefined}
        >
          {state.fieldErrors?.url ??
            "Use the public HTTP or HTTPS origin for this store."}
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="store-name" className="text-sm font-medium">
          Store name{" "}
          <span className="font-normal text-muted-foreground">(optional)</span>
        </label>
        <Input
          id="store-name"
          name="name"
          type="text"
          autoComplete="organization"
          placeholder="Derived from the hostname when left blank"
          defaultValue={state.values?.name}
          maxLength={120}
          disabled={pending}
          aria-invalid={Boolean(state.fieldErrors?.name)}
          aria-describedby={
            state.fieldErrors?.name ? "store-name-error" : undefined
          }
        />
        {state.fieldErrors?.name && (
          <p
            id="store-name-error"
            className="text-sm text-destructive"
            role="alert"
          >
            {state.fieldErrors.name}
          </p>
        )}
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
        {pending ? "Adding store…" : "Add store"}
      </Button>
      {pending && (
        <p className="text-sm text-muted-foreground" role="status">
          Adding the store. Keep this tab open.
        </p>
      )}
    </form>
  );
}
