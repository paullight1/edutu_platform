import { z } from "zod";

export const DM_MESSAGE_MAX_LENGTH = 2000;

export const CreateDmRequestSchema = z.object({
  recipientId: z.string().trim().min(1, "Choose someone to message."),
  body: z
    .string()
    .trim()
    .min(1, "Write a message first.")
    .max(DM_MESSAGE_MAX_LENGTH, "Messages can be up to 2,000 characters."),
});

export const SendDmMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "Write a message first.")
    .max(DM_MESSAGE_MAX_LENGTH, "Messages can be up to 2,000 characters."),
});

export const BlockDmUserSchema = z.object({
  userId: z.string().trim().min(1, "Choose someone to block."),
});

export type CreateDmRequestDto = z.infer<typeof CreateDmRequestSchema>;
export type SendDmMessageDto = z.infer<typeof SendDmMessageSchema>;
export type BlockDmUserDto = z.infer<typeof BlockDmUserSchema>;
