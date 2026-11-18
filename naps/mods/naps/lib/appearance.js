// Light ↔ dark without the Settings window. Herdr has no command for it, but settings.json is
// live, so the mod writes `appearance` there. `dark`: what shows now (settings().dark), which
// also covers settings that follow the system.

/** settings.json's text with `appearance` flipped from what shows now; null if it isn't JSON. */
export function flipAppearance(text, dark) {
  let settings;
  try { settings = JSON.parse(text); } catch { return null; }
  if (!settings || typeof settings !== "object") return null;
  return `${JSON.stringify({ ...settings, appearance: dark ? "light" : "dark" }, null, 2)}\n`;
}
