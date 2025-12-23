# Analyse du code Deposium CLI

Cette note résume une première revue ciblée sur le code mort / inutilisé et sur quelques opportunités de nettoyage rapide. Les vérifications ci-dessous se basent sur les sources TypeScript actuelles et des recherches globales dans le dépôt.

## Faits marquants

- `handleAuthError` est exportée dans `src/utils/auth.ts` mais n'est référencée par aucun autre fichier : elle ne sert pas aux commandes ni au flux d'authentification actuel.
- Plusieurs helpers d'affichage dans `src/utils/formatter.ts` (par ex. `typewriter`, `formatGraphTree`, `displayCompactList`) ne sont utilisés que par des fichiers de démonstration ou la documentation (`demo-ui.ts`, guides UI) et ne sont jamais appelés par les commandes CLI compilées.

## Quick wins proposés

1. **Supprimer `handleAuthError` ou la brancher là où une gestion 401 est attendue** pour éviter d'exporter du code mort et clarifier le chemin d'erreur d'authentification.
2. **Isoler ou nettoyer les helpers UI non utilisés par le CLI** (`typewriter`, `formatGraphTree`, `displayCompactList`) :
   - soit les déplacer vers un espace « démo » explicite ou marquer ces exports comme expérimentaux,
   - soit les retirer du build CLI si aucune commande ne les appelle. Cela réduit la surface maintenue et le bruit lors des audits.
3. **Documenter les scripts/entrées qui restent purement démonstratives** (`demo-ui.ts`) pour signaler qu'ils ne sont pas dans le chemin d’exécution standard et peuvent être exclus des livrables.

## Vérifications effectuées

- Recherche par symboles (`rg`) pour confirmer l'absence de références aux fonctions identifiées comme mortes.
- `npm run typecheck` pour s'assurer qu'aucune contrainte de typage ne masque des usages implicites.
