import { redirect } from "next/navigation";
import { createServerComponentClient } from "@/infrastructure/supabase/server";

export default async function Home() {
  const supabase = await createServerComponentClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/groups");
  } else {
    redirect("/signin");
  }
}
