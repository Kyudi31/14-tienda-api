import { NextResponse } from "next/server";
import { manejarErrorApi, verificarAuth } from "@/lib/auth";
import { obtenerRecursoSincronizacion } from "@/lib/firestoreService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const sesion = await verificarAuth(request);
    const { searchParams } = new URL(request.url);
    const since = searchParams.get("since") ?? undefined;

    const resultado = await obtenerRecursoSincronizacion(
      sesion.uid,
      "movimiento_stock",
      since
    );

    return NextResponse.json(resultado, { status: 200 });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
