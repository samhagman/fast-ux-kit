import assert from "node:assert/strict";
import { after, test } from "node:test";
import { domEnv, mountOutliner, stopVite } from "./harness/outliner-dom.mjs";

after(() => stopVite());
await domEnv();

test("host file links render in native outline rows and survive an edit round trip", async () => {
  const href = "/api/files/abc123?attachment=file-1";
  const text = `[Quarterly report.txt](${href})`;
  for (const readOnly of [true, false]) {
    const ui = await mountOutliner({ defaultValue: [{ id: "file", text }], readOnly });
    try {
      const checkLink = () => {
        const anchors = ui.row("file").querySelectorAll("a");
        assert.equal(anchors.length, 1);
        assert.equal(anchors[0].getAttribute("href"), href);
        assert.equal(anchors[0].textContent, "Quarterly report.txt");
        assert.equal(anchors[0].getAttribute("rel"), "noreferrer noopener");
        assert.equal(ui.row("file").textContent.includes("](/api/files/"), false);
      };
      checkLink();
      if (!readOnly) {
        await ui.edit("file");
        await ui.key("Escape");
        await ui.frames();
        assert.equal(ui.value()[0].text, text);
        checkLink();
      }
    } finally {
      await ui.unmount();
    }
  }
});

test("escaped host filenames stay literal through native note editing and reload", async () => {
  const href = "/api/files/abc123?attachment=file-1";
  for (const filename of [
    "report [final].pdf",
    "snake_case.txt",
    "report_(final).pdf",
    "Sam & Co.pdf",
    "close](target).txt",
    "📎 [résumé].pdf",
  ]) {
    const source = `[${filename.replace(/[\\[\]()`*_&~]/g, "\\$&")}](${href})`;
    const ui = await mountOutliner({
      defaultValue: [{ id: "file", text: "Attachment", data: { note: source } }],
    });
    try {
      const check = () => {
        const link = ui.row("file").querySelector("a");
        assert.ok(link, source);
        assert.equal(link.textContent, filename);
        assert.equal(link.getAttribute("href"), href);
      };
      check();
      await ui.edit("file");
      await ui.key("Enter", { shiftKey: true });
      await ui.frames();
      assert.equal(ui.field()?.dataset.olEditor, "note");
      await ui.key("Escape");
      await ui.frames();
      assert.equal(ui.value()[0].data.note, source);
      check();
      const saved = ui.value();
      await ui.unmount();
      const reload = await mountOutliner({ defaultValue: saved, readOnly: true });
      try {
        const link = reload.row("file").querySelector("a");
        assert.equal(link?.textContent, filename);
        assert.equal(link?.getAttribute("href"), href);
        assert.equal(reload.value()[0].data.note, source);
      } finally {
        await reload.unmount();
      }
    } finally {
      if (ui.container.isConnected) await ui.unmount();
    }
  }
});
