import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Auth } from "firebase-admin/auth";
import { setMockAuthAdmin } from "@/lib/firebaseAdmin";
import { GET as getYo } from "../yo/route";
import { POST as postRegistro } from "../registro/route";
import { POST as postLogin } from "../login/route";
import { POST as postRefresh } from "../refresh/route";

function postJson(url: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Rutas de Autenticación (/api/auth)", () => {
  beforeEach(() => {
    setMockAuthAdmin(null);
    vi.restoreAllMocks();
  });

  // Prueba 1 requerida
  it("GET /api/auth/yo sin header Authorization responde 401", async () => {
    const res = await getYo(new Request("http://localhost:3000/api/auth/yo"));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBeDefined();
  });

  // Prueba 2 requerida
  it("POST /api/auth/registro con contraseña corta (< 8) responde 400 y detalles Zod", async () => {
    const req = postJson("http://localhost:3000/api/auth/registro", {
      email: "user@tienda.com",
      password: "123",
    });
    const res = await postRegistro(req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as {
      error: string;
      detalles: Array<{ campo: string; mensaje: string }>;
    };
    expect(body.error).toBe("Datos de entrada inválidos");
    expect(body.detalles.some((d) => d.campo === "password")).toBe(true);
  });

  // Prueba 3 requerida
  it("POST /api/auth/login con credenciales inválidas responde 401", async () => {
    const req = postJson("http://localhost:3000/api/auth/login", {
      email: "user@tienda.com",
      password: "wrongPassword",
    });
    const res = await postLogin(req);
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Credenciales inválidas");
  });

  // Prueba 4 requerida
  it("GET /api/auth/yo con token mock verificado responde 200 y usuario", async () => {
    setMockAuthAdmin({
      verifyIdToken: vi.fn().mockResolvedValue({
        uid: "uid-123",
        email: "tienda@ejemplo.com",
        rol: "admin",
      }),
    } as unknown as Auth);

    const req = new Request("http://localhost:3000/api/auth/yo", {
      headers: { authorization: "Bearer valid-token" },
    });
    const res = await getYo(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      usuario: { id: string; email: string; rol: string };
    };
    expect(body.usuario).toEqual({
      id: "uid-123",
      email: "tienda@ejemplo.com",
      rol: "admin",
    });
  });

  it("POST /api/auth/registro responde 409 cuando el correo ya existe", async () => {
    setMockAuthAdmin({
      createUser: vi.fn().mockRejectedValue({ code: "auth/email-already-exists" }),
    } as unknown as Auth);

    const prevKey = process.env.FIREBASE_API_KEY;
    delete process.env.FIREBASE_API_KEY;
    try {
      const req = postJson("http://localhost:3000/api/auth/registro", {
        email: "existe@tienda.com",
        password: "passwordValido123",
      });
      const res = await postRegistro(req);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("El correo electrónico ya se encuentra registrado");
    } finally {
      process.env.FIREBASE_API_KEY = prevKey;
    }
  });

  it("POST /api/auth/registro exitoso responde 201 con tokens y usuario", async () => {
    setMockAuthAdmin({
      createUser: vi.fn().mockResolvedValue({ uid: "uid-new", email: "new@tienda.com" }),
      createCustomToken: vi.fn().mockResolvedValue("mock-jwt"),
    } as unknown as Auth);

    const prevKey = process.env.FIREBASE_API_KEY;
    delete process.env.FIREBASE_API_KEY;
    try {
      const req = postJson("http://localhost:3000/api/auth/registro", {
        email: "new@tienda.com",
        password: "passwordValido123",
      });
      const res = await postRegistro(req);
      expect(res.status).toBe(201);
      const body = (await res.json()) as {
        token: string;
        refreshToken: string;
        expiraEnSeg: number;
        usuario: { id: string; email: string };
      };
      expect(body.token).toBe("mock-jwt");
      expect(body.usuario.id).toBe("uid-new");
    } finally {
      process.env.FIREBASE_API_KEY = prevKey;
    }
  });

  it("POST /api/auth/login exitoso responde 200 con tokens y usuario", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        idToken: "tok-abc",
        refreshToken: "ref-xyz",
        expiresIn: "3600",
        localId: "uid-abc",
        email: "ok@tienda.com",
      }),
    } as Response);

    const prevKey = process.env.FIREBASE_API_KEY;
    process.env.FIREBASE_API_KEY = "test-key";
    try {
      const req = postJson("http://localhost:3000/api/auth/login", {
        email: "ok@tienda.com",
        password: "password123",
      });
      const res = await postLogin(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string; usuario: { id: string } };
      expect(body.token).toBe("tok-abc");
      expect(body.usuario.id).toBe("uid-abc");
    } finally {
      process.env.FIREBASE_API_KEY = prevKey;
      fetchMock.mockRestore();
    }
  });

  it("POST /api/auth/refresh responde 200 con nuevo token", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        id_token: "tok-refresh-new",
        refresh_token: "ref-new",
        expires_in: "3600",
      }),
    } as Response);

    const prevKey = process.env.FIREBASE_API_KEY;
    process.env.FIREBASE_API_KEY = "test-key";
    try {
      const req = postJson("http://localhost:3000/api/auth/refresh", {
        refreshToken: "ref-valid",
      });
      const res = await postRefresh(req);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { token: string; expiraEnSeg: number };
      expect(body.token).toBe("tok-refresh-new");
      expect(body.expiraEnSeg).toBe(3600);
    } finally {
      process.env.FIREBASE_API_KEY = prevKey;
      fetchMock.mockRestore();
    }
  });

  it("POST /api/auth/refresh con cuerpo inválido responde 400", async () => {
    const res = await postRefresh(postJson("http://localhost:3000/api/auth/refresh", {}));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Datos de entrada inválidos");
  });
});
