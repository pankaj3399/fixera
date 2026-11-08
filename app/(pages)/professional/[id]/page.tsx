import { notFound } from "next/navigation"
import { getPublicProfessional } from "@/lib/server/publicEntities"
import ProfessionalProfileView from "./ProfessionalProfileView"

/**
 * Loads the public profile record on the server, so the first HTML contains the profile.
 * A professional who is missing or not publicly viewable returns a real 404. A backend
 * outage renders the shell, and the client fetches as before. Reviews load on the client.
 */
export default async function ProfessionalProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const lookup = await getPublicProfessional(id)
  if (lookup.status === "not_found") notFound()

  return (
    <ProfessionalProfileView
      key={id}
      initialProfessional={lookup.status === "found" ? lookup.data : null}
    />
  )
}
