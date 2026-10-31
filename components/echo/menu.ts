// Shared look for the full-screen menus (title, pause menu, end screen).

const MENU_BUTTON =
  'w-full rounded-md py-3 text-xs uppercase tracking-[0.3em] transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
export const MENU_PRIMARY = `${MENU_BUTTON} bg-primary font-medium text-primary-foreground hover:opacity-90`
export const MENU_SECONDARY = `${MENU_BUTTON} border border-foreground/20 bg-background/35 text-foreground/85 backdrop-blur-sm hover:border-foreground/45 hover:text-foreground`
export const MENU_DANGER = `${MENU_BUTTON} border border-destructive/60 text-destructive hover:bg-destructive/10`

/** Keeps Space / Enter for the game instead of re-pressing the button that started it. */
export function dropFocus() {
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
}
