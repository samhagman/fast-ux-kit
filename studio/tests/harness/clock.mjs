// A fixed calendar for every test: "today" is always the same day, wherever and whenever the
// suite runs, so date chips ("Today", "Yesterday"), next occurrences and relative labels never
// change as real time moves on. The clock still runs: elapsed time is real, so typing groups,
// timers and debounces behave as they do in the app.
//
//   node --import ./tests/harness/clock.mjs --test …   (package.json does this)
//   TEST_NOW=2026-12-31T23:59 node --test …            (another day, to try one)
//
const RealDate = globalThis.Date;

if (!RealDate.pinned) {
  const start = new RealDate(process.env.TEST_NOW ?? "2026-11-02T12:00:00").getTime();
  const began = RealDate.now();
  const now = () => start + (RealDate.now() - began);

  class PinnedDate extends RealDate {
    constructor(...args) {
      super(...(args.length ? args : [now()]));
    }
    static now() {
      return now();
    }
  }
  Object.defineProperty(PinnedDate, "pinned", { value: true });
  // Calling Date() without new gives the current time as a string, as it does natively.
  globalThis.Date = new Proxy(PinnedDate, { apply: () => new PinnedDate().toString() });
}
