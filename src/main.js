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

    // ✅ OPTIMIZED LISTENER: Only force update if selection exists
    eventBus.addEventListener('object:transformed', () => {
      if (sceneSvc.selectedIds.size > 0) {
        controlsSvc.update(); 
      }
    });

    // 2. Demo Scene
    if (ENABLE_DEMO) {
      const THREE = await import("three");
      const geo = new THREE.BoxGeometry(1, 1, 1);
      const mat = new THREE.MeshStandardMaterial({ color: 0x007fd4 });
      const cube = new THREE.Mesh(geo, mat);
      cube.name = "Demo Cube";
      cube.position.y = 0.5;
      sceneSvc.addObject("demo_cube", cube);

      const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222);
      rendererSvc.scene.add(grid);

      const amb = new THREE.AmbientLight(0xffffff, 0.4);
      const dir = new THREE.DirectionalLight(0xffffff, 1);
      dir.position.set(5, 10, 7);
      rendererSvc.scene.add(amb, dir);
    }

    // 3. Outliner
    const outlinerModule = await import("./modules/outliner/index.js");
    outlinerModule.init({ 
      container: document.body, 
      services: { sceneSvc, rendererSvc, controlsSvc, eventBus } 
    });

    // 4. Main Menu
    const mainMenu = document.getElementById("main-menu");
    if (mainMenu) {
      const createBtn = (label, fn) => {
        const b = document.createElement("button");
        b.className = "btn"; b.textContent = label; b.onclick = fn;
        mainMenu.appendChild(b);
      };

      createBtn("Save", () => {
        const json = saveProject({ scene: sceneSvc.serialize() });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([json], {type: "application/json"}));
        a.download = "ti3d-project.json"; a.click();
      });

      const loadBtn = document.createElement("button");
      loadBtn.className = "btn"; loadBtn.textContent = "Load";
      loadBtn.onclick = () => {
        const i = document.createElement("input"); i.type = "file"; i.style.display = "none";
        i.onchange = async (e) => {
          if (e.target.files[0]) sceneSvc.deserialize(loadProject(await e.target.files[0].text())?.state?.scene);
        };
        document.body.appendChild(i); i.click();
      };
      mainMenu.appendChild(loadBtn);

      const spacer = document.createElement("div"); spacer.style.flex = "1"; mainMenu.appendChild(spacer);
      mainMenu.insertAdjacentHTML("beforeend", `<div style="color:#666;font-size:11px;margin-right:12px">Ctrl+Z / Ctrl+Y</div>`);

      const counter = document.createElement("div");
      counter.style.cssText = "font-size:11px;color:#888;margin-right:12px"; counter.textContent = "0 selected";
      mainMenu.appendChild(counter);
      eventBus.addEventListener("selection:changed", e => {
        const c = e.detail.ids.length; counter.textContent = `${c} selected`; counter.style.color = c > 0 ? "#fff" : "#888";
      });

      const chipBtn = document.createElement("button");
      chipBtn.className = "btn"; chipBtn.textContent = "Open Chip Editor";
      chipBtn.onclick = async () => {
        if (chipEditorInstance) { chipEditorInstance.destroy(); chipEditorInstance = null; chipBtn.textContent = "Open Chip Editor"; return; }
        chipBtn.disabled = true;
        try {
          const mod = await import("./modules/chip-editor/index.js");
          chipEditorInstance = mod.init({
            container: document.body,
            services: { sceneSvc, rendererSvc, controlsSvc, eventBus },
            onClose: () => { chipEditorInstance = null; chipBtn.textContent = "Open Chip Editor"; chipBtn.disabled = false; }
          });
          chipBtn.textContent = "Close Chip Editor";
        } catch (e) { console.error(e); } finally { chipBtn.disabled = false; }
      };
      mainMenu.appendChild(chipBtn);
    }

    if (spinner) spinner.remove();

    // Start Loop
    rendererSvc.start(() => {
      controlsSvc.update();
    });

    appHandles = { rendererSvc, sceneSvc, controlsSvc, pickingSvc, historySvc };
    if (import.meta.env && import.meta.env.DEV) window.__app = appHandles;

  } catch (err) {
    console.error("Bootstrap failed", err);
    if (spinner) {
      spinner.style.border="none"; spinner.style.animation="none";
      spinner.innerHTML = `<div style="text-align:center;color:#ff4444;background:#222;padding:20px;border-radius:8px;border:1px solid #ff4444"><b>System Error</b><br>${err.message}</div>`;
    }
  }
}

bootstrap();