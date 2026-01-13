import { NextResponse } from "next/server";
import postgres from "postgres";

export async function POST() {
  const sql = postgres(process.env.POSTGRES_URL!, { ssl: "require" });

  try {
    // Add commit_hash column if it doesn't exist
    await sql`
      ALTER TABLE proposals_seen
      ADD COLUMN IF NOT EXISTS commit_hash TEXT
    `;

    // Add proposal_url column if it doesn't exist
    await sql`
      ALTER TABLE proposals_seen
      ADD COLUMN IF NOT EXISTS proposal_url TEXT
    `;

    await sql.end();

    return NextResponse.json({ success: true, message: "Migration completed" });
  } catch (error) {
    await sql.end();
    console.error("Migration failed:", error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
