/**
 * Python packages a workspace installs with micropip. Shared by the Convex
 * functions that store the list and the workspace that installs them.
 */
export const MAX_PACKAGES = 20;

/** A PyPI-style name with an optional ==version pin. */
export function packageSpecProblem(spec: string): string | null {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?(?:==[A-Za-z0-9.+!-]{1,32})?$/.test(spec)) {
    return "Use a package name like “emoji” or “emoji==2.12.1”.";
  }
  return null;
}

/** The name without a version pin, lowercased, for duplicate checks. */
export function packageKey(spec: string): string {
  return spec.split("==")[0]!.toLowerCase().replace(/[-_.]+/g, "-");
}
