import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().email("Invalid email address").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(8, "Password must be at least 8 characters"),
  displayName: z.string().trim().optional(),
});

export const loginSchema = z.object({
  email: z.string().email("Invalid email address").transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, "Password is required"),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export const checkoutSchema = z.object({
  plan: z.enum(["pro", "studio"], {
    errorMap: () => ({ message: "Invalid plan. Choose 'pro' or 'studio'." }),
  }),
});

export const refineSchema = z.object({
  instruction: z
    .string()
    .trim()
    .min(1, "Instruction is required")
    .max(10000, "Instruction must be 10000 characters or fewer"),
});

export const generateIconSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(1000).optional(),
});

export const visualFeedbackSchema = z.object({
  screenshot: z
    .string()
    .min(1, "Screenshot (base64) is required"),
  instruction: z
    .string()
    .trim()
    .max(5000, "Instruction must be 5000 characters or fewer")
    .optional(),
});
