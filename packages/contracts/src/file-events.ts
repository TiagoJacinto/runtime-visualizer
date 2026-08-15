import { z } from "zod";

export const FileChangeEventSchema = z.object({
  type: z.literal("file-changed"),
  file: z.string(),
  change: z.enum(["added", "modified", "deleted"]),
  revision: z.string().optional(),
});

export type FileChangeEvent = z.infer<typeof FileChangeEventSchema>;
