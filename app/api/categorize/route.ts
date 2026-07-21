import { NextRequest, NextResponse } from "next/server"
import { GoogleGenerativeAI, Part } from "@google/generative-ai"
import { initializeApp, getApps, cert } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"

// ── Firebase Admin (server-side only) ────────────────────────────────────────
function getAdminApp() {
  if (getApps().length > 0) return getApps()[0]
  return initializeApp({
    credential: cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  })
}

// ── Shared prompt builder ─────────────────────────────────────────────────────
function buildPrompt(existingCategories: string[], isImage: boolean): string {
  const existingList =
    existingCategories.length > 0
      ? `Existing categories: ${existingCategories.map(n => `"${n}"`).join(", ")}.`
      : "There are no existing categories yet."

  const inputDesc = isImage
    ? "Analyze the image (whiteboard, handwritten notes, screenshot, or printed text) and extract all visible text/tasks."
    : "Analyze the following pasted text."

  return `You are a smart note organizer. ${inputDesc}

1. Suggest the best category name (use an existing one if it fits, otherwise suggest a new short name).
2. Classify each non-empty item as one of: "todo", "header", or "text".
   - "header": a short title/section label (≤ 6 words, no trailing punctuation, title-case or ALL CAPS)
   - "todo": an actionable task or checklist item
   - "text": a note, description, or sentence that is not a task
3. Detect if a line starts with ✓ ✔ ☑ ✅ or is visually checked — mark it completed:true.
4. Strip bullet characters (-, •, *, [ ], [x]) from the start of lines.

${existingList}

Return ONLY valid JSON in this exact shape, no markdown, no explanation:
{
  "suggestedCategory": "string",
  "items": [
    { "text": "cleaned line text", "type": "todo"|"header"|"text", "completed": true|false }
  ]
}`
}

// ── POST /api/categorize ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  // 1. Verify Firebase ID token
  const authHeader = req.headers.get("authorization") ?? ""
  const idToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null

  if (!idToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const adminApp = getAdminApp()
    await getAuth(adminApp).verifyIdToken(idToken)
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 })
  }

  // 2. Parse request body
  const body = (await req.json()) as {
    text?: string
    imageBase64?: string   // base64-encoded image data (no data: prefix)
    imageMimeType?: string // e.g. "image/jpeg", "image/png"
    existingCategories: string[]
  }

  const { text, imageBase64, imageMimeType, existingCategories } = body
  const isImage = !!imageBase64

  if (!isImage && !text?.trim()) {
    return NextResponse.json({ error: "No text or image provided" }, { status: 400 })
  }

  // 3. Call Gemini
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Gemini API key not configured" }, { status: 500 })
  }

  const genAI = new GoogleGenerativeAI(apiKey)
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" })

  const prompt = buildPrompt(existingCategories ?? [], isImage)

  // Build content parts — image or text
  const parts: Part[] = isImage
    ? [
        { inlineData: { data: imageBase64!, mimeType: (imageMimeType ?? "image/jpeg") as "image/jpeg" } },
        { text: prompt },
      ]
    : [{ text: `${prompt}\n\nText to analyze:\n${text}` }]

  try {
    const result = await model.generateContent(parts)
    const raw = result.response.text().trim()

    // Strip markdown code fences if Gemini wraps in ```json ... ```
    const jsonStr = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim()
    const parsed = JSON.parse(jsonStr)

    return NextResponse.json(parsed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error("Gemini error:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
