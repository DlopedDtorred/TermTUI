import { App, Box, List, Progress, Text } from "../src/index.js";

const menu = new List(["Overview", "Projects", "Activity", "Settings"], { activeColor: "brightCyan" });
const root = new Box({ direction: "column", gap: 1, padding: 1 });
const header = new Box({ size: 3, border: true, title: " TermTUI " });
header.add(new Text({ content: "  A modern terminal interface toolkit", color: "brightBlue", bold: true }));

const content = new Box({ direction: "row", border: true, title: " Workspace ", padding: 1 });
const navigation = new Box({ size: 22, direction: "column" });
navigation.add(new Text({ content: "NAVIGATION", color: "gray", bold: true }), menu);
const main = new Box({ direction: "column", gap: 1 });
main.add(
  new Text({ content: "Welcome back, developer.", color: "white", bold: true }),
  new Text({ content: "Build focused terminal apps with composable widgets.", color: "gray" }),
  new Box({ direction: "row", size: 4, gap: 2 }).add(
    new Box({ border: true, title: "CPU" }).add(new Text({ content: "  24%", color: "green" })),
    new Box({ border: true, title: "MEMORY" }).add(new Text({ content: "  3.2 GB", color: "yellow" }))
  ),
  new Text({ content: "PROJECT HEALTH", color: "gray", bold: true }),
  new Progress({ value: 0.78, color: "cyan" }),
  new Text({ content: "↑ 78%   Press ↑/↓ to navigate · q to quit", color: "gray" })
);
content.add(navigation, main);
root.add(header, content, new Text({ content: " TermTUI  •  zero dependencies  •  MIT", color: "gray" }));

const app = new App({ root, alternateScreen: true });
app.onKey = key => {
  if (key === "\x1b[A") menu.move(-1);
  if (key === "\x1b[B") menu.move(1);
};
app.start();
