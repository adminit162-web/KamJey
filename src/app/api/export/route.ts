import { NextRequest, NextResponse } from "next/server";
import { sessionFromRequest } from "@/lib/auth";
import { createDataBackup } from "@/lib/backup";

export async function GET(request: NextRequest) {
  const session = await sessionFromRequest(request);
  if (session?.role !== "admin") return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  try {
    const backup = await createDataBackup();
    return new NextResponse(JSON.stringify(backup, null, 2), { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="kamjey-export-${new Date().toISOString().slice(0, 10)}.json"` } });
  } catch {
    return NextResponse.json({ error: "Unable to export data." }, { status: 503 });
  }
}
