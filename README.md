# TermTUI

TermTUI is a zero-dependency Node.js 20+ framework for building reliable,
keyboard-driven terminal interfaces. It uses only Node's standard library and
is designed to be embedded directly from `src/index.js`.

## What it provides

- Unicode and ANSI-aware measurement, wrapping, truncation, and padding.
- Composable `Widget` trees with lifecycle hooks and change-driven redraws.
- Responsive row/column layout with fixed, flexible, min/max, gap, padding,
  borders, titles, and start/center/end alignment.
- A focus manager, Tab navigation, bubbling widget events, resize handling,
  UTF-8 input buffering, common keyboard constants, and signal-safe cleanup.
- Differential rendering: only changed terminal rows are written after the
  initial frame, avoiding flicker and unnecessary output.
- ANSI-preserving truncation, Unicode-safe text editing (including emoji),
  dirty-line clearing, render error recovery, and automatic timer cleanup.
- Production-oriented widgets: `Text`, `Input`, `Button`, `Checkbox`, `Select`,
  `List`, `Table`, `Tabs`, `Progress`, `Log`, `Box`, and `Spacer`.
- OpenCode-style shell primitives: `SplitPane`, `ScrollView`, `ScrollableList`,
  `ScrollableLog`, `MultilineEditor`, `CommandPalette`, `Modal`, `StatusBar`,
  and `Diff`.
- No runtime dependencies, build step, or global framework state.

## Quick start

```js
import { App, Box, Input, Text } from "./src/index.js";

const input = new Input({
  placeholder: "Your name",
  onSubmit: value => message.props.content = `Hello, ${value}!`
});
const message = new Text({ content: "Press Tab to focus the input." });
const root = new Box({ border: "rounded", title: " Example ", padding: 1 })
  .add(message, input);

const app = new App({ root, alternateScreen: true });
app.start();                 // Ctrl+C, SIGTERM, or app.stop() exits cleanly
```

Run the included dashboard:

```bash
npm start
npm test
```

## Core API

### Widgets and rendering

Every widget implements `render(width, height)` and returns exactly `height`
strings. `Widget#add`, `remove`, and `clear` are chainable. `invalidate()`
coalesces a redraw. `onMount` and `onUnmount` are called as the tree is
attached/detached. A custom widget can be as small as:

```js
class Badge extends Widget {
  render(width, height) {
    return Array.from({ length: height }, (_, row) =>
      fit(row === 0 ? " READY " : "", width)
    );
  }
}
```

`visibleWidth`, `stripAnsi`, `fit`, `wrap`, and `style` are exported helpers.
`fit` preserves ANSI when no truncation is required and safely handles wide
Unicode characters. Colors include `black`, `red`, `green`, `yellow`, `blue`,
`magenta`, `cyan`, `white`, `gray`, and bright variants.

### Layout

```js
new Box({
  direction: "row",       // "column" is the default
  width: 80, height: 10,
  gap: 1, padding: 1,
  border: "single",       // single, double, rounded, bold, or false
  title: "Panel",
  align: "center"         // start, center, or end
})
```

Children with `width`/`height` (or legacy `size`) receive fixed space.
Unspecified children share remaining space. `minWidth`, `maxWidth`,
`minHeight`, and `maxHeight` constrain allocation. Child `align` overrides the
container alignment.

### Interaction widgets

- `Input`: editing, cursor movement, placeholder, `setValue`, and
  `onChange(value)`/`onSubmit(value)`.
- `Button`: Enter/Space activation with `onPress`.
- `Checkbox`: `checked`, `toggle()`, and `onChange(checked)`.
- `List`: strings or `{ label, ...data }`, `move`, `select`, `setItems`, and
  `onSelect(value, index)`.
- `Select`: a compact list that opens with Enter/Space.
- `Tabs`: list-style selection rendered as a tab strip.
- `Table`: `{ columns: [{ key, label, width }], rows }`.
- `Log`: `write(message)`, bounded history, and tail rendering.
- `Progress`: `value` clamped to `0..1`, updated with `setValue`.

Widgets accept `onFocus`, `onBlur`, and event callbacks in their props.
Events bubble through parents and can be stopped by returning `true`.

### App, focus, and keyboard input

```js
const app = new App({ root, input: process.stdin, output: process.stdout });
app.onKey = (key, app) => { /* application-level fallback */ };
app.onResize = (width, height) => { /* optional */ };
app.start();
```

Focusable widgets are discovered in tree order. `Tab` and `Shift+Tab` cycle
focus; `widget.focus()` selects a specific control. `Keys` includes arrows,
Home/End, page keys, Delete, Enter, Escape, Backspace, Tab, Space, Ctrl+C,
Ctrl+A/E/U/W, and more.

`app.setInterval(fn, ms)` and `app.setTimeout(fn, ms)` invoke callbacks only
while mounted. `stop()` is idempotent and restores raw mode, signal handlers,
cursor visibility, ANSI styles, and the alternate screen when enabled.
Timers are cancelled on stop. Rendering and timer callbacks are isolated so an
application can provide `app.onError(error)` and keep running by returning
`true`; otherwise the app shuts down safely. Adding an already-mounted widget
mounts it immediately, and cyclic widget trees are rejected.

### Application shells

`SplitPane` divides a workspace using `ratio`. `ScrollView` and
`ScrollableLog` keep an explicit viewport for streaming output without
rebuilding the widget tree. `MultilineEditor` adds newline editing and history:

```js
const editor = new MultilineEditor({
  history: ["status"],
  onSubmit: text => log.write(text)
});
```

Register application commands with `app.registerAction(name, fn)` and
`app.addKeymap({ key: name })`. Modal widgets can be shown with
`app.pushOverlay(new CommandPalette(commands))` and dismissed with Escape.
`Diff` renders line-oriented additions and removals, while `StatusBar` provides
a stable footer. Every primitive is exported from the same zero-dependency
entry point and preserves the original API.

## Compatibility

The original `Text`, `Box`, `List`, `Progress`, `Spacer`, `Widget`, `App`,
`Keys`, `colors`, `fit`, `wrap`, `visibleWidth`, and `stripAnsi` exports remain
available with their original constructors and methods. TermTUI has no
dependency on TermChat; applications can continue importing this file directly.
