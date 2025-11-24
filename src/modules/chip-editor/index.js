import eventBus from "../../services/EventBus.js";
import { createWindow } from "../../ui/Window.js";

// Helper to locate the CSS file relative to this module
const CSS_URL = new URL('./chip-editor.css', import.meta.url).href;

export async function init({ container, services, onClose }) {
  const storageKey = "ti3d_chip_window";
  
  // 1. Fetch CSS text manually
  // This ensures the popup has styles even if the browser blocks local file links
  const cssText = await fetch(CSS_URL).then(res => res.text()).catch(() => "");

  // 2. Open Native Window
  let win = null;
  try {
    const saved = localStorage.getItem(storageKey);
    // Default size/position if no saved state
    win = window.open("", "Ti3D_ChipEditor", saved || "width=900,height=600,left=150,top=150");
  } catch(e) {
    console.warn("Window open failed", e);
  }

  // 3. Fallback: Internal Window (If Popup Blocked)
  if (!win || win.closed) {
    console.warn("Popup blocked. Using internal fallback.");
    const internal = createWindow({ title: "🔌 Chip Editor (Internal)", width: 500, height: 400 });
    internal.querySelector(".window-content").innerHTML = `<div style="padding:20px;text-align:center;color:#888">Popups blocked.<br>Using fallback mode.</div>`;
    return { destroy: () => internal.remove() };
  }

  // 4. Setup External Document
  const doc = win.document;
  doc.title = "🔌 Node Graph";
  
  // Inject Styles
  const styleEl = doc.createElement("style");
  styleEl.textContent = cssText;
  doc.head.appendChild(styleEl);

  // Inject Skeleton HTML
  doc.body.innerHTML = `
    <div class="chip-header">
      <span>Scene Graph</span>
      <span id="status" style="font-size:11px;opacity:0.6">Ready</span>
    </div>
    <div class="chip-canvas" id="canvas"></div>
  `;

  const canvas = doc.getElementById("canvas");
  const status = doc.getElementById("status");

  // ===============================================
  // 🛠 NODE FACTORY & DATA BINDING
  // ===============================================
  const activeNodes = new Map(); // Stores references to DOM elements for updates

  const createNode = (obj, index) => {
    const node = doc.createElement("div");
    node.className = "node-card";
    // Simple cascading layout
    node.style.left = `${50 + (index * 260)}px`;
    node.style.top = "50px";

    // Node Header
    node.innerHTML = `
      <div class="node-header">
        <div class="port in" title="Input Flow"></div>
        <span>${obj.name} <small style="opacity:0.5">(${obj.type})</small></span>
        <div class="port out" title="Output Object"></div>
      </div>
      <div class="node-body"></div>
    `;

    const body = node.querySelector(".node-body");

    // --- Helper: Create Property Row ---
    const addRow = (label, type, value, onChange) => {
      const row = doc.createElement("div");
      row.className = "prop-row";
      
      // Visual Ports
      row.innerHTML = `<div class="row-port in"></div><span class="label">${label}</span>`;
      
      const input = doc.createElement("input");
      
      // Configure Input Type
      if (type === "number") {
        input.type = "number";
        input.step = "0.1";
        input.value = typeof value === 'number' ? value.toFixed(2) : 0;
      } else if (type === "text") {
        input.type = "text";
        input.value = value;
      } else if (type === "color") {
        input.type = "color";
        input.value = "#" + value.getHexString();
      }

      // --- TWO-WAY BINDING (UI -> 3D) ---
      input.oninput = (e) => {
        const val = e.target.value;
        
        // Update Data
        if (type === "number") {
          const num = parseFloat(val);
          if(!isNaN(num)) onChange(num);
        } else {
          onChange(val);
        }

        // ⚡ CRITICAL UPDATES: Force everything to refresh immediately
        if (obj.updateMatrixWorld) obj.updateMatrixWorld(); // Update Physics
        services.controlsSvc.update(); // Update Selection Box Helper
        services.rendererSvc.renderer.render(services.rendererSvc.scene, services.rendererSvc.camera); // Re-draw Scene
      };

      row.appendChild(input);
      row.insertAdjacentHTML("beforeend", `<div class="row-port out"></div>`);
      body.appendChild(row);

      return input;
    };

    // --- Map Properties ---
    const inputs = {};

    // Position
    inputs.px = addRow("Pos X", "number", obj.position.x, v => obj.position.x = v);
    inputs.py = addRow("Pos Y", "number", obj.position.y, v => obj.position.y = v);
    inputs.pz = addRow("Pos Z", "number", obj.position.z, v => obj.position.z = v);

    // Color (if mesh)
    if (obj.material && obj.material.color) {
      inputs.col = addRow("Color", "color", obj.material.color, v => obj.material.color.set(v));
    }

    // Track node for updates
    activeNodes.set(obj.id, { el: node, inputs });
    canvas.appendChild(node);
  };

  // ===============================================
  // 🔄 EVENT LISTENERS
  // ===============================================

  // 1. Selection Changed -> Rebuild Graph
  const onSelection = (e) => {
    if (win.closed) return;
    const ids = e.detail.ids;
    
    canvas.innerHTML = "";
    activeNodes.clear();

    if (ids.length === 0) {
      canvas.innerHTML = `<div class="empty-state"><h3>No Selection</h3><p>Select objects in the 3D Viewport</p></div>`;
      status.textContent = "Idle";
      return;
    }

    status.textContent = `Editing ${ids.length} Node(s)`;
    ids.forEach((id, i) => {
      const obj = services.sceneSvc.getObject(id);
      if (obj) createNode(obj, i);
    });
  };

  // 2. Scene Changed (Gizmo Drag) -> Update UI Inputs
  const onSceneUpdate = () => {
    if (win.closed) return;
    
    activeNodes.forEach((data, id) => {
      const obj = services.sceneSvc.getObject(id);
      if (!obj) return;
      
      // Smart Update: Only update if value drifted & not focused
      const updateIfDiff = (input, val) => {
        if (!input) return;
        const currentVal = parseFloat(input.value);
        if (doc.activeElement !== input && Math.abs(currentVal - val) > 0.01) {
          input.value = val.toFixed(2);
        }
      };

      updateIfDiff(data.inputs.px, obj.position.x);
      updateIfDiff(data.inputs.py, obj.position.y);
      updateIfDiff(data.inputs.pz, obj.position.z);
    });
  };

  // Subscribe
  eventBus.addEventListener("selection:changed", onSelection);
  eventBus.addEventListener("scene:changed", onSceneUpdate);

  // ===============================================
  // 🧹 CLEANUP & LIFECYCLE
  // ===============================================
  
  // Heartbeat to detect if user force-closed window
  const hb = setInterval(() => {
    if (win.closed) {
      clearInterval(hb);
      eventBus.removeEventListener("selection:changed", onSelection);
      eventBus.removeEventListener("scene:changed", onSceneUpdate);
      if (onClose) onClose();
    }
  }, 1000);

  // Save position on close
  win.onbeforeunload = () => {
    if(!win.closed) {
      localStorage.setItem(storageKey, `width=${win.outerWidth},height=${win.outerHeight},left=${win.screenX},top=${win.screenY}`);
    }
  };
  
  // If Main App closes, close popup
  window.addEventListener("beforeunload", () => { 
    if(win && !win.closed) win.close(); 
  });

  return { destroy: () => win.close() };
}