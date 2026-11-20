import { NextResponse } from "next/server";
import { manejarErrorApi, verificarAuth } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const sesion = await verificarAuth(request);
    return NextResponse.json(
      {
        usuario: {
          id: sesion.uid,
          email: sesion.email ?? null,
          rol: sesion.rol ?? "usuario",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return manejarErrorApi(error);
  }
}
