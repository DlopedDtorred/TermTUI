import { StringDecoder } from "node:string_decoder";

export const ANSI = Object.freeze({
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", underline: "\x1b[4m",
  inverse: "\x1b[7m", colors: Object.freeze({
    black: 30, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36,
    white: 37, gray: 90, brightBlack: 90, brightRed: 91, brightGreen: 92,
    brightYellow: 93, brightBlue: 94, brightMagenta: 95, brightCyan: 96, brightWhite: 97
  })
});
const ESC = "\x1b";
const clamp = (n, min, max) => Math.min(Math.max(n, min), max);
const ansiPattern = /\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1b\\))/g;
export const stripAnsi = value => String(value ?? "").replace(ansiPattern, "");
const tokenize = value => {
  const text = String(value ?? "");
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    ansiPattern.lastIndex = i;
    const match = ansiPattern.exec(text);
    if (match?.index === i) {
      tokens.push({ ansi: match[0], width: 0 });
      i += match[0].length;
      continue;
    }
    const cp = text.codePointAt(i);
    const char = String.fromCodePoint(cp);
    tokens.push({ char, width: cpWidth(char) });
    i += char.length;
  }
  ansiPattern.lastIndex = 0;
  return tokens;
};
const cpWidth = char => {
  const n = char.codePointAt(0);
  if (!n || n < 32 || (n >= 0x7f && n < 0xa0) || n === 0x200b ||
      (n >= 0x300 && n <= 0x36f) || (n >= 0xfe00 && n <= 0xfe0f)) return 0;
  if ((n >= 0x1100 && n <= 0x115f) || n === 0x2329 || n === 0x232a ||
      (n >= 0x2e80 && n <= 0xa4cf) || (n >= 0xac00 && n <= 0xd7a3) ||
      (n >= 0xf900 && n <= 0xfaff) || (n >= 0xfe10 && n <= 0xfe6f) ||
      (n >= 0xff00 && n <= 0xff60) || (n >= 0xffe0 && n <= 0xffe6) ||
      (n >= 0x1f300 && n <= 0x1faff)) return 2;
  return 1;
};
export const visibleWidth = value => [...stripAnsi(value)].reduce((n, c) => n + cpWidth(c), 0);
export function style(value, color, options = {}) {
  const codes = [];
  if (options.bold) codes.push(ANSI.bold); if (options.dim) codes.push(ANSI.dim);
  if (options.underline) codes.push(ANSI.underline); if (options.inverse) codes.push(ANSI.inverse);
  if (ANSI.colors[color] != null) codes.push(`\x1b[${ANSI.colors[color]}m`);
  return codes.length ? `${codes.join("")}${value}${ANSI.reset}` : String(value);
}
export const themes = Object.freeze({
  default: Object.freeze({ primary: "cyan", muted: "gray", success: "green", warning: "yellow", danger: "red", text: "white" }),
  dark: Object.freeze({ primary: "brightCyan", muted: "brightBlack", success: "brightGreen", warning: "brightYellow", danger: "brightRed", text: "brightWhite" })
});
export function fit(value, width, ellipsis = "…") {
  width = Math.max(0, Math.floor(Number(width) || 0));
  const raw = String(value ?? ""), current = visibleWidth(raw);
  if (current <= width) return raw + " ".repeat(width - current);
  if (!width) return "";
  const mark = String(ellipsis ?? ""), markWidth = visibleWidth(mark);
  if (markWidth >= width) {
    let out = "";
    for (const token of tokenize(mark)) {
      if (token.width && visibleWidth(out) + token.width > width) break;
      out += token.ansi ?? token.char;
    }
    return out;
  }
  let out = "", used = 0;
  for (const token of tokenize(raw)) {
    if (token.ansi) { out += token.ansi; continue; }
    if (used + token.width > width - markWidth) break;
    out += token.char;
    used += token.width;
  }
  return `${out}${mark}${" ".repeat(Math.max(0, width - used - markWidth))}${ANSI.reset}`;
}
export function wrap(value, width) {
  width = Math.max(1, Number(width) || 1);
  return String(value ?? "").split("\n").flatMap(line => {
    if (!line) return [""];
    const result = []; let current = "";
    for (const word of line.split(/\s+/)) {
      if (visibleWidth(word) > width) {
        if (current) result.push(current); current = "";
        for (const c of word) { if (visibleWidth(current + c) > width) { result.push(current); current = ""; } current += c; }
      } else if (!current) current = word;
      else if (visibleWidth(`${current} ${word}`) <= width) current += ` ${word}`;
      else { result.push(current); current = word; }
    }
    if (current || !result.length) result.push(current); return result;
  });
}
const lines = (value, width, height) => Array.from({ length: Math.max(0, height) }, (_, i) => fit(value[i] ?? "", width));
const borderSets = {
  single: ["┌", "┐", "└", "┘", "─", "│"], double: ["╔", "╗", "╚", "╝", "═", "║"],
  rounded: ["╭", "╮", "╰", "╯", "─", "│"], bold: ["┏", "┓", "┗", "┛", "━", "┃"]
};

export class Widget {
  constructor(props = {}) { this.props = typeof props === "object" ? { ...props } : {}; this.parent = null; this.children = []; this.focusable = !!this.props.focusable; this.visible = this.props.visible !== false; }
  get app() { return this.parent?.app ?? this._app ?? null; }
  get width() { return this.props.width ?? this.props.size; } get height() { return this.props.height ?? this.props.size; }
  get minWidth() { return Number(this.props.minWidth ?? 0) || 0; } get maxWidth() { return Number(this.props.maxWidth ?? Infinity); }
  get minHeight() { return Number(this.props.minHeight ?? 0) || 0; } get maxHeight() { return Number(this.props.maxHeight ?? Infinity); }
  add(...children) {
    for (const child of children.flat(Infinity)) {
      if (!(child instanceof Widget)) throw new TypeError("Children must be TermTUI widgets");
      if (child === this || child.contains(this)) throw new Error("Cannot create a widget cycle");
      if (child.parent) child.parent.remove(child);
      child.parent = this; this.children.push(child);
      if (this.app) child.mount(this.app);
    }
    return this.invalidate();
  }
  contains(widget) { return this.children.some(child => child === widget || child.contains(widget)); }
  remove(child) { const i = this.children.indexOf(child); if (i >= 0) { this.children.splice(i, 1); child.parent = null; child.onUnmount?.(); this.invalidate(); } return this; }
  clear() { this.children.forEach(c => { c.parent = null; c.onUnmount?.(); }); this.children = []; return this.invalidate(); }
  invalidate() { this.props.onChange?.(this); this.app?.requestRender(); return this; }
  mount(app) { this._app = app; this.children.forEach(c => c.mount(app)); this.onMount?.(app); return this; }
  unmount() { this.children.forEach(c => c.unmount()); this.onUnmount?.(); this._app = null; }
  render(width = 80, height = 24) { return lines([], width, height); }
  focus() { return this.app?.focus(this) ?? false; }
  emit(type, ...args) {
    let node = this;
    while (node) {
      const handler = node.props[`on${type[0].toUpperCase()}${type.slice(1)}`];
      if (handler?.(...args, this) === true) return true;
      node = node.parent;
    }
    return false;
  }
}
export class Text extends Widget {
  constructor(props = {}) { super(typeof props === "string" ? { content: props } : props); }
  render(width = 80, height = 24) { return lines(wrap(this.props.content ?? "", width).map(x => style(x, this.props.color, this.props)), width, height); }
}
export class Spacer extends Widget {}
export class Progress extends Widget {
  constructor(props = {}, legacyColor) { if (typeof props === "number") props = { value: props, color: legacyColor }; super(props); this.value = clamp(Number(props.value ?? 0) || 0, 0, 1); }
  setValue(v) { this.value = clamp(Number(v) || 0, 0, 1); return this.invalidate(); }
  render(width = 80, height = 1) { const n = Math.round(width * this.value); return lines([style("█".repeat(n) + "░".repeat(Math.max(0, width - n)), this.props.color ?? "green", this.props)], width, height); }
}
export const Keys = Object.freeze({
  UP: "\x1b[A", DOWN: "\x1b[B", RIGHT: "\x1b[C", LEFT: "\x1b[D", HOME: "\x1b[H", END: "\x1b[F",
  PAGE_UP: "\x1b[5~", PAGE_DOWN: "\x1b[6~", DELETE: "\x1b[3~", ENTER: "\r", ESCAPE: ESC,
  BACKSPACE: "\x7f", TAB: "\t", SHIFT_TAB: "\x1b[Z", SPACE: " ", CTRL_C: "\u0003",
  CTRL_A: "\u0001", CTRL_E: "\u0005", CTRL_U: "\u0015", CTRL_W: "\u0017"
});
export class List extends Widget {
  constructor(items = [], props = {}) { if (!Array.isArray(items)) { props = items; items = props.items ?? []; } super({ ...props, focusable: true }); this.items = [...items]; this.selected = clamp(Number(props.selected ?? 0), 0, Math.max(0, this.items.length - 1)); this.offset = 0; }
  get value() { return this.items[this.selected]; }
  setItems(items) { if (!Array.isArray(items)) throw new TypeError("List items must be an array"); this.items = [...items]; this.selected = clamp(this.selected, 0, Math.max(0, items.length - 1)); return this.invalidate(); }
  select(i) { const n = clamp(Number(i) || 0, 0, Math.max(0, this.items.length - 1)); if (n !== this.selected) { this.selected = n; this.props.onSelect?.(this.value, n); this.emit("select", this.value, n); this.invalidate(); } return this; }
  move(n) { return this.select(this.selected + (Number(n) || 0)); }
  handleKey(key) { if (key === Keys.UP || key === Keys.LEFT) return this.move(-1); if (key === Keys.DOWN || key === Keys.RIGHT) return this.move(1); if (key === Keys.HOME) return this.select(0); if (key === Keys.END) return this.select(this.items.length - 1); return this; }
  onKey(key) { return this.handleKey(key); }
  render(width = 80, height = 24) { const marker = this.props.marker ?? "› "; const rows = this.items.map((item, i) => { const label = typeof item === "object" ? item?.label ?? item?.name ?? "" : item; const active = i === this.selected; return style(`${active ? marker : " ".repeat(visibleWidth(marker))}${label}`, active ? (this.props.activeColor ?? "cyan") : this.props.color, active ? { ...this.props, bold: this.props.boldActive ?? true } : this.props); }); const visible = Math.max(1, height); this.offset = clamp(this.selected - Math.floor(visible / 2), 0, Math.max(0, rows.length - visible)); return lines(rows.slice(this.offset, this.offset + visible), width, height); }
}
export class Input extends Widget {
  constructor(props = {}) { super({ ...props, focusable: true }); this.value = String(props.value ?? ""); this.cursor = this.value.length; this.placeholder = props.placeholder ?? ""; }
  invalidate() { this.app?.requestRender(); return this; }
  setValue(value) { this.value = String(value ?? ""); this.cursor = clamp(this.cursor, 0, this.value.length); this.props.onChange?.(this.value, this); return this.invalidate(); }
  onKey(key) {
    const chars = [...this.value], index = chars.findIndex((_, i) => chars.slice(0, i).reduce((n, c) => n + c.length, 0) >= this.cursor);
    const before = chars.slice(0, index < 0 ? chars.length : index);
    if (key === Keys.LEFT) this.cursor = before.length ? before.slice(0, -1).reduce((n, c) => n + c.length, 0) : 0;
    else if (key === Keys.RIGHT) this.cursor = Math.min(this.value.length, this.cursor + (chars[index]?.length ?? 0));
    else if (key === Keys.HOME || key === Keys.CTRL_A) this.cursor = 0;
    else if (key === Keys.END || key === Keys.CTRL_E) this.cursor = this.value.length;
    else if (key === Keys.BACKSPACE && this.cursor) { const prev = before.at(-1); const size = prev?.length ?? 1; this.value = this.value.slice(0, this.cursor - size) + this.value.slice(this.cursor); this.cursor -= size; }
    else if (key === Keys.DELETE) { const next = chars[index]; if (next) this.value = this.value.slice(0, this.cursor) + this.value.slice(this.cursor + next.length); }
    else if (key === Keys.ENTER) { this.props.onSubmit?.(this.value); this.emit("submit", this.value); }
    else if ([...String(key)].length === 1 && key >= " ") { this.value = this.value.slice(0, this.cursor) + key + this.value.slice(this.cursor); this.cursor += key.length; }
    else return false;
    this.props.onChange?.(this.value, this); return this.invalidate();
  }
  render(width = 80, height = 1) {
    const content = this.value || (this.app?.focused === this ? "" : this.placeholder);
    if (this.app?.focused !== this) return lines([fit(content, width)], width, height);
    const prefix = this.value.slice(0, this.cursor), available = Math.max(0, width - 1);
    const start = visibleWidth(prefix) > available ? Math.max(0, prefix.length - available) : 0;
    const shown = fit(this.value.slice(start), available, "");
    const cursor = Math.min(available, visibleWidth(this.value.slice(start, this.cursor)));
    let before = "", after = "", used = 0;
    for (const char of shown) {
      const size = cpWidth(char);
      if (used < cursor && used + size <= cursor) before += char;
      else if (used >= cursor) after += char;
      used += size;
    }
    return lines([before + (after ? after[0] : " ") + after.slice(after ? after[0].length : 0)], width, height);
  }
}
export class Button extends Widget {
  constructor(props = {}) { super({ ...props, focusable: true }); this.label = props.label ?? props.text ?? ""; }
  onKey(key) { if (key === Keys.ENTER || key === Keys.SPACE) { this.props.onPress?.(this); this.emit("press"); return this.invalidate(); } return false; }
  render(width = 20, height = 1) { return lines([style(`[ ${this.label} ]`, this.props.color ?? "cyan", { ...this.props, bold: true, inverse: this.app?.focused === this })], width, height); }
}
export class Checkbox extends Widget {
  constructor(props = {}) { super({ ...props, focusable: true }); this.checked = !!props.checked; this.label = props.label ?? ""; }
  invalidate() { this.app?.requestRender(); return this; }
  toggle() { this.checked = !this.checked; this.props.onChange?.(this.checked, this); this.emit("change", this.checked); return this.invalidate(); }
  onKey(key) { if (key === Keys.SPACE || key === Keys.ENTER) return this.toggle(); return false; }
  render(width = 30, height = 1) { return lines([style(`${this.checked ? "☑" : "☐"} ${this.label}`, this.props.color ?? "white", this.app?.focused === this ? { inverse: true } : this.props)], width, height); }
}
export class Select extends List {
  constructor(items = [], props = {}) { super(items, props); this.open = false; }
  onKey(key) { if (key === Keys.ENTER || key === Keys.SPACE) { this.open = !this.open; return this.invalidate(); } return super.onKey(key); }
  render(width = 30, height = 1) { if (!this.open) return lines([`${this.props.label ?? ""}${this.value?.label ?? this.value ?? ""} ▾`], width, height); return super.render(width, height); }
}
export class Table extends Widget {
  constructor(props = {}) { super(props); this.columns = props.columns ?? []; this.rows = props.rows ?? []; this.offset = 0; }
  setRows(rows) { this.rows = rows ?? []; return this.invalidate(); }
  render(width = 80, height = 10) { const widths = this.columns.map(c => Number(c.width) || Math.max(1, visibleWidth(c.label ?? c.key ?? ""))); const head = this.columns.map((c, i) => fit(c.label ?? c.key ?? "", widths[i])).join(" "); const body = this.rows.map(row => this.columns.map((c, i) => fit(row[c.key] ?? row[i] ?? "", widths[i])).join(" ")); return lines([style(head, this.props.headerColor ?? "cyan", { bold: true }), ...body], width, height); }
}
export class Tabs extends List {
  constructor(items = [], props = {}) { super(items, props); }
  render(width = 80, height = 1) { return lines([this.items.map((item, i) => style(` ${typeof item === "object" ? item.label : item} `, i === this.selected ? (this.props.activeColor ?? "cyan") : this.props.color, i === this.selected ? { underline: true, bold: true } : {})).join(" ")], width, height); }
}
export class Log extends Widget {
  constructor(props = {}) { super(props); this.entries = [...(props.entries ?? [])]; this.follow = props.follow !== false; }
  write(message) { this.entries.push(String(message)); if (this.entries.length > (this.props.maxEntries ?? 1000)) this.entries.shift(); return this.invalidate(); }
  render(width = 80, height = 10) { const start = Math.max(0, this.entries.length - height); return lines(this.entries.slice(start), width, height); }
}
export class Box extends Widget {
  constructor(props = {}) { super(props); this.direction = props.direction ?? "column"; }
  render(width = 80, height = 24) {
    width = Math.max(0, width); height = Math.max(0, height); const border = this.props.border; const edge = border ? 2 : 0; const pad = Math.max(0, Number(this.props.padding ?? 0) || 0);
    const iw = Math.max(0, width - edge - pad * 2), ih = Math.max(0, height - edge - pad * 2), row = this.direction === "row", gap = Math.max(0, Number(this.props.gap ?? 0) || 0);
    const kids = this.children.filter(c => c.visible); const total = (row ? iw : ih) - gap * Math.max(0, kids.length - 1);
    const fixed = kids.reduce((s, c) => s + (Number(row ? c.width : c.height) || 0), 0);
    const flex = kids.filter(c => (row ? c.width : c.height) == null).length;
    let rem = Math.max(0, total - fixed);
    const sizes = kids.map(c => {
      const explicit = row ? c.width : c.height;
      const n = explicit == null ? (flex ? Math.floor(rem / flex) : 0) : Number(explicit) || 0;
      if (explicit == null) rem -= n;
      return clamp(n, row ? c.minWidth : c.minHeight, row ? Math.min(c.maxWidth, iw) : Math.min(c.maxHeight, ih));
    });
    const body = Array.from({ length: ih }, () => ""); let cursor = 0;
    kids.forEach((child, i) => {
      const size = sizes[i], rendered = child.render(row ? size : iw, row ? ih : size);
      const align = child.props.align ?? this.props.align ?? "start";
      rendered.forEach((line, y) => {
        if (row) {
          const offset = align === "end" ? Math.max(0, ih - rendered.length) : align === "center" ? Math.max(0, Math.floor((ih - rendered.length) / 2)) : 0;
          if (y + offset < ih) body[y + offset] += fit(line, size) + (i < kids.length - 1 ? " ".repeat(gap) : "");
        } else if (cursor + y < ih) {
          const fitted = fit(line, iw);
          body[cursor + y] = align === "end" ? `${" ".repeat(Math.max(0, iw - visibleWidth(fitted)))}${fitted}` :
            align === "center" ? `${" ".repeat(Math.max(0, Math.floor((iw - visibleWidth(fitted)) / 2)))}${fitted}` : fitted;
        }
      });
      if (!row) cursor += size + gap;
    });
    const content = Array.from({ length: pad }, () => " ".repeat(iw)).concat(body.map(x => " ".repeat(pad) + fit(x, iw) + " ".repeat(pad)), Array.from({ length: pad }, () => " ".repeat(iw)));
    if (!border) return lines(content, width, height);
    const g = typeof border === "string" ? borderSets[border] ?? borderSets.single : borderSets.single; const inner = Math.max(0, width - 2); const title = this.props.title ? ` ${this.props.title} ` : ""; const top = `${g[0]}${fit(title, inner, "").replace(/ /g, g[4])}${g[1]}`; const bottom = `${g[2]}${g[4].repeat(inner)}${g[3]}`;
    return lines([top, ...content.slice(0, Math.max(0, height - 2)).map(x => `${g[5]}${fit(x, inner)}${g[5]}`), bottom], width, height);
  }
}
function parseInput(buffer) { const m = buffer.match(/^(?:\x1b\[[0-9;?]*[ -/]*[@-~]|\x1bO[0-9;]*[ -/]*[@-~])/); if (m) return [m[0], buffer.slice(m[0].length)]; if (/^\x1b(?:\[|O)$/.test(buffer)) return null; const c = [...buffer][0]; return [c, buffer.slice(c.length)]; }
export class App {
  constructor({ root, input = process.stdin, output = process.stdout, alternateScreen = false, fps = 30 } = {}) {
    if (!(root instanceof Widget)) throw new TypeError("App requires a root Widget");
    this.root = root; this.input = input; this.output = output; this.alternateScreen = alternateScreen;
    this.fps = fps; this.onKey = null; this.onResize = null; this.onError = null; this.started = false;
    this.focused = null; this._focusScope = null; this.overlays = []; this.keymaps = []; this.actions = new Map();
    this._status = null; this._dirty = true; this._previous = []; this._buffer = ""; this._timers = new Set();
    this._decoder = new StringDecoder("utf8"); this._handleData = d => this._handleInput(this._decoder.write(d));
    this._handleResize = () => { this.onResize?.(this.width, this.height, this); this.requestRender(); };
    this._handleSignal = () => this.stop();
  }
  get width() { return this.output.columns || 80; } get height() { return this.output.rows || 24; }
  requestRender() { this._dirty = true; if (this.started && !this._queued) { this._queued = true; queueMicrotask(() => { this._queued = false; if (this._dirty) this.render(); }); } return this; }
  _handleInput(data) { this._buffer += data; while (this._buffer) { const p = parseInput(this._buffer); if (!p) break; this._buffer = p[1]; this.handleKey(p[0]); } if (this._buffer === ESC) { clearTimeout(this._escTimer); this._escTimer = setTimeout(() => { if (this._buffer === ESC) { this._buffer = ""; this.handleKey(ESC); } }, 40); } }
  focus(widget) { if (widget && !widget.focusable) return false; if (this.focused === widget) return true; this.focused?.props.onBlur?.(this.focused); this.focused = widget; widget?.props.onFocus?.(widget); this.requestRender(); return true; }
  focusables() { const out = []; const walk = w => { if (w.focusable && w.visible) out.push(w); w.children.forEach(walk); }; walk(this._focusScope ?? (this.overlays.at(-1) ?? this.root)); return out; }
  focusNext(reverse = false) { const a = this.focusables(); if (!a.length) return false; const i = a.indexOf(this.focused); return this.focus(a[(i + (reverse ? -1 : 1) + a.length) % a.length]); }
  handleKey(key) {
    if (key === Keys.CTRL_C) return this.stop();
    if (key === Keys.ESCAPE && this.overlays.length) { this.popOverlay(); return true; }
    if (key === Keys.TAB) return this.focusNext();
    if (key === Keys.SHIFT_TAB) return this.focusNext(true);
    for (const map of [...this.keymaps].reverse()) {
      const action = map[key] ?? map[String(key)];
      if (action) {
        const result = typeof action === "function" ? action(this, key) : this.dispatch(action, key);
        if (result !== false) { this.requestRender(); return result; }
      }
    }
    let result = this.focused?.onKey?.(key);
    if (result === false || result == null) result = this.onKey?.(key, this);
    if (result?.then) result.catch(error => this._handleError(error));
    this.requestRender(); return result;
  }
  _handleError(error) { if (this.onError?.(error, this) !== true) this.stop(); }
  render() {
    if (!this.started) return this;
    let next;
    try {
      next = lines(this.root.render(this.width, this.height), this.width, this.height);
      for (const overlay of this.overlays) {
        const rendered = lines(overlay.render(this.width, this.height), this.width, this.height);
        next = rendered.map((line, i) => line.trim() ? line : next[i]);
      }
      if (this._status) next[this.height - 1] = fit(this._status, this.width);
    }
    catch (error) { this._handleError(error); return this; }
    let out = ""; if (!this._previous.length) out += "\x1b[2J";
    next.forEach((line, i) => { if (line !== this._previous[i]) out += `\x1b[${i + 1};1H${line}\x1b[K`; });
    if (out) this.output.write(`${out}\x1b[?25l`);
    this._previous = next; this._dirty = false; return this;
  }
  start() {
    if (this.started) return this;
    this.started = true; this.root.mount(this); this.focus(this.focusables()[0]);
    try {
      if (this.alternateScreen) this.output.write("\x1b[?1049h");
      if (this.input.isTTY) { this.input.setRawMode?.(true); this.input.resume?.(); this.input.on?.("data", this._handleData); }
      this.output.on?.("resize", this._handleResize); process.once?.("SIGINT", this._handleSignal); process.once?.("SIGTERM", this._handleSignal);
      this.render();
    } catch (error) { this._handleError(error); }
    return this;
  }
  stop(error) {
    if (!this.started) return this; this.started = false; clearTimeout(this._escTimer);
    for (const timer of this._timers) { clearTimeout(timer); clearInterval(timer); } this._timers.clear();
    this.input.off?.("data", this._handleData); this.input.setRawMode?.(false); this.input.pause?.();
    this.output.off?.("resize", this._handleResize); process.off?.("SIGINT", this._handleSignal); process.off?.("SIGTERM", this._handleSignal);
    this.focus(null); this.root.unmount(); this.output.write(`${this.alternateScreen ? "\x1b[?1049l" : ""}\x1b[?25h\x1b[0m\n`);
    if (error && this.onError?.(error, this) !== true) queueMicrotask(() => { throw error; }); return this;
  }
  setInterval(fn, ms) { const timer = setInterval(() => { if (this.started) { try { fn(this); } catch (error) { this._handleError(error); } } }, ms); this._timers.add(timer); return timer; }
  setTimeout(fn, ms) { const timer = setTimeout(() => { this._timers.delete(timer); if (this.started) { try { fn(this); } catch (error) { this._handleError(error); } } }, ms); this._timers.add(timer); return timer; }
  dispatch(action, ...args) { const fn = this.actions.get(action); return fn ? fn(this, ...args) : false; }
  registerAction(name, handler) { if (typeof handler !== "function") throw new TypeError("Action handler must be a function"); this.actions.set(name, handler); return this; }
  addKeymap(map) { this.keymaps.push(map ?? {}); return this; }
  setStatus(value) { this._status = value == null ? null : String(value); return this.requestRender(); }
  pushOverlay(widget) {
    if (!(widget instanceof Widget)) throw new TypeError("Overlay must be a Widget");
    this.overlays.push(widget); if (this.started) widget.mount(this);
    const focusable = (() => { const walk = w => w.focusable ? w : w.children.map(walk).find(Boolean); return walk(widget); })();
    this.focus(focusable ?? null); return this.requestRender();
  }
  popOverlay() { const widget = this.overlays.pop(); if (widget) { widget.unmount(); this.focus(this.focusables()[0] ?? null); this.requestRender(); } return widget; }
  setFocusScope(widget = null) { this._focusScope = widget; this.focus(this.focusables()[0] ?? null); return this.requestRender(); }
  withFocusScope(widget, callback) { const previous = this._focusScope; this.setFocusScope(widget); try { return callback?.(this); } finally { this.setFocusScope(previous); } }
}
export const colors = ANSI.colors;

/** A two-pane container with a fixed or proportional divider. */
export class SplitPane extends Box {
  constructor(props = {}) { super({ ...props, direction: "row" }); this.ratio = clamp(Number(props.ratio ?? 0.5), 0, 1); }
  render(width = 80, height = 24) {
    if (this.children.length > 1 && this.children.every(c => c.width == null)) {
      const divider = Number(this.props.divider ?? 1) || 0;
      const available = Math.max(0, width - divider);
      this.children[0].props.width = Math.floor(available * this.ratio);
      this.children[1].props.width = Math.max(0, available - this.children[0].props.width);
    }
    return super.render(width, height);
  }
  setRatio(value) { this.ratio = clamp(Number(value) || 0, 0, 1); return this.invalidate(); }
}

/** A scrollable viewport for arbitrary child content. */
export class ScrollView extends Widget {
  constructor(props = {}) { super(props); this.offset = 0; this.scrollTop = 0; }
  scrollBy(amount) { this.offset = Math.max(0, this.offset + (Number(amount) || 0)); this.scrollTop = this.offset; return this.invalidate(); }
  scrollTo(offset) { this.offset = Math.max(0, Number(offset) || 0); this.scrollTop = this.offset; return this.invalidate(); }
  onKey(key) { if (key === Keys.UP) return this.scrollBy(-1); if (key === Keys.DOWN) return this.scrollBy(1); if (key === Keys.PAGE_UP) return this.scrollBy(-10); if (key === Keys.PAGE_DOWN) return this.scrollBy(10); return false; }
  render(width = 80, height = 24) {
    const content = this.children.length === 1 ? this.children[0].render(width, Math.max(height, this.offset + height)) : this.children.flatMap(c => c.render(width, height));
    const max = Math.max(0, content.length - height); this.offset = clamp(this.offset, 0, max); this.scrollTop = this.offset;
    return lines(content.slice(this.offset), width, height);
  }
}

export class ScrollableList extends List {
  constructor(items = [], props = {}) { super(items, props); this.offset = 0; }
  scrollBy(amount) { this.offset = clamp(this.offset + (Number(amount) || 0), 0, Math.max(0, this.items.length - 1)); return this.invalidate(); }
  onKey(key) { if (key === Keys.PAGE_UP) return this.scrollBy(-10); if (key === Keys.PAGE_DOWN) return this.scrollBy(10); return super.onKey(key); }
}

/** Bounded streaming log with explicit scrollback and follow mode. */
export class ScrollableLog extends Log {
  constructor(props = {}) { super(props); this.offset = 0; this.follow = props.follow !== false; }
  write(message) { super.write(message); if (this.follow) this.offset = Math.max(0, this.entries.length - 1); return this; }
  scrollBy(amount, height = 10) { this.follow = false; this.offset = clamp(this.offset + (Number(amount) || 0), 0, Math.max(0, this.entries.length - height)); return this.invalidate(); }
  onKey(key) { if (key === Keys.UP) return this.scrollBy(-1); if (key === Keys.DOWN) return this.scrollBy(1); if (key === Keys.PAGE_UP) return this.scrollBy(-10); if (key === Keys.PAGE_DOWN) return this.scrollBy(10); return false; }
  render(width = 80, height = 10) { const start = this.follow ? Math.max(0, this.entries.length - height) : clamp(this.offset, 0, Math.max(0, this.entries.length - height)); this.offset = start; return lines(this.entries.slice(start), width, height); }
}

export class MultilineEditor extends Input {
  constructor(props = {}) { super(props); this.history = [...(props.history ?? [])]; this.historyIndex = this.history.length; this.multiline = true; }
  pushHistory(value = this.value) { if (value && this.history.at(-1) !== value) this.history.push(value); this.historyIndex = this.history.length; return this; }
  onKey(key) {
    if (key === Keys.UP && this.history.length && !this.value.includes("\n")) { this.historyIndex = Math.max(0, this.historyIndex - 1); this.setValue(this.history[this.historyIndex] ?? ""); return true; }
    if (key === Keys.DOWN && this.history.length && !this.value.includes("\n")) { this.historyIndex = Math.min(this.history.length, this.historyIndex + 1); this.setValue(this.history[this.historyIndex] ?? ""); return true; }
    if (key === Keys.ENTER) { if (this.props.submitOnEnter !== false) { this.pushHistory(); this.props.onSubmit?.(this.value); this.emit("submit", this.value); } else { this.value = this.value.slice(0, this.cursor) + "\n" + this.value.slice(this.cursor); this.cursor++; this.invalidate(); } return true; }
    return super.onKey(key);
  }
  render(width = 80, height = 4) { return lines(this.value || this.placeholder ? this.value.split("\n").flatMap(line => wrap(line, width)) : [""], width, height); }
}

export class Modal extends Box {
  constructor(props = {}) { super({ ...props, border: props.border ?? "rounded", padding: props.padding ?? 1, align: "center" }); this.focusable = false; }
}

export class CommandPalette extends Modal {
  constructor(commands = [], props = {}) {
    super(props); this.commands = commands; this.query = new Input({ placeholder: props.placeholder ?? "Search commands…" }); this.results = new List([], { activeColor: props.activeColor ?? "cyan", onSelect: value => this.props.onSelect?.(value) }); this.add(this.query, this.results); this.query.props.onChange = value => this.filter(value); this.filter("");
  }
  filter(query) { const q = String(query).toLowerCase(); this.results.setItems(this.commands.filter(c => String(c.label ?? c.title ?? c).toLowerCase().includes(q))); return this; }
  onKey(key) { if (key === Keys.ENTER) { const command = this.results.value; if (command) this.props.onCommand?.(command); return true; } return false; }
}

export class StatusBar extends Widget {
  constructor(props = {}) { super(props); this.items = props.items ?? []; }
  setItems(items) { this.items = items ?? []; return this.invalidate(); }
  render(width = 80, height = 1) { return lines([this.items.map(item => typeof item === "string" ? item : item.label ?? "").join("  ")], width, height); }
}

export class Diff extends Widget {
  constructor(props = {}) { super(props); this.before = String(props.before ?? ""); this.after = String(props.after ?? ""); }
  set({ before = this.before, after = this.after } = {}) { this.before = String(before); this.after = String(after); return this.invalidate(); }
  render(width = 80, height = 10) {
    const oldLines = this.before.split("\n"), newLines = this.after.split("\n"), out = [];
    const max = Math.max(oldLines.length, newLines.length);
    for (let i = 0; i < max; i++) {
      const a = oldLines[i], b = newLines[i];
      if (a === b) out.push(style(`  ${a ?? ""}`, this.props.color));
      else {
        if (a != null) out.push(style(`- ${a}`, this.props.removeColor ?? "red"));
        if (b != null) out.push(style(`+ ${b}`, this.props.addColor ?? "green"));
      }
    }
    return lines(out, width, height);
  }
}

export const renderDiff = (before, after, width = 80, height = 10, props = {}) =>
  new Diff({ ...props, before, after }).render(width, height);
export const Overlay = Modal;
export const Editor = MultilineEditor;
export const CommandMenu = CommandPalette;
export const createTheme = (overrides = {}) => Object.freeze({ ...themes.default, ...overrides });
