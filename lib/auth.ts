import { NextResponse } from "next/server";
import { type AuthUser } from "./authTypes";
import { getAuthAdmin } from "./firebaseAdmin";

export * from "./authTypes";
export * from "./authClient";

export async function verificarAuth(request: Request): Promise<AuthUser> {
  const authHeader =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw NextResponse.json(
      { error: "Token de autorización no proporcionado o formato inválido" },
      { status: 401 }
    );
  }

  const token = authHeader.substring(7).trim();
  if (!token) {
    throw NextResponse.json(
      { error: "Token de autorización no proporcionado o formato inválido" },
      { status: 401 }
    );
  }

  try {
    const authAdmin = getAuthAdmin();
    const decoded = await authAdmin.verifyIdToken(token);
    const rol =
      typeof decoded.rol === "string"
        ? decoded.rol
        : typeof decoded.role === "string"
        ? decoded.role
        : undefined;

    return {
      uid: decoded.uid,
      email: decoded.email,
      rol,
    };
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    throw NextResponse.json(
      { error: "Token inválido o expirado" },
      { status: 401 }
    );
  }
}

export async function verificarAdminRole(request: Request): Promise<AuthUser> {
  const usuario = await verificarAuth(request);
  if (usuario.rol !== "admin") {
    throw NextResponse.json(
      { error: "Acceso denegado: se requieren permisos de administrador" },
      { status: 403 }
    );
  }
  return usuario;
}
