import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { AtsResources } from "./index";

test("explains ATS compatibility without presenting it as a file format", () => {
  render(<AtsResources />);
  expect(screen.getByText(/n’est pas un format de fichier/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /modèle docx/i })).toHaveAttribute("download");
});
