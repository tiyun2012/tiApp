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