import "server-only";

import { AnnotationCanvasClient } from "./AnnotationCanvasClient";

export const dynamic = "force-dynamic";

export default function AnnotationPage() {
  return <AnnotationCanvasClient />;
}
