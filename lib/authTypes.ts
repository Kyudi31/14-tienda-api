import { NextResponse } from "next/server";
import { z } from "zod";

export interface AuthUser {
  uid: string;
  email?: string;
  rol?: string;
}

export interface AuthTokensResponse {
  token: string;
  refreshToken: string;
  expiraEnSeg: number;
  usuario: {
    id: string;
    email: string;
  };
}

export interface RefreshTokenResponse {
  token: string;
  refreshToken: string;
  expiraEnSeg: number;
}

export class ApiError extends Error {
  readonly status: number;
  readonly detalles?: Array<{ campo: string; mensaje: string }>;

  constructor(
    status: number,
    message: string,
    detalles?: Array<{ campo: string; mensaje: string }>
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detalles = detalles;
  }
}

export class AuthError extends ApiError {
  constructor(
    status: number,
    message: string,
    detalles?: Array<{ campo: string; mensaje: string }>
  ) {
    super(status, message, detalles);
    this.name = "AuthError";
  }
}

export const registroSchema = z.object({
  email: z.string().email("El correo electrónico no es válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

export const loginSchema = z.object({
  email: z.string().email("El correo electrónico no es válido"),
  password: z.string().min(1, "La contraseña es requerida"),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, "El token de actualización es requerido"),
});

export type RegistroInput = z.infer<typeof registroSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;

export function formatearDetallesZod(
  error: z.ZodError
): Array<{ campo: string; mensaje: string }> {
  return error.issues.map((issue) => ({
    campo: issue.path.join(".") || "cuerpo",
    mensaje: issue.message,
  }));
}

export function manejarErrorApi(error: unknown): NextResponse {
  if (error instanceof Response) {
    return error as NextResponse;
  }
  if (error instanceof ApiError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error.detalles ? { detalles: error.detalles } : {}),
      },
      { status: error.status }
    );
  }
  return NextResponse.json(
    { error: "Error interno del servidor" },
    { status: 500 }
  );
}
