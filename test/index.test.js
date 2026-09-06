import test from "node:test";
import assert from "node:assert/strict";
import { App, Box, Button, Checkbox, Input, Keys, List, Progress, Table, Text, Widget, fit, visibleWidth, wrap, style } from "../src/index.js";

test("text wraps, pads, and measures wide characters", () => {
  assert.equal(visibleWidth("界"), 2);
  assert.deepEqual(wrap("one two three", 7), ["one two", "three"]);
  assert.equal(visibleWidth(fit("界abc", 4)), 4);
  assert.equal(new Text({ content: "hello world" }).render(5, 2).join("\n"), "hello\nworld");
});

test("Box allocates rows and renders titled borders", () => {
  const root = new Box({ height: 6, border: true, title: "Demo", padding: 1 })
    .add(new Text({ content: "top", height: 1 }), new Text({ content: "bottom" }));
  const lines = root.render(16, 6);
  assert.equal(lines.length, 6);
  assert.match(lines[0], /^┌.*Demo.*┐$/);
  assert.match(lines.at(-1), /^└.*┘$/);
});

test("List scrolls, selects, and updates items", () => {
  const list = new List(["a", "b", "c", "d"]);
  list.move(3);
  assert.equal(list.value, "d");
  assert.match(list.render(10, 2)[1], /d/);
  list.handleKey(Keys.HOME);
  assert.equal(list.selected, 0);
  list.setItems(["new"]);
  assert.equal(list.value, "new");
});

test("Progress clamps values and supports updates", () => {
  const progress = new Progress({ value: 2 });
  assert.equal(progress.value, 1);
  progress.setValue(-1);
  assert.equal(progress.value, 0);
  assert.equal(progress.render(5, 1)[0].length > 0, true);
});

test("App parses split escape sequences and restores terminal state", () => {
  const writes = [];
  const output = {
    columns: 20, rows: 4, write: value => writes.push(value),
    on() {}, off() {}
  };
  const input = {
    isTTY: true, on() {}, off() {}, setRawMode() {}, resume() {}, pause() {}
  };
  const app = new App({ root: new Text("ok"), input, output });
  const keys = [];
  app.onKey = key => keys.push(key);
  app.start();
  app._handleInput("\x1b[");
  app._handleInput("Dq");
  assert.deepEqual(keys, [Keys.LEFT, "q"]);
  app.stop();
  assert.match(writes.at(-1), /\x1b\[0m/);
});

test("focus navigation and input controls are keyboard accessible", () => {
  const first = new Input({ value: "ab" });
  const check = new Checkbox({ label: "Accept" });
  const button = new Button({ label: "Save" });
  const app = new App({ root: new Box().add(first, check, button), input: { isTTY: false }, output: { columns: 40, rows: 5, write() {} } });
  app.start();
  assert.equal(app.focused, first);
  app.handleKey(Keys.LEFT); app.handleKey("x");
  assert.equal(first.value, "axb");
  app.handleKey(Keys.TAB); app.handleKey(Keys.SPACE);
  assert.equal(check.checked, true);
  app.handleKey(Keys.TAB); let pressed = false; button.props.onPress = () => { pressed = true; };
  app.handleKey(Keys.ENTER);
  assert.equal(pressed, true);
  app.stop();
});

test("widgets render bounded rectangles and table data", () => {
  const table = new Table({ columns: [{ key: "name", label: "Name", width: 6 }, { key: "n", label: "N", width: 2 }], rows: [{ name: "Alice", n: 3 }] });
  const rendered = table.render(12, 3);
  assert.equal(rendered.length, 3);
  assert.equal(rendered.every(line => visibleWidth(line) === 12), true);
  const box = new Box({ direction: "row", align: "end" }).add(new Text({ content: "x", width: 3 }), new Text({ content: "y" }));
  assert.equal(box.render(10, 2).length, 2);
});

test("fit preserves ANSI sequences while truncating Unicode safely", () => {
  const value = style("界abc", "red", { bold: true });
  const fitted = fit(value, 4);
  assert.equal(visibleWidth(fitted), 4);
  assert.match(fitted, /\x1b\[31m/);
  assert.match(fitted, /\x1b\[0m/);
});

test("Input edits code points without splitting emoji", () => {
  const input = new Input({ value: "A🙂B" });
  input.onKey(Keys.LEFT);
  input.onKey(Keys.BACKSPACE);
  assert.equal(input.value, "AB");
  input.onKey(Keys.HOME);
  input.onKey("界");
  assert.equal(input.value, "界AB");
});

test("mounted children and app timers are cleaned up", async () => {
  let mounted = 0, unmounted = 0, ticks = 0;
  class Probe extends Widget {
    onMount() { mounted++; }
    onUnmount() { unmounted++; }
  }
  const root = new Box().add(new Probe());
  const app = new App({ root, input: { isTTY: false }, output: { columns: 10, rows: 2, write() {} } });
  app.start();
  app.setInterval(() => ticks++, 1);
  await new Promise(resolve => setTimeout(resolve, 8));
  app.stop();
  assert.equal(mounted, 1);
  assert.equal(unmounted, 1);
  assert.ok(ticks > 0);
});
