import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RecruitmentAdminPanel } from "@techzone/recruitment-admin";
import { RecruitmentPublicRoutes } from "@techzone/recruitment-public";

const path = window.location.pathname.replace(/\/$/, "") || "/";

// La racine du site redirige vers les offres.
if (path === "/") window.location.replace("/recrutement");

const isAdmin = path === "/admin/recrutement" || path.startsWith("/admin/recrutement/");

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isAdmin
      ? <RecruitmentAdminPanel apiBaseUrl="/api/admin/recrutement" />
      : <RecruitmentPublicRoutes apiBaseUrl="/api/recrutement" turnstileSiteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY || ""} />}
  </StrictMode>
);
