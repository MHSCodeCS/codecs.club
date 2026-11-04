import { v } from "convex/values";

// Fixed dark-editor brand colors: Keyword, Function, String and Number.
// Keep these values and order stable: existing students retain their assigned color.
export const avatarColors = ["#5ee8bf", "#b8a8ff", "#ffd27a", "#ff9f85"] as const;
export const avatarColorValidator = v.union(...avatarColors.map(color => v.literal(color)));
// Read legacy gray values until existing records have been migrated.
export const storedAvatarColorValidator = v.union(avatarColorValidator, v.literal("#7f938a"), v.literal("#a9b8b1"));
export type StudentAvatarColor = typeof avatarColors[number];

export function studentAvatarColor(student: { _id: string; avatarColor?: string }): StudentAvatarColor {
  if (avatarColors.includes(student.avatarColor as StudentAvatarColor)) return student.avatarColor as StudentAvatarColor;
  // Stable fallback for records created before avatars were introduced.
  let hash = 2166136261;
  for (const character of student._id) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
  return avatarColors[(hash >>> 0) % avatarColors.length];
}
