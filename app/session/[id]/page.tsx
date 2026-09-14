import SessionRunner from "../SessionRunner";

// /session/<id> → retoma una sesión que quedó a medias. La cola se recupera de
// la base de datos y se salta lo ya respondido.
export default async function ResumeSessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <SessionRunner resumeId={id} />;
}
