import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Auth } from "firebase-admin/auth";
import { setMockAuthAdmin } from "@/lib/firebaseAdmin";
import { verificarAuth, verificarAdminRole } from "@/lib/auth";

describe("Helpers de Autenticación (lib/auth)", () => {
  beforeEach(() => {
    setMockAuthAdmin(null);
    vi.restoreAllMocks();
  });

  it("verificarAuth rechaza con 401 si no hay cabecera Bearer", async () => {
    const req = new Request("http://localhost:3000/api/test");
    await expect(verificarAuth(req)).rejects.toSatisfy(
      (err: unknown) => err instanceof Response && err.status === 401
    );
  });

  it("verificarAuth rechaza con 401 si el token es inválido o expira", async () => {
    setMockAuthAdmin({
      verifyIdToken: vi.fn().mockRejectedValue(new Error("Token expirado")),
    } as unknown as Auth);

    const req = new Request("http://localhost:3000/api/test", {
      headers: { authorization: "Bearer token-expirado" },
    });
    await expect(verificarAuth(req)).rejects.toSatisfy(
      (err: unknown) => err instanceof Response && err.status === 401
    );
  });

  it("verificarAdminRole rechaza con 403 si el rol no es admin", async () => {
    setMockAuthAdmin({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "user-1",
        email: "u@tienda.com",
        rol: "cajero",
      }),
    } as unknown as Auth);

    const req = new Request("http://localhost:3000/api/test", {
      headers: { authorization: "Bearer token-cajero" },
    });
    await expect(verificarAdminRole(req)).rejects.toSatisfy(
      (err: unknown) => err instanceof Response && err.status === 403
    );
  });

  it("verificarAdminRole aprueba al usuario admin", async () => {
    setMockAuthAdmin({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "admin-1",
        email: "admin@tienda.com",
        rol: "admin",
      }),
    } as unknown as Auth);

    const req = new Request("http://localhost:3000/api/test", {
      headers: { authorization: "Bearer token-admin" },
    });
    const user = await verificarAdminRole(req);
    expect(user.uid).toBe("admin-1");
    expect(user.rol).toBe("admin");
  });
});
