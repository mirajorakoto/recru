# Prompt d'image — illustration héro « Recrutement »

Ce document contient uniquement le prompt de génération d'image à utiliser
si une illustration dédiée doit remplacer le placeholder actuel. Il ne décrit
aucune autre décision d'implémentation.

## Où ce prompt s'applique

`packages/public-ui/src/index.jsx`, section héro de `JobList` (page
`/recrutement`, maquette `maquettes/01_recrutement_offres.png`). La maquette
montre une illustration isométrique de bâtiments de bureaux à droite du
texte d'accroche, sous la légende « Des équipes qui **construisent**
demain ».

En attendant l'image finale, cette zone affiche un **placeholder** SVG
généré par code (formes géométriques simples reprenant la palette bleue du
produit) : `packages/public-ui/src/index.jsx`, composant `HeroIllustration`.
Aucun fichier binaire n'a été ajouté au dépôt.

## Prompt à copier (ChatGPT Image / équivalent)

```text
Illustration vectorielle plate (flat design) pour une page carrières B2B,
format portrait libre proche de 4:5, fond transparent ou blanc pur.
Sujet : un petit groupe d'immeubles de bureaux modernes stylisés, vus en
légère perspective isométrique, avec quelques arbustes ronds au sol et deux
ou trois silhouettes humaines abstraites (sans visage, sans caractéristique
personnelle identifiable) devant les bâtiments. Palette strictement limitée
à des bleus : #0050cb (bâtiment principal), #0066ff (accents), #dce8fb et
#eef4fd (bâtiments secondaires, ciel), #10233d (traits fins de contour
optionnels). Style épuré, formes géométriques simples, aplats de couleur
sans dégradé complexe, pas de texture photo-réaliste, pas de texte, pas de
logo. Composition centrée, fond neutre pour permettre un détourage propre.
```

## Contraintes à conserver

- Aucune photo réelle, aucun visage identifiable.
- Palette limitée aux bleus déjà utilisés par l'interface (`--tz-blue-*`
  dans `packages/public-ui/src/styles.css`), pour rester cohérent avec le
  reste de la page une fois l'image intégrée.
- Une fois l'image générée et validée, l'intégrer comme fichier statique
  (ex. `packages/public-ui/src/assets/hero-illustration.svg` ou `.png`) et
  remplacer le composant `HeroIllustration` par une balise `<img>` pointant
  vers ce fichier, sans changer la mise en page environnante.
