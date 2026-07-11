import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { NextResponse } from "next/server";

import { findLearningResource } from "@/content/learning/resources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: {
    slug: string;
  };
};

export async function GET(_request: Request, { params }: RouteContext) {
  const resource = findLearningResource(params.slug);
  if (!resource) {
    return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  }

  try {
    const file = await readFile(
      join(process.cwd(), "public", "learning", "guides", resource.pdf.fileName),
    );

    return new NextResponse(file, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${resource.pdf.fileName}"`,
        "cache-control": "public, max-age=86400",
      },
    });
  } catch {
    return NextResponse.json({ error: "PDF unavailable" }, { status: 404 });
  }
}
