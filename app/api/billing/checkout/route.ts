import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { message: "Payments not configured yet" },
    { status: 501 },
  );
}
