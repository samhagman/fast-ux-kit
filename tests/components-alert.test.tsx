import { dom, browserErrors } from "./components-dom.js";
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import * as React from "react";
import { renderToString } from "react-dom/server";
import { act, cleanup, render } from "@testing-library/react";
import { CircleAlertIcon } from "lucide-react";
import { Alert, AlertActions, AlertDescription, AlertTitle } from "../src/components/index.js";

const { hydrateRoot } = await import("react-dom/client");

afterEach(async () => {
  await act(async () => {
    cleanup();
  });
  assert.deepEqual(browserErrors.splice(0), []);
});

/** An alert as an application would write one: what happened, then the next step. */
function SyncAlert(props: React.ComponentProps<typeof Alert>) {
  return (
    <Alert icon={<CircleAlertIcon />} {...props}>
      <AlertTitle>Sync stopped</AlertTitle>
      <AlertDescription>3 notes on this device have not reached the server.</AlertDescription>
      <AlertActions>
        <button type="button">Try again</button>
        <a href="#waiting">See what is waiting</a>
      </AlertActions>
    </Alert>
  );
}

/** Every class name on the alert and its parts. */
function classTokens(root: Element) {
  return [root, ...root.querySelectorAll("*")]
    .flatMap((element) => (element.getAttribute("class") ?? "").split(/\s+/))
    .filter(Boolean);
}

test("errors interrupt (role alert); info, success and warning wait their turn (role status)", () => {
  const cases = [
    [undefined, "info", "status"],
    ["info", "info", "status"],
    ["success", "success", "status"],
    ["warning", "warning", "status"],
    ["error", "error", "alert"],
    // shadcn's names keep working as aliases.
    ["default", "info", "status"],
    ["destructive", "error", "alert"],
  ] as const;
  for (const [variant, tone, role] of cases) {
    const view = render(<SyncAlert variant={variant} />);
    const alert = view.getByRole(role);
    assert.equal(alert.getAttribute("data-slot"), "alert");
    assert.equal(alert.getAttribute("data-variant"), tone, `${variant} renders as ${tone}`);
    assert.match(alert.textContent ?? "", /Sync stopped/);
    view.unmount();
  }
});

test("a consumer's role wins over the variant's", () => {
  const view = render(
    <>
      <SyncAlert variant="error" role="status" />
      <SyncAlert variant="info" role="alert" />
      <SyncAlert variant="warning" role="note" />
    </>,
  );
  const roots = [...view.container.querySelectorAll('[data-slot="alert"]')];
  assert.deepEqual(
    roots.map((root) => [root.getAttribute("data-variant"), root.getAttribute("role")]),
    [
      ["error", "status"],
      ["info", "alert"],
      ["warning", "note"],
    ],
  );
});

test("icon, title, description and actions render in their slots, and the action is reachable", () => {
  const view = render(<SyncAlert variant="error" className="my-alert" id="sync" />);
  const alert = view.getByRole("alert");
  assert.equal(alert.id, "sync", "DOM props pass through");
  assert.ok(alert.classList.contains("my-alert"), "className merges");
  const slots = [...alert.children].map((child) => child.getAttribute("data-slot"));
  assert.deepEqual(slots, ["alert-icon", "alert-title", "alert-description", "alert-actions"]);
  const icon = alert.querySelector('[data-slot="alert-icon"]')!;
  assert.equal(icon.getAttribute("aria-hidden"), "true", "the icon is decoration");
  assert.ok(icon.querySelector("svg"));
  assert.equal(view.getByText("Sync stopped").getAttribute("data-slot"), "alert-title");
  const actions = alert.querySelector('[data-slot="alert-actions"]')!;
  const retry = view.getByRole("button", { name: "Try again" });
  const link = view.getByRole("link", { name: "See what is waiting" });
  assert.ok(actions.contains(retry) && actions.contains(link));
  for (const control of [retry, link]) {
    assert.ok(control.tabIndex >= 0, "in the tab order");
    control.focus();
    assert.equal(document.activeElement, control);
  }
});

test("no icon leaves no icon slot; a bare svg child still works as shadcn's icon", () => {
  const plain = render(
    <Alert>
      <AlertTitle>Shared notebook</AlertTitle>
    </Alert>,
  );
  assert.equal(plain.container.querySelector('[data-slot="alert-icon"]'), null);
  plain.unmount();
  const bare = render(
    <Alert variant="success">
      <CircleAlertIcon />
      <AlertTitle>Export finished</AlertTitle>
    </Alert>,
  );
  const alert = bare.getByRole("status");
  assert.equal(alert.firstElementChild?.tagName.toLowerCase(), "svg");
  assert.ok(
    classTokens(alert).some((token) => token.startsWith("has-[>svg]:")),
    "the root lays out a bare svg as the icon",
  );
});

test("server markup equals the hydrated markup", async () => {
  const tree = (
    <>
      <SyncAlert variant="error" />
      <SyncAlert variant="warning" dir="rtl" />
    </>
  );
  const html = renderToString(tree);
  assert.equal(renderToString(tree), html, "server rendering is stable");
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  const server = host.innerHTML;
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(host, tree, { onRecoverableError: (error) => errors.push(error) });
    });
    assert.deepEqual(errors, [], "no hydration mismatch");
    assert.equal(host.innerHTML, server, "hydration changes nothing");
  } finally {
    await act(async () => root?.unmount());
    host.remove();
  }
});

test("right to left: the alert follows its host's direction and uses logical sides only", () => {
  const view = render(
    <div dir="rtl">
      <SyncAlert variant="warning" />
    </div>,
  );
  const alert = view.getByRole("status");
  assert.equal(alert.closest("[dir]")?.getAttribute("dir"), "rtl");
  assert.equal(alert.hasAttribute("dir"), false, "no direction of its own unless asked");
  view.unmount();
  const own = render(<SyncAlert variant="warning" dir="rtl" />);
  assert.equal(own.getByRole("status").getAttribute("dir"), "rtl");
  const physical =
    /(^|:)-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|rounded-tl|rounded-tr|rounded-bl|rounded-br|text-left|text-right|float-left|float-right|scroll-ml|scroll-mr)(-|$)/;
  const offenders = classTokens(own.getByRole("status")).filter((token) => physical.test(token));
  assert.deepEqual(offenders, [], "start/end utilities instead of left/right");
});

test("every color comes from a theme token, so a theme restyles the alert", () => {
  const variants = ["info", "success", "warning", "error"] as const;
  const view = render(
    <>
      {variants.map((variant) => (
        <SyncAlert key={variant} variant={variant} />
      ))}
    </>,
  );
  const tokens = [...view.container.querySelectorAll('[data-slot="alert"]')].flatMap(classTokens);
  assert.ok(tokens.length > 20, "the alert is styled");
  const literal =
    /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(white|black)\b|-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d/i;
  assert.deepEqual(
    tokens.filter((token) => literal.test(token)),
    [],
    "no literal or palette colors",
  );
  // Each tone is one custom property set from a theme token, which consumers can override.
  const tones = [...view.container.querySelectorAll('[data-slot="alert"]')].map((root) =>
    classTokens(root).find((token) => token.startsWith("[--fux-alert-tone:")),
  );
  assert.deepEqual(tones, [
    "[--fux-alert-tone:var(--signal)]",
    "[--fux-alert-tone:var(--success)]",
    "[--fux-alert-tone:var(--warning)]",
    "[--fux-alert-tone:var(--destructive)]",
  ]);
  // Arbitrary values only read custom properties.
  for (const token of tokens.filter((token) => /\[[^\]]*\(/.test(token)))
    for (const value of token.matchAll(/var\(([^),]+)/g))
      assert.match(value[1]!, /^--[a-z0-9-]+$/, `${token} reads a token`);
  // The tone a consumer sets replaces the kit's.
  const custom = render(<SyncAlert variant="info" className="[--fux-alert-tone:var(--chart-3)]" />);
  const customTones = classTokens(custom.container.querySelector('[data-slot="alert"]')!).filter(
    (token) => token.startsWith("[--fux-alert-tone:"),
  );
  assert.deepEqual(customTones, ["[--fux-alert-tone:var(--chart-3)]"]);
});

/** A full-page refusal: what can't be done here, why, and where to go instead. */
function ExpiredLink(props: React.ComponentProps<typeof Alert>) {
  return (
    <Alert size="page" variant="error" icon={<CircleAlertIcon />} {...props}>
      <AlertTitle asChild>
        <h1>This link expired</h1>
      </AlertTitle>
      <AlertDescription>
        Invitation links last 7 days. This one was sent on 3 March.
      </AlertDescription>
      <AlertActions>
        <a href="#request">Ask for a new link</a>
      </AlertActions>
    </Alert>
  );
}

test("alerts are default size unless asked; page size shows no icon, even one passed in", () => {
  const view = render(
    <>
      <SyncAlert variant="info" />
      <ExpiredLink />
      <Alert size="page" variant="info">
        <CircleAlertIcon />
        <AlertTitle>This task is already closed</AlertTitle>
      </Alert>
    </>,
  );
  const [plain, page, bare] = [...view.container.querySelectorAll('[data-slot="alert"]')];
  assert.equal(plain!.getAttribute("data-size"), "default");
  assert.ok(plain!.querySelector('[data-slot="alert-icon"]'), "default size keeps its icon");
  assert.equal(page!.getAttribute("data-size"), "page");
  assert.equal(page!.querySelector('[data-slot="alert-icon"]'), null, "the icon prop is dropped");
  assert.equal(page!.querySelector("svg"), null);
  const bareTokens = classTokens(bare!);
  assert.ok(bareTokens.includes("[&>svg]:hidden"), "a bare svg child is hidden");
  assert.ok(bareTokens.includes("has-[>svg]:grid-cols-[0_1fr]"), "and takes no column");
  assert.ok(!bareTokens.includes("has-[>svg]:grid-cols-[auto_1fr]"));
});

test("a page alert's title is a real heading at display size, its description at body size", () => {
  const view = render(<ExpiredLink />);
  const heading = view.getByRole("heading", { level: 1, name: "This link expired" });
  assert.equal(heading.getAttribute("data-slot"), "alert-title");
  assert.equal(heading.parentElement?.getAttribute("data-slot"), "alert");
  const title = classTokens(heading);
  assert.ok(title.includes("font-heading"), "the theme's heading font");
  assert.ok(title.includes("group-data-[size=page]/alert:text-2xl"), "display size on page");
  const description = classTokens(view.container.querySelector('[data-slot="alert-description"]')!);
  assert.ok(description.includes("group-data-[size=page]/alert:text-base/relaxed"), "body size");
  const root = classTokens(view.getByRole("alert"));
  assert.ok(root.includes("px-6") && root.includes("py-6"), "roomier padding");
  assert.ok(!root.includes("px-4") && !root.includes("py-3"), "the default padding is replaced");
  // A default-size title stays a div unless the consumer asks for a heading.
  const plain = render(<SyncAlert />);
  assert.equal(
    plain.container.querySelector('[data-slot="alert-title"]')?.tagName.toLowerCase(),
    "div",
  );
});

test("page alerts keep the tones' roles and the role override", () => {
  const cases = [
    ["error", "alert"],
    ["destructive", "alert"],
    ["info", "status"],
    ["default", "status"],
    ["success", "status"],
    ["warning", "status"],
  ] as const;
  for (const [variant, role] of cases) {
    const view = render(<ExpiredLink variant={variant} />);
    assert.equal(view.getByRole(role).getAttribute("data-size"), "page", `${variant} is ${role}`);
    view.unmount();
  }
  const override = render(<ExpiredLink variant="error" role="status" />);
  assert.ok(override.getByRole("status"));
});

test("page alerts: server markup equals hydrated, colors are tokens, sides are logical", async () => {
  const tree = (
    <>
      <ExpiredLink />
      <ExpiredLink variant="info" dir="rtl" />
    </>
  );
  const html = renderToString(tree);
  assert.equal(renderToString(tree), html);
  assert.match(html, /<h1 data-slot="alert-title"/);
  const host = document.createElement("div");
  host.innerHTML = html;
  document.body.append(host);
  const server = host.innerHTML;
  const errors: unknown[] = [];
  let root: ReturnType<typeof hydrateRoot> | undefined;
  try {
    await act(async () => {
      root = hydrateRoot(host, tree, { onRecoverableError: (error) => errors.push(error) });
    });
    assert.deepEqual(errors, [], "no hydration mismatch");
    assert.equal(host.innerHTML, server, "hydration changes nothing");
    const tokens = [...host.querySelectorAll('[data-slot="alert"]')].flatMap(classTokens);
    const literal =
      /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(|\b(white|black)\b|-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d/i;
    assert.deepEqual(
      tokens.filter((token) => literal.test(token)),
      [],
      "token colors only",
    );
    const physical =
      /(^|:)-?(ml|mr|pl|pr|left|right|border-l|border-r|rounded-l|rounded-r|text-left|text-right)(-|$)/;
    assert.deepEqual(
      tokens.filter((token) => physical.test(token)),
      [],
      "logical sides only",
    );
  } finally {
    await act(async () => root?.unmount());
    host.remove();
  }
});
