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
    if ('documentPictureInPicture' in window) {
      console.log("🎨 Using Picture-in-Picture (Always on Top)");
      win = await window.documentPictureInPicture.requestWindow({
        width: 320,  // Optimal PiP size
        height: 520
      });
      isPiP = true;
    } 
    // 🚀 TIER B: Standard Popup (Cross-browser fallback)
    else {
      console.log("🪟 Using Standard Popup");
      const saved = localStorage.getItem(storageKey);
      const features = (saved || "width=800,height=600,left=150,top=150") + ",popup=yes,resizable=yes";
      win = window.open("", "Ti3D_ChipEditor", features);
    }
  } catch(e) {
    console.warn("❌ External window failed:", e);
  }

  // 🚀 TIER C: Internal Window (Popup blocked)
  if (!win || win.closed) {
    console.log("🏠 Using internal fallback (popup blocked)");
    const internal = createWindow({ 
      title: "🔌 Chip Editor (Internal)", 
      width: 500, 
      height: 400 
    });
    
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
        internal.style.zIndex = "10000";
      }
    };
  }

  // 3. 🎨 SETUP EXTERNAL WINDOW (A or B)
  const doc = win.document;
  
  // Manual CSS injection for external windows
  const styleEl = doc.createElement("style");
  styleEl.textContent = cssText;
  doc.head.appendChild(styleEl);
  
  // Set title for standard popups
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

  // Different close events for PiP vs Popup
  if (isPiP) {
    win.addEventListener("pagehide", handleExternalClose);
  } else {
    // Polling for standard popups
    const heartbeat = setInterval(() => {
      if (win.closed) {
        clearInterval(heartbeat);
        handleExternalClose();
      }
    }, 1000);
    
    // Save window position on close
    win.addEventListener("beforeunload", () => {
      if (!win.closed) {
        try {
          localStorage.setItem(storageKey, 
            `width=${win.outerWidth},height=${win.outerHeight},left=${win.screenX},top=${win.screenY}`
          );
        } catch (e) {
          console.warn("Could not save window position:", e);
        }
      }
    });
  }

  // Close external window when main app closes
  window.addEventListener("beforeunload", () => {
    if (win && !win.closed) {
      win.close();
    }
  });

  return { 
    destroy: () => {
      cleanup();
      if (win && !win.closed) win.close();
    },
    bringToFront: () => {
      if (win && !win.closed && !isPiP) {
        win.focus();
      }
    }
  };
}

// ============================================================
// 🧩 SHARED EDITOR LOGIC (PiP, Popup, and Internal)
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

  // 🎯 Input Debouncing Manager
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

    // 🎯 Input Row Helper with Better UX
    const addRow = (label, type, value, onChange, propertyKey) => {
      const row = docContext.createElement("div");
      row.className = "prop-row";
      row.innerHTML = `<div class="row-port in" title="Data Input"></div><span class="label">${label}</span>`;
      
      const input = docContext.createElement("input");
      const inputId = `${nodeId}-${propertyKey}`;
      
      // Type-specific configuration
      if (type === "number") { 
        input.type = "number"; 
        input.step = "0.1"; 
        input.value = typeof value === 'number' ? value.toFixed(2) : '0.00';
      }
      else if (type === "text") { 
        input.type = "text"; 
        input.value = value || ''; 
      }
      else if (type === "color") { 
        input.type = "color"; 
        input.value = value && value.isColor ? `#${value.getHexString()}` : '#ffffff'; 
      }

      // 🎯 Smart Input Handling with Debouncing
      input.addEventListener('input', (e) => {
        const val = e.target.value;
        
        // Clear existing timeout
        if (debounceManager.has(inputId)) {
          clearTimeout(debounceManager.get(inputId));
        }
        
        // Set new timeout with type-specific delay
        const timeoutId = setTimeout(() => {
          try {
            let processedValue = val;
            
            if (type === "number") { 
              const num = parseFloat(val);
              if (!isNaN(num)) processedValue = num;
              else return; // Invalid number, skip update
            } else if (type === "color") {
              processedValue = new THREE.Color(val);
            }
            
            // Apply the change
            onChange(processedValue);
            
            // 🎯 Force updates for smooth experience
            if (obj.updateMatrixWorld) obj.updateMatrixWorld(true);
            
            // Signal transformation
            eventBus.dispatchEvent(new CustomEvent('object:transformed', { 
              detail: { objectId: nodeId }
            }));
            
            // Trigger render
            if (services.rendererSvc && services.rendererSvc.renderer) {
              services.rendererSvc.renderer.render(
                services.rendererSvc.scene, 
                services.rendererSvc.camera
              );
            }
            
          } catch (error) {
            console.warn('Input processing error:', error);
          } finally {
            debounceManager.delete(inputId);
          }
        }, type === "number" ? 150 : 50);
        
        debounceManager.set(inputId, timeoutId);
      });

      row.appendChild(input);
      row.insertAdjacentHTML("beforeend", `<div class="row-port out" title="Data Output"></div>`);
      body.appendChild(row);
      return input;
    };

    const inputs = {};
    
    // Position properties
    inputs.px = addRow("Pos X", "number", obj.position.x, v => { obj.position.x = v; }, "posX");
    inputs.py = addRow("Pos Y", "number", obj.position.y, v => { obj.position.y = v; }, "posY");
    inputs.pz = addRow("Pos Z", "number", obj.position.z, v => { obj.position.z = v; }, "posZ");
    
    // Color property (if available)
    if (obj.material && obj.material.color && obj.material.color.isColor) {
      inputs.col = addRow("Color", "color", obj.material.color, v => { 
        obj.material.color.copy(v); 
      }, "color");
    }

    activeNodes.set(nodeId, { inputs, node });
    canvas.appendChild(node);
    
    return node;
  };

  // --- Event Handlers ---
  const onSelection = (e) => {
    // Clear any pending debounced updates
    debounceManager.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    debounceManager.clear();
    
    // Clear previous state
    canvas.innerHTML = "";
    activeNodes.clear();
    
    const ids = e.detail.ids;
    
    if (ids.length === 0) {
      canvas.innerHTML = `
        <div class="empty-state">
          <h3>No Selection</h3>
          <p>Select objects in the 3D Viewport</p>
        </div>
      `;
      status.textContent = "Idle";
      return;
    }

    status.textContent = `Editing ${ids.length} Node(s)`;
    
    // Create nodes for selected objects
    ids.forEach((id, index) => {
      const obj = services.sceneSvc.getObject(id);
      if (obj && obj.userData && obj.userData.id) {
        createNode(obj, index);
      }
    });
  };

  const onSceneUpdate = () => {
    // 🎯 Smart UI Sync: Only update if values changed significantly
    activeNodes.forEach((data, id) => {
      const obj = services.sceneSvc.getObject(id);
      if (!obj) return;
      
      const updateIfChanged = (input, newValue, threshold = 0.01) => {
        if (!input || input === docContext.activeElement) return;
        
        const currentVal = parseFloat(input.value);
        if (Math.abs(currentVal - newValue) > threshold) {
          input.value = newValue.toFixed(2);
        }
      };
      
      // Update position inputs
      updateIfChanged(data.inputs.px, obj.position.x);
      updateIfChanged(data.inputs.py, obj.position.y);
      updateIfChanged(data.inputs.pz, obj.position.z);
      
      // Update color input if exists
      if (data.inputs.col && obj.material && obj.material.color) {
        const currentHex = data.inputs.col.value;
        const newHex = `#${obj.material.color.getHexString()}`;
        if (currentHex !== newHex && data.inputs.col !== docContext.activeElement) {
          data.inputs.col.value = newHex;
        }
      }
    });
  };

  // 🎯 Initial render if objects are already selected
  if (services.sceneSvc.selectedIds && services.sceneSvc.selectedIds.size > 0) {
    onSelection({ detail: { ids: Array.from(services.sceneSvc.selectedIds) } });
  }

  // Attach to global event bus
  eventBus.addEventListener("selection:changed", onSelection);
  eventBus.addEventListener("scene:changed", onSceneUpdate);

  // 🧹 Return cleanup function
  return () => {
    // Clear all pending timeouts
    debounceManager.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    debounceManager.clear();
    
    // Remove event listeners
    eventBus.removeEventListener("selection:changed", onSelection);
    eventBus.removeEventListener("scene:changed", onSceneUpdate);
    
    // Clear nodes
    activeNodes.clear();
  };
}