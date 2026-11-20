import { NextResponse } from "next/server";
import { formatearDetallesZod, manejarErrorApi, verificarAuth } from "@/lib/auth";
import { ajusteStockSchema } from "@/lib/firestoreSchemas";
import { ajustarStockTransaccional } from "@/lib/firestoreService";

export const runtime = "nodejs";

export async function POST(
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

    const validacion = ajusteStockSchema.safeParse(body);
    if (!validacion.success) {
      return NextResponse.json(
        {
          error: "Datos de ajuste inválidos",
          detalles: formatearDetallesZod(validacion.error),
        },
        { status: 400 }
      );
    }

    const resultado = await ajustarStockTransaccional(
      sesion.uid,
      id,
      validacion.data.delta,
      validacion.data.motivo
    );

    return NextResponse.json(resultado, { status: 200 });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
