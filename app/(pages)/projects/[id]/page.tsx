import { notFound } from 'next/navigation';
import { getPublicProject, getPublicProjectReviews } from '@/lib/server/publicEntities';
import ProjectDetailView from './ProjectDetailView';

/**
 * Loads the public project on the server so the first HTML contains its content.
 * A project that is missing or not published returns a real 404. A backend outage
 * renders the shell, and the client fetches the project as before.
 */
export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [project, reviews] = await Promise.all([
    getPublicProject(id),
    getPublicProjectReviews(id),
  ]);
  if (project.status === 'not_found') notFound();

  return (
    <ProjectDetailView
      key={id}
      initialProject={project.status === 'found' ? project.data : null}
      initialReviews={reviews.status === 'found' ? reviews.data : null}
    />
  );
}
