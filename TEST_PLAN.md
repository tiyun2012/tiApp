# 🧪 Ti3D Editor - Quality Assurance Test Plan

**Version:** 1.0
**Last Updated:** 2025-11-24
**Scope:** Core functionality, 3D interaction, and Project Persistence.

---

## 🟢 Phase 1: Smoke Test (Basic Health)
*Objective: Ensure the application loads essential components without crashing.*

| Test ID | Action | Expected Result | Automation Selector / Check |
| :--- | :--- | :--- | :--- |
| **SMOKE-001** | Open Application URL | Page loads with title "Ti3D Modular". | `document.title === 'Ti3D Modular'` |
| **SMOKE-002** | Check Viewport | The 3D Viewport is visible. | `#viewport` exists |
| **SMOKE-003** | Check Console | No critical errors in Console. | `window.console.error` count is 0 |
| **SMOKE-004** | Check Scene Content | "Demo Cube" exists in the scene. | `sceneSvc.getObject('demo_cube')` is not null |

---

## 📷 Phase 2: Navigation & Camera
*Objective: Ensure 3D controls (OrbitControls) are responsive.*

| Test ID | Action | Expected Result | Automation Logic |
| :--- | :--- | :--- | :--- |
| **NAV-001** | Mouse Drag (Left) | Camera position changes (Orbit). | Compare `camera.position` before/after |
| **NAV-002** | Mouse Scroll | Camera zooms in/out. | Compare `camera.position` magnitude |
| **NAV-003** | Window Resize | Canvas resizes to fill window. | `canvas.width === window.innerWidth` |

---

## 👆 Phase 3: Selection System (Picking)
*Objective: Validate raycasting and selection state management.*

| Test ID | Action | Expected Result | Automation Logic |
| :--- | :--- | :--- | :--- |
| **SEL-001** | Single Click Cube | Cube is selected. Blue bounding box appears. | `sceneSvc.selectedIds.has('demo_cube')` |
| **SEL-002** | Click Empty Space | Selection is cleared. | `sceneSvc.selectedIds.size === 0` |
| **SEL-003** | UI Outliner Click | Clicking "Demo Cube" in list selects it in 3D. | Click `.outliner-item` -> Check selection |
| **SEL-004** | Shift + Click | Selects multiple objects (requires 2 objects). | `sceneSvc.selectedIds.size === 2` |

---

## 🛠 Phase 4: Transformation Tools
*Objective: Verify Gizmo interactions and Keyboard shortcuts.*

| Test ID | Action | Expected Result | Automation Logic |
| :--- | :--- | :--- | :--- |
| **TRN-001** | Press 'W' Key | Gizmo mode changes to Translate. | `controlsSvc.transform.getMode() === 'translate'` |
| **TRN-002** | Press 'E' Key | Gizmo mode changes to Rotate. | `controlsSvc.transform.getMode() === 'rotate'` |
| **TRN-003** | Press 'R' Key | Gizmo mode changes to Scale. | `controlsSvc.transform.getMode() === 'scale'` |
| **TRN-004** | Press 'Esc' Key | Deselects current object. | `sceneSvc.selectedIds.size === 0` |

---

## 🖱 Phase 5: Advanced Context Menu
*Objective: Test right-click operations and complex scene logic.*

| Test ID | Action | Expected Result | Automation Logic |
| :--- | :--- | :--- | :--- |
| **CTX-001** | Right-Click Object | Context Menu DOM element appears. | `.ti-context-menu` exists |
| **CTX-002** | Click "Duplicate" | Object count increases by 1. | `sceneSvc.objects.size` increases |
| **CTX-003** | Click "Focus" (F) | Camera target moves to object center. | `controlsSvc.orbit.target` ≈ object position |
| **CTX-004** | Click "Delete" | Object removed from scene and outliner. | `sceneSvc.getObject(...)` returns undefined |

---

## 📂 Phase 6: Hierarchy & Grouping
*Objective: Verify parenting logic.*

| Test ID | Action | Expected Result | Automation Logic |
| :--- | :--- | :--- | :--- |
| **GRP-001** | Select 2 Objs -> Group | A new Group object is created. | `sceneSvc.objects` contains type 'Group' |
| **GRP-002** | Select Group | Bounding box covers all children. | Group selection helper is visible |
| **GRP-003** | Undo Group (Ctrl+Z) | Group removed, children return to root. | Group ID removed from scene |

---

## 💾 Phase 7: Persistence (Save/Load)
*Objective: Ensure JSON serialization is accurate.*

| Test ID | Action | Expected Result | Automation Logic |
| :--- | :--- | :--- | :--- |
| **SAVE-001** | Modify & Save | `ti3d-project.json` is generated. | Verify JSON structure contains `state.scene` |
| **LOAD-001** | Load JSON | Scene reconstructs exactly as saved. | Compare loaded object count vs saved count |

---

## 🤖 Future Automation Strategy
*Notes for implementing Playwright/Puppeteer:*

1.  **Expose Internals:** Use the `window.__app` object (exposed in `main.js` during DEV) to assert state directly in tests.
    * *Example:* `await page.evaluate(() => window.__app.sceneSvc.selectedIds.size)`
2.  **Mock File System:** For `SAVE-001` and `LOAD-001`, mock the `input[type="file"]` interaction to avoid OS dialogs.
3.  **Visual Regression:** Use `toMatchSnapshot()` for the 3D canvas to catch rendering regressions (shaders, lighting).