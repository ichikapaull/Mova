/** Shared class names for dropdown and context menus. */
export const menuContentClass =
  "z-50 min-w-[12rem] overflow-hidden rounded-lg border border-border-strong bg-surface-elevated p-1 text-sm shadow-xl shadow-black/50 data-[state=open]:animate-scale-in origin-(--radix-dropdown-menu-content-transform-origin)";
export const menuItemClass =
  "relative flex cursor-default items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] text-foreground/90 outline-none select-none data-[highlighted]:bg-white/[0.07] data-[highlighted]:text-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground data-[variant=destructive]:text-destructive data-[variant=destructive]:[&_svg]:text-destructive";
export const menuSeparatorClass = "-mx-1 my-1 h-px bg-border";
export const menuLabelClass = "px-2 py-1.5 text-[11px] font-medium uppercase tracking-wider text-subtle-foreground";
