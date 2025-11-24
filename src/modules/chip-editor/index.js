import eventBus from "../../services/EventBus.js";
import { createWindow } from "../../ui/Window.js";

// Dedicated styles for the external window
const CHIP_STYLES = `
  :root { --bg: #151515; --panel: #222; --text: #ddd; --accent: #007fd4; --border: #333; }
  body { background: var(--bg); color: var(--text); margin: 0; font-family: Segoe UI, sans-serif; overflow: hidden; }
  .chip-header { padding: 10px 15px; background: #1f1f1f; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: center; -webkit-app-region: drag; }
  .chip-canvas { height: calc(100vh - 40px); background: radial-gradient(#333 1px, transparent 1px) 0 0 / 20px 20px; overflow: auto; position: relative; }
  .node-card { background: #2b2b2b; border: 1px solid #444; border-radius: 6px; padding: 0; width: 220px; box-shadow: 0 4px 12px rgba(0,0,0,0.5); position: absolute; transition: border 0.2s; }
  .node-card:hover { border-color: var(--accent); }
  .node-header { background: #333; padding: 6px 10px; font-weight: bold; border-bottom: 1px solid #444; border-radius: 5px 5px 0 0; display:flex; justify-content:space-between; }
  .node-body { padding: 10px; font-size: 12px; color: #aaa; }
  .prop-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .prop-val { color: #fff; font-family: monospace; }
  .empty-state { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #444; text-align: center; pointer-events: none; }
`;

export function init({ container, services, onClose }) {
  // 1. Attempt to Load Saved State
  const storageKey = "ti3d_chip_window";
  const savedState = localStorage.getItem(storageKey);
  const defaultFeatures = "width=800,height=600,left=200,top=200";
  
  // 2. Try Opening Native Window
  let win = null;
  try {
    win = window.open("", "Ti3D_ChipEditor", savedState || defaultFeatures);
  } catch (e) { console.warn("Popup blocked"); }

  // 3. FALLBACK: Internal Window (If blocked)
  if (!win || win.closed) {
    console.warn("Popup blocked or failed. Falling back to internal window.");
    const internal = createWindow({ title: "🔌 Chip Editor (Internal)", width: 500, height: 400 });
    internal.querySelector(".window-content").innerHTML = `<div style="padding:20px;text-align:center">Popups blocked.<br>Running in fallback mode.</div>`;
    return { destroy: () => internal.remove() };
  }

  // =========================================
  // 🚀 EXTERNAL WINDOW SETUP
  // =========================================

  // A. inject CSS
  const styleEl = win.document.createElement("style");
  styleEl.textContent = CHIP_STYLES;
  win.document.head.appendChild(styleEl);
  win.document.title = "🔌 Chip Editor";

  // B. Setup Skeleton
  win.document.body.innerHTML = `
    <div class="chip-header">
      <span>Node Graph Active</span>
      <span id="status" style="font-size:11px;opacity:0.6">Ready</span>
    </div>
    <div class="chip-canvas" id="canvas">
      <div class="empty-state">
        <h3>No Selection</h3>
        <p>Select objects in the 3D Viewport</p>
      </div>
    </div>
  `;

  const canvas = win.document.getElementById("canvas");
  const status = win.document.getElementById("status");

  // C. Selection Handler with Debounce
  let debounceTimer;
  const updateNodes = (ids) => {
    canvas.innerHTML = ""; // Clear
    
    if (ids.length === 0) {
      canvas.innerHTML = `<div class="empty-state"><h3>No Selection</h3><p>Select objects in the 3D Viewport</p></div>`;
      status.textContent = "Idle";
      return;
    }

    status.textContent = `${ids.length} Object(s) Active`;

    // Render Nodes
    ids.forEach((id, index) => {
      const obj = services.sceneSvc.getObject(id);
      if (!obj) return;

      const node = document.createElement("div");
      node.className = "node-card";
      // Auto-layout logic (Simple cascade)
      node.style.left = `${40 + (index * 240)}px`;
      node.style.top = "40px";

      node.innerHTML = `
        <div class="node-header">
          <span>${obj.name || "Untitled"}</span>
          <span style="opacity:0.5">ID:${id.substr(0,4)}</span>
        </div>
        <div class="node-body">
          <div class="prop-row"><span>Type</span> <span class="prop-val">${obj.type}</span></div>
          <div class="prop-row"><span>Vis</span> <span class="prop-val">${obj.visible}</span></div>
          <hr style="border:0;border-top:1px solid #444;margin:8px 0">
          <div class="prop-row"><span>Pos X</span> <span class="prop-val">${obj.position.x.toFixed(2)}</span></div>
          <div class="prop-row"><span>Pos Y</span> <span class="prop-val">${obj.position.y.toFixed(2)}</span></div>
          <div class="prop-row"><span>Pos Z</span> <span class="prop-val">${obj.position.z.toFixed(2)}</span></div>
        </div>
      `;
      canvas.appendChild(node);
    });
  };

  const onSelectionChange = (e) => {
    if (win.closed) return;
    clearTimeout(debounceTimer);
    // Debounce to prevent lag on mass-selection
    debounceTimer = setTimeout(() => updateNodes(e.detail.ids), 50);
  };

  eventBus.addEventListener("selection:changed", onSelectionChange);

  // D. State Persistence (Save Position on Close)
  win.addEventListener("beforeunload", () => {
    if(!win.closed) {
      const state = `width=${win.outerWidth},height=${win.outerHeight},left=${win.screenX},top=${win.screenY}`;
      localStorage.setItem(storageKey, state);
    }
    // Cleanup listener
    eventBus.removeEventListener("selection:changed", onSelectionChange);
    if (onClose) onClose();
  });

  // E. Health Check (Heartbeat)
  // Handles case where user Force Quits the window or Browser crashes
  const heartBeat = setInterval(() => {
    if (win.closed) {
      clearInterval(heartBeat);
      eventBus.removeEventListener("selection:changed", onSelectionChange);
      if (onClose) onClose();
    }
  }, 1000);

  // F. Parent Window Closure
  window.addEventListener("beforeunload", () => {
    if (win && !win.closed) win.close();
  });

  return {
    destroy: () => {
      clearInterval(heartBeat);
      eventBus.removeEventListener("selection:changed", onSelectionChange);
      if (win && !win.closed) win.close();
    }
  };
}