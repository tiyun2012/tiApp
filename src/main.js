import { RendererService } from "./services/RendererService.js";
import { SceneService } from "./services/SceneService.js";
import { ControlsService } from "./services/ControlsService.js";
import { PickingService } from "./services/PickingService.js";
import { HistoryService } from "./services/HistoryService.js";
import eventBus from "./services/EventBus.js";
import { saveProject, loadProject } from "./utils/serializer.js";

const ENABLE_DEMO = true;
let appHandles = null;
let chipEditorInstance = null;

async function bootstrap() {
  const container = document.getElementById("viewport");
  const spinner = document.getElementById("boot-spinner");

  if (!container) return;

  try {
    // 1. Initialize Services
    const historySvc = new HistoryService();
    const rendererSvc = new RendererService(container);
    const sceneSvc = new SceneService(rendererSvc.scene, historySvc); 
    const controlsSvc = new ControlsService(rendererSvc.camera, rendererSvc.renderer.domElement, sceneSvc);
    const pickingSvc = new PickingService(rendererSvc, sceneSvc, controlsSvc);

    // 2. Setup Demo Scene
    if (ENABLE_DEMO) {
      const THREE = await import("three");
      
      // Blue Cube
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0x007fd4 });
      const cube = new THREE.Mesh(geo, mat);
      cube.name = "Demo Cube";
      cube.position.y = 0.5;
      sceneSvc.addObject("demo_cube", cube);

      // Grid Floor
      const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
      rendererSvc.scene.add(grid);

      // Lights
      const amb = new THREE.AmbientLight(0xffffff, 0.4);
      const dir = new THREE.DirectionalLight(0xffffff, 1);
      dir.position.set(5, 10, 7);
      rendererSvc.scene.add(amb, dir);
    }

    // 3. Load Outliner
    const outlinerModule = await import("./modules/outliner/index.js");
    const outliner = outlinerModule.init({ 
      container: document.body, 
      services: { sceneSvc, rendererSvc, controlsSvc, eventBus } 
    });

    // 4. Setup UI (Main Menu)
    const mainMenu = document.getElementById("main-menu");
    if (mainMenu) {
      const createBtn = (label, fn) => {
        const b = document.createElement("button");
        b.className = "btn"; b.textContent = label; b.onclick = fn;
        mainMenu.appendChild(b);
      };

      // Save
      createBtn("Save", () => {
        const json = saveProject({ scene: sceneSvc.serialize() });
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "ti3d-project.json";
        document.body.appendChild(a); a.click(); a.remove();
      });

      // Load
      const loadBtn = document.createElement("button");
      loadBtn.className = "btn"; loadBtn.textContent = "Load";
      loadBtn.onclick = () => {
        const input = document.createElement("input");
        input.type = "file"; input.accept = "application/json"; input.style.display = "none";
        input.onchange = async (e) => {
          if (!e.target.files[0]) return;
          const parsed = loadProject(await e.target.files[0].text());
          if (parsed?.state?.scene) sceneSvc.deserialize(parsed.state.scene);
          input.remove();
        };
        document.body.appendChild(input); input.click();
      };
      mainMenu.appendChild(loadBtn);

      // Hints & Spacer
      const spacer = document.createElement("div"); spacer.style.flex = "1"; mainMenu.appendChild(spacer);
      mainMenu.insertAdjacentHTML("beforeend", `<div style="color:#666;font-size:11px;margin-right:12px">Ctrl+Z / Ctrl+Y</div>`);

      // Selection Counter
      const counter = document.createElement("div");
      counter.style.fontSize = "11px"; counter.style.color = "#888"; counter.style.marginRight = "12px";
      counter.textContent = "0 selected";
      mainMenu.appendChild(counter);
      eventBus.addEventListener("selection:changed", e => {
        const c = e.detail.ids.length; counter.textContent = `${c} selected`; counter.style.color = c > 0 ? "#fff" : "#888";
      });

      // Chip Editor Button
      const chipBtn = document.createElement("button");
      chipBtn.className = "btn"; chipBtn.textContent = "Open Chip Editor";
      chipBtn.onclick = async () => {
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
            // Callback for when window is closed via X or Alt+F4
            onClose: () => {
              chipEditorInstance = null;
              chipBtn.textContent = "Open Chip Editor";
              chipBtn.disabled = false;
            }
          });
          chipBtn.textContent = "Close Chip Editor";
        } catch(e) { 
          console.error(e); 
        } finally { 
          chipBtn.disabled = false; 
        }
      };
      mainMenu.appendChild(chipBtn);
    }

    // 5. Clean Loading Spinner
    if (spinner) spinner.remove();

    // 6. Start Render Loop
    // IMPORTANT: controlsSvc.update() syncs the BoxHelpers
    rendererSvc.start(() => {
      controlsSvc.update();
    });

    // Expose for debug
    appHandles = { rendererSvc, sceneSvc, controlsSvc, pickingSvc, historySvc };
    if (import.meta.env && import.meta.env.DEV) window.__app = appHandles;

  } catch (err) {
    console.error("Bootstrap failed", err);
    if (spinner) {
      spinner.innerHTML = `
        <div style="text-align:center;color:#ff4444;background:#222;padding:20px;border:1px solid #ff4444;border-radius:8px;">
          <b>System Error</b><br><small>${err.message}</small><br>
          <button onclick="location.reload()" style="margin-top:10px">Retry</button>
        </div>`;
      spinner.style.animation = "none";
      spinner.style.border = "none";
    }
  }
}

bootstrap();