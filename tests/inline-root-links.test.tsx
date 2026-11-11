import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { browserErrors } from "./components-dom.js";
import { parseInline, inlineToPlain } from "../src/core/outliner/inline.js";
import { inlineHtml } from "../src/core/outliner/interchange.js";
const { cleanup, render } = await import("@testing-library/react");
const { InlineText } = await import("../src/outliner/inline.js");

afterEach(() => {
  cleanup();
  assert.deepEqual(browserErrors.splice(0), []);
});

// These are the escaped labels a host uses for filenames, not hand-normalized Markdown.
const filenameSource = (filename: string, href: string) =>
  `[${filename.replace(/[\\[\]()`*_&~]/g, "\\$&")}](${href})`;
const filenames = [
  "report [final].pdf",
  "snake_case.txt",
  "report_(final).pdf",
  "Sam & Co.pdf",
  "close](target).txt",
  "back\\slash.txt",
  "`code` *star* ~tilde~.txt",
  "📎 [résumé].pdf",
];

test("escaped filename labels retain literal display and every visible source offset", () => {
  const href = "/api/files/abc123?attachment=file-1";
  for (const filename of filenames) {
    const token = filenameSource(filename, href);
    const source = `Before ${token} after`;
    const link = parseInline(source).find((segment) => segment.kind === "link");
    assert.ok(link, source);
    assert.equal(link.href, href);
    assert.equal(link.display, filename);
    assert.equal(inlineToPlain(source), `Before ${filename} after`);
    assert.equal(source.slice(link.start, link.end), token);
    for (let i = 0; i < filename.length; i++) {
      assert.equal(source[link.displayOffsets?.[i] ?? link.contentStart + i], filename[i]);
    }
    const offset = 11;
    const view = render(
      <InlineText
        source={source}
        offset={offset}
        marks={[{ start: link.contentStart + offset, end: link.contentEnd + offset }]}
      />,
    );
    const anchor = view.getByRole("link", { name: filename });
    assert.equal(anchor.textContent, filename);
    assert.equal(anchor.getAttribute("href"), href);
    for (const run of anchor.querySelectorAll<HTMLElement>("[data-src]")) {
      const start = Number(run.dataset.src) - offset;
      assert.equal(source.slice(start, start + run.textContent!.length), run.textContent);
    }
    assert.equal(anchor.querySelector("mark")?.textContent?.length! > 0, true);
    cleanup();
  }
});

test("portable HTML preserves relative-link source without changing its origin", () => {
  const href = "/api/files/abc123?attachment=file-1&download=1";
  for (const filename of filenames) {
    const source = filenameSource(filename, href);
    const view = render(<div dangerouslySetInnerHTML={{ __html: inlineHtml(source) }} />);
    assert.equal(view.container.textContent, source);
    assert.equal(view.container.querySelector("a"), null);
    cleanup();
  }
  assert.equal(
    inlineHtml("[File](https://example.test/file)"),
    '<a href="https://example.test/file">File</a>',
  );
});

test("root-relative links preserve labels, hrefs and source offsets", () => {
  for (const href of [
    "/api/files/abc123?attachment=file-1",
    "/files/report_(final).pdf?download=1#page-2",
    "/files/%E2%9C%93%20report.pdf",
    "/",
    "/?view=files",
    "/#files",
  ]) {
    const token = `[Quarterly report.txt](${href})`;
    const source = `Read **${token}** now`;
    const link = parseInline(source).find((segment) => segment.kind === "link");
    assert.ok(link, href);
    assert.equal(link.href, href);
    assert.equal(link.display, "Quarterly report.txt");
    assert.equal(source.slice(link.start, link.end), token);
    assert.equal(source.slice(link.contentStart, link.contentEnd), link.display);
    assert.deepEqual(
      link.marks?.map((mark) => mark.kind),
      ["bold"],
    );
    assert.equal(inlineToPlain(source), "Read Quarterly report.txt now");
    assert.equal(new URL(href, "https://example.test").origin, "https://example.test");
  }
});

test("root-relative support does not admit network paths, backslashes or control characters", () => {
  for (const href of [
    "//external.test/file",
    "/\\external.test/file",
    "/files\\report.txt",
    "/\n/external.test",
    "/\t/external.test",
    "/\r/external.test",
    "/\0/external.test",
    "/files/\u007freport.txt",
    "javascript:alert(1)",
    "data:text/html,test",
    "file:///report.txt",
    "relative/report.txt",
  ]) {
    assert.equal(
      parseInline(`[File](${href})`).some((segment) => segment.kind === "link"),
      false,
      JSON.stringify(href),
    );
  }
});

test("existing absolute links and literal source remain unchanged", () => {
  for (const href of [
    "https://example.test/report_(final)",
    "http://example.test",
    "mailto:person@example.test",
  ]) {
    assert.equal(
      parseInline(`[File](${href})`).find((segment) => segment.kind === "link")?.href,
      href,
    );
  }
  for (const source of ["`[File](/files/report.txt)`", "\\[File](/files/report.txt)"]) {
    assert.equal(
      parseInline(source).some((segment) => segment.kind === "link"),
      false,
    );
  }
});

test("the native inline renderer projects file links as labeled anchors", () => {
  const href = "/api/files/abc123?attachment=file-1";
  for (const source of [`[Quarterly report.txt](${href})`, `**[Quarterly report.txt](${href})**`]) {
    const view = render(<InlineText source={source} />);
    const link = view.getByRole("link", { name: "Quarterly report.txt" });
    assert.equal(link.getAttribute("href"), href);
    assert.equal(link.getAttribute("target"), "_blank");
    assert.equal(link.getAttribute("rel"), "noreferrer noopener");
    assert.equal(view.container.querySelectorAll("a").length, 1);
    assert.equal(view.container.textContent?.includes("](/api/files/"), false);
    cleanup();
  }
});
