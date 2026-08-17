"use client";

/* eslint-disable @next/next/no-img-element */

import { FormEvent, useMemo, useState } from "react";

import type { AuditResult, Finding } from "@/domain/audit";
import type {
  BatchAuditResult,
  CatalogDiscoveryResult,
} from "@/domain/catalog";

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
  const [testAddToCart, setTestAddToCart] = useState(false);
  const [catalogUrl, setCatalogUrl] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogFieldError, setCatalogFieldError] = useState<string | null>(
    null,
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogDiscoveryResult | null>(null);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchError, setBatchError] = useState<string | null>(null);
  const [batch, setBatch] = useState<BatchAuditResult | null>(null);

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
        body: JSON.stringify({
          url: url.trim(),
          testAddToCart,
        }),
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
    const validationError = clientValidation(
      catalogUrl.trim(),
      "sitemap or category",
    );
    setCatalogFieldError(validationError);
    if (validationError) return;

    setCatalogLoading(true);
    setCatalogError(null);
    setCatalog(null);
    try {
      const response = await fetch("/api/catalog/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: catalogUrl.trim() }),
      });
      const payload = (await response.json()) as
        CatalogDiscoveryResult | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Catalog discovery failed.",
        );
      }
      setCatalog(payload as CatalogDiscoveryResult);
      setSelectedUrls(
        (payload as CatalogDiscoveryResult).sourceType === "category"
          ? (payload as CatalogDiscoveryResult).pageUrls.slice(0, 5)
          : [],
      );
      setBatch(null);
      setBatchError(null);
    } catch (caught) {
      setCatalogError(
        caught instanceof Error
          ? caught.message
          : "The catalog source could not be read.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }

  function toggleBatchUrl(pageUrl: string) {
    setSelectedUrls((current) =>
      current.includes(pageUrl)
        ? current.filter((item) => item !== pageUrl)
        : current.length < 5
          ? [...current, pageUrl]
          : current,
    );
  }

  function showAuditReport(auditResult: AuditResult) {
    setResult(auditResult);
    setFilter("all");
    setState("success");
    requestAnimationFrame(() => {
      const report = document.getElementById("audit-report");
      report?.focus({ preventScroll: true });
      report?.scrollIntoView({ block: "start" });
    });
  }

  async function runBatchAudits() {
    if (!selectedUrls.length || selectedUrls.length > 5) return;
    setBatchLoading(true);
    setBatchError(null);
    setBatch(null);
    setResult(null);
    if (state === "success") setState("initial");
    try {
      const response = await fetch("/api/catalog/audits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: selectedUrls }),
      });
      const payload = (await response.json()) as
        BatchAuditResult | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "Batch audit failed.",
        );
      }
      setBatch(payload as BatchAuditResult);
    } catch (caught) {
      setBatchError(
        caught instanceof Error
          ? caught.message
          : "The selected pages could not be audited.",
      );
    } finally {
      setBatchLoading(false);
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
                disabled={state === "scanning" || batchLoading}
                onChange={(event) => {
                  setUrl(event.target.value);
                  if (fieldError) setFieldError(null);
                }}
              />
              <button
                type="submit"
                disabled={state === "scanning" || batchLoading}
              >
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
            <label className="interaction-option">
              <input
                type="checkbox"
                checked={testAddToCart}
                disabled={state === "scanning" || batchLoading}
                onChange={(event) => setTestAddToCart(event.target.checked)}
              />
              <span>
                <strong>Test Add to cart</strong>
                <small>
                  Uses an isolated session. Never selects variants, clicks Buy
                  now or continues to checkout.
                </small>
              </span>
            </label>
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
              <h2 id="catalog-title">Find product pages</h2>
              <p>
                Use a category page for PDP candidates or an XML sitemap for a
                general URL preview.
              </p>
            </div>
            <span className="viewport-chip">Stage 2</span>
          </div>

          <form onSubmit={discoverPages} noValidate>
            <label htmlFor="catalog-url">Sitemap or category URL</label>
            <div className="input-row">
              <input
                id="catalog-url"
                name="catalogUrl"
                type="url"
                inputMode="url"
                autoComplete="url"
                placeholder="https://store.example/collections/shoes"
                value={catalogUrl}
                aria-invalid={Boolean(catalogFieldError)}
                aria-describedby={
                  catalogFieldError ? "catalog-error" : "catalog-help"
                }
                disabled={catalogLoading || batchLoading}
                onChange={(event) => {
                  setCatalogUrl(event.target.value);
                  if (catalogFieldError) setCatalogFieldError(null);
                }}
              />
              <button type="submit" disabled={catalogLoading || batchLoading}>
                {catalogLoading ? (
                  <>
                    <span className="spinner" aria-hidden="true" /> Discovering
                  </>
                ) : (
                  "Find products"
                )}
              </button>
            </div>
            {catalogFieldError ? (
              <p className="field-error" id="catalog-error" role="alert">
                {catalogFieldError}
              </p>
            ) : (
              <p className="field-help" id="catalog-help">
                Public HTTP and HTTPS pages only. Discovery never starts audits
                automatically.
              </p>
            )}
          </form>

          {catalogError && (
            <div className="error-state" role="alert">
              <strong>Catalog source could not be read</strong>
              <p>{catalogError}</p>
            </div>
          )}

          {catalog && (
            <div className="catalog-result" aria-live="polite">
              <div className="catalog-summary">
                <strong>
                  {catalog.pageUrls.length}{" "}
                  {catalog.sourceType === "category"
                    ? "product pages found"
                    : "pages found"}
                </strong>
                <span>
                  {catalog.inspectedSources}{" "}
                  {catalog.sourceType === "category" ? "category" : "sitemap"}
                  {catalog.inspectedSources === 1 ? "" : "s"} inspected
                </span>
              </div>
              {catalog.truncated && (
                <p className="catalog-note">
                  Result limited for this local preview.
                </p>
              )}
              {catalog.pageUrls.length ? (
                <ul className="catalog-list">
                  {catalog.pageUrls.map((pageUrl) => (
                    <li key={pageUrl}>
                      <label>
                        <input
                          className="catalog-checkbox"
                          type="checkbox"
                          checked={selectedUrls.includes(pageUrl)}
                          disabled={
                            batchLoading ||
                            (!selectedUrls.includes(pageUrl) &&
                              selectedUrls.length === 5)
                          }
                          onChange={() => toggleBatchUrl(pageUrl)}
                        />
                        <a href={pageUrl} target="_blank" rel="noreferrer">
                          {pageUrl}
                        </a>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="catalog-note">
                  No matching URLs were found within the discovery limits.
                </p>
              )}
              {catalog.pageUrls.length > 0 && (
                <div className="batch-actions">
                  <span>{selectedUrls.length} of 5 selected</span>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={
                      batchLoading ||
                      state === "scanning" ||
                      selectedUrls.length === 0
                    }
                    onClick={runBatchAudits}
                  >
                    {batchLoading ? (
                      <>
                        <span className="spinner" aria-hidden="true" /> Auditing
                        selected pages
                      </>
                    ) : (
                      "Audit selected pages"
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          {batchError && (
            <div className="error-state" role="alert">
              <strong>Batch audit could not be completed</strong>
              <p>{batchError}</p>
            </div>
          )}

          {batch && (
            <div className="batch-result" aria-live="polite">
              <div className="batch-counts" aria-label="Batch audit summary">
                <span>{batch.counts.completed} completed</span>
                <span>{batch.counts.critical} critical</span>
                <span>{batch.counts.warning} warnings</span>
                <span>{batch.counts.passed} passed</span>
                <span>{batch.counts.failed} failed</span>
              </div>
              <div className="batch-table-wrap">
                <table className="batch-table">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Status</th>
                      <th>Critical</th>
                      <th>Warnings</th>
                      <th>Passed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batch.items.map((item) => {
                      const status = item.result?.summary.status;
                      return (
                        <tr key={item.url}>
                          <td>
                            <a
                              href={item.result?.finalUrl ?? item.url}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {item.result?.pageTitle || item.url}
                            </a>
                            {item.result && (
                              <button
                                className="batch-report-button"
                                type="button"
                                onClick={() => showAuditReport(item.result!)}
                              >
                                View detailed report
                              </button>
                            )}
                            {item.error && <small>{item.error}</small>}
                          </td>
                          <td>
                            <span
                              className={`status-badge status-${status ?? "critical"}`}
                            >
                              {status ?? "failed"}
                            </span>
                          </td>
                          <td>{item.result?.summary.counts.critical ?? "—"}</td>
                          <td>{item.result?.summary.counts.warning ?? "—"}</td>
                          <td>{item.result?.summary.counts.passed ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>

        {state === "success" && result && (
          <section
            className="results"
            id="audit-report"
            tabIndex={-1}
            aria-labelledby="results-title"
          >
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
