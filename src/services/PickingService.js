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