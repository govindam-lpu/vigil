import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { TaskComment } from "@/lib/types";

const commentSchema = z.object({
  careCircleId: z.string().uuid(),
  taskId: z.string().uuid(),
  content: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const parsed = commentSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid comment payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "caregiver");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data: task, error: taskError } = await supabase
      .from("tasks")
      .select("care_circle_id")
      .eq("id", parsed.data.taskId)
      .eq("care_circle_id", parsed.data.careCircleId)
      .maybeSingle();

    if (taskError || !task) {
      return NextResponse.json({ error: "Task not found" }, { status: 404 });
    }

    const { data, error } = await supabase
      .from("task_comments")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        task_id: parsed.data.taskId,
        author_id: context.userId,
        content: parsed.data.content
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const comment = data as TaskComment;
    const profiles = await getProfilesById([comment.author_id]);
    return NextResponse.json({ comment: { ...comment, author: profiles.get(comment.author_id) ?? null } });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
