import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    servidor_ahora: new Date().toISOString(),
    servicio: "14-inventario-tienda-api",
  });
}
