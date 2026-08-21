import type { Finding } from "@/domain/audit";

export const MAX_SCENARIO_STEPS = 12;

export type ScenarioLocator =
  | { by: "testId"; value: string }
  | { by: "text"; value: string; exact?: boolean }
  | { by: "label"; value: string; exact?: boolean }
  | {
      by: "role";
      role:
        | "button"
        | "checkbox"
        | "dialog"
        | "link"
        | "option"
        | "radio"
        | "textbox";
      name?: string;
      exact?: boolean;
    };

export type ScenarioStep =
  | { action: "navigate"; url: string }
  | { action: "click"; locator: ScenarioLocator }
  | { action: "select"; locator: ScenarioLocator; value: string }
  | { action: "fill"; locator: ScenarioLocator; value: string }
  | {
      action: "press";
      locator?: ScenarioLocator;
      key:
        | "ArrowDown"
        | "ArrowLeft"
        | "ArrowRight"
        | "ArrowUp"
        | "Enter"
        | "Escape"
        | "Space"
        | "Tab";
    }
  | { action: "scroll"; locator?: ScenarioLocator; pixels?: number }
  | { action: "back" }
  | { action: "waitReady"; locator: ScenarioLocator; timeoutMs?: number }
  | {
      capture: "value";
      name: string;
      locator: ScenarioLocator;
      source: "text" | "value" | `attribute:${string}`;
    }
  | { capture: "fingerprint"; name: string }
  | {
      capture: "linkTarget";
      name: string;
      locator: ScenarioLocator;
      part: { query: string } | { pathSegment: number };
    }
  | { assert: "url"; equals?: string; matches?: string }
  | { assert: "visibleText"; text: string; locator?: ScenarioLocator }
  | { assert: "absentText"; text: string; locator?: ScenarioLocator }
  | {
      assert: "state";
      locator: ScenarioLocator;
      state: "visible" | "hidden" | "enabled" | "selected" | "reachable";
    }
  | { assert: "fingerprintChanged"; from: string }
  | {
      assert: "capturedValue";
      locator: ScenarioLocator;
      source: "text" | "value" | `attribute:${string}`;
      equalsCapture: string;
    }
  | {
      assert: "request";
      urlMatches: string;
      method?: string;
      status?: number;
      query?: Record<string, string>;
    };

export interface Scenario {
  id: string;
  version: number;
  name: string;
  approvedOrigins: string[];
  evidenceQueryKeys?: string[];
  steps: ScenarioStep[];
}

export interface ScenarioRunResult {
  finding: Finding;
  completedSteps: number;
}
