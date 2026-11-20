import { getApps, initializeApp, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

let mockAuthAdmin: Auth | null = null;
let mockFirestoreAdmin: Firestore | null = null;

export function setMockAuthAdmin(mock: Auth | null): void {
  mockAuthAdmin = mock;
}

export function setMockFirestoreAdmin(mock: Firestore | null): void {
  mockFirestoreAdmin = mock;
}

function obtenerCredencialesFirebase(): {
  projectId: string | undefined;
  clientEmail: string | undefined;
  privateKey: string | undefined;
} {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL?.trim();
  const rawPrivateKey = process.env.FIREBASE_PRIVATE_KEY;
  const privateKey = rawPrivateKey ? rawPrivateKey.replace(/\\n/g, "\n") : undefined;

  return { projectId, clientEmail, privateKey };
}

export function inicializarFirebaseAdmin(): App {
  const apps = getApps();
  if (apps.length > 0 && apps[0]) {
    return apps[0];
  }

  const { projectId, clientEmail, privateKey } = obtenerCredencialesFirebase();

  if (projectId && clientEmail && privateKey) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  }

  // Fallback para desarrollo, emulador o pruebas sin credenciales de producción
  return initializeApp({
    projectId: projectId || "demo-inventario-tienda",
  });
}

export function getAuthAdmin(): Auth {
  if (mockAuthAdmin) {
    return mockAuthAdmin;
  }
  return getAuth(inicializarFirebaseAdmin());
}

export function getFirestoreAdmin(): Firestore {
  if (mockFirestoreAdmin) {
    return mockFirestoreAdmin;
  }
  return getFirestore(inicializarFirebaseAdmin());
}
