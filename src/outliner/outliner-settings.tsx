import * as React from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertTriangle,
  Keyboard,
  Pencil,
  RotateCcw,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { cn } from "../lib/utils.js";
import { motionTokens } from "../lib/motion.js";
import { useMediaQuery } from "../hooks/use-media-query.js";
import { useApplePlatform } from "../lib/platform.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog.js";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from "../components/ui/drawer.js";
import { useOutlinerContext } from "./context.js";
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  assignShortcut,
  checkAssignment,
  comboFromEvent,
  findConflicts,
  formatCombo,
  isOverridden,
  resetShortcut,
  shortcutDef,
  shortcutLabel,
  unbindShortcut,
  type AssignCheck,
  type ShortcutId,
} from "./keymap.js";
import type { OutlinerSettings } from "./settings.js";

/**
 * The settings panel: the one editor of the reader's preferences (density, text size, notes,
 * bullet click, keyboard profile, remapped shortcuts). A dialog on desktop, a bottom sheet on
 * touch. It edits `ui.settings` through `ui.updateSettings`; whether those are the host's
 * (controlled) or the outliner's own (uncontrolled) is decided in <Outliner>.
 */
export function OutlinerSettingsPanel() {
  const { ui } = useOutlinerContext();
  const coarse = useMediaQuery("(pointer: coarse)");
  const narrow = useMediaQuery("(max-width: 639px)");
  const [tab, setTab] = React.useState<"general" | "shortcuts">("general");
  /** Recording holds Escape for itself (cancel), so the panel must not close on it. */
  const recording = React.useRef(false);
  const L = ui.labels;
  const onEscape = (event: KeyboardEvent) => {
    if (recording.current) event.preventDefault();
  };
  const body = <SettingsBody tab={tab} onTab={setTab} recording={recording} />;
  if (coarse || narrow)
    return (
      <Drawer open={ui.settingsOpen} onOpenChange={ui.setSettingsOpen} autoFocus>
        <DrawerContent
          data-outliner-settings=""
          // Fixed (no jump between tabs) and just tall enough for General; Shortcuts scrolls inside.
          className="h-[min(86vh,600px)] max-h-[86vh] pb-[env(safe-area-inset-bottom)] outline-none"
          onEscapeKeyDown={onEscape}
          onCloseAutoFocus={(event) => ui.returnFocus(event)}
          // Focus lands in the sheet (Esc, screen readers), on the sheet itself: no ringed control.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.target as HTMLElement | null)?.focus?.({ preventScroll: true });
          }}
        >
          <DrawerHeader className="gap-0 px-4 pt-2 pb-2 text-start! md:text-start">
            <DrawerTitle className="text-[15px]">{L.settings}</DrawerTitle>
            <DrawerDescription className="text-[13px] leading-5">
              {L.settingsDescription}
            </DrawerDescription>
          </DrawerHeader>
          {body}
        </DrawerContent>
      </Drawer>
    );
  return (
    <Dialog open={ui.settingsOpen} onOpenChange={ui.setSettingsOpen}>
      <DialogContent
        data-outliner-settings=""
        // A fixed height (no jump between tabs) that fits General; Shortcuts scrolls inside it.
        className="flex h-[min(80vh,452px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-[34rem]"
        onEscapeKeyDown={onEscape}
        onCloseAutoFocus={(event) => ui.returnFocus(event)}
      >
        <DialogHeader className="gap-0.5 px-4 pt-4 pb-2">
          <DialogTitle className="text-[15px]">{L.settings}</DialogTitle>
          <DialogDescription className="text-ui">{L.settingsDescription}</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function SettingsBody({
  tab,
  onTab,
  recording,
}: {
  readonly tab: "general" | "shortcuts";
  readonly onTab: (tab: "general" | "shortcuts") => void;
  readonly recording: React.MutableRefObject<boolean>;
}) {
  const { ui } = useOutlinerContext();
  const L = ui.labels;
  return (
    <>
      <div className="px-4 pb-2">
        <Segmented
          label={L.settings}
          value={tab}
          onChange={onTab}
          options={[
            {
              value: "general",
              label: L.generalSettings,
              icon: <SlidersHorizontal className="size-3.5" />,
            },
            {
              value: "shortcuts",
              label: L.shortcutSettings,
              icon: <Keyboard className="size-3.5" />,
            },
          ]}
          id="settings-tab"
          tabs
          wide
        />
      </div>
      {/* Tabs cross-fade in one quick beat: the new tab rises in while the old one fades out
          over it (popLayout), so there is never a blank frame between them. */}
      <div className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-hairline">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={tab}
            id={`settings-panel-${tab}`}
            role="tabpanel"
            aria-labelledby={`settings-tab-${tab}`}
            data-settings-tab={tab}
            initial={{ opacity: 0, x: tab === "shortcuts" ? 8 : -8 }}
            animate={{ opacity: 1, x: 0, transition: motionTokens.quick }}
            exit={{ opacity: 0, transition: motionTokens.instant }}
          >
            {tab === "general" ? <GeneralSettings /> : <ShortcutSettings recording={recording} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </>
  );
}

function GeneralSettings() {
  const { ui } = useOutlinerContext();
  const apple = useApplePlatform();
  const coarse = useMediaQuery("(pointer: coarse)");
  const L = ui.labels;
  const s = ui.settings;
  const set =
    <K extends keyof OutlinerSettings>(key: K) =>
    (value: OutlinerSettings[K]) =>
      ui.updateSettings({ [key]: value } as Partial<OutlinerSettings>);
  return (
    <div className="divide-y divide-hairline px-4">
      <SettingRow label={L.density}>
        <Segmented
          id="density"
          label={L.density}
          value={s.density}
          onChange={set("density")}
          options={[
            { value: "compact", label: L.densityCompact },
            { value: "cozy", label: L.densityCozy },
          ]}
        />
      </SettingRow>
      <SettingRow label={L.fontSize}>
        <Segmented
          id="font"
          label={L.fontSize}
          value={s.fontSize}
          onChange={set("fontSize")}
          options={[
            {
              value: "small",
              label: L.fontSmall,
              icon: <span className="text-[11px] leading-none font-medium">A</span>,
              iconOnly: true,
            },
            {
              value: "default",
              label: L.fontDefault,
              icon: <span className="text-[13px] leading-none font-medium">A</span>,
              iconOnly: true,
            },
            {
              value: "large",
              label: L.fontLarge,
              icon: <span className="text-[16px] leading-none font-medium">A</span>,
              iconOnly: true,
            },
          ]}
        />
      </SettingRow>
      <SettingRow label={L.noteDisplay}>
        <Segmented
          id="notes"
          label={L.noteDisplay}
          value={s.noteDisplay}
          onChange={set("noteDisplay")}
          options={[
            { value: "show", label: L.notesShow },
            { value: "first-line", label: L.notesFirstLine },
            { value: "hide", label: L.notesHide },
          ]}
        />
      </SettingRow>
      <SettingRow
        label={L.bulletClick}
        hint={coarse ? L.bulletHintTouch : L.bulletHint(apple ? "⌥" : "Alt")}
      >
        <Segmented
          id="bullet"
          label={L.bulletClick}
          value={s.bulletClick}
          onChange={set("bulletClick")}
          options={[
            { value: "zoom", label: L.bulletZoom },
            { value: "fold", label: L.bulletFold },
          ]}
        />
      </SettingRow>
      <SettingRow label={L.keyboardProfile} hint={L.profileHint(s.keyboard === "power")}>
        <Segmented
          id="profile"
          label={L.keyboardProfile}
          value={s.keyboard}
          onChange={set("keyboard")}
          options={[
            { value: "standard", label: L.profileStandard },
            { value: "power", label: L.profilePower },
          ]}
        />
      </SettingRow>
    </div>
  );
}

function SettingRow({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint?: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 py-2.5 coarse:py-3">
      <div className="min-w-0 flex-1 basis-40">
        <div className="text-ui font-medium coarse:text-[15px]">{label}</div>
        {hint && (
          <div className="mt-0.5 text-2xs leading-4 text-muted-foreground coarse:text-[12px]">
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * A radio group drawn as segments with a sliding pill (arrow keys move, RTL aware). With `tabs`
 * it is the panel's section switcher instead: a tablist whose tabs name the panel they show.
 */
function Segmented<T extends string>({
  id,
  label,
  value,
  onChange,
  options,
  wide,
  tabs,
}: {
  readonly id: string;
  readonly label: string;
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly options: readonly {
    readonly value: T;
    readonly label: string;
    readonly icon?: React.ReactNode;
    readonly iconOnly?: boolean;
  }[];
  readonly wide?: boolean;
  readonly tabs?: boolean;
}) {
  const group = React.useRef<HTMLDivElement>(null);
  return (
    <div
      ref={group}
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      data-setting={id}
      className={cn(
        "relative flex h-8 shrink-0 items-center rounded-lg border border-hairline bg-muted/40 p-0.5 coarse:h-11",
        wide && "w-full",
      )}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        event.preventDefault();
        const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
        const forward = (event.key === "ArrowRight") !== rtl;
        const at = options.findIndex((option) => option.value === value);
        const next = options[(at + (forward ? 1 : options.length - 1)) % options.length]!;
        onChange(next.value);
        requestAnimationFrame(() =>
          group.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus(),
        );
      }}
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role={tabs ? "tab" : "radio"}
            id={tabs ? `${id}-${option.value}` : undefined}
            aria-selected={tabs ? on : undefined}
            aria-controls={tabs && on ? `settings-panel-${option.value}` : undefined}
            aria-checked={tabs ? undefined : on}
            aria-label={option.iconOnly ? option.label : undefined}
            title={option.iconOnly ? option.label : undefined}
            data-value={option.value}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex h-full items-center justify-center gap-1.5 rounded-md px-2.5 text-ui text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal/40 coarse:px-3.5 coarse:text-[14px]",
              option.iconOnly && "w-9 px-0 coarse:w-11",
              wide && "flex-1",
              on && "text-foreground",
            )}
          >
            {on && (
              <motion.span
                layoutId={`segment-${id}`}
                transition={motionTokens.layout}
                className="absolute inset-0 rounded-md border border-hairline bg-surface shadow-[0_1px_1px_rgb(0_0_0/0.05)]"
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {option.icon}
              {!option.iconOnly && option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── Shortcuts: record, check conflicts, resolve, reset ───────────── */

type Pending = { readonly id: ShortcutId; readonly check: AssignCheck };

function ShortcutSettings({
  recording: recordingRef,
}: {
  readonly recording: React.MutableRefObject<boolean>;
}) {
  const { ui } = useOutlinerContext();
  const apple = useApplePlatform();
  const L = ui.labels;
  const keymap = ui.keymap;
  const [filter, setFilter] = React.useState("");
  const filterRef = React.useRef<HTMLInputElement>(null);
  const [recording, setRecording] = React.useState<ShortcutId | null>(null);
  const [pending, setPending] = React.useState<Pending | null>(null);
  recordingRef.current = recording !== null;
  const conflicts = React.useMemo(() => findConflicts(keymap), [keymap]);
  const conflicted = new Map<ShortcutId, string>();
  for (const conflict of conflicts)
    for (const id of conflict.ids) conflicted.set(id, conflict.combo);
  const changed = SHORTCUTS.filter((def) => isOverridden(keymap, def.id)).length;
  const words = filter.trim().toLowerCase();
  const visible = SHORTCUTS.filter(
    (def) =>
      !words ||
      `${def.label} ${def.group} ${shortcutLabel(keymap, def.id, apple)}`
        .toLowerCase()
        .includes(words),
  );
  const save = (shortcuts: OutlinerSettings["shortcuts"]) => ui.updateSettings({ shortcuts });
  /*
   * One tab stop per section: ↑/↓ (Home/End) rove between its shortcuts, → / ← between a
   * shortcut and its reset button. Tab goes section to section instead of through 29 buttons.
   */
  const [roving, setRoving] = React.useState<Partial<Record<string, ShortcutId>>>({});
  const rove = (event: React.KeyboardEvent<HTMLUListElement>) => {
    if (recording !== null || event.altKey || event.metaKey || event.ctrlKey || event.shiftKey)
      return;
    const list = event.currentTarget;
    const at = (event.target as Element).closest("li");
    const recorders = [...list.querySelectorAll<HTMLElement>("[data-shortcut-record]")];
    const index = recorders.findIndex((el) => at?.contains(el));
    if (index < 0) return;
    const rtl = getComputedStyle(list).direction === "rtl";
    const inward = event.key === (rtl ? "ArrowLeft" : "ArrowRight");
    const outward = event.key === (rtl ? "ArrowRight" : "ArrowLeft");
    const target =
      event.key === "ArrowDown"
        ? recorders[Math.min(recorders.length - 1, index + 1)]
        : event.key === "ArrowUp"
          ? recorders[Math.max(0, index - 1)]
          : event.key === "Home"
            ? recorders[0]
            : event.key === "End"
              ? recorders.at(-1)
              : inward
                ? at?.querySelector<HTMLButtonElement>("[data-shortcut-reset]:not(:disabled)")
                : outward
                  ? recorders[index]
                  : null;
    if (event.key.startsWith("Arrow") || event.key === "Home" || event.key === "End")
      event.preventDefault();
    target?.focus();
  };

  const record = (id: ShortcutId, event: React.KeyboardEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") {
      setRecording(null);
      return;
    }
    if (
      (event.key === "Backspace" || event.key === "Delete") &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      save(unbindShortcut(keymap, id));
      setRecording(null);
      return;
    }
    const combo = comboFromEvent(event.nativeEvent);
    if (!combo) return; // a modifier alone: keep listening
    const check = checkAssignment(keymap, id, combo, ui.host.reservedShortcuts);
    setRecording(null);
    if (check.ok && !check.conflicts.length) {
      save(assignShortcut(keymap, id, check.combo));
      ui.announce(L.shortcutSaved(shortcutDef(id).label, formatCombo(check.combo, apple)));
      setPending(null);
    } else setPending({ id, check });
  };

  return (
    <div className="px-4 pt-2 pb-3">
      <div className="flex items-center gap-2">
        <label className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md border border-hairline bg-surface px-2 focus-within:border-signal/50 coarse:h-11">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={filterRef}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder={L.filterShortcuts}
            aria-label={L.filterShortcuts}
            className="h-full min-w-0 flex-1 bg-transparent text-ui outline-none placeholder:text-muted-foreground/60 coarse:text-[16px]"
          />
        </label>
        <button
          type="button"
          disabled={!changed}
          onClick={() => {
            save({});
            setPending(null);
            // The button disables itself: focus moves to the filter, never to <body> (Esc still closes).
            requestAnimationFrame(() => filterRef.current?.focus({ preventScroll: true }));
          }}
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-md px-2 text-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40 coarse:h-11"
        >
          <RotateCcw className="size-3.5" /> {L.resetAllShortcuts}
        </button>
      </div>
      <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] text-muted-foreground">
        <span>
          {keymap.profile === "power" ? L.profilePower : L.profileStandard} ·{" "}
          {L.shortcutsChanged(changed)}
        </span>
        <span className="max-sm:hidden">{L.recordHint}</span>
      </div>
      {SHORTCUT_GROUPS.map((group) => {
        const defs = visible.filter((def) => def.group === group);
        if (!defs.length) return null;
        const stop = defs.find((def) => def.id === roving[group]) ?? defs[0]!;
        return (
          <section key={group} className="mt-3">
            <h3 className="mb-0.5 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
              {group}
            </h3>
            <ul className="divide-y divide-hairline" aria-label={group} onKeyDown={rove}>
              {defs.map((def) => {
                const keys = keymap.bindings.get(def.id) ?? [];
                const shown = shortcutLabel(keymap, def.id, apple, ", ");
                const isRecording = recording === def.id;
                const open = pending?.id === def.id ? pending : null;
                const clash = conflicted.get(def.id);
                return (
                  <li key={def.id} data-shortcut={def.id} className="py-0.5">
                    <div className="flex min-h-8 items-center gap-2 coarse:min-h-12">
                      <span className="min-w-0 flex-1 truncate text-ui coarse:text-[15px]">
                        {def.label}
                      </span>
                      {clash && (
                        <span
                          title={L.shortcutConflict(formatCombo(clash, apple))}
                          className="text-warning"
                          data-shortcut-conflict=""
                        >
                          <AlertTriangle
                            className="size-3.5"
                            aria-label={L.shortcutConflict(formatCombo(clash, apple))}
                          />
                        </span>
                      )}
                      <button
                        type="button"
                        data-shortcut-record={def.id}
                        data-recording={isRecording ? "" : undefined}
                        tabIndex={stop.id === def.id ? 0 : -1}
                        onFocus={() =>
                          roving[group] !== def.id &&
                          setRoving((current) => ({ ...current, [group]: def.id }))
                        }
                        aria-label={L.changeShortcut(def.label, shown)}
                        onClick={() => {
                          setPending(null);
                          setRecording(isRecording ? null : def.id);
                        }}
                        onBlur={() => isRecording && setRecording(null)}
                        onKeyDown={(event) => {
                          if (isRecording) record(def.id, event);
                        }}
                        className={cn(
                          "group/rec flex h-7 max-w-[60%] shrink-0 items-center gap-1 rounded-md border border-transparent px-1.5 transition-colors outline-none hover:border-hairline hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-signal/40 coarse:h-11 coarse:px-2.5",
                          isRecording && "border-signal/60 bg-signal/[0.06]",
                        )}
                      >
                        {isRecording ? (
                          <span className="px-0.5 font-mono text-[11px] text-signal">
                            {L.recordShortcut}
                          </span>
                        ) : keys.length ? (
                          keys.map((combo) => (
                            <kbd
                              key={combo}
                              dir="ltr"
                              className={cn(
                                "rounded-[5px] border border-hairline bg-surface px-1.5 font-mono text-[11px] leading-5 text-foreground/85 shadow-[0_1px_0_var(--hairline)]",
                                clash === combo && "border-warning/60",
                              )}
                            >
                              {formatCombo(combo, apple)}
                            </kbd>
                          ))
                        ) : (
                          <span className="px-0.5 font-mono text-[11px] text-muted-foreground/70">
                            {L.noShortcut}
                          </span>
                        )}
                        <Pencil
                          className="size-3 shrink-0 text-muted-foreground/60 coarse:size-3.5"
                          aria-hidden
                        />
                      </button>
                      <button
                        type="button"
                        data-shortcut-reset=""
                        tabIndex={-1}
                        aria-label={L.resetShortcut(def.label)}
                        title={L.resetShortcut(def.label)}
                        disabled={!isOverridden(keymap, def.id)}
                        onClick={(event) => {
                          save(resetShortcut(keymap.overrides, def.id));
                          // This button hides once nothing is overridden: focus goes to the shortcut it reset.
                          const item = event.currentTarget.closest("li");
                          requestAnimationFrame(() =>
                            item
                              ?.querySelector<HTMLElement>("[data-shortcut-record]")
                              ?.focus({ preventScroll: true }),
                          );
                        }}
                        className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-[opacity,color,background-color] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-signal/40 disabled:pointer-events-none disabled:opacity-0 coarse:size-11"
                      >
                        <RotateCcw className="size-3.5" />
                      </button>
                    </div>
                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          key="pending"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={motionTokens.quick}
                          className="overflow-hidden"
                        >
                          <PendingNotice
                            pending={open}
                            apple={apple}
                            onReplace={() => {
                              if (open.check.ok)
                                save(
                                  assignShortcut(keymap, open.id, open.check.combo, {
                                    replace: true,
                                  }),
                                );
                              setPending(null);
                            }}
                            onCancel={() => setPending(null)}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

function PendingNotice({
  pending,
  apple,
  onReplace,
  onCancel,
}: {
  readonly pending: Pending;
  readonly apple: boolean;
  readonly onReplace: () => void;
  readonly onCancel: () => void;
}) {
  const { ui } = useOutlinerContext();
  const L = ui.labels;
  const check = pending.check;
  const keys = check.combo ? formatCombo(check.combo, apple) : "";
  const owner = (who: "fixed" | "host" | "browser", label: string) =>
    who === "browser" ? `the browser (${label})` : who === "host" ? `the app (${label})` : label;
  return (
    <div
      role="alert"
      data-shortcut-pending=""
      className={cn(
        "mb-1 flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 text-2xs",
        check.ok ? "bg-warning/10 text-foreground" : "bg-destructive/8 text-destructive",
      )}
    >
      <span className="min-w-0 flex-1">
        {check.ok
          ? L.shortcutTaken(keys, check.conflicts.map((id) => shortcutDef(id).label).join(", "))
          : check.reason === "reserved" && check.reserved
            ? L.shortcutReserved(keys, owner(check.reserved.owner, check.reserved.label))
            : L.needsModifier}
      </span>
      {check.ok && (
        <button
          type="button"
          onClick={onReplace}
          className="h-6 rounded-[5px] bg-foreground px-2 font-medium text-background transition-opacity hover:opacity-90 coarse:h-9"
        >
          {L.replaceShortcut}
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="h-6 rounded-[5px] px-2 text-muted-foreground hover:bg-muted hover:text-foreground coarse:h-9"
      >
        {check.ok ? L.cancel : "OK"}
      </button>
    </div>
  );
}
