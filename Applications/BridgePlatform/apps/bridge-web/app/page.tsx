import { redirect } from "next/navigation";
import { isMobileSite } from "@/lib/nexus";

export default async function Root() {
  // The mobile host lands straight on the phone lobby; every other host keeps
  // the desktop entry point.
  if (await isMobileSite()) redirect("/m/play");
  redirect("/bridge/home");
}
