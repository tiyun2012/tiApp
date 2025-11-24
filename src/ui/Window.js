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