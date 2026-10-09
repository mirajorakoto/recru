import React from "react";
import ReactDOM from "react-dom/client";
import { RecruitmentPublicRoutes } from "@techzone/recruitment-public";
import { RecruitmentAdminPanel } from "@techzone/recruitment-admin";
import "@techzone/recruitment-public/styles.css";   
import "@techzone/recruitment-admin/styles.css";    
import "./shell.css";

function PublicShell({ recruitmentConfig }) {
  return <>{recruitmentConfig.isTestDeployment ? <p className="demo-admin-note">Environnement de test : ne transmettez aucune donnée personnelle réelle.</p> : null}<RecruitmentPublicRoutes turnstileSiteKey={recruitmentConfig.turnstileSiteKey} /></>;
}

function AdminShell() {
  return <main className="demo-admin"><RecruitmentAdminPanel /></main>;
}

async function loadRecruitmentConfig() {
  try {
    const response = await fetch("/recruitment-config.json", { cache: "no-store" });
    return response.ok ? await response.json() : {};
  } catch {
    return {};
  }
}

if (window.location.pathname === "/") window.history.replaceState({}, "", "/recrutement");
const recruitmentConfig = await loadRecruitmentConfig();
const shell = window.location.pathname === "/admin/recrutement" ? <AdminShell /> : <PublicShell recruitmentConfig={recruitmentConfig} />;
ReactDOM.createRoot(document.getElementById("root")).render(<React.StrictMode>{shell}</React.StrictMode>);
