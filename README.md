# Universal PDF Blob Viewer

🚀 Force l'ouverture des PDF blob: en onglet au lieu du téléchargement automatique.

## 📦 Installation

### Prérequis
Installez d'abord une extension userscript :
- [Tampermonkey](https://www.tampermonkey.net/) (Chrome, Firefox, Edge, Safari)
- [Violentmonkey](https://violentmonkey.github.io/) (Chrome, Firefox, Edge)
- [Userscripts](https://apps.apple.com/app/userscripts/id1463298887) (Safari/iOS)

### Installation du script
👉 **[Cliquer ici pour installer](https://github.com/rolldav/universal-pdf-blob-viewer/raw/main/universal-pdf-blob-viewer.user.js)**

## ✨ Fonctionnalités

- ✅ Intercepte automatiquement tous les PDF blob:
- ✅ Conversion en data:URI pour affichage inline
- ✅ Ouverture dans nouvel onglet (configurable)
- ✅ Support des Workers et ServiceWorkers
- ✅ Détection intelligente des PDF (MIME type + magic bytes)
- ✅ Gestion mémoire optimisée
- ✅ Compatible tous sites web

## ⚙️ Configuration

Modifiez ces constantes au début du script selon vos besoins :
```javascript
const CONFIG = {
    OPEN_IN_NEW_TAB: true,    // true = nouvel onglet, false = onglet actuel
    WATCH_MS: 4000,            // Durée observation DOM (ms)
    MAX_MB: 80,                // Taille max PDF (0 = illimité)
    DEBUG: false               // Logs console détaillés
}

