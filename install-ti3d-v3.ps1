# === install-ti3d-v3-fixed.ps1 ===
# Robust Installer for Ti3D v3 (Focus, Error UI, Grid, Fixes)

$Root = Join-Path $PSScriptRoot "tiApp"
Write-Host "🔷 Installing Ti3D v3 (Robust Mode)..." -ForegroundColor Cyan

# --- Helper Function to Write Files Safely ---
function Write-Ti3DFile {
    param(
        [string]$FilePath,
        [string]$Content
    )
    $Full = Join-Path $Root $FilePath
    $Dir = Split-Path $Full -Parent
    if (!(Test-Path $Dir)) { New-Item -ItemType Directory -Force -Path $Dir | Out-Null }
    
    # Write file using UTF8
    [System.IO.File]::WriteAllText($Full, $Content, [System.Text.Encoding]::UTF8)
    Write-Host "   ✅ $FilePath" -ForegroundColor Green
}

# ---------------------------------------------
# 1. ROOT FILES
# ---------------------------------------------

Write-Ti3DFile "package.json" @'
{
  "name": "ti3d-app",
  "version": "1.0.0",
  "description": "Ti3D Modular Editor",
  "type": "module",
  "scripts": {
    "start": "http-server . -p 8080 -c-1 --cors",
    "dev": "http-server . -p 8080 -c-1 --cors -o /public/index.html"
  },
  "dependencies": {
    "three": "^0.170.0"
  },
  "devDependencies": {
    "http-server": "^14.1.1"
  }
}
'@

Write-Ti3DFile "runApp.bat" @'
@echo off
setlocal
title Ti3D Server
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js is missing. Please install from nodejs.org
    pause
    exit /b
)

echo Starting Ti3D Server...
echo Open Chrome to: http://localhost:8080/public/index.html
start "Ti3D Server" /min npm start

timeout /t 3 /nobreak >nul
set "URL=http://localhost:8080/public/index.html"
if exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
    start "" "C:\Program Files\Google\Chrome\Application\chrome.exe" --app="%URL%"
) else (
    start "" "%URL%"
)
'@

# ---------------------------------------------
# 2. PUBLIC HTML
# ---------------------------------------------

Write-Ti3DFile "public\index.html" @'
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Ti3D Modular</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔷</text></svg>">
  
  <link rel="stylesheet" href="/src/app.css">
  <link rel="stylesheet" href="/src/ui/ContextMenu.css">
  <link rel="stylesheet" href="/src/modules/outliner/outliner.css">
  <link rel="stylesheet" href="/src/modules/chip-editor/chip-editor.css">

  <script type="importmap">
  {
    "imports": {
      "three": "/node_modules/three/build/three.module.js",
      "three/examples/jsm/": "/node_modules/three/examples/jsm/"
    }
  }
  </script>

  <style>
    body { margin: 0; background: #111; overflow: hidden; }
    #app { width: 100vw; height: 100vh; display: flex; flex-direction: column; }
    .spinner { position: absolute; left:50%; top:50%; transform:translate(-50%,-50%); 
               width:48px; height:48px; border-radius:50%; border:5px solid rgba(255,255,255,0.08); 
               border-top-color:#007fd4; animation:spin 1s linear infinite; z-index:9999; }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div id="app">
    <div id="main-menu" class="main-menu">
      <div class="app-logo">🔷 Ti3D</div>
    </div>
    <div id="viewport" class="viewport"></div>
    <div id="boot-spinner" class="spinner"></div>
  </div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
'@

# ---------------------------------------------
# 3. SOURCE FILES
# ---------------------------------------------

Write-Ti3DFile "src\app.css" @'
:root{ --bg:#111; --panel:#222; --header:#1f1f1f; --accent:#007fd4; --text:#ddd; --muted:#888; --border:#333; }
*{box-sizing:border-box}
html,body,#app{height:100%;margin:0}
body{background:var(--bg);color:var(--text);font-family:Segoe UI,Arial,sans-serif;font-size:13px}
.main-menu{height:34px;background:var(--header);border-bottom:1px solid var(--border);display:flex;align-items:center;padding:6px 12px;gap:8px}
.app-logo{font-weight:700;color:var(--accent)}
.viewport{position:relative;flex:1;height:calc(100vh - 34px);overflow:hidden}
.btn{background:#333;border:1px solid #444;color:var(--text);padding:4px 8px;border-radius:4px;cursor:pointer}
.btn:hover{background:#444}
.window{position:absolute;background:var(--panel);border:1px solid var(--border);box-shadow:0 10px 40px rgba(0,0,0,0.6);border-radius:6px;overflow:hidden;display:flex;flex-direction:column;z-index:5000}
.window-header{height:32px;background:var(--header);display:flex;align-items:center;justify-content:space-between;padding:0 10px;cursor:move;color:var(--text);font-weight:700;border-bottom:1px solid var(--border)}
.window-content{padding:8px;overflow:auto}
'@

Write-Ti3DFile "src\main.js" @'
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
    const historySvc = new HistoryService();
    const rendererSvc = new RendererService(container);
    const sceneSvc = new SceneService(rendererSvc.scene, historySvc); 
    const controlsSvc = new ControlsService(rendererSvc.camera, rendererSvc.renderer.domElement, sceneSvc);
    const pickingSvc = new PickingService(rendererSvc, sceneSvc, controlsSvc);

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

    const outlinerModule = await import("./modules/outliner/index.js");
    const outliner = outlinerModule.init({ container: document.body, services: { sceneSvc, rendererSvc, controlsSvc, eventBus } });

    // UI Buttons
    const mainMenu = document.getElementById("main-menu");
    if (mainMenu) {
      const createBtn = (lbl, fn) => {
        const b = document.createElement("button");
        b.className = "btn"; b.textContent = lbl; b.onclick = fn;
        mainMenu.appendChild(b);
      };

      createBtn("Save", () => {
        const json = saveProject({ scene: sceneSvc.serialize() });
        const blob = new Blob([json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a"); a.href = url; a.download = "ti3d-project.json";
        document.body.appendChild(a); a.click(); a.remove();
      });

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

      const spacer = document.createElement("div"); spacer.style.flex = "1"; mainMenu.appendChild(spacer);
      mainMenu.insertAdjacentHTML("beforeend", `<div style="color:#666;font-size:11px;margin-right:12px">Ctrl+Z / Ctrl+Y</div>`);

      const counter = document.createElement("div");
      counter.style.fontSize = "11px"; counter.style.color = "#888"; counter.style.marginRight = "12px";
      counter.textContent = "0 selected";
      mainMenu.appendChild(counter);
      eventBus.addEventListener("selection:changed", e => {
        const c = e.detail.ids.length; counter.textContent = `${c} selected`; counter.style.color = c > 0 ? "#fff" : "#888";
      });

      const chipBtn = document.createElement("button");
      chipBtn.className = "btn"; chipBtn.textContent = "Open Chip Editor";
      chipBtn.onclick = async () => {
        if (chipEditorInstance) { chipEditorInstance = null; chipBtn.textContent = "Open Chip Editor"; return; }
        const mod = await import("./modules/chip-editor/index.js");
        chipEditorInstance = mod.init({ container: document.body });
        chipBtn.textContent = "Close Chip Editor";
      };
      mainMenu.appendChild(chipBtn);
    }

    if (spinner) spinner.remove();
    rendererSvc.start(() => controlsSvc.orbit.update?.());
    appHandles = { rendererSvc, sceneSvc };

  } catch (err) {
    console.error("Bootstrap failed", err);
    if (spinner) {
      spinner.style.border = "none";
      spinner.style.animation = "none";
      spinner.style.width = "auto";
      spinner.style.height = "auto";
      spinner.innerHTML = `
        <div style="text-align:center;color:#ff4444;background:#222;padding:20px;border-radius:8px;border:1px solid #ff4444">
          <div style="font-size:18px;font-weight:bold;margin-bottom:8px">🚨 Bootstrap Failed</div>
          <div style="font-size:12px;margin-bottom:16px;color:#ccc">${err.message}</div>
          <button class="btn" onclick="location.reload()">Retry</button>
        </div>
      `;
    }
  }
}
bootstrap();
'@

# ---------------------------------------------
# 4. SERVICES
# ---------------------------------------------

Write-Ti3DFile "src\services\EventBus.js" 'export const eventBus = new EventTarget(); export default eventBus;'

Write-Ti3DFile "src\services\RendererService.js" @'
import * as THREE from "three";
export class RendererService {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setClearColor(0x111111);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, container.clientWidth/container.clientHeight, 0.1, 1000);
    this.camera.position.set(3, 3, 6);
    this._onResize = () => {
      const w = container.clientWidth, h = container.clientHeight;
      this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.renderer.setSize(w, h);
    };
    window.addEventListener("resize", this._onResize);
  }
  start(loop) {
    this.renderer.setAnimationLoop(() => { if (loop) loop(); this.renderer.render(this.scene, this.camera); });
  }
}
'@

Write-Ti3DFile "src\services\SceneService.js" @'
import * as THREE from "three";
import eventBus from "./EventBus.js";
export class SceneService {
  constructor(scene, historySvc) {
    this.scene = scene; this.historySvc = historySvc;
    this.objects = new Map(); this.selectedIds = new Set();
  }
  addObject(id, obj) {
    obj.userData.id = id; this.objects.set(id, obj);
    if (!obj.parent) this.scene.add(obj);
    this._emitChange();
  }
  removeObject(id) {
    const o = this.objects.get(id);
    if (o) {
      if (this.selectedIds.has(id)) { this.selectedIds.delete(id); this._emitSelect(); }
      o.removeFromParent(); if (o.geometry) o.geometry.dispose();
      this.objects.delete(id); this._emitChange();
    }
  }
  getObject(id) { return this.objects.get(id); }
  selectSingle(id) { 
    if(!id) { this.selectedIds.clear(); } else { this.selectedIds.clear(); this.selectedIds.add(id); }
    this._emitSelect();
  }
  toggleSelection(id) {
    if (this.selectedIds.has(id)) this.selectedIds.delete(id); else this.selectedIds.add(id);
    this._emitSelect();
  }
  deleteSelection() {
    const ids = Array.from(this.selectedIds); if(!ids.length) return;
    ids.forEach(id => this.removeObject(id));
  }
  duplicateSelection(mode) {
    const ids = Array.from(this.selectedIds);
    this.selectedIds.clear();
    ids.forEach((id, i) => {
      const orig = this.objects.get(id);
      if(orig) {
        const clone = orig.clone();
        if(clone.material) clone.material = orig.material.clone();
        clone.name += " (Copy)";
        if(mode==="offset") clone.position.addScalar(0.5);
        if(mode==="grid") clone.position.x += 2;
        const newId = crypto.randomUUID();
        this.addObject(newId, clone);
        this.selectedIds.add(newId);
      }
    });
    this._emitSelect();
  }
  serialize() {
    const list = [];
    for(const [id, o] of this.objects) {
      list.push({id, name:o.name, type:o.type, pos:o.position.toArray(), rot:o.rotation.toArray(), scl:o.scale.toArray(), color:o.material?.color?.getHex()});
    }
    return {objects: list};
  }
  deserialize(data) {
    this.selectedIds.clear(); Array.from(this.objects.keys()).forEach(k=>this.removeObject(k));
    data.objects.forEach(d => {
      let mesh;
      if(d.type === "Mesh") {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1,1,1), new THREE.MeshStandardMaterial({color:d.color}));
      }
      if(mesh) {
        mesh.name = d.name; mesh.position.fromArray(d.pos); mesh.rotation.fromArray(d.rot); mesh.scale.fromArray(d.scl);
        this.addObject(d.id, mesh);
      }
    });
  }
  _emitSelect() { eventBus.dispatchEvent(new CustomEvent("selection:changed", {detail:{ids:Array.from(this.selectedIds)}})); }
  _emitChange() { eventBus.dispatchEvent(new CustomEvent("scene:changed")); }
}
'@

Write-Ti3DFile "src\services\HistoryService.js" @'
export class HistoryService {
  constructor() {
    this.stack = []; this.ptr = -1;
    window.addEventListener("keydown", e => {
      if ((e.ctrlKey||e.metaKey) && e.key==="z") { e.preventDefault(); e.shiftKey ? this.redo() : this.undo(); }
      if ((e.ctrlKey||e.metaKey) && e.key==="y") { e.preventDefault(); this.redo(); }
    });
  }
  execute(cmd) {
    this.stack.splice(this.ptr+1);
    cmd.execute(); this.stack.push(cmd); this.ptr++;
  }
  undo() { if(this.ptr >= 0) { this.stack[this.ptr].undo(); this.ptr--; } }
  redo() { if(this.ptr < this.stack.length-1) { this.ptr++; this.stack[this.ptr].execute(); } }
}
'@

Write-Ti3DFile "src\services\ControlsService.js" @'
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import eventBus from "./EventBus.js";

export class ControlsService {
  constructor(cam, el, sceneSvc) {
    this.sceneSvc = sceneSvc; this.helpers = new Map();
    this.camera = cam;
    this.orbit = new OrbitControls(cam, el); this.orbit.enableDamping = true;
    this.transform = new TransformControls(cam, el);
    this.transform.addEventListener("dragging-changed", e => this.orbit.enabled = !e.value);
    el.parentElement.appendChild(this.transform.domElement);
    
    eventBus.addEventListener("selection:changed", e => {
      this.transform.detach(); this.helpers.forEach(h => h.removeFromParent()); this.helpers.clear();
      e.detail.ids.forEach(id => {
        const o = sceneSvc.getObject(id);
        if(o) {
          const h = new THREE.BoxHelper(o, 0x007fd4); sceneSvc.scene.add(h); this.helpers.set(id, h);
          this.transform.attach(o);
        }
      });
    });

    window.addEventListener("keydown", e => {
      if(e.key==="w") this.transform.setMode("translate");
      if(e.key==="e") this.transform.setMode("rotate");
      if(e.key==="r") this.transform.setMode("scale");
      if(e.key==="f") this.focusOnSelection();
      if(e.key==="Escape") sceneSvc.selectSingle(null);
    });
  }

  focusOnSelection() {
    const ids = Array.from(this.sceneSvc.selectedIds);
    if (ids.length === 0) return;
    const box = new THREE.Box3();
    ids.forEach(id => {
      const obj = this.sceneSvc.getObject(id);
      if (obj) box.expandByObject(obj);
    });
    if(box.isEmpty()) return;

    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    this.orbit.target.copy(center);
    const direction = new THREE.Vector3().subVectors(this.camera.position, center).normalize().multiplyScalar(maxDim * 2.5);
    this.camera.position.copy(center).add(direction);
    this.orbit.update();
  }
}
'@

Write-Ti3DFile "src\services\PickingService.js" @'
import * as THREE from "three";
import { showContextMenu } from "../ui/ContextMenu.js";
export class PickingService {
  constructor(renderer, sceneSvc, controls) {
    this.ray = new THREE.Raycaster(); this.sceneSvc = sceneSvc; this.controls = controls;
    this.cam = renderer.camera; this.el = renderer.renderer.domElement;
    this.el.addEventListener("pointerdown", e => {
      if(e.button === 2) { this.handleRightClick(e); return; }
      if(e.button === 0) { this.handleLeftClick(e); }
    });
    this.el.addEventListener("contextmenu", e => e.preventDefault());
  }
  raycast(e) {
    const r = this.el.getBoundingClientRect();
    const uv = { x: ((e.clientX-r.left)/r.width)*2-1, y: -((e.clientY-r.top)/r.height)*2+1 };
    this.ray.setFromCamera(uv, this.cam);
    const hits = this.ray.intersectObjects(Array.from(this.sceneSvc.objects.values()));
    return hits.length ? hits[0].object : null;
  }
  handleLeftClick(e) {
    const obj = this.raycast(e);
    const id = obj ? obj.userData.id : null;
    e.shiftKey ? this.sceneSvc.toggleSelection(id) : this.sceneSvc.selectSingle(id);
  }
  handleRightClick(e) {
    const obj = this.raycast(e);
    if(obj) {
      if(!this.sceneSvc.selectedIds.has(obj.userData.id)) this.sceneSvc.selectSingle(obj.userData.id);
      showContextMenu(e.clientX, e.clientY, [
        {label: "Focus (F)", action: () => this.controls.focusOnSelection()},
        {separator: true},
        {label: "Duplicate (Offset)", action: () => this.sceneSvc.duplicateSelection("offset")},
        {label: "Duplicate (Grid)", action: () => this.sceneSvc.duplicateSelection("grid")},
        {separator: true},
        {label: "Delete", danger: true, action: () => this.sceneSvc.deleteSelection()}
      ]);
    }
  }
}
'@

# ---------------------------------------------
# 5. UI MODULES
# ---------------------------------------------

Write-Ti3DFile "src\modules\outliner\index.js" @'
import eventBus from "../../services/EventBus.js";
export function init({ container, services }) {
  const el = document.createElement("div"); el.className = "mini-outliner";
  el.innerHTML = `<div class="header">Outliner</div><div class="outliner-list"></div>`;
  container.appendChild(el);
  const list = el.querySelector(".outliner-list");
  
  const render = () => {
    list.innerHTML = "";
    for(const [id, o] of services.sceneSvc.objects) {
      const item = document.createElement("div");
      item.className = "outliner-item"; item.textContent = o.name || id;
      if(services.sceneSvc.selectedIds.has(id)) item.classList.add("selected");
      item.onclick = e => e.shiftKey ? services.sceneSvc.toggleSelection(id) : services.sceneSvc.selectSingle(id);
      list.appendChild(item);
    }
  };
  eventBus.addEventListener("scene:changed", render);
  eventBus.addEventListener("selection:changed", render);
  render();
}
'@

Write-Ti3DFile "src\modules\outliner\outliner.css" @'
.mini-outliner { position:absolute; left:12px; top:46px; width:240px; background:#222; border:1px solid #333; border-radius:6px; z-index:50; }
.mini-outliner .header { padding:8px; background:#1f1f1f; border-bottom:1px solid #333; font-weight:700; color:#ddd; }
.outliner-item { padding:6px 10px; color:#888; cursor:pointer; border-bottom:1px solid rgba(255,255,255,0.02); }
.outliner-item:hover { color:#fff; background:rgba(255,255,255,0.05); }
.outliner-item.selected { background:#094771; color:#fff; border-left:3px solid #007fd4; }
'@

Write-Ti3DFile "src\modules\chip-editor\index.js" @'
import { createWindow } from "../../ui/Window.js";
export function init() {
  const win = createWindow({ title: "🔌 Chip Editor", width: 500, height: 400 });
  win.querySelector(".window-content").innerHTML = "<div style='padding:20px;text-align:center;color:#666'>Node Editor Placeholder</div>";
  return { destroy: () => win.remove() };
}
'@

Write-Ti3DFile "src\modules\chip-editor\chip-editor.css" '.chip-window .window-content { background:#151515; }'

Write-Ti3DFile "src\ui\ContextMenu.js" @'
export function showContextMenu(x, y, actions) {
  const old = document.querySelector(".ti-context-menu"); if(old) old.remove();
  const menu = document.createElement("div"); menu.className = "ti-context-menu";
  menu.style.left = x + "px"; menu.style.top = y + "px";
  actions.forEach(a => {
    if(a.separator) { menu.appendChild(document.createElement("hr")); return; }
    const item = document.createElement("div"); item.className = "item";
    if(a.danger) item.style.color = "#ff4444";
    item.textContent = a.label; item.onclick = () => { a.action(); menu.remove(); };
    menu.appendChild(item);
  });
  document.body.appendChild(menu);
  setTimeout(() => window.addEventListener("click", () => menu.remove(), {once:true}), 10);
}
'@

Write-Ti3DFile "src\ui\ContextMenu.css" @'
.ti-context-menu { position:absolute; background:#252526; border:1px solid #454545; border-radius:4px; padding:4px 0; min-width:140px; z-index:9999; }
.ti-context-menu .item { padding:6px 12px; cursor:pointer; color:#ccc; }
.ti-context-menu .item:hover { background:#094771; color:#fff; }
.ti-context-menu hr { border:0; border-top:1px solid #454545; margin:4px 0; }
'@

Write-Ti3DFile "src\ui\Window.js" @'
export function createWindow({ title, width, height }) {
  const w = document.createElement("div"); w.className = "window";
  w.style.width = width+"px"; w.style.height = height+"px"; w.style.left = "300px"; w.style.top = "100px";
  w.innerHTML = `<div class="window-header">${title}<span style="float:right;cursor:pointer" onclick="this.closest('.window').remove()">×</span></div><div class="window-content"></div>`;
  document.body.appendChild(w);
  const h = w.querySelector(".window-header");
  let drag=false, sx, sy, lx, ly;
  h.onmousedown = e => { drag=true; sx=e.clientX; sy=e.clientY; lx=w.offsetLeft; ly=w.offsetTop; };
  window.onmousemove = e => { if(drag) { w.style.left=(lx+e.clientX-sx)+"px"; w.style.top=(ly+e.clientY-sy)+"px"; } };
  window.onmouseup = () => drag=false;
  return w;
}
'@

Write-Ti3DFile "src\utils\serializer.js" @'
export function saveProject(state) { return JSON.stringify({ version: 1, timestamp: Date.now(), state }, null, 2); }
export function loadProject(json) { try { return JSON.parse(json); } catch (e) { return null; } }
'@

Write-Host "------------------------------------------------"
Write-Host "🎉 Ti3D v3 (Fixed) Installed Successfully!" -ForegroundColor Cyan
Write-Host "   Run 'runApp.bat' to start."
Write-Host "------------------------------------------------"