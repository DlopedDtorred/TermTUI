import {
  App, Box, CommandPalette, Diff, Input, ScrollableLog, SplitPane, StatusBar, Text
} from "../src/index.js";

const log = new ScrollableLog({ follow: true, entries: ["TermTUI session ready"] });
const editor = new Input({
  placeholder: "Type a command and press Enter",
  onSubmit: value => { if (value) log.write(`> ${value}`); editor.setValue(""); }
});
const workspace = new SplitPane({ ratio: 0.3, border: "rounded", title: " Workspace " })
  .add(new Box({ padding: 1 }).add(new Text({ content: "FILES\n\nsrc/\n  index.js\ntest/" })),
    new Box({ padding: 1 }).add(new Text({ content: "OUTPUT", color: "cyan", bold: true }), log, editor));
const root = new Box().add(workspace, new StatusBar({ items: ["F1 Commands", "Tab Focus", "Ctrl+C Quit"] }));
const app = new App({ root, alternateScreen: true });
app.registerAction("commands", ui => ui.pushOverlay(new CommandPalette(["Open file", "Search", "Toggle diff"])));
app.addKeymap({ "\x1bOP": "commands" });
app.start();
