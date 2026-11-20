import { NextResponse } from "next/server";
import { manejarErrorApi, verificarAuth } from "@/lib/auth";
import { obtenerProductosBajoStock } from "@/lib/firestoreService";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const sesion = await verificarAuth(request);
    const productos = await obtenerProductosBajoStock(sesion.uid);
    return NextResponse.json(productos, { status: 200 });
  } catch (error) {
    return manejarErrorApi(error);
  }
}
