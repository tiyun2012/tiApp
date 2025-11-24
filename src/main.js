import { RendererService } from "./services/RendererService.js";
import { SceneService } from "./services/SceneService.js";
import { ControlsService } from "./services/ControlsService.js";
import { PickingService } from "./services/PickingService.js";
import { HistoryService } from "./services/HistoryService.js";
import eventBus from "./services/EventBus.js";
import { saveProject, loadProject } from "./utils/serializer.js";

const ENABLE_DEMO = true;

// Global handles for debugging and cleanup
let appHandles = null;
let chipEditorInstance = null;

async function bootstrap() {
  const container = document.getElementById("viewport");
  const spinner = document.getElementById("boot-spinner");

  // If the viewport is missing, we can't do anything
  if (!container) return;

  try {
    // 1. Initialize Services (Order matters)
    const historySvc = new HistoryService();
    const rendererSvc = new RendererService(container);
    const sceneSvc = new SceneService(rendererSvc.scene, historySvc);
    const controlsSvc = new ControlsService(rendererSvc.camera, rendererSvc.renderer.domElement, sceneSvc);
    const pickingSvc = new PickingService(rendererSvc, sceneSvc, controlsSvc);

    // 2. Setup Demo Scene
    if (ENABLE_DEMO) {
      // Dynamic import of Three.js to keep initial bundle small
      const THREE = await import("three");

      // A. The "Demo Cube"
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0x007fd4 });
      const cube = new THREE.Mesh(geo, mat);
      cube.name = "Demo Cube";
      cube.position.y = 0.5; // Sit on the grid
      sceneSvc.addObject("demo_cube", cube);

      // B. Grid Floor (Visual Reference)
      const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
      rendererSvc.scene.add(grid);

      // C. Lighting
      const amb = new THREE.AmbientLight(0xffffff, 0.4);
      const dir = new THREE.DirectionalLight(0xffffff, 1);
      dir.position.set(5, 10, 7);
      rendererSvc.scene.add(amb, dir);
    }

    // 3. Load Modules
    const outlinerModule = await import("./modules/outliner/index.js");
    const outliner = outlinerModule.init({
      container: document.body,
      services: { sceneSvc, rendererSvc, controlsSvc, eventBus }
    });

    // 4. Build Main Menu UI
    const mainMenu = document.getElementById("main-menu");
    if (mainMenu) {
      // Helper to create buttons
      const createBtn = (label, onClick) => {
        const btn = document.createElement("button");
        btn.className = "btn";
        btn.textContent = label;
        btn.onclick = onClick;
        mainMenu.appendChild(btn);
        return btn;
      };

      // -- Save Button --
      createBtn("Save", () => {
        const state = { scene: sceneSvc.serialize() };
        const json = saveProject(state);
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "ti3d-project.json";
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      });

      // -- Load Button --
      createBtn("Load", () => {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        input.style.display = "none";
        input.onchange = async (ev) => {
          const f = ev.target.files?.[0];
          if (!f) return;
          const text = await f.text();
          const parsed = loadProject(text);
          if (parsed && parsed.state && parsed.state.scene) {
            sceneSvc.deserialize(parsed.state.scene);
          }
          input.remove();
        };
        document.body.appendChild(input);
        input.click();
      });

      // -- Spacer & Hints --
      const spacer = document.createElement("div");
      spacer.style.flex = "1";
      mainMenu.appendChild(spacer);

      const hint = document.createElement("div");
      hint.style.color = "#666";
      hint.style.fontSize = "11px";
      hint.style.marginRight = "12px";
      hint.textContent = "Ctrl+Z / Ctrl+Y";
      mainMenu.appendChild(hint);

      // -- Selection Counter --
      const selectionCounter = document.createElement("div");
      selectionCounter.className = "selection-counter";
      selectionCounter.style.fontSize = "11px";
      selectionCounter.style.color = "#888";
      selectionCounter.style.marginRight = "12px";
      selectionCounter.textContent = "0 selected";
      mainMenu.appendChild(selectionCounter);

      eventBus.addEventListener("selection:changed", (e) => {
        const count = e.detail.ids.length;
        selectionCounter.textContent = `${count} selected`;
        selectionCounter.style.color = count > 0 ? "#fff" : "#888";
      });

      // -- Chip Editor Button (Popout Logic) --
      const chipBtn = document.createElement("button");
      chipBtn.className = "btn";
      chipBtn.textContent = "Open Chip Editor";
      chipBtn.onclick = async () => {
        // Close if already open
        if (chipEditorInstance) {
          chipEditorInstance.destroy();
          chipEditorInstance = null;
          chipBtn.textContent = "Open Chip Editor";
          return;
        }

        chipBtn.disabled = true;
        try {
          const mod = await import("./modules/chip-editor/index.js");
          chipEditorInstance = mod.init({
            container: document.body,
            services: { sceneSvc, rendererSvc, controlsSvc, eventBus },
            // Self-healing callback: Called if user closes popup manually
            onClose: () => {
              chipEditorInstance = null;
              chipBtn.textContent = "Open Chip Editor";
              chipBtn.disabled = false;
            }
          });
          chipBtn.textContent = "Close Chip Editor";
        } catch (err) {
          console.error("Failed to load Chip Editor module", err);
        } finally {
          chipBtn.disabled = false;
        }
      };
      mainMenu.appendChild(chipBtn);
    }

    // 5. Cleanup Bootstrap UI
    if (spinner) spinner.remove();

    // 6. Start Render Loop
    // We pass a callback to update controls (damping) every frame
    rendererSvc.start(() => {
      controlsSvc.orbit.update?.();
    });

    // Expose handles for debugging in console (window.__app)
    appHandles = { rendererSvc, sceneSvc, controlsSvc, pickingSvc, historySvc, outliner };
    if (import.meta.env && import.meta.env.DEV) {
      window.__app = appHandles;
    }

  } catch (err) {
    // 🚨 Error Recovery UI
    console.error("Bootstrap failed", err);
    if (spinner) {
      // Reuse the spinner div to show the error
      spinner.style.border = "none";
      spinner.style.animation = "none";
      spinner.style.width = "auto";
      spinner.style.height = "auto";
      spinner.style.transform = "translate(-50%, -50%)";
      spinner.innerHTML = `
        <div style="text-align:center; color:#ff4444; background:#222; padding:20px; border-radius:8px; border:1px solid #ff4444; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
          <div style="font-size:18px; font-weight:bold; margin-bottom:8px">🚨 System Error</div>
          <div style="font-size:12px; margin-bottom:16px; color:#ccc; white-space:pre-wrap; max-width:400px">${err.message}</div>
          <button class="btn" onclick="location.reload()" style="width:100%">Reload Application</button>
        </div>
      `;
    }
  }
}

// Start the application
bootstrap();