import { z } from 'zod';
export const risuSchema = z.object({
  version: z.literal(1),
  scripts: z
    .array(
      z.object({
        id: z.string().max(1000),
        name: z.string().max(1000),
        code: z.string().max(2_000_000),
      }),
    )
    .max(30),
  styles: z.string().max(1_000_000),
  variables: z.string().max(100000),
  postHistory: z.string().max(2_000_000).optional(),
  examples: z.string().max(2_000_000).optional(),
  rules: z
    .array(
      z.object({
        id: z.string().max(1000),
        name: z.string().max(1000),
        type: z.enum(['editdisplay', 'editprocess', 'editinput', 'editoutput']),
        pattern: z.string().max(10000),
        replacement: z.string().max(2_000_000),
        flags: z.string().max(100),
        cbs: z.boolean().optional(),
      }),
    )
    .max(1000),
  loreSettings: z.object({
    scanDepth: z.number().int().min(0).max(1000),
    tokenBudget: z.number().min(0).max(1e7),
    recursive: z.boolean(),
  }),
});
