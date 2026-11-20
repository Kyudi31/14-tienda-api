import {
  type AuthTokensResponse,
  type RefreshTokenResponse,
  type RegistroInput,
  type LoginInput,
  type RefreshInput,
  AuthError,
} from "./authTypes";
import { getAuthAdmin } from "./firebaseAdmin";

function obtenerApiKey(): string | undefined {
  return (
    process.env.FIREBASE_API_KEY?.trim() ??
    process.env.FIREBASE_WEB_API_KEY?.trim() ??
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY?.trim()
  );
}

export async function registrarUsuario(
  input: RegistroInput
): Promise<AuthTokensResponse> {
  const apiKey = obtenerApiKey();

  if (apiKey) {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: input.email,
          password: input.password,
          returnSecureToken: true,
        }),
      }
    );

    const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok || !data) {
      const errorObj =
        data && typeof data.error === "object"
          ? (data.error as Record<string, unknown>)
          : null;
      const message =
        errorObj && typeof errorObj.message === "string"
          ? errorObj.message
          : "";

      if (message.includes("EMAIL_EXISTS")) {
        throw new AuthError(
          409,
          "El correo electrónico ya se encuentra registrado"
        );
      }
      throw new AuthError(
        400,
        "No fue posible registrar el usuario con los datos provistos"
      );
    }

    return {
      token: String(data.idToken),
      refreshToken: String(data.refreshToken),
      expiraEnSeg: Number(data.expiresIn) || 3600,
      usuario: {
        id: String(data.localId),
        email: String(data.email),
      },
    };
  }

  // Fallback con Firebase Admin SDK para entornos locales o de prueba
  try {
    const authAdmin = getAuthAdmin();
    const userRecord = await authAdmin.createUser({
      email: input.email,
      password: input.password,
    });
    const customToken = await authAdmin.createCustomToken(userRecord.uid);

    return {
      token: customToken,
      refreshToken: `mock-refresh-${userRecord.uid}`,
      expiraEnSeg: 3600,
      usuario: {
        id: userRecord.uid,
        email: userRecord.email ?? input.email,
      },
    };
  } catch (error: unknown) {
    const errCode =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "";
    if (errCode === "auth/email-already-exists") {
      throw new AuthError(
        409,
        "El correo electrónico ya se encuentra registrado"
      );
    }
    throw new AuthError(500, "Error al registrar el usuario");
  }
}

export async function iniciarSesion(
  input: LoginInput
): Promise<AuthTokensResponse> {
  const apiKey = obtenerApiKey();

  if (!apiKey) {
    throw new AuthError(401, "Credenciales inválidas");
  }

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: input.email,
        password: input.password,
        returnSecureToken: true,
      }),
    }
  );

  if (!response.ok) {
    throw new AuthError(401, "Credenciales inválidas");
  }

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const token = data?.idToken;
  const refreshToken = data?.refreshToken;
  const localId = data?.localId;

  if (!token || !refreshToken || !localId) {
    throw new AuthError(401, "Credenciales inválidas");
  }

  return {
    token: String(token),
    refreshToken: String(refreshToken),
    expiraEnSeg: Number(data?.expiresIn) || 3600,
    usuario: {
      id: String(localId),
      email: String(data?.email ?? input.email),
    },
  };
}

export async function refrescarToken(
  input: RefreshInput
): Promise<RefreshTokenResponse> {
  const apiKey = obtenerApiKey();

  if (!apiKey) {
    if (input.refreshToken.startsWith("mock-refresh-")) {
      return {
        token: `mock-token-${Date.now()}`,
        refreshToken: input.refreshToken,
        expiraEnSeg: 3600,
      };
    }
    throw new AuthError(401, "Token de actualización inválido o expirado");
  }

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });

  const response = await fetch(
    `https://securetoken.googleapis.com/v1/token?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }
  );

  if (!response.ok) {
    throw new AuthError(401, "Token de actualización inválido o expirado");
  }

  const data = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const token = data?.id_token ?? data?.idToken;
  const refreshToken = data?.refresh_token ?? data?.refreshToken;

  if (!token || !refreshToken) {
    throw new AuthError(401, "Token de actualización inválido o expirado");
  }

  return {
    token: String(token),
    refreshToken: String(refreshToken),
    expiraEnSeg: Number(data?.expires_in ?? data?.expiresIn) || 3600,
  };
}
