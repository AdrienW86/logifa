import { Page, Text, View, Document, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: { padding: 40, fontFamily: 'Helvetica', fontSize: 10, color: '#1e293b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 40 },
  logo: { width: 60, height: 60, borderRadius: 8, marginBottom: 10 },
  // Le titre s'adapte maintenant (Facture ou Devis)
  title: { fontSize: 30, color: '#e2e8f0', textTransform: 'uppercase', fontWeight: 'bold' },
  label: { fontSize: 8, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 'bold', marginBottom: 4 },
  emetteur: { width: '50%' },
  destinataire: { width: '45%', textAlign: 'right', marginTop: 40, marginLeft: 'auto' },
  
  table: { width: '100%', marginTop: 20 },
  tableHeader: { 
    flexDirection: 'row', borderBottomWidth: 2, borderBottomColor: '#0f172a', 
    paddingBottom: 5, marginBottom: 5, fontSize: 7, textTransform: 'uppercase', color: '#94a3b8' 
  },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingVertical: 8, alignItems: 'center' },
  sectionRow: { backgroundColor: '#f8fafc', padding: 6, marginTop: 5, fontSize: 8, fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b' },
  
  colDesc: { flex: 4 },
  colQty: { flex: 1.5, textAlign: 'center' },
  colPrice: { flex: 1.5, textAlign: 'right' },
  colTva: { flex: 1, textAlign: 'right' },
  colTotal: { flex: 2, textAlign: 'right', fontWeight: 'bold' },

  totalSection: { marginTop: 30, borderTopWidth: 3, borderTopColor: '#0f172a', paddingTop: 15, width: 220, marginLeft: 'auto' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  totalHT: { fontSize: 9, color: '#64748b' },
  totalFinal: { fontSize: 16, fontWeight: 'bold', marginTop: 8, color: '#0f172a', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingTop: 8 },
  
  // Style pour le tampon "Acquittée" ou "Acompte"
  badge: { 
    position: 'absolute', top: 170, right: 40, borderWidth: 3, borderColor: '#ef4444', 
    color: '#ef4444', padding: 10, fontSize: 20, fontWeight: 'bold', borderRadius: 8, 
    transform: 'rotate(-15deg)', opacity: 0.2 
  },
  footer: { position: 'absolute', bottom: 30, left: 40, right: 40, textAlign: 'center', color: '#cbd5e1', fontSize: 8 }
});

const FacturePDF = ({ 
  monEntreprise, 
  clientInfo, 
  items, 
  numFacture, 
  totalHT, 
  totalTVA, 
  totalTTC, 
  isExonere, 
  logoUrl,
  docType = 'facture', // Par défaut facture
  statut = 'brouillon',
  montantAcompte = 0 
}) => {
  
  const resteAPayer = totalTTC - montantAcompte;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        
        {/* Tampon si payée */}
        {statut === 'payée' && (
          <Text style={styles.badge}>ACQUITTÉE</Text>
        )}

        <View style={styles.header}>
          <View style={styles.emetteur}>
            {logoUrl && <Image src={logoUrl} style={styles.logo} />}
            <Text style={styles.label}>Émetteur</Text>
            <Text style={{ fontWeight: 'bold', fontSize: 11 }}>{monEntreprise.nom}</Text>
            <Text style={{ color: '#64748b' }}>{monEntreprise.adresse}</Text>
            <Text style={{ color: '#64748b' }}>{monEntreprise.villeCP}</Text>
            <Text style={{ marginTop: 5, fontSize: 7, color: '#94a3b8' }}>SIRET: {monEntreprise.siret}</Text>
          </View>
          <View style={{ textAlign: 'right' }}>
            <Text style={styles.title}>{docType}</Text>
            <Text style={{ fontSize: 14, fontWeight: 'bold', marginTop: 5 }}>{numFacture}</Text>
            <Text style={{ color: '#94a3b8', fontSize: 9 }}>Date: {new Date().toLocaleDateString()}</Text>
          </View>
        </View>

        <View style={styles.destinataire}>
          <Text style={styles.label}>Destinataire</Text>
          <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 2 }}>{clientInfo.nom_entreprise || "NOM DU CLIENT"}</Text>
          <Text style={{ color: '#64748b' }}>{clientInfo.adresse_numero} {clientInfo.adresse_voie}</Text>
          <Text style={{ color: '#64748b' }}>{clientInfo.code_postal} {clientInfo.ville}</Text>
        </View>

        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={styles.colDesc}>Désignation</Text>
            <Text style={styles.colQty}>Qté / Unité</Text>
            <Text style={styles.colPrice}>P.U HT</Text>
            {!isExonere && <Text style={styles.colTva}>TVA</Text>}
            <Text style={styles.colTotal}>Total HT</Text>
          </View>

          {items.map((item, i) => (
            <View key={i} wrap={false}>
              {item.type === 'section' ? (
                <Text style={styles.sectionRow}>{item.titre}</Text>
              ) : (
                <View style={styles.tableRow}>
                  <Text style={styles.colDesc}>{item.description || "Prestation"}</Text>
                  <Text style={styles.colQty}>{item.quantite} {item.unite || 'unité'}</Text>
                  <Text style={styles.colPrice}>{parseFloat(item.prixHT || 0).toFixed(2)} €</Text>
                  {!isExonere && <Text style={styles.colTva}>{item.tva || 0}%</Text>}
                  <Text style={styles.colTotal}>{((item.quantite || 0) * (item.prixHT || 0)).toFixed(2)} €</Text>
                </View>
              )}
            </View>
          ))}
        </View>

        <View style={styles.totalSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalHT}>TOTAL HT</Text>
            <Text>{parseFloat(totalHT || 0).toFixed(2)} €</Text>
          </View>
          
          {!isExonere && (
            <View style={styles.totalRow}>
              <Text style={styles.totalHT}>DONT TVA</Text>
              <Text>{parseFloat(totalTVA || 0).toFixed(2)} €</Text>
            </View>
          )}

          <View style={styles.totalRow}>
            <Text style={{ fontSize: 10, fontWeight: 'bold' }}>TOTAL TTC</Text>
            <Text style={{ fontSize: 10, fontWeight: 'bold' }}>{parseFloat(totalTTC || 0).toFixed(2)} €</Text>
          </View>

          {montantAcompte > 0 && (
            <>
              <View style={styles.totalRow}>
                <Text style={styles.totalHT}>ACOMPTE VERSÉ</Text>
                <Text>- {parseFloat(montantAcompte).toFixed(2)} €</Text>
              </View>
              <View style={[styles.totalRow, styles.totalFinal]}>
                <Text>NET À PAYER</Text>
                <Text>{parseFloat(resteAPayer).toFixed(2)} €</Text>
              </View>
            </>
          )}

          {montantAcompte === 0 && (
             <View style={[styles.totalRow, styles.totalFinal]}>
                <Text>TOTAL À PAYER</Text>
                <Text>{parseFloat(totalTTC || 0).toFixed(2)} €</Text>
             </View>
          )}

          {isExonere && (
            <Text style={{ fontSize: 7, fontStyle: 'italic', marginTop: 15, color: '#94a3b8', textAlign: 'right' }}>
              TVA non applicable, art. 293 B du CGI
            </Text>
          )}
        </View>

        <Text style={styles.footer}>Document généré numériquement — Page 1/1</Text>
      </Page>
    </Document>
  );
};

export default FacturePDF;