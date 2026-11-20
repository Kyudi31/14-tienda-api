import { NextResponse } from "next/server";
import {
  formatearDetallesZod,
  manejarErrorApi,
  registrarUsuario,
  registroSchema,
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

    const validacion = registroSchema.safeParse(body);
    if (!validacion.success) {
      return NextResponse.json(
        {
          error: "Datos de entrada inválidos",
          detalles: formatearDetallesZod(validacion.error),
        },
        { status: 400 }
      );
    }

    const resultado = await registrarUsuario(validacion.data);
    return NextResponse.json(resultado, { status: 201 });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
