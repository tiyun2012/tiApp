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