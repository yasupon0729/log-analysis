import type { ReactNode } from "react";

import {
  uploadDescriptionRecipe,
  uploadIntroSectionRecipe,
  uploadTitleRecipe,
} from "@/styles/recipes/components/upload-log-client.recipe";

interface UploadIntroProps {
  title: string;
  description: ReactNode;
}

export function UploadIntro({ title, description }: UploadIntroProps) {
  return (
    <section className={uploadIntroSectionRecipe()}>
      <h1 className={uploadTitleRecipe()}>{title}</h1>
      <p className={uploadDescriptionRecipe()}>{description}</p>
    </section>
  );
}
