"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useMemo, useState } from "react";

import type { AuditResult, Finding } from "@/domain/audit";
import type { CatalogDiscoveryResult } from "@/domain/catalog";

type ViewState = "initial" | "scanning" | "success" | "error";
type Filter = "all" | "critical" | "warning" | "passed";

const filters: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "critical", label: "Critical" },
  { id: "warning", label: "Warnings" },
  { id: "passed", label: "Passed" },
];

function clientValidation(
  value: string,
  label = "product page",
): string | null {
  if (!value.trim()) return `Enter a ${label} URL.`;
  if (value.length > 2_048) return "The URL is too long.";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "Use an HTTP or HTTPS URL.";
    }
    if (url.username || url.password)
      return "URLs containing credentials are not allowed.";
  } catch {
    return "Enter a valid absolute URL, including https://.";
  }
  return null;
}

function statusLabel(result: AuditResult) {
  if (result.summary.status === "critical") return "Critical issues found";
  if (result.summary.status === "warning") return "Needs attention";
  return "All core checks passed";
}

function FindingCard({ finding }: { finding: Finding }) {
  const tone = finding.status === "passed" ? "passed" : finding.severity;
  const label = finding.status === "passed" ? "Passed" : finding.severity;
  return (
    <article className="finding-card">
      <div className="finding-heading">
        <span className={`status-badge status-${tone}`}>
          <span aria-hidden="true">
            {finding.status === "passed" ? "✓" : "!"}
          </span>
          {label}
        </span>
        <h3>{finding.title}</h3>
      </div>
      <p className="finding-description">{finding.description}</p>
      <div className="finding-grid">
        <div>
          <h4>Evidence</h4>
          <ul>
            {finding.evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>Recommendation</h4>
          <p>{finding.recommendation}</p>
        </div>
      </div>
    </article>
  );
}

export default function AuditWorkspace() {
  const [url, setUrl] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<ViewState>("initial");
  const [result, setResult] = useState<AuditResult | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [sitemapUrl, setSitemapUrl] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogFieldError, setCatalogFieldError] = useState<string | null>(
    null,
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogDiscoveryResult | null>(null);

  const visibleFindings = useMemo(() => {
    if (!result || filter === "all") return result?.findings ?? [];
    if (filter === "passed")
      return result.findings.filter((item) => item.status === "passed");
    return result.findings.filter(
      (item) => item.status === "failed" && item.severity === filter,
    );
  }, [filter, result]);

  async function runAudit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = clientValidation(url.trim());
    setFieldError(validationError);
    if (validationError) return;

    setState("scanning");
    setError(null);
    setResult(null);
    setFilter("all");

    try {
      const response = await fetch("/api/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const payload = (await response.json()) as
        AuditResult | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error ? payload.error : "Audit failed.",
        );
      }
      setResult(payload as AuditResult);
      setState("success");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "The audit could not be completed.",
      );
      setState("error");
    }
  }

  async function discoverPages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validationError = clientValidation(sitemapUrl.trim(), "sitemap");
    setCatalogFieldError(validationError);
    if (validationError) return;

    setCatalogLoading(true);
    setCatalogError(null);
    setCatalog(null);
    try {
      const response = await fetch("/api/catalog/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: sitemapUrl.trim() }),
      });
      const payload = (await response.json()) as
        CatalogDiscoveryResult | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Sitemap discovery failed.",
        );
      }
      setCatalog(payload as CatalogDiscoveryResult);
    } catch (caught) {
      setCatalogError(
        caught instanceof Error
          ? caught.message
          : "The sitemap could not be read.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="PDP Guard home">
          <span className="brand-mark" aria-hidden="true">
            P
          </span>
          <span>PDP Guard</span>
        </a>
        <span className="local-badge">Local MVP</span>
      </header>

      <div className="workspace" id="top">
        <section className="intro" aria-labelledby="page-title">
          <p className="eyebrow">Mobile product page audit</p>
          <h1 id="page-title">Find purchase blockers before shoppers do.</h1>
          <p>
            Check one public product page for missing prices, images, purchase
            controls and structured product data.
          </p>
        </section>

        <section className="audit-panel" aria-labelledby="audit-form-title">
          <div className="panel-heading">
            <div>
              <h2 id="audit-form-title">Run an audit</h2>
              <p>
                The scan opens the page in a mobile browser and may take several
                seconds.
              </p>
            </div>
            <span className="viewport-chip">390 × 844</span>
          </div>

          <form onSubmit={runAudit} noValidate>
            <label htmlFor="product-url">Product page URL</label>
            <div className="input-row">
              <input
                id="product-url"
                name="url"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://store.example/products/product"
                value={url}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? "url-error" : "url-help"}
                disabled={state === "scanning"}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (fieldError) setFieldError(null);
                }}
              />
              <button type="submit" disabled={state === "scanning"}>
                {state === "scanning" ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Auditing
                    page
                  </>
                ) : (
                  "Run audit"
                )}
              </button>
            </div>
            {fieldError ? (
              <p className="field-error" id="url-error" role="alert">
                {fieldError}
              </p>
            ) : (
              <p className="field-help" id="url-help">
                Only public HTTP and HTTPS pages are allowed.
              </p>
            )}
          </form>

          {state === "scanning" && (
            <div className="scan-state" role="status" aria-live="polite">
              <span className="scan-pulse" aria-hidden="true" />
              <div>
                <strong>Opening and checking the mobile page…</strong>
                <p>
                  Keep this tab open while the screenshot and findings are
                  prepared.
                </p>
              </div>
            </div>
          )}

          {state === "error" && error && (
            <div className="error-state" role="alert">
              <strong>Audit could not be completed</strong>
              <p>{error}</p>
            </div>
          )}
        </section>

        <section className="catalog-panel" aria-labelledby="catalog-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Catalog discovery</p>
              <h2 id="catalog-title">Find pages from a sitemap</h2>
              <p>
                Preview up to 200 page URLs before batch auditing is enabled.
              </p>
            </div>
            <span className="viewport-chip">Stage 2</span>
          </div>

          <form onSubmit={discoverPages} noValidate>
            <label htmlFor="sitemap-url">Sitemap URL</label>
            <div className="input-row">
              <input
                id="sitemap-url"
                name="sitemapUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://store.example/sitemap.xml"
                value={sitemapUrl}
                aria-invalid={Boolean(catalogFieldError)}
                aria-describedby={
                  catalogFieldError ? "sitemap-error" : "sitemap-help"
                }
                disabled={catalogLoading}
                onChange={(event) => {
                  setSitemapUrl(event.target.value);
                  if (catalogFieldError) setCatalogFieldError(null);
                }}
              />
              <button type="submit" disabled={catalogLoading}>
                {catalogLoading ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Discovering
                  </>
                ) : (
                  "Discover pages"
                )}
              </button>
            </div>
            {catalogFieldError ? (
              <p className="field-error" id="sitemap-error" role="alert">
                {catalogFieldError}
              </p>
            ) : (
              <p className="field-help" id="sitemap-help">
                Public HTTP and HTTPS sitemaps only. No audits run yet.
              </p>
            )}
          </form>

          {catalogError && (
            <div className="error-state" role="alert">
              <strong>Sitemap could not be read</strong>
              <p>{catalogError}</p>
            </div>
          )}

          {catalog && (
            <div className="catalog-result" aria-live="polite">
              <div className="catalog-summary">
                <strong>{catalog.pageUrls.length} pages found</strong>
                <span>
                  {catalog.inspectedSitemaps} sitemap
                  {catalog.inspectedSitemaps === 1 ? "" : "s"} inspected
                </span>
              </div>
              {catalog.truncated && (
                <p className="catalog-note">
                  Result limited for this local preview.
                </p>
              )}
              {catalog.pageUrls.length ? (
                <ol className="catalog-list">
                  {catalog.pageUrls.map((pageUrl) => (
                    <li key={pageUrl}>
                      <a href={pageUrl} target="_blank" rel="noreferrer">
                        {pageUrl}
                      </a>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="catalog-note">
                  This sitemap contains no page URLs within the discovery
                  limits.
                </p>
              )}
            </div>
          )}
        </section>

        {state === "success" && result && (
          <section className="results" aria-labelledby="results-title">
            <div className="result-header">
              <div className="result-title-row">
                <span
                  className={`result-status result-${result.summary.status}`}
                >
                  {result.summary.status === "passed" ? "✓" : "!"}
                </span>
                <div>
                  <p className="eyebrow">Audit complete</p>
                  <h2 id="results-title">{statusLabel(result)}</h2>
                </div>
              </div>
              <dl className="result-meta">
                <div>
                  <dt>Page</dt>
                  <dd>{result.pageTitle || "Untitled product page"}</dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>{(result.durationMs / 1_000).toFixed(1)}s</dd>
                </div>
                <div>
                  <dt>Checked</dt>
                  <dd>{new Date(result.finishedAt).toLocaleString()}</dd>
                </div>
              </dl>
              <a
                className="audited-url"
                href={result.finalUrl}
                target="_blank"
                rel="noreferrer"
              >
                {result.finalUrl}
              </a>
            </div>

            <div className="summary-grid" aria-label="Audit summary">
              <div className="summary-card summary-critical">
                <span>Critical</span>
                <strong>{result.summary.counts.critical}</strong>
              </div>
              <div className="summary-card summary-warning">
                <span>Warnings</span>
                <strong>{result.summary.counts.warning}</strong>
              </div>
              <div className="summary-card summary-passed">
                <span>Passed</span>
                <strong>{result.summary.counts.passed}</strong>
              </div>
            </div>

            <div className="result-layout">
              <div className="findings-panel">
                <div className="findings-toolbar">
                  <div>
                    <h2>Findings</h2>
                    <p>Deterministic checks with evidence and next steps.</p>
                  </div>
                  <div className="filters" aria-label="Filter findings">
                    {filters.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className={filter === item.id ? "active" : ""}
                        aria-pressed={filter === item.id}
                        onClick={() => setFilter(item.id)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="finding-list">
                  {visibleFindings.length > 0 ? (
                    visibleFindings.map((item) => (
                      <FindingCard key={item.id} finding={item} />
                    ))
                  ) : (
                    <div className="empty-filter">
                      No findings match this filter.
                    </div>
                  )}
                </div>
              </div>

              <aside
                className="screenshot-panel"
                aria-labelledby="screenshot-title"
              >
                <div>
                  <p className="eyebrow">Evidence</p>
                  <h2 id="screenshot-title">Full-page screenshot</h2>
                  <p>
                    Captured at {result.metadata.viewport.width} ×{" "}
                    {result.metadata.viewport.height}px.
                  </p>
                </div>
                <div className="screenshot-frame">
                  <img
                    src={result.screenshot.url}
                    alt={`Mobile screenshot of ${result.pageTitle || result.finalUrl}`}
                  />
                </div>
                <a
                  className="secondary-button"
                  href={result.screenshot.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open full screenshot
                </a>
              </aside>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
