# 🪼 Méduses

Un petit jeu d'arcade dans le navigateur : tu guides une méduse dans les profondeurs, tu manges du plancton lumineux et tu évites les tortues de mer qui traversent l'écran.

HTML, CSS et JavaScript vanilla avec `<canvas>`. Pas de dépendance, pas de build.

## Jouer

Ouvre `index.html` dans un navigateur, ou lance un petit serveur local :

```bash
npx serve .
```

## Commandes

| Action | Commande |
| --- | --- |
| Déplacer la méduse | Souris, doigt ou flèches du clavier |
| Lancer une partie | Bouton **Jouer** |

## Règles

- Chaque plancton mangé rapporte 1 point.
- Une tortue qui touche la méduse termine la partie.
- Plus la partie dure, plus les tortues sont rapides et nombreuses.
- Le meilleur score est gardé dans le `localStorage` du navigateur.

## Structure

```
meduses/
├── index.html   # page et écran d'accueil
├── style.css    # mise en page et thème
└── game.js      # boucle de jeu, entités, dessin et entrées
```
