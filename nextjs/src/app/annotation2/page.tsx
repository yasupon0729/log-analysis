import "server-only";

import { AnnotationCanvas2Client } from "./AnnotationCanvas2Client";

export const dynamic = "force-dynamic";

export default function AnnotationPage2() {
  return <AnnotationCanvas2Client />;
}
