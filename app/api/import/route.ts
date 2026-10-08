import { NextRequest, NextResponse } from "next/server";
import { fetchRepoContext } from "@/lib/github";

export const runtime = "nodejs";

/** POST { repo: string } → repo context used to seed AI generation. */
export async function POST(req: NextRequest) {
  let body: { repo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const repo = body.repo?.trim();
  if (!repo) return NextResponse.json({ error: "Provide a repository." }, { status: 400 });

  try {
    const ctx = await fetchRepoContext(repo);
    return NextResponse.json({ context: ctx });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Failed to read repository.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
