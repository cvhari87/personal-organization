/**
 * Firestore sync layer.
 * All user data lives at: users/{uid}/categories/{categoryId}
 * Each category is a single Firestore document containing its items array.
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  onSnapshot,
  QuerySnapshot,
  DocumentData,
  Unsubscribe,
} from "firebase/firestore"
import { db } from "./firebase"
import { Category } from "./types"

function categoriesRef(uid: string) {
  return collection(db, "users", uid, "categories")
}

/** Load all categories for a user (one-time read) */
export async function loadCategoriesFromFirestore(uid: string): Promise<Category[]> {
  const snap = await getDocs(categoriesRef(uid))
  const cats: Category[] = []
  snap.forEach(d => cats.push(d.data() as Category))
  return cats.sort((a, b) => a.priority - b.priority)
}

/** Save a single category (upsert) */
export async function saveCategoryToFirestore(uid: string, category: Category): Promise<void> {
  const ref = doc(db, "users", uid, "categories", category.id)
  // Firestore rejects undefined values — strip them via JSON round-trip before writing
  const clean = JSON.parse(JSON.stringify(category))
  await setDoc(ref, clean)
}

/** Save all categories (used for bulk sync / migration) */
export async function saveAllCategoriesToFirestore(uid: string, categories: Category[]): Promise<void> {
  await Promise.all(categories.map(cat => saveCategoryToFirestore(uid, cat)))
}

/** Delete a category */
export async function deleteCategoryFromFirestore(uid: string, categoryId: string): Promise<void> {
  await deleteDoc(doc(db, "users", uid, "categories", categoryId))
}

/** Real-time listener — calls onChange whenever Firestore data changes.
 *  The snapshot is passed so callers can inspect metadata (e.g. hasPendingWrites,
 *  fromCache) to decide whether to apply the update. */
export function subscribeToCategories(
  uid: string,
  onChange: (categories: Category[], snap: QuerySnapshot<DocumentData>) => void
): Unsubscribe {
  return onSnapshot(categoriesRef(uid), snap => {
    const cats: Category[] = []
    snap.forEach(d => cats.push(d.data() as Category))
    onChange(cats.sort((a, b) => a.priority - b.priority), snap)
  })
}
