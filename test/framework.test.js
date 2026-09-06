import test from "node:test";
import assert from "node:assert/strict";
import {
  App, CommandPalette, Diff, Keys, MultilineEditor, ScrollableLog, ScrollView,
  SplitPane, StatusBar, Text, visibleWidth
} from "../src/index.js";

test("split panes allocate both children", () => {
  const pane = new SplitPane({ ratio: 0.25 }).add(new Text("left"), new Text("right"));
  const output = pane.render(20, 2);
  assert.equal(output.length, 2);
  assert.equal(output.every(line => visibleWidth(line) === 20), true);
});

test("multiline editor supports history and submit", () => {
  let submitted = "";
  const editor = new MultilineEditor({ history: ["one"], onSubmit: value => { submitted = value; } });
  editor.onKey(Keys.UP);
  assert.equal(editor.value, "one");
  editor.onKey(Keys.ENTER);
  assert.equal(submitted, "one");
});

test("streaming log can leave follow mode and scroll", () => {
  const log = new ScrollableLog({ entries: ["a", "b", "c"], follow: true });
  log.scrollBy(-1, 2);
  assert.equal(log.follow, false);
  assert.equal(log.render(5, 2)[0].trim(), "a");
  log.write("d");
  assert.equal(log.render(5, 2)[0].trim(), "a");
});

test("command palette filters commands", () => {
  const palette = new CommandPalette(["Open", "Close", "Other"]);
  palette.query.setValue("op");
  assert.deepEqual(palette.results.items, ["Open"]);
});

test("app actions and status bar are available without a terminal", () => {
  let invoked = false;
  const app = new App({ root: new StatusBar({ items: ["ready"] }), input: { isTTY: false }, output: { columns: 20, rows: 1, write() {} } });
  app.registerAction("quit", () => { invoked = true; });
  app.addKeymap({ q: "quit" });
  app.start();
  app.handleKey("q");
  assert.equal(invoked, true);
  app.stop();
});

test("diff rendering marks additions and removals", () => {
  const output = new Diff({ before: "old", after: "new" }).render(20, 3).join("\n");
  assert.match(output, /old/);
  assert.match(output, /new/);
});
