import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

const BRAND_INK = [10, 15, 30] // #0a0f1e — matches app --ink
const GRAY_500 = [107, 114, 128]
const GRAY_300 = [205, 210, 218]
const GRAY_100 = [241, 243, 245]
const ZEBRA = [250, 251, 252]

function genderText(gender) {
  if (gender === 'Male') return 'Male'
  if (gender === 'Female') return 'Female'
  return 'Unspecified'
}

function describeFilters({ searchTerm, selectedArea, maleFilter, femaleFilter, phoneOnly }) {
  const parts = []
  if (selectedArea && selectedArea !== 'All') parts.push(`Area: ${selectedArea}`)
  if (maleFilter && !femaleFilter) parts.push('Male only')
  if (femaleFilter && !maleFilter) parts.push('Female only')
  if (phoneOnly) parts.push('With phone number')
  if (searchTerm && String(searchTerm).trim()) parts.push(`Search: "${String(searchTerm).trim()}"`)
  return parts.length ? parts.join(' · ') : 'None — complete PG list'
}

/**
 * Export PG listings to a PDF.
 * @param {Array<{id:number,name:string,area:string,gender:string|null,phone:string|null,location:string,distance_from_srm_ktr_km:number}>} listings
 * @param {{scopeLabel:string, searchTerm:string, selectedArea:string, maleFilter:boolean, femaleFilter:boolean, phoneOnly:boolean}} info
 */
export function exportListingsPdf(listings, info) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const pageW = doc.internal.pageSize.getWidth()
  const pageH = doc.internal.pageSize.getHeight()
  const marginX = 40

  /* ── Header ─────────────────────────────────── */
  doc.setFillColor(...BRAND_INK)
  doc.rect(0, 0, pageW, 86, 'F')

  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(20)
  doc.text('PGIO', marginX, 36)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(180, 188, 205)
  doc.text('PG Directory · Near SRM KTR (Kattankulathur)', marginX, 54)

  doc.setFontSize(9)
  doc.text(`Generated: ${new Date().toLocaleString()}`, marginX, 70)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(255, 255, 255)
  doc.text(`${listings.length} PG listing${listings.length !== 1 ? 's' : ''}`, pageW - marginX, 40, {
    align: 'right',
  })

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  doc.setTextColor(180, 188, 205)
  doc.text(`Filters: ${describeFilters(info)}`, pageW - marginX, 56, { align: 'right' })
  doc.text(info.scopeLabel === 'all' ? 'Scope: Complete PG list' : 'Scope: Filtered results', pageW - marginX, 70, {
    align: 'right',
  })

  /* ── Table ──────────────────────────────────── */
  const rows = listings.map((it, i) => [
    String(i + 1),
    it.name || '—',
    it.area || '—',
    genderText(it.gender),
    it.phone || 'Not listed',
    `${Number(it.distance_from_srm_ktr_km ?? 0).toFixed(2)} km`,
    it.location || '—',
  ])

  const tableStartY = 104
  autoTable(doc, {
    head: [['#', 'PG Name', 'Area', 'Type', 'Phone', 'Distance', 'Address']],
    body: rows,
    startY: tableStartY,
    margin: { left: marginX, right: marginX, top: 96, bottom: 34 },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: { top: 5, right: 5, bottom: 5, left: 5 },
      overflow: 'linebreak',
      textColor: BRAND_INK,
      lineColor: GRAY_300,
      lineWidth: { top: 0, right: 0, bottom: 0.5, left: 0 },
    },
    headStyles: {
      fillColor: GRAY_100,
      textColor: BRAND_INK,
      fontStyle: 'bold',
      fontSize: 8,
      lineWidth: { top: 0, right: 0, bottom: 1, left: 0 },
      lineColor: GRAY_300,
    },
    alternateRowStyles: {
      fillColor: ZEBRA,
    },
    columnStyles: {
      0: { cellWidth: 22, halign: 'right', textColor: GRAY_500 },
      1: { cellWidth: 110, fontStyle: 'bold' },
      2: { cellWidth: 60 },
      3: { cellWidth: 48 },
      4: { cellWidth: 66 },
      5: { cellWidth: 42, halign: 'right' },
      6: { cellWidth: 'auto' },
    },
  })

  /* ── Footer on every page ───────────────────── */
  const pageCount = doc.getNumberOfPages()
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p)
    doc.setDrawColor(...GRAY_300)
    doc.setLineWidth(0.5)
    doc.line(marginX, pageH - 26, pageW - marginX, pageH - 26)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.setTextColor(...GRAY_500)
    doc.text('PGIO · PG Directory near SRM KTR — always confirm availability & rates by phone before visiting', marginX, pageH - 14)
    doc.text(`Page ${p} of ${pageCount}`, pageW - marginX, pageH - 14, { align: 'right' })
  }

  /* ── Filename + save ────────────────────────── */
  const stamp = new Date().toISOString().slice(0, 10)
  const scopeWord = info.scopeLabel === 'all' ? 'complete' : 'filtered'
  doc.save(`pgio-${scopeWord}-pg-list-${listings.length}-${stamp}.pdf`)
}
