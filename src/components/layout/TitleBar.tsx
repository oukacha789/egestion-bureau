export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="h-8 shrink-0 flex items-center justify-center bg-bx-900 border-b border-bx-800 select-none relative"
    >
      {/* Traffic lights zone — ~70px inset on left, must stay draggable */}
      <div className="absolute inset-y-0 left-0 w-[70px]" data-tauri-drag-region />
      {/* Icon + title */}
      <div className="flex items-center gap-1.5 pointer-events-none">
        <img src="/icon.png" alt="" className="w-[14px] h-[14px] rounded-[3px]" />
        <span className="text-[12px] font-semibold text-zinc-300 tracking-tight">eGestion</span>
      </div>
    </div>
  );
}
