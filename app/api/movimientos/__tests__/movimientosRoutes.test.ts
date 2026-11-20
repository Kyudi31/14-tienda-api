import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Auth } from "firebase-admin/auth";
import { setMockAuthAdmin, setMockFirestoreAdmin } from "@/lib/firebaseAdmin";
import { MockFirestoreDb } from "@/lib/__tests__/mockFirestore";
import type { MovimientoDoc, SincronizacionResponse } from "@/lib/firestoreSchemas";
import { GET as getMovimientos } from "../route";
import { PUT as putMovimiento, DELETE as deleteMovimiento } from "../[id]/route";

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

describe("Rutas de Movimientos (/api/movimientos)", () => {
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

  it("GET /api/movimientos sin token responde 401", async () => {
    const res = await getMovimientos(req("http://localhost:3000/api/movimientos"));
    expect(res.status).toBe(401);
  });

  it("PUT /api/movimientos/:id guarda movimiento idempotentemente", async () => {
    const uid = "user-1";
    const request = req(
      "http://localhost:3000/api/movimientos/mov-1",
      "PUT",
      { producto_id: "prod-10", delta: 5, motivo: "Compra inicial" },
      "valid-user-1"
    );

    const res = await putMovimiento(request, makeParams("mov-1"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as MovimientoDoc;
    expect(body.id).toBe("mov-1");
    expect(body.producto_id).toBe("prod-10");
    expect(body.delta).toBe(5);

    const enDb = mockDb.getStored(uid, "movimiento_stock", "mov-1");
    expect(enDb?.producto_id).toBe("prod-10");
  });

  it("GET /api/movimientos retorna items y servidor_ahora", async () => {
    const uid = "user-1";
    mockDb.seed(uid, "movimiento_stock", "m1", {
      producto_id: "p1",
      delta: 2,
      motivo: "Ajuste",
      created_at: "2026-11-20T00:00:00.000Z",
      updated_at: "2026-11-20T00:00:00.000Z",
      deleted_at: null,
    });

    const res = await getMovimientos(req("http://localhost:3000/api/movimientos", "GET", undefined, "valid-user-1"));
    expect(res.status).toBe(200);

    const body = (await res.json()) as SincronizacionResponse<MovimientoDoc>;
    expect(body.items.length).toBe(1);
    expect(body.items[0]?.id).toBe("m1");
    expect(body.servidor_ahora).toBeDefined();
  });

  it("DELETE /api/movimientos/:id realiza borrado lógico", async () => {
    const uid = "user-1";
    mockDb.seed(uid, "movimiento_stock", "m-del", {
      producto_id: "p1",
      delta: -1,
      motivo: "Error",
      created_at: "2026-11-20T00:00:00.000Z",
      updated_at: "2026-11-20T00:00:00.000Z",
      deleted_at: null,
    });

    const res = await deleteMovimiento(
      req("http://localhost:3000/api/movimientos/m-del", "DELETE", undefined, "valid-user-1"),
      makeParams("m-del")
    );
    expect(res.status).toBe(200);

    const enDb = mockDb.getStored(uid, "movimiento_stock", "m-del");
    expect(enDb?.deleted_at).toBeDefined();
  });
});
