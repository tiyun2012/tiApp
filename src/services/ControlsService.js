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