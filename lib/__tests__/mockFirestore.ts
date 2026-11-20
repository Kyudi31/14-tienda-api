import type { Firestore } from "firebase-admin/firestore";

interface MockDocSnapshot {
  id: string;
  exists: boolean;
  data: () => Record<string, unknown> | undefined;
}

interface MockDocRef {
  id: string;
  uid: string;
  col: string;
  get: () => Promise<MockDocSnapshot>;
  set: (data: Record<string, unknown>) => Promise<void>;
  update: (partial: Record<string, unknown>) => Promise<void>;
  delete: () => Promise<void>;
}

interface MockQuerySnapshot {
  docs: MockDocSnapshot[];
  empty: boolean;
  size: number;
}

interface QueryFilter {
  field: string;
  op: string;
  val: unknown;
}

export class MockFirestoreDb {
  // Key: `${uid}/${collection}/${docId}` -> doc data
  private storage = new Map<string, Record<string, unknown>>();

  private buildKey(uid: string, col: string, docId: string): string {
    return `${uid}/${col}/${docId}`;
  }

  reset(): void {
    this.storage.clear();
  }

  seed(uid: string, col: string, docId: string, data: Record<string, unknown>): void {
    this.storage.set(this.buildKey(uid, col, docId), { ...data, id: docId });
  }

  getStored(uid: string, col: string, docId: string): Record<string, unknown> | undefined {
    const raw = this.storage.get(this.buildKey(uid, col, docId));
    return raw ? { ...raw } : undefined;
  }

  getAllStored(uid: string, col: string): Array<Record<string, unknown>> {
    const prefix = `${uid}/${col}/`;
    const results: Array<Record<string, unknown>> = [];
    for (const [key, val] of this.storage.entries()) {
      if (key.startsWith(prefix)) {
        results.push({ ...val });
      }
    }
    return results;
  }

  collection(collectionName: string) {
    if (collectionName !== "usuarios") {
      throw new Error(`MockFirestoreDb solo soporta colección raíz 'usuarios', recibida: ${collectionName}`);
    }

    return {
      doc: (uid: string) => ({
        collection: (subCol: string) => this.createSubCollection(uid, subCol),
      }),
    };
  }

  private createSubCollection(uid: string, colName: string) {
    return {
      doc: (docId?: string) => {
        const id = docId ?? `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        return this.createDocRef(uid, colName, id);
      },
      where: (field: string, op: string, val: unknown) =>
        this.createQuery(uid, colName, [{ field, op, val }], null, null),
      orderBy: (field: string, direction: "asc" | "desc" = "asc") =>
        this.createQuery(uid, colName, [], { field, direction }, null),
      limit: (n: number) =>
        this.createQuery(uid, colName, [], null, n),
      get: async (): Promise<MockQuerySnapshot> => {
        return this.executeQuery(uid, colName, [], null, null);
      },
    };
  }

  private createDocRef(uid: string, col: string, id: string): MockDocRef {
    return {
      id,
      uid,
      col,
      get: async (): Promise<MockDocSnapshot> => {
        const val = this.getStored(uid, col, id);
        return {
          id,
          exists: val !== undefined,
          data: () => (val ? { ...val } : undefined),
        };
      },
      set: async (data: Record<string, unknown>): Promise<void> => {
        this.storage.set(this.buildKey(uid, col, id), { ...data, id });
      },
      update: async (partial: Record<string, unknown>): Promise<void> => {
        const existing = this.storage.get(this.buildKey(uid, col, id));
        if (!existing) {
          throw new Error(`Documento no encontrado para update: ${id}`);
        }
        this.storage.set(this.buildKey(uid, col, id), { ...existing, ...partial, id });
      },
      delete: async (): Promise<void> => {
        this.storage.delete(this.buildKey(uid, col, id));
      },
    };
  }

  private createQuery(
    uid: string,
    col: string,
    filters: QueryFilter[],
    sort: { field: string; direction: "asc" | "desc" } | null,
    limitCount: number | null
  ) {
    const query = {
      where: (field: string, op: string, val: unknown) =>
        this.createQuery(uid, col, [...filters, { field, op, val }], sort, limitCount),
      orderBy: (field: string, direction: "asc" | "desc" = "asc") =>
        this.createQuery(uid, col, filters, { field, direction }, limitCount),
      limit: (n: number) =>
        this.createQuery(uid, col, filters, sort, n),
      get: async (): Promise<MockQuerySnapshot> => {
        return this.executeQuery(uid, col, filters, sort, limitCount);
      },
    };
    return query;
  }

  private executeQuery(
    uid: string,
    col: string,
    filters: QueryFilter[],
    sort: { field: string; direction: "asc" | "desc" } | null,
    limitCount: number | null
  ): MockQuerySnapshot {
    let items = this.getAllStored(uid, col);

    for (const filter of filters) {
      items = items.filter((item) => {
        const val = item[filter.field];
        if (filter.op === "==") {
          return val === filter.val;
        }
        if (filter.op === ">") {
          return typeof val === "string" && typeof filter.val === "string"
            ? val > filter.val
            : Number(val) > Number(filter.val);
        }
        return true;
      });
    }

    if (sort) {
      items.sort((a, b) => {
        const valA = String(a[sort.field] ?? "");
        const valB = String(b[sort.field] ?? "");
        return sort.direction === "desc"
          ? valB.localeCompare(valA)
          : valA.localeCompare(valB);
      });
    }

    if (limitCount !== null) {
      items = items.slice(0, limitCount);
    }

    const docs: MockDocSnapshot[] = items.map((item) => ({
      id: String(item.id),
      exists: true,
      data: () => ({ ...item }),
    }));

    return {
      docs,
      empty: docs.length === 0,
      size: docs.length,
    };
  }

  async runTransaction<T>(
    updateFunction: (transaction: {
      get: (ref: MockDocRef) => Promise<MockDocSnapshot>;
      set: (ref: MockDocRef, data: Record<string, unknown>) => void;
      update: (ref: MockDocRef, partial: Record<string, unknown>) => void;
    }) => Promise<T>
  ): Promise<T> {
    const pendingWrites: Array<() => void> = [];

    const transaction = {
      get: async (ref: MockDocRef): Promise<MockDocSnapshot> => {
        return await ref.get();
      },
      set: (ref: MockDocRef, data: Record<string, unknown>): void => {
        pendingWrites.push(() => {
          this.storage.set(this.buildKey(ref.uid, ref.col, ref.id), {
            ...data,
            id: ref.id,
          });
        });
      },
      update: (ref: MockDocRef, partial: Record<string, unknown>): void => {
        pendingWrites.push(() => {
          const key = this.buildKey(ref.uid, ref.col, ref.id);
          const current = this.storage.get(key);
          if (current) {
            this.storage.set(key, { ...current, ...partial, id: ref.id });
          }
        });
      },
    };

    const result = await updateFunction(transaction);

    // Apply writes only if callback didn't throw
    for (const write of pendingWrites) {
      write();
    }

    return result;
  }

  asFirestore(): Firestore {
    return this as unknown as Firestore;
  }
}
