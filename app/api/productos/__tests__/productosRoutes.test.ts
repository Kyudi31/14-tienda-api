import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Auth } from "firebase-admin/auth";
import { setMockAuthAdmin, setMockFirestoreAdmin } from "@/lib/firebaseAdmin";
import { MockFirestoreDb } from "@/lib/__tests__/mockFirestore";
import type { ProductoDoc, MovimientoDoc, SincronizacionResponse } from "@/lib/firestoreSchemas";
import { POST as postAjustar } from "../[id]/ajustar/route";
import { GET as getBajoStock } from "../bajo-stock/route";
import { GET as getProductos } from "../route";
import { PUT as putProducto, DELETE as deleteProducto } from "../[id]/route";

const mockDb = new MockFirestoreDb();

function req(url: string, method = "GET", body?: unknown, token?: string): Request {
  const headers = new Headers();
  if (body !== undefined) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return new Request(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

function makeParams(id: string): { params: Promise<{ id: string }> } {
  return { params: Promise.resolve({ id }) };
}

const baseProd = {
  codigo: "7701",
  created_at: "2026-11-20T00:00:00.000Z",
  updated_at: "2026-11-20T00:00:00.000Z",
  deleted_at: null,
};

describe("Endpoints de Negocio, Firestore y Sincronización (/api/productos)", () => {
  beforeEach(() => {
    mockDb.reset();
    setMockFirestoreAdmin(mockDb.asFirestore());
    setMockAuthAdmin({
      verifyIdToken: vi.fn().mockImplementation(async (tok: string) => {
        if (!tok.startsWith("valid-")) throw new Error("Token inválido");
        const uid = tok.replace("valid-", "");
        return { uid, email: `${uid}@tienda.com`, rol: "usuario" };
      }),
    } as unknown as Auth);
  });

  // Prueba 1 requerida
  it("Prueba 1: Ruta protegida sin Bearer token responde 401", async () => {
    const resAjustar = await postAjustar(
      req("http://localhost:3000/api/productos/p1/ajustar", "POST", { delta: 1 }),
      makeParams("p1")
    );
    expect(resAjustar.status).toBe(401);
    const bodyAjustar = (await resAjustar.json()) as { error: string };
    expect(bodyAjustar.error).toBeDefined();

    const resBajoStock = await getBajoStock(req("http://localhost:3000/api/productos/bajo-stock"));
    expect(resBajoStock.status).toBe(401);

    const resProductos = await getProductos(req("http://localhost:3000/api/productos"));
    expect(resProductos.status).toBe(401);
  });

  // Prueba 2 requerida
  it("Prueba 2: Ajuste de stock con cantidad que resulta en stock negativo responde 400", async () => {
    const uid = "user-1";
    mockDb.seed(uid, "producto", "p-neg", {
      ...baseProd,
      nombre: "Leche",
      precio_centavos: 3500,
      stock: 5,
      minimo: 2,
      bajo_stock: false,
    });

    const request = req("http://localhost:3000/api/productos/p-neg/ajustar", "POST", { delta: -10 }, "valid-user-1");
    const res = await postAjustar(request, makeParams("p-neg"));
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Stock insuficiente");

    const docEnDb = mockDb.getStored(uid, "producto", "p-neg");
    expect(docEnDb?.stock).toBe(5);
    expect(mockDb.getAllStored(uid, "movimiento_stock").length).toBe(0);
  });

  // Prueba 3 requerida
  it("Prueba 3: Ajuste de stock válido actualiza stock, bajo_stock y registra movimiento atómico (200)", async () => {
    const uid = "user-1";
    mockDb.seed(uid, "producto", "p-ok", {
      ...baseProd,
      nombre: "Arroz",
      precio_centavos: 4200,
      stock: 10,
      minimo: 5,
      bajo_stock: false,
    });

    const request = req("http://localhost:3000/api/productos/p-ok/ajustar", "POST", { delta: -6, motivo: "Venta" }, "valid-user-1");
    const res = await postAjustar(request, makeParams("p-ok"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as { producto: ProductoDoc; movimiento: MovimientoDoc };
    expect(body.producto.stock).toBe(4);
    expect(body.producto.bajo_stock).toBe(true);
    expect(body.movimiento.delta).toBe(-6);
    expect(body.movimiento.motivo).toBe("Venta");

    const prodEnDb = mockDb.getStored(uid, "producto", "p-ok");
    expect(prodEnDb?.stock).toBe(4);
    expect(prodEnDb?.bajo_stock).toBe(true);
    const movs = mockDb.getAllStored(uid, "movimiento_stock");
    expect(movs.length).toBe(1);
    expect(movs[0]?.delta).toBe(-6);
  });

  // Prueba 4 requerida
  it("Prueba 4: GET /api/productos/bajo-stock retorna únicamente productos con bajo_stock = true", async () => {
    const uid = "user-1";
    mockDb.seed(uid, "producto", "p-alto", { ...baseProd, nombre: "Aceite", precio_centavos: 8000, stock: 20, minimo: 5, bajo_stock: false });
    mockDb.seed(uid, "producto", "p-bajo", { ...baseProd, nombre: "Café", precio_centavos: 6500, stock: 2, minimo: 5, bajo_stock: true });
    mockDb.seed(uid, "producto", "p-del-bajo", { ...baseProd, nombre: "Pan", precio_centavos: 2000, stock: 1, minimo: 10, bajo_stock: true, deleted_at: "2026-11-20T01:00:00.000Z" });

    const request = req("http://localhost:3000/api/productos/bajo-stock", "GET", undefined, "valid-user-1");
    const res = await getBajoStock(request);
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProductoDoc[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBe(1);
    expect(body[0]?.id).toBe("p-bajo");
    expect(body[0]?.bajo_stock).toBe(true);
  });

  // Prueba 5 requerida
  it("Prueba 5: Aislamiento entre usuarios (usuario 1 no puede ver ni modificar datos en la ruta de usuario 2)", async () => {
    const u1 = "user-1";

    mockDb.seed(u1, "producto", "prod-privado-u1", {
      ...baseProd,
      nombre: "Exclusivo U1",
      precio_centavos: 9900,
      stock: 15,
      minimo: 3,
      bajo_stock: false,
    });

    // U2 intenta ajustar el producto de U1 -> 404
    const resAjusteU2 = await postAjustar(
      req("http://localhost:3000/api/productos/prod-privado-u1/ajustar", "POST", { delta: -3 }, "valid-user-2"),
      makeParams("prod-privado-u1")
    );
    expect(resAjusteU2.status).toBe(404);

    // U2 lista productos -> no ve el producto de U1
    const resListarU2 = await getProductos(req("http://localhost:3000/api/productos", "GET", undefined, "valid-user-2"));
    expect(resListarU2.status).toBe(200);
    const bodyU2 = (await resListarU2.json()) as SincronizacionResponse<ProductoDoc>;
    expect(bodyU2.items.some((p) => p.id === "prod-privado-u1")).toBe(false);

    // El stock del producto de U1 sigue intacto
    const prodU1 = mockDb.getStored(u1, "producto", "prod-privado-u1");
    expect(prodU1?.stock).toBe(15);

    // U1 sí ve su producto
    const resListarU1 = await getProductos(req("http://localhost:3000/api/productos", "GET", undefined, "valid-user-1"));
    const bodyU1 = (await resListarU1.json()) as SincronizacionResponse<ProductoDoc>;
    expect(bodyU1.items.some((p) => p.id === "prod-privado-u1")).toBe(true);
  });

  // Pruebas adicionales
  it("PUT /api/productos/:id guarda producto descartando campos no declarados y calcula bajo_stock", async () => {
    const uid = "user-1";
    const request = req(
      "http://localhost:3000/api/productos/nuevo-prod",
      "PUT",
      { nombre: "Galletas", precio_centavos: 1500, stock: 3, minimo: 5, campo_malicioso: "hacker" },
      "valid-user-1"
    );

    const res = await putProducto(request, makeParams("nuevo-prod"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as ProductoDoc;
    expect(body.id).toBe("nuevo-prod");
    expect(body.bajo_stock).toBe(true);
    expect("campo_malicioso" in body).toBe(false);

    const enDb = mockDb.getStored(uid, "producto", "nuevo-prod");
    expect(enDb?.bajo_stock).toBe(true);
    expect("campo_malicioso" in (enDb ?? {})).toBe(false);
  });

  it("DELETE /api/productos/:id ejecuta borrado lógico con deleted_at ISO", async () => {
    const uid = "user-1";
    mockDb.seed(uid, "producto", "p-borrar", { ...baseProd, nombre: "Temporal", precio_centavos: 1000, stock: 5, minimo: 2, bajo_stock: false });

    const request = req("http://localhost:3000/api/productos/p-borrar", "DELETE", undefined, "valid-user-1");
    const res = await deleteProducto(request, makeParams("p-borrar"));
    expect(res.status).toBe(200);

    const enDb = mockDb.getStored(uid, "producto", "p-borrar");
    expect(typeof enDb?.deleted_at).toBe("string");

    const resRepetido = await deleteProducto(request, makeParams("p-borrar"));
    expect(resRepetido.status).toBe(404);
  });

  it("POST /api/productos/:id/ajustar con delta = 0 responde 400 y detalles Zod", async () => {
    const request = req("http://localhost:3000/api/productos/p1/ajustar", "POST", { delta: 0 }, "valid-user-1");
    const res = await postAjustar(request, makeParams("p1"));
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string; detalles: Array<{ campo: string }> };
    expect(body.error).toBe("Datos de ajuste inválidos");
    expect(body.detalles.some((d) => d.campo === "delta")).toBe(true);
  });
});
