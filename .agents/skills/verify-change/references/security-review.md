# Conditional security review

Use this checklist only when network, browser, HTTP route, or screenshot storage behavior changed.

- SSRF: preserve initial URL validation, redirect validation, DNS checks, and request interception for browser subrequests.
- Resource exhaustion: preserve bounded timeouts, page/screenshot limits, discovery limits, batch limits, and browser cleanup.
- Path traversal: keep generated screenshot IDs separate from absolute paths and validate fixture/storage paths remain inside their roots.
- Error disclosure: map internal failures to safe public errors; do not return filesystem paths, screenshot bytes, stack traces, or sensitive network details.
