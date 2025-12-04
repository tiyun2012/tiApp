import eventBus from "../../services/EventBus.js";
import { createWindow } from "../../ui/Window.js";
import * as THREE from "three";

const CSS_URL = new URL('./chip-editor.css', import.meta.url).href;

export async function init({ container, services, onClose }) {
  const storageKey = "ti3d_chip_window";
  
  // 1. 🛡️ SAFE CSS PRELOADING
  let cssText = "";
  try {
    const response = await fetch(CSS_URL);
    if (response.ok) {
      cssText = await response.text();
    }
  } catch (e) {
    console.warn("Could not load Chip Editor CSS", e);
  }

  let win = null;
  let isPiP = false;

  // 2. 🛡️ THREE-TIER WINDOW STRATEGY
  try {
    // 🚀 TIER A: Document Picture-in-Picture (True Always on Top)
    // This is the ONLY way to get a window that stays on top of the browser
    if ('documentPictureInPicture' in window) {
      console.log("🎨 Using Picture-in-Picture (Always on Top)");
      win = await window.documentPictureInPicture.requestWindow({
        width: 320,
        height: 520
      });
      isPiP = true;
    } 
    // 🚀 TIER B: Standard Popup (Multi-monitor capable)
    else {
      console.log("🪟 Using Standard Popup");
      const saved = localStorage.getItem(storageKey);
      
      // Smart positioning: Center it if no saved state
      const width = 800;
      const height = 600;
      const left = (window.screen.availWidth / 2) - (width / 2);
      const top = (window.screen.availHeight / 2) - (height / 2);
      
      const features = (saved || `width=${width},height=${height},left=${left},top=${top}`) + ",popup=yes,resizable=yes";
      win = window.open("", "Ti3D_ChipEditor", features);
    }
  } catch(e) {
    console.warn("❌ External window failed:", e);
  }

  // 🚀 TIER C: Internal Window (Popup blocked or Fallback)
  if (!win || win.closed) {
    console.log("🏠 Using internal fallback (popup blocked)");
    const internal = createWindow({ 
      title: "🔌 Chip Editor (Internal)", 
      width: 500, 
      height: 400 
    });
    
    // Ensure it's on top of other internal windows
    internal.style.zIndex = "10000";

    const cleanup = setupEditorLogic(
      internal.querySelector(".window-content"), 
      document, 
      false, 
      services
    );
    
    return { 
      destroy: () => {
        cleanup();
        internal.remove();
      },
      bringToFront: () => {
        internal.style.zIndex = "10001";
      }
    };
  }

  // 3. 🎨 SETUP EXTERNAL WINDOW (A or B)
  const doc = win.document;
  
  // Manual CSS injection
  const styleEl = doc.createElement("style");
  styleEl.textContent = cssText;
  doc.head.appendChild(styleEl);
  
  // Set title & Icon (Standard popups only)
  if (!isPiP) {
    doc.title = "🔌 Node Graph - Ti3D";
    try {
      const link = doc.createElement("link");
      link.rel = "icon";
      link.href = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔌</text></svg>";
      doc.head.appendChild(link);
    } catch (e) {}
  }

  // 4. 🧩 INITIALIZE EDITOR LOGIC
  const cleanup = setupEditorLogic(doc.body, doc, isPiP, services);

  // 5. 🔄 LIFECYCLE MANAGEMENT
  const handleExternalClose = () => {
    cleanup();
    if (onClose) onClose();
  };

  if (isPiP) {
    // PiP window closed by user
    win.addEventListener("pagehide", handleExternalClose);
  } else {
    // Standard Popup Polling
    const heartbeat = setInterval(() => {
      if (win.closed) {
        clearInterval(heartbeat);
        handleExternalClose();
      }
    }, 1000);
    
    // Save position on close
    win.addEventListener("beforeunload", () => {
      if (!win.closed) {
        try {
          localStorage.setItem(storageKey, 
            `width=${win.outerWidth},height=${win.outerHeight},left=${win.screenX},top=${win.screenY}`
          );
        } catch (e) {}
      }
    });
  }

  // Force close external window if Main App closes/refreshes
  window.addEventListener("beforeunload", () => {
    if (win && !win.closed) win.close();
  });

  return { 
    destroy: () => {
      cleanup();
      if (win && !win.closed) win.close();
    },
    bringToFront: () => {
      if (win && !win.closed && !isPiP) win.focus();
    }
  };
}

// ============================================================
// 🧩 SHARED EDITOR LOGIC (No Changes Needed Here)
// ============================================================
function setupEditorLogic(rootElement, docContext, isAlwaysOnTop, services) {
  rootElement.innerHTML = `
    <div class="chip-header">
      <span>Scene Graph ${isAlwaysOnTop ? '📌' : ''}</span>
      <span id="status" style="font-size:11px;opacity:0.6">Ready</span>
    </div>
    <div class="chip-canvas" id="canvas"></div>
  `;

  const canvas = rootElement.querySelector("#canvas");
  const status = rootElement.querySelector("#status");
  const activeNodes = new Map();
  const debounceManager = new Map();

  // --- Node Factory ---
  const createNode = (obj, index) => {
    const node = docContext.createElement("div");
    node.className = "node-card";
    node.style.left = `${20 + (index * 250)}px`;
    node.style.top = "50px";

    node.innerHTML = `
      <div class="node-header">
        <div class="port in" title="Input Flow"></div>
        <span>${obj.name || 'Unnamed'} <small style="opacity:0.5">(${obj.type})</small></span>
        <div class="port out" title="Output Object"></div>
      </div>
      <div class="node-body"></div>
    `;

    const body = node.querySelector(".node-body");
    const nodeId = obj.userData.id;

    const addRow = (label, type, value, onChange, propertyKey) => {
      const row = docContext.createElement("div");
      row.className = "prop-row";
      row.innerHTML = `<div class="row-port in" title="Data Input"></div><span class="label">${label}</span>`;
      
      const input = docContext.createElement("input");
      const inputId = `${nodeId}-${propertyKey}`;
      
      if (type === "number") { 
        input.type = "number"; input.step = "0.1"; input.value = typeof value === 'number' ? value.toFixed(2) : '0.00';
      } else if (type === "text") { 
        input.type = "text"; input.value = value || ''; 
      } else if (type === "color") { 
        input.type = "color"; input.value = value && value.isColor ? `#${value.getHexString()}` : '#ffffff'; 
      }

      input.addEventListener('input', (e) => {
        const val = e.target.value;
        if (debounceManager.has(inputId)) clearTimeout(debounceManager.get(inputId));
        
        const timeoutId = setTimeout(() => {
          try {
            let processedValue = val;
            if (type === "number") { 
              const num = parseFloat(val);
              if (!isNaN(num)) processedValue = num; else return; 
            } else if (type === "color") {
              processedValue = new THREE.Color(val);
            }
            onChange(processedValue);
            
            if (obj.updateMatrixWorld) obj.updateMatrixWorld(true);
            eventBus.dispatchEvent(new CustomEvent('object:transformed', { detail: { objectId: nodeId } }));
            if (services.rendererSvc) services.rendererSvc.renderer.render(services.rendererSvc.scene, services.rendererSvc.camera);
            
          } catch (error) { console.warn(error); } 
          finally { debounceManager.delete(inputId); }
        }, type === "number" ? 150 : 50);
        
        debounceManager.set(inputId, timeoutId);
      });

      row.appendChild(input);
      row.insertAdjacentHTML("beforeend", `<div class="row-port out" title="Data Output"></div>`);
      body.appendChild(row);
      return input;
    };

    const inputs = {};
    inputs.px = addRow("Pos X", "number", obj.position.x, v => { obj.position.x = v; }, "posX");
    inputs.py = addRow("Pos Y", "number", obj.position.y, v => { obj.position.y = v; }, "posY");
    inputs.pz = addRow("Pos Z", "number", obj.position.z, v => { obj.position.z = v; }, "posZ");
    
    if (obj.material?.color?.isColor) {
      inputs.col = addRow("Color", "color", obj.material.color, v => { obj.material.color.copy(v); }, "color");
    }

    activeNodes.set(nodeId, { inputs, node });
    canvas.appendChild(node);
  };

  const onSelection = (e) => {
    debounceManager.forEach(t => clearTimeout(t)); debounceManager.clear();
    canvas.innerHTML = ""; activeNodes.clear();
    
    const ids = e.detail.ids;
    if (ids.length === 0) {
      canvas.innerHTML = `<div class="empty-state"><h3>No Selection</h3><p>Select objects</p></div>`;
      status.textContent = "Idle";
      return;
    }
    status.textContent = `Editing ${ids.length} Node(s)`;
    ids.forEach((id, index) => {
      const obj = services.sceneSvc.getObject(id);
      if (obj) createNode(obj, index);
    });
  };

  const onSceneUpdate = () => {
    activeNodes.forEach((data, id) => {
      const obj = services.sceneSvc.getObject(id);
      if (!obj) return;
      
      const updateIfChanged = (input, newValue, threshold = 0.01) => {
        if (!input || input === docContext.activeElement) return;
        const currentVal = parseFloat(input.value);
        if (Math.abs(currentVal - newValue) > threshold) input.value = newValue.toFixed(2);
      };
      
      updateIfChanged(data.inputs.px, obj.position.x);
      updateIfChanged(data.inputs.py, obj.position.y);
      updateIfChanged(data.inputs.pz, obj.position.z);
      
      if (data.inputs.col && obj.material?.color) {
        const currentHex = data.inputs.col.value;
        const newHex = `#${obj.material.color.getHexString()}`;
        if (currentHex !== newHex && data.inputs.col !== docContext.activeElement) {
          data.inputs.col.value = newHex;
        }
      }
    });
  };

  if (services.sceneSvc.selectedIds?.size > 0) {
    onSelection({ detail: { ids: Array.from(services.sceneSvc.selectedIds) } });
  }

  eventBus.addEventListener("selection:changed", onSelection);
  eventBus.addEventListener("scene:changed", onSceneUpdate);

  return () => {
    debounceManager.forEach(t => clearTimeout(t));
    eventBus.removeEventListener("selection:changed", onSelection);
    eventBus.removeEventListener("scene:changed", onSceneUpdate);
    activeNodes.clear();
  };
}