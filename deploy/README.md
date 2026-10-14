# CI/CD — TechZone Recrutement

Ces fichiers s'ajoutent à la **racine du dépôt** (`C:\techzone-recrutement`). Ils ne remplacent ni votre `docker-compose.yml`
de production, ni votre `.dockerignore` (vos tests les vérifient) : tout ce qui est nouveau est dans `deploy/` et `Jenkinsfile`.

| Fichier | Rôle |
|---|---|
| `Jenkinsfile` | Pipeline : tests, sécurité, images, analyse Trivy, test de bout en bout, publication, déploiement |
| `deploy/backend.Dockerfile` | Image du serveur (Node 22, utilisateur non-root, volume `/app/demo`, healthcheck) |
| `deploy/web.Dockerfile` | Image web : console RH + site public + espace candidat, servis par nginx sans privilèges |
| `deploy/docker-compose.ci.yml` | Pile de recette locale : serveur + web (port 8088, local uniquement) |
| `deploy/nginx.conf` | Relais `/api` vers le serveur, repli sur `index.html`, en-têtes de sécurité |
| `deploy/web/` | Petite application hôte qui assemble `packages/admin-ui` et `packages/public-ui` |
| `deploy/*.dockerignore` | Exclusions propres à chaque image (`.env`, `node_modules`, `demo/`… jamais copiés) |
| `packages/backend/demo-server.js` | **Modifié** : écoute sur `LISTEN_HOST` (127.0.0.1 par défaut) au lieu d'une adresse fixe, pour fonctionner en conteneur |

## 1. Préparer le dépôt
1. Copiez ces fichiers à la racine du dépôt, puis `git add`, `git commit`.
2. Ajoutez à votre `.gitattributes` racine : `Jenkinsfile text eol=lf` (Windows écrit en CRLF, ce qui casse les scripts shell).
3. Générez les fichiers de verrouillage une fois (builds reproductibles) :
   ```bash
   cd packages/backend && npm install && cd ../admin-ui && npm install && cd ../public-ui && npm install
   ```
   puis commitez les `package-lock.json`. Sans eux le pipeline fonctionne, mais les versions peuvent varier d'un build à l'autre.

## 2. Créer le job dans Jenkins
1. **Nouveau Item** → nom `techzone-recrutement` → **Pipeline**.
2. Section *Pipeline* : **Pipeline script from SCM** → **Git** → URL de votre dépôt, branche `*/main` ; *Script Path* : `Jenkinsfile`.
   - Dépôt GitHub privé : ajoutez un identifiant (Settings → Credentials) de type *Username with password* (jeton d'accès).
   - Dépôt local uniquement : `sudo -u jenkins git config --global --add safe.directory '*'`, puis une URL de type `/chemin/du/depot`
     lisible par l'utilisateur `jenkins` (vérifiez avec `sudo -u jenkins ls /chemin/du/depot`). GitHub reste plus simple.
3. **Lancer** une première fois (les paramètres `DEPLOY`, `PUSH_IMAGES`, `REGISTRY` apparaissent ensuite : *Build with Parameters*).
   Le premier build est long : téléchargement des images Node, nginx et de la base de vulnérabilités Trivy (plusieurs centaines de Mo).

Plugins nécessaires : *Pipeline*, *Git*, *Credentials Binding*, *JUnit* — tous inclus dans « suggested plugins ».

## 3. Ce que fait le pipeline
1. **Récupération** du code, version `numéro de build-commit`.
2. **Tests** en parallèle (serveur, console RH, site public) dans des conteneurs `node:22` ; résultats JUnit visibles dans Jenkins.
3. **Sécurité** : `npm audit` (dépendances) et Gitleaks (secrets dans les fichiers) → un résultat rend le build *instable* sans l'arrêter.
4. **Images Docker** du serveur et du web.
5. **Trivy** : vulnérabilités HIGH/CRITICAL des deux images (build *instable* si trouvées).
6. **Test de bout en bout** : démarre la pile `docker compose`, puis crée un compte, dépose un CV, vérifie que la référence `TZR-…`
   apparaît côté candidat et côté RH, et supprime tout.
7. **Publication** (option `PUSH_IMAGES`) : pousse les images vers le registre ; identifiant Jenkins `registry-credentials`.
8. **Déploiement** (option `DEPLOY`) : met à jour la recette locale http://localhost:8088.

## 4. Utiliser la pile sans Jenkins
```bash
docker compose -f deploy/docker-compose.ci.yml up -d --build
```
Site public : http://localhost:8088/recrutement — console RH : http://localhost:8088/admin/recrutement — arrêt : `docker compose -f deploy/docker-compose.ci.yml down` (`-v` supprime aussi la base).

Variables facultatives (dans le terminal ou `deploy/.env`) : `WEB_PORT` (8088), `MAIL_MODE` (`simulation` par défaut ; mettre `auto` pour envoyer de vrais e-mails),
`PRIVACY_CONTACT_EMAIL`. Un `.env` à la racine du dépôt est lu par le serveur (clé OpenAI, SMTP…) ; sans lui, l'analyse IA est simulée.

## 5. À savoir
- **La recette utilise `demo-server.js`** : la console RH y est ouverte sans connexion. Le port n'est publié que sur `127.0.0.1` ;
  ne l'exposez jamais sur Internet. La production reste `node server.js` avec l'adaptateur de session du portail (`RECRUITMENT_HOST_ADAPTER`)
  et votre `docker-compose.yml` actuel : ces images peuvent servir de base, mais je n'ai pas vu votre déploiement existant.
- Aucun secret n'est dans les images ni dans le pipeline : utilisez les *Credentials* Jenkins pour tout mot de passe.
- Gitleaks analyse les fichiers du dépôt, pas l'historique Git. Pour l'historique : `gitleaks detect` en local.
- Les 10 tests de déploiement du serveur lisent `docker-compose.yml`, `.dockerignore` et la documentation OpenAPI du dépôt : s'ils échouent, le build s'arrête à l'étape *Serveur*.

## 6. Dépannage
| Symptôme | Cause probable | Correction |
|---|---|---|
| `permission denied … docker.sock` | `jenkins` n'est pas dans le groupe `docker` | `sudo usermod -aG docker jenkins && sudo systemctl restart jenkins` |
| `npm ci` échoue (lock désynchronisé) | `package-lock.json` pas à jour | `npm install` en local puis commit du lock |
| `port is already allocated` (8088/18088) | autre service sur le port | `WEB_PORT=8090` ou arrêtez l'autre service |
| Étape *Test de bout en bout* : `unhealthy` | serveur qui ne démarre pas | `docker compose -p <projet> -f deploy/docker-compose.ci.yml logs backend` |
| Build très lent / mémoire saturée | WSL limité à 5,7 Go | `C:\Users\<vous>\.wslconfig` : `[wsl2]` `memory=8GB`, puis `wsl --shutdown` |
