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