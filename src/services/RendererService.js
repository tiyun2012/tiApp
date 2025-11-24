import * as THREE from "three";

export class RendererService {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    
    // High-DPI support
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    this.renderer.setClearColor(0x111111);
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();

    // FIXED: FOV 45 looks more natural for 3D editing (was 60)
    this.camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
    
    // FIXED: Moved camera further back to compensate for zoom
    this.camera.position.set(5, 5, 8);

    this._onResize = () => {
      const w = container.clientWidth;
      const h = container.clientHeight;
      this.camera.aspect = w / h; 
      this.camera.updateProjectionMatrix(); 
      this.renderer.setSize(w, h);
    };

    window.addEventListener("resize", this._onResize);
  }

  start(loop) {
    this.renderer.setAnimationLoop(() => { 
      if (loop) loop(); 
      this.renderer.render(this.scene, this.camera); 
    });
  }
}