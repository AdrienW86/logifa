import type { CatalogueService } from "../types/editor";
// prestationsCouverture.js
const prestationsCouverture: CatalogueService[] = [
  // CHARPENTE / SUPPORT
  { name: "Pose de chevrons en sapin traité classe 2", unit: "ml", price: 20, category: "Charpente" },
  { name: "Pose de liteaux en sapin traité classe 2 48*18mm", unit: "ml", price: 8, category: "Charpente" },
  { name: "Pose d'un liteau en sapin traité classe 2 48x18mm", unit: "ml", price: 8, category: "Charpente" },
  { name: "Pose de contre-liteaux", unit: "ml", price: 9, category: "Charpente" },
  { name: "Pose volige sapin 18mm", unit: "m²", price: 35, category: "Charpente" },
  { name: "Remplacement poutre en bois", unit: "unité", price: 120, category: "Charpente" },
  { name: "Pose de fermettes industrielles", unit: "ml", price: 50, category: "Charpente" },
  { name: "Traitement préventif charpente", unit: "m²", price: 25, category: "Charpente" },

  // ÉCRAN / ÉTANCHÉITÉ
  { name: "Pose écran sous-toiture HPV", unit: "m²", price: 22, category: "Étanchéité" },
  { name: "Pose pare-vapeur", unit: "m²", price: 18, category: "Étanchéité" },
  { name: "Pose membrane d'étanchéité bitumineuse", unit: "m²", price: 45, category: "Étanchéité" },
  { name: "Pose membrane EPDM", unit: "m²", price: 60, category: "Étanchéité" },
  { name: "Pose sous-toiture respirante", unit: "m²", price: 8, category: "Étanchéité" },
  { name: "Étanchéité terrasse bitume", unit: "m²", price: 65, category: "Étanchéité" },

  // TUILES
  { name: "Pose tuiles mécaniques terre cuite", unit: "m²", price: 65, category: "Couverture" },
  { name: "Pose tuiles canal", unit: "m²", price: 75, category: "Couverture" },
  { name: "Pose tuiles plates", unit: "m²", price: 95, category: "Couverture" },
  { name: "Réparation de toiture / remplacement tuiles cassées", unit: "m²", price: 35, category: "Couverture" },
  { name: "Remplacement d'une tuile cassée", unit: "unité", price: 25, category: "Couverture" },

  // ARDOISE
  { name: "Pose ardoise naturelle", unit: "m²", price: 110, category: "Couverture" },
  { name: "Pose ardoise synthétique", unit: "m²", price: 80, category: "Couverture" },

  // ZINGUERIE
  { name: "Pose gouttière PVC", unit: "ml", price: 35, category: "Zinguerie" },
  { name: "Pose gouttière zinc", unit: "ml", price: 65, category: "Zinguerie" },
  { name: "Pose descente EP zinc", unit: "ml", price: 70, category: "Zinguerie" },
  { name: "Pose solin plomb", unit: "ml", price: 55, category: "Zinguerie" },
  { name: "Habillage de cheminée en zinc", unit: "unité", price: 80, category: "Zinguerie" },
  { name: "Pose abergement cheminée", unit: "forfait", price: 450, category: "Zinguerie" },
  { name: "Pose de chéneau aluminium", unit: "ml", price: 30, category: "Zinguerie" },

  // FENÊTRE DE TOIT
  { name: "Pose fenêtre de toit type Velux", unit: "unité", price: 900, category: "Fenêtre" },
  { name: "Remplacement fenêtre de toit existante", unit: "unité", price: 750, category: "Fenêtre" },
  { name: "Pose Velux / fenêtre de toit", unit: "unité", price: 350, category: "Fenêtre" },

  // ISOLATION
  { name: "Isolation laine de verre combles perdus", unit: "m²", price: 28, category: "Isolation" },
  { name: "Isolation laine de roche rampants", unit: "m²", price: 45, category: "Isolation" },
  { name: "Isolation sarking", unit: "m²", price: 120, category: "Isolation" },
  { name: "Isolation sarking par l’extérieur", unit: "m²", price: 90, category: "Isolation" },
  { name: "Isolation toiture laine de bois", unit: "m²", price: 45, category: "Isolation" },

  // NETTOYAGE / ENTRETIEN
  { name: "Nettoyage toiture haute pression", unit: "m²", price: 18, category: "Entretien" },
  { name: "Traitement anti-mousse", unit: "m²", price: 15, category: "Entretien" },
  { name: "Hydrofugation toiture", unit: "m²", price: 25, category: "Entretien" },
  { name: "Nettoyage et démoussage toiture", unit: "m²", price: 10, category: "Entretien" },
  { name: "Inspection et réparation fuite", unit: "forfait", price: 120, category: "Entretien" },

  // DÉMOLITION / DÉPOSE
  { name: "Dépose couverture tuiles", unit: "m²", price: 25, category: "Démolition" },
  { name: "Dépose couverture ardoise", unit: "m²", price: 30, category: "Démolition" },

  // ACCESSOIRES ET SÉCURITÉ
  { name: "Pose garde-corps ou ligne de vie", unit: "ml", price: 35, category: "Sécurité" },
  { name: "Installation échelle ou accès toiture", unit: "unité", price: 150, category: "Sécurité" },
  { name: "Pose de bâche de sécurité pour chantier", unit: "m²", price: 8, category: "Sécurité" },

  // LOGISTIQUE / CHANTIER
  { name: "Location échafaudage (journée)", unit: "forfait", price: 120, category: "Chantier" },
  { name: "Location benne (7 m³)", unit: "forfait", price: 250, category: "Chantier" },
  { name: "Nettoyage complet chantier", unit: "forfait", price: 200, category: "Chantier" },
  { name: "Évacuation des débris / gravats", unit: "m³", price: 40, category: "Chantier" },

  // FORFAITS
  { name: "Remplacement toiture complète 100 m²", unit: "forfait", price: 8000, category: "Forfait" },
  { name: "Remplacement toiture complète 150 m²", unit: "forfait", price: 12000, category: "Forfait" },
];

export default prestationsCouverture;