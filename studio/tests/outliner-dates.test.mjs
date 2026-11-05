// Dates: ranges `!(start → end)` (parse, format, chips, range-overlap search, agenda placement),
// `created:` search, and timezone / daylight-saving correctness for dates and recurrence. The
// clock is injected (`now`) and the zone is switched per test through process.env.TZ (node reads
// it on every Date call; each test file runs in its own process, so nothing leaks).
//
//   cd studio && node --test tests/outliner-dates.test.mjs
//
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
let vite, inline, search, hook;
const load = (path) => vite.ssrLoadModule(path);
before(async () => {
  vite = await createServer({
    root,
    logLevel: "error",
    server: { middlewareMode: true, hmr: false, ws: false, watch: null },
    appType: "custom",
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  inline = await load("/src/registry/outliner/inline.tsx");
  search = await load("/src/registry/outliner/search-filters.ts");
  hook = await load("/src/registry/outliner/use-outliner.ts");
});
after(() => vite?.close());

/** Run `fn` with the process in `zone`, restoring the previous zone after. */
function inZone(zone, fn) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}
const date = (source) => inline.parseInline(source).find((s) => s.kind === "date")?.date;
const ids = (nodes, query, now) => search.searchOutliner(nodes, query, { now }).matchedIds;

/* ───────────── Ranges: parse and format ───────────── */

test("ranges: day, timed and same-day forms parse; -> reads as →; bad ranges stay text", () => {
  const days = date("Offsite !(2026-11-03 → 2026-11-07) prep");
  assert.equal(days.value.getDate(), 3);
  assert.equal(days.end.getDate(), 7);
  assert.equal(days.hasTime, false);
  assert.equal(days.endHasTime, false);
  const sameDay = date("!(2026-11-03 09:00 → 11:00)");
  assert.equal(sameDay.end.getDate(), 3, "a bare end time ends the same day");
  assert.equal(sameDay.end.getHours(), 11);
  assert.equal(sameDay.endHasTime, true);
  const overnight = date("!(2026-11-03 22:00 -> 2026-11-04 06:00)");
  assert.equal(overnight.end.getDate(), 4);
  assert.equal(
    inline.dateTokenOf(overnight),
    "!(2026-11-03 22:00 → 2026-11-04 06:00)",
    "the canonical arrow is →",
  );
  assert.equal(
    date("!(2026-11-07 → 2026-11-03)"),
    undefined,
    "an end before the start is not a range",
  );
  assert.equal(date("!(2026-11-03 → 11:00)"), undefined, "an end time needs a start time");
  assert.equal(date("!(2026-11-03 → 2026-11-07 every week)"), undefined, "ranges never repeat");
  assert.equal(date("!(2026-02-27 → 2026-02-30)"), undefined, "Feb 30 is not a day");
  assert.equal(date("!(2026-11-03 24:00)"), undefined, "24:00 is not a time");
});

test("ranges: tokens round-trip; the chip reads compactly; tone is today while under way", () => {
  for (const token of [
    "!(2026-11-03 → 2026-11-07)",
    "!(2026-11-03 09:00 → 11:00)",
    "!(2026-11-03 22:00 → 2026-11-04 06:00)",
    "!(2026-11-03 09:00 → 2026-11-05)",
  ])
    assert.equal(inline.dateTokenOf(date(token)), token);
  const now = new Date(2026, 10, 5, 12);
  assert.equal(
    inline.dateTone(new Date(2026, 10, 3), now, new Date(2026, 10, 7)),
    "today",
    "under way",
  );
  assert.equal(
    inline.dateTone(new Date(2026, 10, 1), now, new Date(2026, 10, 4)),
    "overdue",
    "ended yesterday",
  );
  assert.equal(
    inline.dateTone(new Date(2026, 10, 6), now, new Date(2026, 10, 9)),
    "soon",
    "starts tomorrow",
  );
  const label = inline.formatDate(date("!(2026-11-03 → 2026-11-07)"), now);
  assert.match(label, /→/);
  assert.match(
    inline.formatDate(date("!(2026-11-05 09:00 → 11:00)"), now),
    /^Today 9:00\sAM → 11:00\sAM$/,
    "same-day end is just the time",
  );
  assert.equal(
    inline.inlineToPlain("Offsite !(2026-11-03 → 2026-11-07)", undefined, { dates: "absolute" }),
    "Offsite 2026-11-03 → 2026-11-07",
  );
  assert.match(inline.inlineToSpeech("!(2026-11-03 → 2026-11-07)"), /^from .+ to .+$/);
});

/* ───────────── Ranges: overlap search and agenda ───────────── */

const ranged = () => [
  { id: "offsite", text: "Offsite !(2026-11-03 → 2026-11-07)" },
  { id: "trip", text: "Trip !(2026-11-09 → 2026-11-12)" },
  { id: "past", text: "Conference !(2026-10-20 → 2026-10-22)", checked: false },
  { id: "pastdone", text: "Retro !(2026-10-20 → 2026-10-21)", checked: true },
  { id: "single", text: "Review !(2026-11-05)" },
  { id: "none", text: "Undated" },
];

test("search: due: and during: match ranges that OVERLAP the span; overdue means the range ended", () => {
  const now = new Date(2026, 10, 5, 9); // Thu Nov 5
  const nodes = ranged();
  assert.deepEqual(
    ids(nodes, "due:today", now),
    ["offsite", "single"],
    "a range under way is due today",
  );
  assert.deepEqual(ids(nodes, "due:tomorrow", now), ["offsite"]);
  assert.deepEqual(
    ids(nodes, "due:week", now),
    ["offsite", "trip", "single"],
    "Nov 9–12 overlaps Nov 5–11",
  );
  assert.deepEqual(
    ids(nodes, "due:overdue", now),
    ["past"],
    "ended and not done (a range under way is not overdue)",
  );
  assert.deepEqual(ids(nodes, "due:2026-11-04", now), ["offsite"], "a day inside the range");
  assert.deepEqual(
    ids(nodes, "during:2026-11-07..2026-11-09", now),
    ["offsite", "trip"],
    "touching either end counts",
  );
  assert.deepEqual(ids(nodes, "during:2026-10-23..2026-11-02", now), [], "the gap between ranges");
  assert.deepEqual(ids(nodes, "during:2026-11-05", now), ["offsite", "single"]);
  assert.deepEqual(
    ids(nodes, "before:2026-11-04", now),
    ["offsite", "past", "pastdone"],
    "before: compares the start",
  );
  assert.deepEqual(
    ids(nodes, "after:2026-11-06", now),
    ["offsite", "trip"],
    "after: compares the end",
  );
  assert.deepEqual(ids(nodes, "-during:2026-11-01..2026-11-30 has:date", now), [
    "past",
    "pastdone",
  ]);
  const bad = search.searchOutliner(nodes, "during:2026-11-09..2026-11-01", { now });
  assert.match(bad.diagnostics[0].message, /ends before it starts/);
  assert.match(
    search.searchOutliner(nodes, "during:soon", { now }).diagnostics[0].message,
    /during: takes a day or a span/,
  );
});

test("agenda: a range under way sits under Today, a future one under its first day", () => {
  const today = search.dayNumber(new Date(2026, 10, 5));
  const node = (text, extra = {}) => ({ id: "x", text, ...extra });
  assert.equal(hook.agendaGroupOf(node("!(2026-11-03 → 2026-11-07)"), today), "today");
  assert.equal(hook.agendaGroupOf(node("!(2026-11-06 → 2026-11-07)"), today), "tomorrow");
  assert.equal(hook.agendaGroupOf(node("!(2026-11-09 → 2026-11-12)"), today), "week");
  assert.equal(
    hook.agendaGroupOf(node("!(2026-10-20 → 2026-10-22)", { checked: false }), today),
    "overdue",
  );
  assert.equal(
    hook.agendaGroupOf(node("!(2026-10-20 → 2026-10-22)", { checked: true }), today),
    "earlier",
  );
});

test("ranges: the date sort reads the start; has:date counts them; HTML keeps the end", async () => {
  const details = search.outlinerDetails({ id: "r", text: "!(2026-11-03 → 2026-11-07)" });
  assert.equal(details.dates.length, 1);
  assert.ok(
    details.dates[0].end > details.dates[0].start,
    "the core sees a real range (start < end)",
  );
  const interchange = await load("/src/registry/outliner/interchange.ts");
  const html = interchange.exportOutlineHtml([
    { id: "r", text: "Offsite !(2026-11-03 → 2026-11-07)" },
  ]);
  assert.match(html, /data-end="2026-11-07"/);
  const { JSDOM } = await import("jsdom");
  const parse = (h) => new new JSDOM("").window.DOMParser().parseFromString(h, "text/html");
  const back = interchange.importOutlineHtml(html, () => "n", parse);
  assert.equal(
    back[0].text,
    "Offsite !(2026-11-03 → 2026-11-07)",
    "a range survives a copy/paste through HTML",
  );
});

/* ───────────── created: search ───────────── */

test("search: created: reads data.createdAt with the changed: words; created:week ≠ changed:week", () => {
  const now = new Date(2026, 10, 5, 12);
  const at = (days) => new Date(2026, 10, 5 + days, 10).getTime();
  const nodes = [
    { id: "new", text: "New today", data: { createdAt: at(0), editedAt: at(0) } },
    { id: "old-touched", text: "Old, edited today", data: { createdAt: at(-40), editedAt: at(0) } },
    { id: "yday", text: "Made yesterday", data: { createdAt: at(-1), editedAt: at(-1) } },
    { id: "unknown", text: "No stamps" },
  ];
  assert.deepEqual(ids(nodes, "created:today", now), ["new"]);
  assert.deepEqual(ids(nodes, "changed:today", now), ["new", "old-touched"]);
  assert.deepEqual(ids(nodes, "created:yesterday", now), ["yday"]);
  assert.deepEqual(ids(nodes, "created:week", now), ["new", "yday"]);
  assert.deepEqual(ids(nodes, "created:month", now), ["new", "yday"]);
  assert.deepEqual(ids(nodes, "created:2026-09-26", now), ["old-touched"]);
  assert.deepEqual(ids(nodes, "-created:month", now), ["old-touched", "unknown"]);
  assert.match(
    search.searchOutliner(nodes, "created:soon", { now }).diagnostics[0].message,
    /^created: takes today/,
  );
  assert.ok(
    search.searchSuggestions("crea").some((s) => s.label === "created:"),
    "the help strip offers it",
  );
  assert.ok(search.searchSuggestions("during:").length > 0);
});

/* ───────────── Timezones and daylight saving ───────────── */

const ZONES = [
  "America/New_York",
  "Europe/London",
  "Australia/Lord_Howe",
  "Asia/Kolkata",
  "Pacific/Chatham",
  "UTC",
];

test("tz: a token names a local calendar day in every zone; day numbers never skip or repeat", () => {
  for (const zone of ZONES)
    inZone(zone, () => {
      // Every day of 2026 (both DST transitions in each hemisphere) maps to consecutive day numbers.
      let previous = null;
      for (
        let d = new Date(2026, 0, 1);
        d.getFullYear() === 2026;
        d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      ) {
        const token = inline.formatDateToken(d);
        const parsed = date(token);
        assert.equal(inline.formatDateToken(parsed.value), token, `${zone} ${token} round-trips`);
        const day = search.dayNumber(parsed.value);
        if (previous !== null)
          assert.equal(day, previous + 1, `${zone}: ${token} follows the day before`);
        previous = day;
      }
    });
});

test("tz: due:today and the chip agree at 00:30 and 23:30 on DST days (local days, not 24 h buckets)", () => {
  const cases = [
    ["America/New_York", [2026, 2, 8]], // spring forward (23 h day)
    ["America/New_York", [2026, 10, 1]], // fall back (25 h day)
    ["Europe/London", [2026, 2, 29]],
    ["Europe/London", [2026, 9, 25]],
    ["Australia/Lord_Howe", [2026, 3, 5]], // a 30-minute shift
    ["Pacific/Chatham", [2026, 8, 27]], // +12:45 → +13:45
  ];
  for (const [zone, [y, m, d]] of cases)
    inZone(zone, () => {
      const token = inline.formatDateToken(new Date(y, m, d));
      const nodes = [{ id: "x", text: `Task ${token}` }];
      for (const [h, min] of [
        [0, 30],
        [23, 30],
      ]) {
        const now = new Date(y, m, d, h, min);
        assert.deepEqual(
          ids(nodes, "due:today", now),
          ["x"],
          `${zone} ${token} ${h}:${min} is today`,
        );
        assert.equal(inline.dateTone(date(token).value, now), "today");
        assert.equal(inline.formatDate(date(token), now), "Today");
        assert.deepEqual(ids(nodes, "due:overdue", now), []);
      }
      const nextMorning = new Date(y, m, d + 1, 0, 30);
      assert.deepEqual(
        ids(nodes, "due:overdue", nextMorning),
        ["x"],
        `${zone}: overdue right after local midnight`,
      );
      assert.equal(inline.formatDate(date(token), nextMorning), "Yesterday");
    });
});

test("tz: a daily 09:00 task stays at 09:00 across both New York transitions", () => {
  inZone("America/New_York", () => {
    let text = "Standup !(2026-03-06 09:00 every day)";
    const seen = [];
    for (let i = 0; i < 4; i++) {
      const now = date(text).value; // completed on time each day
      const next = hook.advanceRecurring(text, now);
      text = next.text;
      seen.push(text.match(/\((.+?) every/)[1]);
      assert.equal(next.next.getHours(), 9);
    }
    assert.deepEqual(seen, [
      "2026-03-07 09:00",
      "2026-03-08 09:00",
      "2026-03-09 09:00",
      "2026-03-10 09:00",
    ]);
    text = "Standup !(2026-10-31 09:00 every day)";
    text = hook.advanceRecurring(text, new Date(2026, 9, 31, 9)).text;
    assert.equal(
      text,
      "Standup !(2026-11-01 09:00 every day)",
      "fall back keeps the wall time too",
    );
  });
});

test("tz: a 02:30 task in the spring-forward gap keeps 02:30 afterwards (it does not drift to 03:30)", () => {
  inZone("America/New_York", () => {
    // 2026-03-08 02:30 does not exist in New York: that one occurrence happens at 03:30.
    let text = "Backup !(2026-03-07 02:30 every day)";
    let next = hook.advanceRecurring(text, new Date(2026, 2, 7, 3));
    assert.equal(
      next.text,
      "Backup !(2026-03-08 02:30 every day)",
      "the token keeps the time as written",
    );
    assert.equal(next.next.getHours(), 3, "the instant is the first valid moment, 03:30");
    next = hook.advanceRecurring(next.text, new Date(2026, 2, 8, 4));
    assert.equal(next.text, "Backup !(2026-03-09 02:30 every day)");
    assert.equal(next.next.getHours(), 2, "and the day after is 02:30 again");
    // Weekly and monthly across the gap behave the same way.
    assert.equal(
      hook.advanceRecurring("W !(2026-03-01 02:30 every week)", new Date(2026, 2, 1, 3)).text,
      "W !(2026-03-08 02:30 every week)",
    );
    assert.equal(
      hook.advanceRecurring("W !(2026-03-08 02:30 every week)", new Date(2026, 2, 8, 4)).text,
      "W !(2026-03-15 02:30 every week)",
    );
    assert.equal(
      hook.advanceRecurring("M !(2026-02-08 02:30 every month)", new Date(2026, 1, 8, 3)).text,
      "M !(2026-03-08 02:30 every month)",
    );
  });
});

test("tz: weekly and monthly steps keep the weekday and day of month in every zone", () => {
  for (const zone of ZONES)
    inZone(zone, () => {
      // Sunday Mar 1 every week: crosses each zone's March/April transition.
      let text = "!(2026-03-01 every week)";
      for (let i = 0; i < 10; i++) {
        text = hook.advanceRecurring(text, date(text).value).text;
        assert.equal(date(text).value.getDay(), 0, `${zone} ${text} is a Sunday`);
      }
      assert.equal(text, "!(2026-05-10 every week)");
      // Jan 31 every month: clamps to Feb 28, returns to Mar 31 (the intended day rides along).
      let monthly = "!(2026-01-31 every month)";
      const months = [];
      for (let i = 0; i < 3; i++) {
        monthly = hook.advanceRecurring(monthly, date(monthly).value).text;
        months.push(inline.dateTokenOf(date(monthly)).slice(2, 12));
      }
      assert.deepEqual(months, ["2026-02-28", "2026-03-31", "2026-04-30"], zone);
    });
});

test("tz: weekdays skip the weekend and 'next occurrence after a late completion' lands after today", () => {
  inZone("Europe/London", () => {
    const next = inline.nextOccurrence(
      date("!(2026-03-27 every weekday)"),
      new Date(2026, 2, 27, 10),
    );
    assert.equal(next.getDay(), 1, "Fri → Mon over the clocks-change weekend");
    assert.equal(next.getDate(), 30);
    const late = inline.nextOccurrence(
      date("!(2026-03-02 every week)"),
      new Date(2026, 2, 31, 23, 59),
    );
    assert.equal(inline.formatDateToken(late), "!(2026-04-06)", "never scheduled in the past");
  });
});

test("tz: a range spanning a DST change covers exactly its days", () => {
  inZone("America/New_York", () => {
    const nodes = [{ id: "r", text: "Trip !(2026-03-07 → 2026-03-09)" }];
    for (const [d, expect] of [
      [6, false],
      [7, true],
      [8, true],
      [9, true],
      [10, false],
    ])
      assert.equal(
        ids(nodes, `due:2026-03-${String(d).padStart(2, "0")}`, new Date(2026, 2, 1)).length === 1,
        expect,
        `Mar ${d}`,
      );
    const overnight = [{ id: "o", text: "Shift !(2026-11-01 00:30 → 2026-11-01 03:00)" }];
    assert.deepEqual(
      ids(overnight, "due:today", new Date(2026, 10, 1, 1, 30)),
      ["o"],
      "the 25-hour day",
    );
  });
});
