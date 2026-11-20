import { NextResponse } from "next/server";
import { manejarErrorApi, verificarAuth } from "@/lib/auth";
import {
  eliminarRecursoLogico,
  guardarRecursoIdempotente,
} from "@/lib/firestoreService";

export const runtime = "nodejs";

export async function PUT(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const sesion = await verificarAuth(request);
    const { id } = await props.params;

    const body = (await request.json().catch(() => null)) as unknown;
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "Cuerpo de petición inválido o ausente" },
        { status: 400 }
      );
    }

    const producto = await guardarRecursoIdempotente(
      sesion.uid,
      "producto",
      id,
      body
    );

    return NextResponse.json(producto, { status: 200 });
  } catch (error) {
    return manejarErrorApi(error);
  }
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const sesion = await verificarAuth(request);
    const { id } = await props.params;

    const resultado = await eliminarRecursoLogico(
      sesion.uid,
      "producto",
      id
    );

    return NextResponse.json(resultado, { status: 200 });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
