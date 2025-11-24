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