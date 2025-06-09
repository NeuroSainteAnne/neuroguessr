export function onBeforePrerenderStart() {
  if (!(global as { __welcomePrerendered?: boolean }).__welcomePrerendered) {
    (global as { __welcomePrerendered?: boolean }).__welcomePrerendered = true;
    return ['/welcome']
  }
  return []
}