# Hosted security boundary

Status: design requirement for the Gate to SaaS. This document describes the
minimum security properties required before PDP Guard is exposed as a hosted,
multi-tenant service. It does not claim that the hosted architecture exists and
does not select a database, queue, worker platform or object store.

## Current implementation and hosted requirement

The current application is a trusted local MVP. Its controls are useful inputs
to the hosted design, but they are not a hosted security boundary.

| Area              | Implemented today                                                                                                                                                                                                                      | Required in hosted mode                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Browser execution | A fresh Chromium browser, context and page are created by the Next.js web process for each audit and closed in `finally`. A process-local flag allows one audit at a time.                                                             | Browser execution runs outside the public web process in an isolated, bounded worker. Job state and concurrency control cannot depend on process memory.                                 |
| URL safety        | HTTP(S)-only parsing, credential rejection, hostname/DNS validation and private/local/reserved IP blocking run before navigation and through Playwright request interception. Main-frame redirects are revalidated and capped at five. | Preserve all application checks and add infrastructure egress enforcement at connection time so DNS rebinding or a browser bypass cannot reach internal networks.                        |
| Browser network   | Service workers are blocked, WebSockets are closed, downloads are disabled and intercepted HTTP(S) requests are validated.                                                                                                             | A deny-by-default worker network policy permits only validated public HTTP(S) destinations and required control-plane/artifact endpoints.                                                |
| Time and size     | The audit has a 45-second overall timeout, 30-second navigation timeout, 10-second default operation timeout, five-redirect limit, 390 × 844 viewport and 20,000 CSS-pixel screenshot-height limit.                                    | Keep per-job configurable limits and add enforced CPU, memory, request-count, response-byte and encoded-artifact budgets. Values need measurement before production defaults are chosen. |
| Screenshots       | The local MVP route still serves temporary PNG files without authentication. The SaaS foundation separately persists bounded artifact bytes and verifies their complete workspace/run ownership chain before reads.                    | Move the protected artifact contract to durable object storage with enforced retention/deletion. Local filesystem paths and possession of an artifact ID are not authorization.          |
| Audit data        | The SaaS foundation persists workspaces, stores, run state and deterministic results in single-node SQLite. It is not wired to the local audit route or a hosted worker.                                                               | Persist only the tenant-owned run record, deterministic findings, bounded evidence, metadata and artifact references required by the product.                                            |
| Failure handling  | Unsafe URLs, timeout and oversized pages have bounded client errors; other failures return a generic 502 response.                                                                                                                     | Durable job states, idempotent completion, bounded retry/cancellation and sanitized customer errors prevent one attempt from affecting another or exposing infrastructure details.       |
| Tenant boundary   | Hashed, expiring sessions and owner/member checks protect the SaaS service model; scoped worker capabilities cannot update another run. No external identity flow or public SaaS routes exist yet.                                     | Every operation resolves and authorizes the full Workspace → Store → Audit Run → Finding / Screenshot ownership chain.                                                                   |

## Trust boundaries and data flow

The hosted system has four security principals:

1. **Authenticated user and web app.** The web app authenticates the user,
   authorizes the requested workspace/store operation and creates an immutable
   audit run plus job request. It never launches Playwright.
2. **Job system.** The job system stores lifecycle state and delivers each job
   to an authorized worker. Job identifiers are not authorization credentials.
3. **Browser worker.** The worker treats the target page and every response as
   hostile. It receives only the bounded job input, applies the audit policy and
   cannot read another tenant's data.
4. **Artifact storage.** Storage accepts worker output through a scoped service
   identity. Customer reads and deletion flow through an authorization check;
   possession of an artifact ID or storage key is insufficient.

The browser worker receives only:

- an opaque job/audit-run identifier;
- the normalized target URL;
- an immutable policy snapshot containing limits and allowed audit version;
- a deadline and cancellation signal or equivalent bounded lifecycle control;
- scoped capability to write artifacts for that audit run only.

It returns only:

- terminal job status and a bounded failure category;
- normalized/final URL, timing and bounded audit metadata;
- deterministic findings with bounded evidence;
- artifact references, size/type metadata and integrity information needed to
  associate them with the run.

It must not receive user browser credentials, tenant-wide storage access or
general application/database credentials. It must not return arbitrary page
source, cookies, storage state or full network logs.

## Browser worker isolation

Before hosted alpha, these invariants must hold:

- Browser execution is outside the public web process and cannot access its
  memory, filesystem, environment or request credentials.
- Every job gets a fresh browser context and isolated browser state. A job must
  not reuse cookies, cache, service workers, local storage or session storage
  from another job.
- A crash, timeout, cancellation or malicious page terminates that attempt and
  releases its browser/process resources without changing another run.
- Worker concurrency is admitted against explicit capacity; an in-memory global
  flag is not a queue, lock or tenant fairness mechanism.
- Worker service credentials are least-privilege and scoped to job state and
  artifacts needed for the current attempt.
- The worker environment has no route to tenant data stores except the narrow
  job/artifact operations required by its contract.

The isolation mechanism may be a process sandbox, container, microVM or an
equivalent platform control. The required property is containment and cleanup,
not a particular vendor.

## Network safety

### Guarantees that must be preserved

- Only absolute public `http:` and `https:` URLs are accepted.
- Credential-bearing URLs are rejected.
- Local/internal hostnames and explicitly blocked IPv4/IPv6 private, loopback,
  link-local, reserved, multicast and documentation ranges are rejected.
- All DNS answers must be public; a mixed public/private answer is rejected.
- The initial URL, every main-frame redirect and first request to each observed
  subresource origin are checked by the application policy.
- Redirect count remains bounded and an unsafe redirect fails the audit.
- Service workers, WebSockets and downloads remain disabled for the audit.

### Additional hosted invariant

Application validation alone does not fully prevent DNS rebinding because DNS
is resolved again by the browser/network stack and the current safe-host cache
does not pin a validated address to the connection. Hosted workers therefore
need infrastructure-level egress enforcement that evaluates the actual
destination IP at connect time and blocks private/local/reserved networks.

The worker network policy is deny-by-default. It permits validated public
HTTP(S) page traffic plus explicitly required control-plane and artifact
endpoints. Cloud metadata, cluster/service networks, loopback, private tenant
networks and management planes remain unreachable even if URL parsing,
interception, DNS or redirect behavior is bypassed. Supporting customer-private
URLs would require a separate product and trust model; it is not an exception
to this policy.

## Bounded resources

Every audit attempt must have one immutable, configurable policy. Unknown
production values are measured and chosen before launch; absence of a chosen
number does not permit an unlimited value.

| Resource               | Required invariant                                                                                                                                                                                                                                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wall-clock time        | One enforced deadline covers navigation, rule execution, screenshot generation and cleanup. The current 45-second limit is the local baseline, not an unreviewed production promise.                                                                    |
| Redirects              | Main-frame redirects are validated individually and capped. The current cap is five. Unsafe redirects are never retried.                                                                                                                                |
| Browser/page lifecycle | A fresh context is created per attempt and closed on success, error, timeout or cancellation. A forced worker termination must also reclaim the browser process.                                                                                        |
| CPU and memory         | Each attempt has enforceable CPU/memory ceilings and cannot consume another job's allocation. Exact limits remain configurable until measured with representative pages.                                                                                |
| Screenshot             | Viewport, full-page height and encoded byte size are bounded before durable storage. The current viewport is 390 × 844 and current height cap is 20,000 CSS pixels; there is no current encoded-byte cap.                                               |
| Network                | Request count, aggregate response bytes, individual response size and connection concurrency are bounded. Exact values require calibration; blocked requests are counted and the terminal reason is bounded.                                            |
| Output                 | Findings, evidence strings, metadata and logs have count/length limits. Raw HTML and response bodies are not job output.                                                                                                                                |
| Retry                  | Retries are finite and only for classified transient infrastructure failures. Validation failures, attempted SSRF, malformed input and deterministic page limits are not retried. Attempts are idempotent and cannot publish duplicate final artifacts. |
| Cancellation           | Queued work can be cancelled without starting; running work receives cancellation and has a forced termination deadline. Cancellation is terminal and cleanup is mandatory.                                                                             |

## Screenshot and artifact access

The hosted ownership chain is:

```text
Workspace
└── Store
    └── Audit Run
        ├── Finding
        └── Screenshot
```

- A screenshot belongs to exactly one audit run; the run belongs to exactly one
  store and workspace.
- Artifact IDs, UUIDs and storage keys are locators, not secrets and not proof
  of authorization.
- Reads use the authenticated principal and verify the complete ownership chain
  before returning bytes or a short-lived scoped download capability.
- Worker writes are scoped to the current run and cannot choose another
  workspace/store owner.
- Retention is explicit and enforced. Deleting a run or workspace makes its
  artifacts inaccessible and schedules durable deletion; failures remain
  observable until resolved.
- Storage keys never contain local absolute paths or customer-controlled path
  segments. Hosted operation makes no assumption about a shared local
  filesystem.
- Cache/CDN behavior must not turn a private artifact into public content or
  serve it across authorization changes.

## Tenant authorization

Object-level authorization applies after authentication to every operation:

- **Create:** a caller may create a store only in an authorized workspace and
  an audit run only under an authorized store. The server derives ownership
  from the authorized parent; it does not trust a client-supplied workspace ID.
- **Read/list:** workspace membership and the complete parent chain are checked
  for stores, runs, findings and screenshots. Knowledge of any object ID cannot
  bypass this check, and list queries are tenant-scoped at the data-access
  boundary.
- **Worker update:** only the service identity assigned to the job may update
  attempt state or attach findings/artifacts to that run. End users cannot
  submit worker results directly.
- **Delete:** only a role permitted by the workspace policy may delete an
  object. Deletion covers descendants and artifacts without crossing a tenant
  boundary; retries are idempotent.

The minimum hierarchy does not require a complex role matrix. Owner/member or
an equally small policy is sufficient if every object operation enforces the
same tenant boundary.

## Sensitive data boundary

PDP Guard should retain only what is necessary for reproducible reports:

- target and final URL;
- deterministic findings and bounded evidence;
- audit status, timestamps, rule/audit version and bounded technical metadata;
- screenshot references and the minimum artifact metadata;
- store/workspace ownership references and operational job state.

Unless a separately reviewed feature requires it, PDP Guard must not retain:

- cookies or browser credentials;
- authorization headers or URL credentials;
- local storage, session storage or browser profiles;
- complete request/response bodies or full network traffic;
- arbitrary HTML, scripts or page content dumps;
- internal filesystem paths, service credentials or infrastructure details in
  customer-visible results.

Screenshots and even public PDP URLs can contain sensitive business or personal
data. They remain tenant data and follow the same authorization, retention and
deletion policy as audit results. Bounded evidence should quote only the
minimum text needed to explain a deterministic finding.

## Failure model

| Failure                             | Safe behavior                                                                                                                                                                                                |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Browser crash                       | Mark the attempt with a bounded infrastructure failure, terminate remaining processes, publish no partial result as completed and do not affect another run. Retry only within the finite transient policy.  |
| Timeout                             | Stop browser work, clean up resources and return a sanitized timeout category. Do not keep the job running after the caller receives failure.                                                                |
| Blocked navigation / attempted SSRF | Abort before connection where possible; network policy blocks the actual destination as a backstop. Record a security-safe category, do not retry and do not reveal resolved internal addresses or topology. |
| Unexpected redirect                 | Validate before following. An unsafe or excessive redirect terminates the job without fetching the target.                                                                                                   |
| Worker termination                  | A lease/deadline makes the attempt recoverable; stale workers cannot later commit results. Cleanup and any bounded retry are idempotent.                                                                     |
| Storage failure                     | Do not mark the run completed with a missing required artifact. Preserve a bounded failure state and clean up orphaned artifacts where possible.                                                             |
| Malformed or hostile page           | Keep browser containment and resource limits, return only bounded findings/failure information and never expose raw parser/browser errors to the customer.                                                   |
| Cancellation                        | Prevent queued execution or terminate the running attempt, discard unpublished output and reach a terminal cancelled state.                                                                                  |

Customer-facing errors expose a stable category and actionable safe message,
not stack traces, absolute paths, credentials, internal hostnames/IPs, vendor
details or raw browser errors. Operational diagnostics may contain more detail
but remain access-controlled, bounded and scrubbed of secrets and page data.

## Gate to SaaS readiness

### Must exist before hosted alpha

- Authenticated workspace boundary and object-level authorization for the full
  Workspace → Store → Audit Run → Finding / Screenshot hierarchy.
- Browser work outside the web process with per-job isolation, lifecycle
  cleanup, admission control and enforceable resource policy.
- Existing URL/request/redirect checks plus connection-time egress protection
  against private networks and DNS rebinding.
- Durable job lifecycle with deadline, cancellation, idempotent terminal state
  and finite retry semantics.
- Private run-bound artifact storage with authorization, retention/deletion and
  no local-filesystem dependency.
- Bounded persisted data and sanitized customer errors.

### Must exist before paid release

- Production evidence that tenant isolation, SSRF/egress controls, worker
  containment and resource ceilings hold under concurrency and representative
  hostile failures.
- Operational visibility for job attempts, cancellation, retries, artifact
  deletion and policy violations without collecting unrestricted page data.
- Tested retention/deletion behavior, recovery from worker/storage failures and
  a documented incident path for cross-tenant or browser-boundary events.
- Supported environment and capacity limits published for operators and
  reflected in customer-facing behavior.

### Can be deferred

- SSO, enterprise role matrices and custom tenant policies.
- Multi-region execution, customer-selected data residency and bring-your-own
  storage or worker environments.
- Auditing private/internal storefronts or accepting customer browser sessions.
- Per-tenant custom retention, network allowlists or rule execution policies.

Deferred features do not weaken the alpha or paid-release invariants above.

## Verification anchors

The current-state claims above were checked against:

- `src/lib/audit/engine.ts` for browser lifecycle, redirects, interception and
  current time/screenshot limits;
- `src/lib/url-safety.ts` and `tests/url-safety.test.ts` for URL, DNS and IP
  validation;
- `src/lib/screenshot-storage.ts` and `src/app/api/screenshots/[id]/route.ts`
  for local artifact storage and unauthenticated retrieval;
- `src/app/api/audits/route.ts` for request bounds, process-local concurrency
  and sanitized API failures;
- `src/domain/audit.ts` for the current result/data contract.

`tests/workspace-service.test.ts` covers session validation/revocation,
owner/member access, cross-tenant denial, scoped worker updates, durable run
transitions and protected artifact reads. There are still no tests for worker
isolation, infrastructure egress, retry/leases, hosted object storage or an
external identity flow because those capabilities do not yet exist.
