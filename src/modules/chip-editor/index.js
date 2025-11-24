import { createWindow } from "../../ui/Window.js";
export function init() {
  const win = createWindow({ title: "🔌 Chip Editor", width: 500, height: 400 });
  win.querySelector(".window-content").innerHTML = "<div style='padding:20px;text-align:center;color:#666'>Node Editor Placeholder</div>";
  return { destroy: () => win.remove() };
}