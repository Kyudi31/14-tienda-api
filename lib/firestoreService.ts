import { ApiError, formatearDetallesZod } from "./authTypes";
import { getFirestoreAdmin } from "./firebaseAdmin";
import {
  productoSchema,
  movimientoSchema,
  type ProductoDoc,
  type MovimientoDoc,
  type SincronizacionResponse,
} from "./firestoreSchemas";

export function normalizarColeccion(col: string): "producto" | "movimiento_stock" {
  if (col === "producto" || col === "productos") {
    return "producto";
  }
  if (col === "movimiento_stock" || col === "movimientos") {
    return "movimiento_stock";
  }
  throw new ApiError(400, `Colección desconocida o no soportada: ${col}`);
}

export async function ajustarStockTransaccional(
  uid: string,
  productoId: string,
  delta: number,
  motivo?: string
): Promise<{ producto: ProductoDoc; movimiento: MovimientoDoc }> {
  const db = getFirestoreAdmin();
  const productoRef = db
    .collection("usuarios")
    .doc(uid)
    .collection("producto")
    .doc(productoId);
  const movColRef = db
    .collection("usuarios")
    .doc(uid)
    .collection("movimiento_stock");

  return await db.runTransaction(async (transaction) => {
    const docSnap = await transaction.get(productoRef);
    if (!docSnap.exists) {
      throw new ApiError(404, "Producto no encontrado");
    }

    const data = docSnap.data() as ProductoDoc;
    if (data.deleted_at !== null && data.deleted_at !== undefined) {
      throw new ApiError(404, "Producto no encontrado");
    }

    const nuevoStock = data.stock + delta;
    if (nuevoStock < 0) {
      throw new ApiError(400, "Stock insuficiente");
    }

    const bajoStock = nuevoStock <= data.minimo;
    const ahoraIso = new Date().toISOString();

    const productoActualizado: ProductoDoc = {
      ...data,
      id: productoId,
      stock: nuevoStock,
      bajo_stock: bajoStock,
      updated_at: ahoraIso,
    };

    transaction.update(productoRef, {
      stock: nuevoStock,
      bajo_stock: bajoStock,
      updated_at: ahoraIso,
    });

    const nuevoMovRef = movColRef.doc();
    const nuevoMovimiento: MovimientoDoc = {
      id: nuevoMovRef.id,
      producto_id: productoId,
      delta,
      motivo:
        motivo?.trim() ||
        (delta > 0 ? "Entrada de stock" : "Salida de stock"),
      created_at: ahoraIso,
      updated_at: ahoraIso,
      deleted_at: null,
    };

    transaction.set(nuevoMovRef, nuevoMovimiento);

    return {
      producto: productoActualizado,
      movimiento: nuevoMovimiento,
    };
  });
}

export async function obtenerProductosBajoStock(
  uid: string
): Promise<ProductoDoc[]> {
  const db = getFirestoreAdmin();
  const snapshot = await db
    .collection("usuarios")
    .doc(uid)
    .collection("producto")
    .where("bajo_stock", "==", true)
    .get();

  return snapshot.docs
    .map(
      (doc) => ({ id: doc.id, ...(doc.data() as Omit<ProductoDoc, "id">) } as ProductoDoc)
    )
    .filter((p) => p.deleted_at === null || p.deleted_at === undefined);
}

export async function obtenerRecursoSincronizacion<
  T extends ProductoDoc | MovimientoDoc
>(
  uid: string,
  coleccion: string,
  since?: string
): Promise<SincronizacionResponse<T>> {
  const db = getFirestoreAdmin();
  const colName = normalizarColeccion(coleccion);

  let query: FirebaseFirestore.Query = db
    .collection("usuarios")
    .doc(uid)
    .collection(colName)
    .orderBy("updated_at", "asc")
    .limit(500);

  if (since && since.trim()) {
    query = query.where("updated_at", ">", since.trim());
  }

  const snapshot = await query.get();
  const items = snapshot.docs.map(
    (doc) => ({ id: doc.id, ...(doc.data() as object) } as T)
  );

  return {
    items,
    servidor_ahora: new Date().toISOString(),
  };
}

export async function guardarRecursoIdempotente(
  uid: string,
  coleccion: string,
  id: string,
  rawData: unknown
): Promise<ProductoDoc | MovimientoDoc> {
  const db = getFirestoreAdmin();
  const colName = normalizarColeccion(coleccion);
  const docRef = db
    .collection("usuarios")
    .doc(uid)
    .collection(colName)
    .doc(id);

  const ahoraIso = new Date().toISOString();
  const existingSnap = await docRef.get();
  const existingData = existingSnap.exists
    ? (existingSnap.data() as Partial<ProductoDoc | MovimientoDoc>)
    : null;
  const createdAt = existingData?.created_at ?? ahoraIso;

  if (colName === "producto") {
    const parsed = productoSchema.safeParse(rawData);
    if (!parsed.success) {
      throw new ApiError(
        400,
        "Datos de producto inválidos",
        formatearDetallesZod(parsed.error)
      );
    }

    const data = parsed.data;
    const docProducto: ProductoDoc = {
      id,
      codigo: data.codigo ?? null,
      nombre: data.nombre,
      precio_centavos: data.precio_centavos,
      stock: data.stock,
      minimo: data.minimo,
      bajo_stock: data.stock <= data.minimo,
      created_at: createdAt,
      updated_at: ahoraIso,
      deleted_at: null,
    };

    await docRef.set(docProducto);
    return docProducto;
  }

  const parsed = movimientoSchema.safeParse(rawData);
  if (!parsed.success) {
    throw new ApiError(
      400,
      "Datos de movimiento inválidos",
      formatearDetallesZod(parsed.error)
    );
  }

  const data = parsed.data;
  const docMovimiento: MovimientoDoc = {
    id,
    producto_id: data.producto_id,
    delta: data.delta,
    motivo: data.motivo,
    created_at: createdAt,
    updated_at: ahoraIso,
    deleted_at: null,
  };

  await docRef.set(docMovimiento);
  return docMovimiento;
}

export async function eliminarRecursoLogico(
  uid: string,
  coleccion: string,
  id: string
): Promise<{ id: string; deleted_at: string }> {
  const db = getFirestoreAdmin();
  const colName = normalizarColeccion(coleccion);
  const docRef = db
    .collection("usuarios")
    .doc(uid)
    .collection(colName)
    .doc(id);

  const snap = await docRef.get();
  if (!snap.exists) {
    throw new ApiError(404, "Recurso no encontrado");
  }

  const actual = snap.data() as { deleted_at?: string | null };
  if (actual.deleted_at !== null && actual.deleted_at !== undefined) {
    throw new ApiError(404, "Recurso no encontrado");
  }

  const ahoraIso = new Date().toISOString();
  await docRef.update({
    deleted_at: ahoraIso,
    updated_at: ahoraIso,
  });

  return { id, deleted_at: ahoraIso };
}
