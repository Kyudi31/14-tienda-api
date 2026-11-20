import { z } from "zod";

export const productoSchema = z
  .object({
    codigo: z.string().nullable().optional().default(null),
    nombre: z
      .string()
      .trim()
      .min(1, "El nombre debe tener al menos 1 caracter"),
    precio_centavos: z
      .number()
      .int("El precio debe ser un número entero")
      .min(0, "El precio en centavos no puede ser negativo"),
    stock: z
      .number()
      .int("El stock debe ser un número entero")
      .min(0, "El stock no puede ser negativo"),
    minimo: z
      .number()
      .int("El mínimo debe ser un número entero")
      .min(1, "El stock mínimo debe ser al menos 1"),
  })
  .strip();

export const movimientoSchema = z
  .object({
    producto_id: z
      .string()
      .trim()
      .min(1, "El ID del producto es requerido"),
    delta: z
      .number()
      .int("El delta debe ser un número entero"),
    motivo: z
      .string()
      .trim()
      .min(1, "El motivo es requerido"),
  })
  .strip();

export const ajusteStockSchema = z
  .object({
    delta: z
      .number()
      .int("El delta debe ser un número entero")
      .refine((val) => val !== 0, "El delta debe ser distinto de 0"),
    motivo: z.string().trim().optional(),
  })
  .strip();

export type ProductoInput = z.infer<typeof productoSchema>;
export type MovimientoInput = z.infer<typeof movimientoSchema>;
export type AjusteStockInput = z.infer<typeof ajusteStockSchema>;

export interface ProductoDoc {
  id: string;
  codigo: string | null;
  nombre: string;
  precio_centavos: number;
  stock: number;
  minimo: number;
  bajo_stock: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface MovimientoDoc {
  id: string;
  producto_id: string;
  delta: number;
  motivo: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface SincronizacionResponse<T> {
  items: T[];
  servidor_ahora: string;
}
