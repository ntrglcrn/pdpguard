#!/bin/sh
set -eu

cd "$(dirname "$0")/../../../.."

pnpm lint
pnpm typecheck
pnpm test
pnpm benchmark
pnpm build
