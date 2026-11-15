import { redirect } from "next/navigation";

/** Bare /professional/projects has no index page — avoid matching the [id] profile route. */
export default function ProfessionalProjectsIndexPage() {
  redirect("/professional/projects/manage");
}
