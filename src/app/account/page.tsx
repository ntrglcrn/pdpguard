import { auth } from "../../../auth";
import { logoutAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import {
  getAppContext,
  getPrincipal,
  getWorkspaceService,
} from "@/lib/app-service";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const [{ workspace }, principal, session] = await Promise.all([
    getAppContext("/account"),
    getPrincipal("/account"),
    auth(),
  ]);
  const membership = await (await getWorkspaceService()).getWorkspaceMembership(
    principal,
    workspace.id,
  );
  return (
    <div className="max-w-xl space-y-6">
      <div>
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Account
        </p>
        <h1 className="mt-2 font-heading text-3xl font-semibold">
          Your access
        </h1>
      </div>
      <dl className="rounded-xl border border-border bg-card p-6 text-sm">
        <div>
          <dt className="text-muted-foreground">Email</dt>
          <dd className="mt-1 font-medium">
            {session?.user?.email || principal.userId}
          </dd>
        </div>
        <div className="mt-5">
          <dt className="text-muted-foreground">Workspace</dt>
          <dd className="mt-1 font-medium">{workspace.name}</dd>
        </div>
        <div className="mt-5">
          <dt className="text-muted-foreground">Role</dt>
          <dd className="mt-1 font-medium">{membership.role}</dd>
        </div>
      </dl>
      <form action={logoutAction}>
        <Button type="submit" variant="outline">
          Log out
        </Button>
      </form>
    </div>
  );
}
