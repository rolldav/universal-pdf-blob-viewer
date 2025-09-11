// ==UserScript==
// @name         Universal PDF Blob Viewer
// @namespace    com.github.universal.pdf.blob.viewer
// @version      2.0.0
// @description  Force l'ouverture des PDF blob: en onglet via data:URI + iframe au lieu du téléchargement
// @author       Medical AI Assistant
// @match        *://*/*
// @exclude      https://docs.google.com/*
// @exclude      https://drive.google.com/*
// @exclude      https://github.com/*
// @exclude      https://gitlab.com/*
// @run-at       document-start
// @grant        none
// @noframes
// @compatible   chrome Chromium 109+
// @compatible   firefox Firefox 102+
// @compatible   safari Safari/Orion 17+
// @compatible   edge Edge 109+
// @license      MIT
// @homepage     https://github.com/example/universal-pdf-blob-viewer
// @updateURL    https://raw.githubusercontent.com/example/universal-pdf-blob-viewer/main/script.user.js
// ==/UserScript==

/**
 * Universal PDF Blob Viewer v2.0.0
 * ================================
 * 
 * BUT
 * ---
 * Transforme automatiquement les liens blob: vers des PDF en ouverture dans un nouvel onglet
 * avec visualisation inline, évitant le téléchargement forcé.
 * 
 * PORTÉE
 * ------
 * - Intercepte: <a href="blob:">, window.open('blob:'), iframe/embed/object, mutations DOM
 * - Détecte: PDF par MIME type ou analyse des premiers octets
 * - Convertit: blob → data:URI → iframe dans nouvel onglet
 * - Supporte: Workers, ServiceWorkers, blobs cross-origin (limité)
 * 
 * LIMITES
 * -------
 * - CSP strict: certains sites bloquent data:URI dans iframes
 * - Safari/Orion: restrictions popups plus strictes, data: parfois limité
 * - Taille: fichiers >80MB peuvent échouer (configurable)
 * - CORS: blobs d'autres origines inaccessibles sauf via fetch
 * 
 * COMPATIBILITÉ
 * -------------
 * | Navigateur    | Version min | Statut    | Notes                           |
 * |---------------|-------------|-----------|----------------------------------|
 * | Chrome/Edge   | 109+        | ✅ Complet | Toutes fonctionnalités OK       |
 * | Firefox       | 102+        | ✅ Complet | Toutes fonctionnalités OK       |
 * | Safari        | 17+         | ⚠️ Partiel | Popups restreintes, data: limité|
 * | Orion         | 1.3+        | ⚠️ Partiel | Basé sur WebKit, mêmes limites  |
 * 
 * PARAMÈTRES
 * ----------
 * OPEN_IN_NEW_TAB : true = nouvel onglet, false = remplace l'actuel
 * WATCH_MS        : durée d'observation DOM après action utilisateur (ms)
 * MAX_MB          : taille max d'un PDF à convertir (MB)
 * DEBUG           : active les logs console
 * EXCLUDED_SITES  : regex des sites à exclure
 * 
 * TESTS MANUELS
 * -------------
 * □ Lien simple: <a href="blob:...">PDF</a>
 * □ Lien download: <a href="blob:..." download="doc.pdf">
 * □ Window.open: window.open('blob:...')
 * □ Iframe dynamique: document.body.innerHTML += '<iframe src="blob:...">'
 * □ Worker PDF: new Worker créant un blob PDF
 * □ Popup bloquée: désactiver popups et tester
 * □ Non-PDF: blob image/texte (ne doit rien faire)
 * □ Gros fichier: PDF >80MB (doit avertir)
 * 
 * FAQ
 * ---
 * Q: Pourquoi pas GM_openInTab?
 * R: @grant none par défaut pour éviter permissions. Décommenter si besoin.
 * 
 * Q: Comment exclure un site?
 * R: Ajouter dans EXCLUDED_SITES ou utiliser @exclude en métadonnées
 * 
 * Q: Safari refuse d'ouvrir?
 * R: Limitations WebKit sur data:URI. Essayer OPEN_IN_NEW_TAB = false
 */

(() => {
  'use strict';

  // ========================================================================
  // CONFIGURATION
  // ========================================================================
  
  const CONFIG = {
    OPEN_IN_NEW_TAB: true,      // true = nouvel onglet, false = remplace actuel
    WATCH_MS: 4000,              // fenêtre observation DOM post-action (ms)
    MAX_MB: 80,                  // taille max PDF en MB (0 = illimité)
    DEBUG: false,                // logs console détaillés
    EXCLUDED_SITES: [            // regex sites à ignorer
      /^https?:\/\/mail\.google\.com/,
      /^https?:\/\/outlook\.live\.com/
    ]
  };

  // ========================================================================
  // HELPERS & UTILITIES
  // ========================================================================
  
  const log = (...args) => CONFIG.DEBUG && console.log('[PDF-Blob]', ...args);
  const warn = (...args) => console.warn('[PDF-Blob]', ...args);
  const error = (...args) => console.error('[PDF-Blob]', ...args);

  /**
   * Vérifie si le site actuel est exclu
   * @returns {boolean}
   */
  const isSiteExcluded = () => {
    const url = window.location.href;
    return CONFIG.EXCLUDED_SITES.some(regex => regex.test(url));
  };

  // Sortie immédiate si site exclu
  if (isSiteExcluded()) {
    log('Site exclu, script désactivé');
    return;
  }

  /**
   * Détecte si un type MIME est PDF
   * @param {string} type - MIME type
   * @returns {boolean}
   */
  const isPdfType = (type) => {
    return type && /application\/(pdf|x-pdf|acrobat)/i.test(type);
  };

  /**
   * Analyse les premiers octets pour détecter un PDF
   * @param {ArrayBuffer|Uint8Array} bytes - Données binaires
   * @returns {boolean}
   */
  const bytesLooksPdf = (bytes) => {
    try {
      const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
      if (arr.length < 5) return false;
      // PDF magic number: %PDF-
      return arr[0] === 0x25 && arr[1] === 0x50 && 
             arr[2] === 0x44 && arr[3] === 0x46 && arr[4] === 0x2D;
    } catch {
      return false;
    }
  };

  /**
   * Vérifie la taille d'un blob
   * @param {Blob} blob
   * @returns {boolean} true si OK, false si trop gros
   */
  const checkBlobSize = (blob) => {
    if (!CONFIG.MAX_MB || CONFIG.MAX_MB === 0) return true;
    const maxBytes = CONFIG.MAX_MB * 1024 * 1024;
    return blob.size <= maxBytes;
  };

  /**
   * Convertit un Blob en data:URI
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  const blobToDataURL = (blob) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Échec lecture blob'));
      reader.readAsDataURL(blob);
    });
  };

  /**
   * Ouvre un data:URI dans un nouvel onglet avec iframe
   * @param {string} dataURL
   * @param {string} [filename] - Nom optionnel du fichier
   */
  const openInNewDoc = (dataURL, filename = 'document.pdf') => {
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${filename}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { height: 100%; width: 100%; overflow: hidden; }
    iframe { 
      width: 100%; 
      height: 100%; 
      border: none; 
      display: block;
    }
    .fallback {
      padding: 20px;
      font-family: system-ui, -apple-system, sans-serif;
      text-align: center;
    }
    .fallback a {
      color: #0066cc;
      text-decoration: none;
      font-size: 18px;
    }
  </style>
</head>
<body>
  <iframe src="${dataURL}" allowfullscreen></iframe>
  <noscript>
    <div class="fallback">
      <p>JavaScript requis pour afficher ce PDF</p>
      <a href="${dataURL}" download="${filename}">Télécharger le PDF</a>
    </div>
  </noscript>
</body>
</html>`;

    try {
      if (CONFIG.OPEN_IN_NEW_TAB) {
        // Tentative nouvel onglet
        const win = window.open('', '_blank');
        if (!win || win.closed) {
          throw new Error('Popup bloquée');
        }
        win.document.open();
        win.document.write(html);
        win.document.close();
        log('PDF ouvert dans nouvel onglet');
      } else {
        // Remplace onglet actuel
        document.open();
        document.write(html);
        document.close();
        log('PDF ouvert dans onglet actuel');
      }
    } catch (err) {
      // Fallback: remplace l'onglet actuel si popup bloquée
      warn('Popup bloquée, ouverture dans onglet actuel', err);
      document.open();
      document.write(html);
      document.close();
    }
  };

  // ========================================================================
  // BLOB MANAGEMENT
  // ========================================================================
  
  // Cache des blobs créés dans cette page
  const blobMap = new Map();
  const blobMetadata = new WeakMap(); // métadonnées sans empêcher GC

  /**
   * Hook URL.createObjectURL pour capturer les blobs PDF
   */
  const originalCreateObjectURL = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function(obj) {
    const url = originalCreateObjectURL(obj);
    
    try {
      if (obj instanceof Blob) {
        const type = obj.type;
        
        // Stocke dans le cache si c'est un PDF
        if (isPdfType(type)) {
          blobMap.set(url, obj);
          blobMetadata.set(obj, {
            created: Date.now(),
            size: obj.size,
            type: type
          });
          log('PDF blob capturé:', url, `(${(obj.size/1024/1024).toFixed(2)}MB)`);
        }
        
        // Si type inconnu, analyse les premiers octets
        else if (!type || type === 'application/octet-stream') {
          obj.slice(0, 5).arrayBuffer().then(buffer => {
            if (bytesLooksPdf(buffer)) {
              blobMap.set(url, obj);
              log('PDF détecté par magic number:', url);
            }
          }).catch(() => {});
        }
      }
    } catch (err) {
      error('Erreur hook createObjectURL:', err);
    }
    
    return url;
  };

  /**
   * Hook URL.revokeObjectURL pour nettoyer le cache
   */
  const originalRevokeObjectURL = URL.revokeObjectURL.bind(URL);
  URL.revokeObjectURL = function(url) {
    if (blobMap.has(url)) {
      log('Nettoyage blob révoqué:', url);
      blobMap.delete(url);
    }
    return originalRevokeObjectURL(url);
  };

  /**
   * Résout un blob:URL vers un Blob
   * Supporte les blobs créés par Workers via fetch fallback
   * @param {string} url
   * @returns {Promise<Blob|null>}
   */
  const resolveBlob = async (url) => {
    // Vérifie d'abord le cache
    if (blobMap.has(url)) {
      log('Blob trouvé dans cache:', url);
      return blobMap.get(url);
    }
    
    // Tentative de récupération via fetch (marche même pour Workers)
    try {
      log('Tentative fetch pour blob:', url);
      const response = await fetch(url, { 
        method: 'GET',
        cache: 'no-store',
        credentials: 'same-origin'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const blob = await response.blob();
      
      // Vérifie si c'est un PDF
      if (isPdfType(blob.type)) {
        log('PDF récupéré via fetch:', url);
        return blob;
      }
      
      // Si type inconnu, vérifie magic number
      if (!blob.type || blob.type === 'application/octet-stream') {
        const buffer = await blob.slice(0, 5).arrayBuffer();
        if (bytesLooksPdf(buffer)) {
          log('PDF détecté via fetch + magic:', url);
          return blob;
        }
      }
      
      log('Blob non-PDF ignoré:', blob.type);
      return null;
      
    } catch (err) {
      error('Échec résolution blob:', url, err);
      return null;
    }
  };

  // ========================================================================
  // ORCHESTRATION
  // ========================================================================
  
  /**
   * Gère l'ouverture d'un blob:URL PDF
   * @param {string} url - blob:URL
   * @param {string} [filename] - nom optionnel
   * @returns {Promise<boolean>} succès
   */
  const handleBlobPdfURL = async (url, filename) => {
    try {
      log('Traitement blob URL:', url);
      
      // Résout le blob
      const blob = await resolveBlob(url);
      if (!blob) {
        log('Pas un PDF ou blob introuvable');
        return false;
      }
      
      // Vérifie la taille
      if (!checkBlobSize(blob)) {
        const sizeMB = (blob.size / 1024 / 1024).toFixed(2);
        const msg = `PDF trop volumineux (${sizeMB}MB > ${CONFIG.MAX_MB}MB)\n` +
                   `Voulez-vous l'ouvrir directement ?`;
        
        if (confirm(msg)) {
          window.open(url, '_blank');
          return true;
        }
        return false;
      }
      
      // Convertit en data:URI
      const dataURL = await blobToDataURL(blob);
      
      // Ouvre dans nouvel onglet
      openInNewDoc(dataURL, filename || 'document.pdf');
      
      return true;
      
    } catch (err) {
      error('Erreur traitement blob:', err);
      
      // Dernier recours: ouverture directe
      try {
        window.open(url, '_blank');
        return true;
      } catch {
        return false;
      }
    }
  };

  // ========================================================================
  // INTERCEPTIONS
  // ========================================================================
  
  /**
   * Intercepte window.open pour les blob:
   */
  const originalWindowOpen = window.open.bind(window);
  window.open = function(url, target, features) {
    try {
      if (typeof url === 'string' && url.startsWith('blob:')) {
        log('Interception window.open:', url);
        handleBlobPdfURL(url).then(handled => {
          if (!handled) {
            // Si pas un PDF, comportement normal
            originalWindowOpen(url, target, features);
          }
        });
        return null;
      }
    } catch (err) {
      error('Erreur hook window.open:', err);
    }
    
    return originalWindowOpen(url, target, features);
  };

  /**
   * Intercepte les clics sur liens blob:
   */
  document.addEventListener('click', (event) => {
    const link = event.target?.closest?.('a[href^="blob:"]');
    if (!link) return;
    
    const url = link.href;
    const filename = link.download || link.textContent?.trim() || 'document.pdf';
    
    log('Interception clic lien:', url, filename);
    
    // Empêche comportement par défaut
    event.preventDefault();
    event.stopPropagation();
    
    // Traite le blob
    handleBlobPdfURL(url, filename);
    
  }, true); // capture phase pour priorité

  // ========================================================================
  // OBSERVATION DOM
  // ========================================================================
  
  let watchUntil = 0;
  const observerActive = { value: false };
  
  /**
   * Active la fenêtre d'observation après action utilisateur
   */
  const armWatcher = () => {
    watchUntil = performance.now() + CONFIG.WATCH_MS;
    
    if (!observerActive.value) {
      observerActive.value = true;
      startObserver();
    }
  };
  
  // Écoute les actions utilisateur
  ['click', 'keydown', 'submit', 'change'].forEach(eventType => {
    document.addEventListener(eventType, armWatcher, { 
      capture: true, 
      passive: true 
    });
  });
  
  /**
   * Observe les mutations DOM pour détecter les blob: injectés
   */
  const mutationObserver = new MutationObserver((mutations) => {
    // Vérifie si on est dans la fenêtre d'observation
    if (performance.now() > watchUntil) {
      if (observerActive.value) {
        observerActive.value = false;
        mutationObserver.disconnect();
        log('Observation DOM terminée');
      }
      return;
    }
    
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        
        // Collecte les éléments à vérifier
        const elements = [];
        
        // L'élément lui-même
        if (node.matches?.('a[href^="blob:"], iframe[src^="blob:"], embed[src^="blob:"], object[data^="blob:"]')) {
          elements.push(node);
        }
        
        // Ses descendants
        if (node.querySelectorAll) {
          elements.push(...node.querySelectorAll('a[href^="blob:"], iframe[src^="blob:"], embed[src^="blob:"], object[data^="blob:"]'));
        }
        
        // Traite chaque élément trouvé
        for (const element of elements) {
          const url = element.href || element.src || element.data;
          
          if (url && url.startsWith('blob:')) {
            log('Blob détecté via mutation:', element.tagName, url);
            
            // Pour les liens, attendre le clic
            if (element.tagName === 'A') continue;
            
            // Pour iframe/embed/object, traiter immédiatement
            handleBlobPdfURL(url).then(handled => {
              if (handled && element.parentNode) {
                // Optionnel: remplacer l'élément par un message
                const msg = document.createElement('div');
                msg.style.cssText = 'padding:10px;background:#f0f0f0;border:1px solid #ccc;';
                msg.textContent = 'PDF ouvert dans un nouvel onglet';
                element.parentNode.replaceChild(msg, element);
                
                // Retirer le message après 3s
                setTimeout(() => msg.remove(), 3000);
              }
            });
            
            // Réinitialise le timer
            watchUntil = 0;
            return;
          }
        }
      }
    }
  });
  
  /**
   * Démarre l'observation DOM
   */
  const startObserver = () => {
    if (!document.documentElement) {
      // Attendre que le DOM soit prêt
      setTimeout(startObserver, 10);
      return;
    }
    
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: false,
      characterData: false
    });
    
    log('Observation DOM activée');
  };

  // ========================================================================
  // COMPATIBILITÉ SAFARI/ORION
  // ========================================================================
  
  /**
   * Détecte Safari/Orion
   */
  const isSafariOrion = () => {
    const ua = navigator.userAgent;
    return /Safari/.test(ua) && !/Chrome/.test(ua) && !/Chromium/.test(ua);
  };
  
  if (isSafariOrion()) {
    log('Safari/Orion détecté - limitations possibles sur data:URI');
    
    // Pour Safari/Orion, préférer location.href si popups bloquées
    const originalOpenInNewDoc = openInNewDoc;
    window.openInNewDoc = (dataURL, filename) => {
      try {
        originalOpenInNewDoc(dataURL, filename);
      } catch {
        // Fallback Safari: utilise location.href
        if (confirm(`Ouvrir ${filename} dans cet onglet ?\n(Safari bloque les popups)`)) {
          location.href = dataURL;
        }
      }
    };
  }

  // ========================================================================
  // FEATURE DETECTION & ALTERNATIVES
  // ========================================================================
  
  /**
   * Vérifie si GM_openInTab est disponible (nécessite @grant GM_openInTab)
   */
  const hasGMOpenInTab = () => {
    return typeof GM_openInTab === 'function' || typeof GM?.openInTab === 'function';
  };
  
  // Si décommenté dans @grant, utiliser GM_openInTab comme fallback
  /*
  if (hasGMOpenInTab()) {
    const gmOpen = GM_openInTab || GM.openInTab;
    
    const originalOpenInNewDoc = openInNewDoc;
    openInNewDoc = (dataURL, filename) => {
      try {
        gmOpen(dataURL, { active: true, insert: true });
        log('PDF ouvert via GM_openInTab');
      } catch {
        originalOpenInNewDoc(dataURL, filename);
      }
    };
  }
  */

  // ========================================================================
  // NETTOYAGE & GESTION MÉMOIRE
  // ========================================================================
  
  /**
   * Nettoie les blobs anciens du cache
   */
  const cleanupOldBlobs = () => {
    const maxAge = 30 * 60 * 1000; // 30 minutes
    const now = Date.now();
    
    for (const [url, blob] of blobMap.entries()) {
      const meta = blobMetadata.get(blob);
      if (meta && (now - meta.created) > maxAge) {
        log('Nettoyage blob ancien:', url);
        blobMap.delete(url);
      }
    }
  };
  
  // Nettoyage périodique
  setInterval(cleanupOldBlobs, 5 * 60 * 1000); // toutes les 5 min
  
  // Nettoyage au déchargement de la page
  window.addEventListener('beforeunload', () => {
    blobMap.clear();
    log('Cache blob nettoyé');
  });

  // ========================================================================
  // INIT & TESTS
  // ========================================================================
  
  log('Universal PDF Blob Viewer initialisé');
  log('Config:', CONFIG);
  log('Safari/Orion:', isSafariOrion());
  
  /**
   * Tests rapides (décommenter pour tester)
   * Exécuter dans la console après installation
   */
  /*
  window.testPdfBlobViewer = () => {
    console.group('🧪 Tests PDF Blob Viewer');
    
    // Test 1: Création blob PDF
    const pdfContent = atob('JVBERi0xLjQKJeLjz9MKNCAwIG9iago8PC9MZW5ndGggNTAvRmlsdGVyL0ZsYXRlRGVjb2RlPj4Kc3RyZWFtCnjaK1YwULCx0XfOL80rySypVIiuVSjJyCxWSM7PS1WoUQIAAAD//wMAYvYLYQplbmRzdHJlYW0KZW5kb2JqCjEgMCBvYmoKPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9SZXNvdXJjZXM8PC9Gb250PDwvRjEgMyAwIFI+Pj4+L0NvbnRlbnRzIDQgMCBSL01lZGlhQm94WzAgMCA2MTIgNzkyXT4+CmVuZG9iagoyIDAgb2JqCjw8L1R5cGUvUGFnZXMvQ291bnQgMS9LaWRzWzEgMCBSXT4+CmVuZG9iago1IDAgb2JqCjw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+CmVuZG9iagozIDAgb2JqCjw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+CmVuZG9iago2IDAgb2JqCjw8L1Byb2R1Y2VyKGlUZXh0IDIuMS43IGJ5IDFUM1hUKS9DcmVhdGlvbkRhdGUoRDoyMDI0MDEwMTEyMDAwMCkPPgplbmRvYmoKeHJlZgowIDcKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMTQ3IDAwMDAwIG4gCjAwMDAwMDAyNTAgMDAwMDAgbiAKMDAwMDAwMDM1NyAwMDAwMCBuIAowMDAwMDAwMDE1IDAwMDAwIG4gCjAwMDAwMDAzMDUgMDAwMDAgbiAKMDAwMDAwMDQzOCAwMDAwMCBuIAp0cmFpbGVyCjw8L1NpemUgNy9Sb290IDUgMCBSL0luZm8gNiAwIFI+PgpzdGFydHhyZWYKNTM0CiUlRU9G');
    const blob = new Blob([pdfContent], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    console.log('✅ Test 1: Blob PDF créé:', url);
    
    // Test 2: Lien simple
    const link = document.createElement('a');
    link.href = url;
    link.textContent = 'Test PDF (cliquer)';
    link.style.cssText = 'display:block;padding:10px;background:yellow;';
    document.body.appendChild(link);
    console.log('✅ Test 2: Lien ajouté au DOM');
    
    // Test 3: Window.open
    setTimeout(() => {
      console.log('✅ Test 3: Tentative window.open...');
      window.open(url);
    }, 1000);
    
    // Test 4: Iframe dynamique
    setTimeout(() => {
      const iframe = document.createElement('iframe');
      iframe.src = url;
      iframe.style.cssText = 'width:300px;height:200px;border:2px solid red;';
      document.body.appendChild(iframe);
      console.log('✅ Test 4: Iframe ajouté');
    }, 2000);
    
    // Test 5: Blob non-PDF
    const textBlob = new Blob(['Hello World'], { type: 'text/plain' });
    const textUrl = URL.createObjectURL(textBlob);
    const textLink = document.createElement('a');
    textLink.href = textUrl;
    textLink.textContent = 'Test non-PDF (ne doit rien faire)';
    textLink.style.cssText = 'display:block;padding:10px;background:lightblue;';
    document.body.appendChild(textLink);
    console.log('✅ Test 5: Lien non-PDF ajouté');
    
    console.groupEnd();
    
    // Nettoyage après 10s
    setTimeout(() => {
      URL.revokeObjectURL(url);
      URL.revokeObjectURL(textUrl);
      console.log('🧹 Tests nettoyés');
    }, 10000);
  };
  
  console.log('💡 Exécuter window.testPdfBlobViewer() pour lancer les tests');
  */

})();

/**
 * CHEMIN CRITIQUE (5 lignes)
 * ===========================
 * 1. blob:URL détecté via hook (createObjectURL) ou interception (click/window.open/mutation)
 * 2. Résolution blob → Blob via cache ou fetch(blobURL) pour support Workers
 * 3. Vérification PDF via MIME type ou magic bytes (%PDF-)
 * 4. Conversion Blob → data:application/pdf;base64,... via FileReader
 * 5. Injection HTML avec <iframe src="data:..."> dans nouvel onglet ou actuel
 * 
 * LIMITES CONNUES
 * ===============
 * - CSP strict interdisant data: dans src iframe → échec affichage
 * - Sandbox iframes sans allow-popups → fallback onglet actuel
 * - Safari/Orion: restrictions sévères sur window.open et data:URI
 * - CORS: blobs d'autres origines parfois inaccessibles
 * - Taille: FileReader limite pratique ~100MB selon RAM disponible
 * 
 * @license MIT
 * @version 2.0.0
 */
