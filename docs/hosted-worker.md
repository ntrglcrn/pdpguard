# Hosted worker contract

Run `pnpm worker` as a separate service with `DATABASE_URL`,
`PDP_GUARD_ARTIFACT_BUCKET`, `AWS_REGION`, and a unique `PDP_GUARD_WORKER_ID`.
It deliberately has no Auth0 configuration. The web service has no Chromium
requirement and only reads artifact bytes after workspace authorization.

Use a non-root user, CPU and memory limits, a PID limit, and an ephemeral
filesystem. Give the worker only private object-storage credentials; buckets
must not publish public object URLs.

The application validates public URLs, redirects, DNS results, browser
subrequests, protocols, and credentials before navigation. Deployment must also
deny worker egress to loopback, RFC1918, link-local, metadata, reserved, and
other internal ranges. That network policy is a Private Pilot deployment
control, not an application-code substitute.
