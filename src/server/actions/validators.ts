import { z } from "zod";

export const idSchema = z.number().int().positive();
export const idsSchema = z.array(idSchema).min(1).max(20_000);
export const nameSchema = z.string().trim().min(1).max(150);
export const optionalTextSchema = z.string().max(5000).nullable().optional();
