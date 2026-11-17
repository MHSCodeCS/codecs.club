/** Names the service a slides link points to, for "Open slides in Canva ↗". */
export function slidesProvider(url: string): string {
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("canva.com")) return "Canva";
    if (host.endsWith("figma.com")) return "Figma";
    if (host.endsWith("google.com")) return "Google Slides";
  } catch {
    // Fall through to the generic label.
  }
  return "a new tab";
}
