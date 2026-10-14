// Pipeline CI/CD — TechZone Recrutement
// Chaîne : code -> tests (serveur, console RH, site public) -> sécurité (dépendances, secrets)
//          -> images Docker -> analyse Trivy -> test de bout en bout (docker compose) -> publication / déploiement.
// Les commandes Node s'exécutent dans des conteneurs : aucun Node n'est requis sur la machine Jenkins, seulement Docker.

// Exécute un script dans un conteneur Node, à la racine du dépôt + sous-dossier « dir ».
// L'utilisateur du conteneur est celui de Jenkins : les fichiers créés restent supprimables par Jenkins.
def inNode(String dir, String script) {
  def cmd = 'docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp -e npm_config_cache=/tmp/.npm -e CI=true ' +
            '-v "$WORKSPACE":/w -w "/w/' + dir + '" ' + env.NODE_IMAGE + " bash -ec '" + script + "'"
  sh cmd
}

pipeline {
  agent any

  options {
    timestamps()
    timeout(time: 60, unit: 'MINUTES')
    disableConcurrentBuilds()
    buildDiscarder(logRotator(numToKeepStr: '15'))
  }

  // triggers { pollSCM('H/5 * * * *') }   // à activer si le dépôt n'envoie pas de webhook

  parameters {
    booleanParam(name: 'DEPLOY', defaultValue: false,
                 description: 'Déployer la recette locale (http://localhost:8088) après un build réussi')
    booleanParam(name: 'PUSH_IMAGES', defaultValue: false,
                 description: 'Publier les images dans un registre (identifiant Jenkins « registry-credentials » requis)')
    string(name: 'REGISTRY', defaultValue: 'ghcr.io/votre-compte',
           description: 'Registre et espace de noms, ex. ghcr.io/mirajorakoto')
  }

  environment {
    DOCKER_BUILDKIT = '1'
    NODE_IMAGE      = 'node:22-bookworm'
    IMAGE_BACKEND   = 'techzone/recruitment-backend'
    IMAGE_WEB       = 'techzone/recruitment-web'
    CI_PROJECT      = "tz-ci-${env.BUILD_NUMBER}"
    CI_WEB_PORT     = '18088'
  }

  stages {

    stage('Récupération du code') {
      steps {
        checkout scm
        script {
          env.GIT_SHORT = sh(script: 'git rev-parse --short HEAD', returnStdout: true).trim()
          env.TAG = "${env.BUILD_NUMBER}-${env.GIT_SHORT}"
        }
        echo "Version construite : ${env.TAG}"
        sh 'docker version --format "Docker serveur {{.Server.Version}}" && docker compose version'
      }
    }

    stage('Tests') {
      parallel {
        stage('Serveur') {
          steps {
            inNode('packages/backend',
              'if [ -f package-lock.json ]; then npm ci; else npm install; fi && ' +
              'mkdir -p test-results && ' +
              'NODE_ENV=test PRIVACY_CONTACT_EMAIL=ci@example.test node --test ' +
              '--test-reporter=spec --test-reporter-destination=stdout ' +
              '--test-reporter=junit --test-reporter-destination=test-results/junit.xml')
          }
          post { always { junit allowEmptyResults: true, testResults: 'packages/backend/test-results/*.xml' } }
        }
        stage('Console RH') {
          steps {
            inNode('packages/admin-ui',
              'if [ -f package-lock.json ]; then npm ci; else npm install; fi && ' +
              'mkdir -p test-results && ' +
              'npx vitest --run --reporter=default --reporter=junit --outputFile.junit=test-results/junit.xml && ' +
              'npm run build')
          }
          post { always { junit allowEmptyResults: true, testResults: 'packages/admin-ui/test-results/*.xml' } }
        }
        stage('Site public') {
          steps {
            inNode('packages/public-ui',
              'if [ -f package-lock.json ]; then npm ci; else npm install; fi && ' +
              'mkdir -p test-results && ' +
              'npx vitest --run --reporter=default --reporter=junit --outputFile.junit=test-results/junit.xml && ' +
              'npm run build')
          }
          post { always { junit allowEmptyResults: true, testResults: 'packages/public-ui/test-results/*.xml' } }
        }
      }
    }

    stage('Sécurité du code') {
      parallel {
        stage('Dépendances (npm audit)') {
          steps {
            // Un résultat critique rend le build « instable » sans l'interrompre.
            catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
              inNode('packages/backend', 'npm audit --omit=dev --audit-level=high')
              inNode('packages/admin-ui', 'npm audit --omit=dev --audit-level=high')
              inNode('packages/public-ui', 'npm audit --omit=dev --audit-level=high')
            }
          }
        }
        stage('Secrets (Gitleaks)') {
          steps {
            catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
              sh 'docker run --rm -v "$WORKSPACE":/repo ghcr.io/gitleaks/gitleaks:latest detect --no-git --source /repo --redact --no-banner'
            }
          }
        }
      }
    }

    stage('Images Docker') {
      steps {
        sh '''
          docker build -f deploy/backend.Dockerfile -t "$IMAGE_BACKEND:$TAG" -t "$IMAGE_BACKEND:latest" .
          docker build -f deploy/web.Dockerfile     -t "$IMAGE_WEB:$TAG"     -t "$IMAGE_WEB:latest" .
          docker images --format "table {{.Repository}}\\t{{.Tag}}\\t{{.Size}}" | grep techzone/ || true
        '''
      }
    }

    stage('Analyse des images (Trivy)') {
      steps {
        catchError(buildResult: 'UNSTABLE', stageResult: 'UNSTABLE') {
          sh '''
            rc=0
            for img in "$IMAGE_BACKEND:$TAG" "$IMAGE_WEB:$TAG"; do
              docker run --rm -v /var/run/docker.sock:/var/run/docker.sock -v trivy-cache:/root/.cache/ \
                aquasec/trivy:latest image --severity HIGH,CRITICAL --ignore-unfixed --no-progress --exit-code 1 "$img" || rc=1
            done
            exit $rc
          '''
        }
      }
    }

    stage('Test de bout en bout') {
      steps {
        sh '''
          export WEB_PORT="$CI_WEB_PORT" IMAGE_TAG="$TAG"
          COMPOSE="docker compose -p $CI_PROJECT -f deploy/docker-compose.ci.yml"
          BASE="http://web:8080"

          $COMPOSE up -d --wait --wait-timeout 180
          docker network connect "${CI_PROJECT}_default" "$(hostname)"

          curl -fsS "$BASE/healthz"
          curl -fsS "$BASE/api/health" | jq -e '.ok == true'
          curl -fsS -o /dev/null -w "site public  /recrutement       : HTTP %{http_code}\\n" "$BASE/recrutement"
          curl -fsS -o /dev/null -w "console RH   /admin/recrutement : HTTP %{http_code}\\n" "$BASE/admin/recrutement"

          # Parcours réel : création de compte, candidature avec CV, référence visible côté RH.
          OFFER=$(curl -fsS "$BASE/api/recrutement/offres" | jq -er '.offres[0].public_id')
          JAR=$(mktemp)
          curl -fsS -c "$JAR" -H "Content-Type: application/json" \
            -d '{"email":"ci@example.test","password":"MotDePasseCI2026","full_name":"Compte CI","phone":"0340000000","candidate_location":"Antananarivo","consent":true}' \
            "$BASE/api/recrutement/compte/inscription" | jq -e '.compte.email == "ci@example.test"'
          printf '%%PDF-1.4\\n1 0 obj\\n<< >>\\nendobj\\n%%%%EOF\\n' > cv-ci.pdf
          REF=$(curl -fsS -b "$JAR" -F consent=true -F "cv=@cv-ci.pdf;type=application/pdf" \
            "$BASE/api/recrutement/offres/$OFFER/candidatures" | jq -er '.reference')
          echo "Référence créée : $REF"
          curl -fsS "$BASE/api/admin/recrutement/candidatures" | jq -e --arg ref "$REF" '[.candidatures[].reference] | index($ref) != null'
          curl -fsS -b "$JAR" "$BASE/api/recrutement/compte/candidatures" | jq -e --arg ref "$REF" '[.candidatures[].reference] | index($ref) != null'
          rm -f cv-ci.pdf "$JAR"
          echo "Test de bout en bout réussi."
        '''
      }
    }

    stage('Publication des images') {
      when { expression { return params.PUSH_IMAGES } }
      steps {
        withCredentials([usernamePassword(credentialsId: 'registry-credentials', usernameVariable: 'REG_USER', passwordVariable: 'REG_PASS')]) {
          sh '''
            HOST="${REGISTRY%%/*}"
            echo "$REG_PASS" | docker login "$HOST" -u "$REG_USER" --password-stdin
            for name in recruitment-backend recruitment-web; do
              for tag in "$TAG" latest; do
                docker tag "techzone/$name:$TAG" "$REGISTRY/$name:$tag"
                docker push "$REGISTRY/$name:$tag"
              done
            done
            docker logout "$HOST"
          '''
        }
      }
    }

    stage('Déploiement de la recette') {
      when { expression { return params.DEPLOY } }
      steps {
        sh '''
          export WEB_PORT=8088 IMAGE_TAG="$TAG"
          docker compose -p techzone-recette -f deploy/docker-compose.ci.yml up -d --wait --wait-timeout 180
          docker compose -p techzone-recette -f deploy/docker-compose.ci.yml ps
        '''
        echo 'Recette disponible : http://localhost:8088/recrutement  et  http://localhost:8088/admin/recrutement'
      }
    }
  }

  post {
    always {
      // La pile de test est toujours supprimée, avec ses volumes.
      sh 'docker network disconnect -f "${CI_PROJECT}_default" "$(hostname)" || true'
      sh 'docker compose -p "$CI_PROJECT" -f deploy/docker-compose.ci.yml down -v --remove-orphans || true'
      sh 'docker image prune -f --filter "until=168h" || true'
      archiveArtifacts artifacts: 'packages/*/dist/**', allowEmptyArchive: true
    }
    success  { echo "Build ${env.TAG} réussi." }
    unstable { echo 'Build instable : consultez les étapes de sécurité (npm audit, Gitleaks, Trivy).' }
    failure  { echo 'Build en échec : consultez le journal de l\'étape en rouge.' }
  }
}
