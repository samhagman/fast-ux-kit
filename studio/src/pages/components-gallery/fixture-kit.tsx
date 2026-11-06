// Shared pieces for the gallery's demos: the fixture shape the catalog test drives, small
// action builders and the sample data several areas use.
import * as React from "react";
import { CalendarDate } from "@internationalized/date";

export interface FixtureAction {
  target: string;
  event: "click" | "input" | "key" | "focus" | "hover" | "file";
  value?: string;
  expect: string;
  text?: string;
}
export interface ComponentFixture {
  Component: React.ComponentType;
  selector: string;
  instructions: string;
  actions: readonly FixtureAction[];
}
interface DemoState {
  report: (value: unknown) => void;
  open: boolean;
  setOpen: (value: boolean) => void;
  page: number;
  setPage: (value: number) => void;
}
export function example(
  instructions: string,
  render: (state: DemoState) => React.ReactNode,
  selector: string,
  actions: readonly FixtureAction[] = [],
): ComponentFixture {
  function Component() {
    const [status, setStatus] = React.useState("");
    const [open, setOpen] = React.useState(false);
    const [page, setPage] = React.useState(0);
    const report = (value: unknown) =>
      setStatus(Array.isArray(value) ? value.join(", ") : String(value ?? "Cleared"));
    return (
      <div className="component-fixture">
        {render({ report, open, setOpen, page, setPage })}
        <output className="fixture-status" aria-live="polite">
          {status}
        </output>
      </div>
    );
  }
  return { Component, selector, instructions, actions };
}
export const click = (
  target: string,
  expect = ".fixture-status",
  text?: string,
): FixtureAction => ({
  target,
  event: "click",
  expect,
  text,
});
export const input = (target: string, value: string, text = value): FixtureAction => ({
  target,
  event: "input",
  value,
  expect: ".fixture-status",
  text,
});
export const key = (
  target: string,
  value: string,
  expect: string,
  text?: string,
): FixtureAction => ({
  target,
  event: "key",
  value,
  expect,
  text,
});
export const options = [
  { id: "draft", label: "Draft" },
  { id: "review", label: "Review" },
  { id: "done", label: "Done", disabled: true },
];
export const date = new CalendarDate(2028, 2, 12);
export const tree = [
  {
    id: "project",
    label: "Project",
    children: [
      { id: "plan", label: "Plan" },
      { id: "notes", label: "Notes" },
    ],
  },
];
export const svgImage = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#cdd8cc"/><circle cx="220" cy="180" r="96" fill="#49624d"/><path d="M320 340 480 80 620 340" fill="#9aaa80"/></svg>')}`;
export const fileAction: FixtureAction = {
  target: 'input[type="file"]',
  event: "file",
  expect: ".fixture-status",
  text: "example.txt",
};
