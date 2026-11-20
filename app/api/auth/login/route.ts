import { NextResponse } from "next/server";
import {
  formatearDetallesZod,
  iniciarSesion,
  loginSchema,
  manejarErrorApi,
} from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Cuerpo de petición inválido o ausente" },
        { status: 400 }
      );
    }

    const validacion = loginSchema.safeParse(body);
    if (!validacion.success) {
      return NextResponse.json(
        {
          error: "Datos de entrada inválidos",
          detalles: formatearDetallesZod(validacion.error),
        },
        { status: 400 }
      );
    }

    const resultado = await iniciarSesion(validacion.data);
    return NextResponse.json(resultado, { status: 200 });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
