// Envoie UN e-mail de test avec la configuration SMTP du .env (celle que l'application utilise).
// Usage : npm run email:test -- ton-adresse@exemple.com
const { loadEnvFile, loadConfig } = require("../src/config");
const { createMailer } = require("../src/mailer");

loadEnvFile();
const recipient = process.argv[2];
if (!recipient || !/^\S+@\S+\.\S+$/.test(recipient)) {
  console.error("Usage : npm run email:test -- adresse-que-tu-controles@exemple.com");
  process.exit(1);
}
const config = loadConfig();
const mailer = createMailer(config);
(async () => {
  console.log(`Mode d'envoi : ${mailer.mode === "smtp" ? `SMTP réel (${config.smtp.host}:${config.smtp.port})` : "simulation (aucun SMTP configuré)"}`);
  if (!(await mailer.verify()) && mailer.mode === "smtp") process.exit(2);
  try {
    await mailer.transporter.sendMail({
      to: recipient,
      subject: "Test d'envoi — TECH ZONE Recrutement",
      text: "Cet e-mail confirme que la configuration SMTP de la plateforme de recrutement fonctionne."
    });
    console.log(mailer.mode === "smtp" ? "E-mail de test envoyé. Vérifiez la boîte de réception (et les courriers indésirables)." : "Simulation terminée.");
  } catch (error) {
    console.error(`Échec d'envoi : ${error.code || ""} ${String(error.message).slice(0, 200)}`);
    process.exit(3);
  }
})();
