import { useEffect, useMemo, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet.markercluster/dist/MarkerCluster.css'
import 'leaflet.markercluster/dist/MarkerCluster.Default.css'
import 'leaflet.markercluster'
import {
  Search,
  List,
  ChevronDown,
  MapPin,
  Phone,
  X,
  Building2,
  Users,
  User,
  SearchX,
  Download,
  FileText,
} from 'lucide-react'
import { exportListingsPdf } from './exportPdf'
import pgData from '../pg_near_srm_ktr.json'
import './App.css'

/* ── Constants ─────────────────────────────────── */

const SRM_KTR = { lat: 12.8231, lng: 80.0444 }
const OSM_TILE = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const CARTO_TILE = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

/* ── Helpers ───────────────────────────────────── */

function esc(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function normalizeGender(value) {
  if (!value) return null
  const v = String(value).trim().toLowerCase()
  if (v === 'male') return 'Male'
  if (v === 'female') return 'Female'
  return null
}

function getPhoneHref(phone) {
  if (!phone) return undefined
  return `tel:${String(phone).replace(/[^\d+]/g, '')}`
}

function getAreaName(location = '') {
  const t = String(location)
  if (/Guduvanchery/i.test(t)) return 'Guduvanchery'
  if (/Urapakkam/i.test(t)) return 'Urapakkam'
  const match = t.match(/Potheri|Kattankulathur|Thailavaram|Maraimalai Nagar|Tambaram|Vandalur|Chengalpattu/i)
  return match?.[0] || 'Nearby'
}

function genderLetter(gender) {
  if (gender === 'Male') return 'M'
  if (gender === 'Female') return 'F'
  return '?'
}

function genderColor(gender) {
  if (gender === 'Male') return '#3b82f6'
  if (gender === 'Female') return '#ec4899'
  return '#6b7280'
}

function normalizeListings(data) {
  const items = Array.isArray(data?.listings) ? data.listings : []
  return items.map((it, i) => ({
    id: i + 1,
    name: it.name || `PG ${i + 1}`,
    phone: it.phone || null,
    location: it.location || '',
    area: getAreaName(it.location || ''),
    latitude: Number(it.latitude),
    longitude: Number(it.longitude),
    gender: normalizeGender(it.gender),
    distance_from_srm_ktr_km: Number(it.distance_from_srm_ktr_km ?? 0),
    has_phone: Boolean(it.phone),
  }))
}

/* ── Map Markers ───────────────────────────────── */

function createMarkerIcon(gender, selected = false) {
  const color = genderColor(gender)
  const size = selected ? 34 : 30
  return L.divIcon({
    className: 'pg-pin-wrapper',
    html: `<span class="pg-pin ${selected ? 'selected' : ''}" style="--pin-color: ${color};"><span class="pg-pin-inner">${genderLetter(gender)}</span></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -(size + 6)],
  })
}

function createClusterIcon(cluster) {
  return L.divIcon({
    html: `<div class="cluster-badge">${cluster.getChildCount()}</div>`,
    className: 'cluster-marker',
    iconSize: [40, 40],
  })
}

function buildPopup(item) {
  const phoneEl = item.phone
    ? `<a href="${esc(getPhoneHref(item.phone))}">${esc(item.phone)}</a>`
    : `<span class="no-phone">Not listed</span>`
  return `
    <div class="map-popup">
      <div class="popup-header"><h3>${esc(item.name)}</h3></div>
      <div class="popup-body">
        <div class="popup-row"><span class="popup-label">Area</span><span class="popup-tag area">${esc(item.area)}</span></div>
        <div class="popup-row"><span class="popup-label">Gender</span><span class="popup-tag ${item.gender ? item.gender.toLowerCase() : 'unknown'}">${esc(item.gender || 'Unspecified')}</span></div>
        <div class="popup-row"><span class="popup-label">Phone</span><span class="popup-value">${phoneEl}</span></div>
        <div class="popup-row"><span class="popup-label">Address</span><span class="popup-value">${esc(item.location)}</span></div>
        <div class="popup-row"><span class="popup-label">Distance</span><span class="popup-value">${item.distance_from_srm_ktr_km.toFixed(2)} km from SRM KTR</span></div>
      </div>
    </div>
  `
}

/* ── Skeleton Loader ───────────────────────────── */

function SkeletonList() {
  return (
    <div className="skeleton-list">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="skeleton-card">
          <div className="skeleton-lines">
            <div className="skeleton-line w70" />
            <div className="skeleton-line w50" />
            <div className="skeleton-line w40" />
          </div>
          <div className="skeleton-block" />
        </div>
      ))}
    </div>
  )
}

/* ── Filter Section Component ──────────────────── */

function FilterSection({ title, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="filter-section">
      <button
        type="button"
        className={`filter-section-header ${open ? 'open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="filter-section-title">{title}</span>
        <ChevronDown className="filter-section-chevron" />
      </button>
      <div className={`filter-section-body ${open ? '' : 'collapsed'}`} role="group">
        {children}
      </div>
    </div>
  )
}

/* ── Filter Panel (stable component — no state loss on re-render) ── */

function FilterPanel({
  searchTerm, setSearchTerm,
  areaOptions, selectedArea, setSelectedArea,
  maleFilter, setMaleFilter,
  femaleFilter, setFemaleFilter,
  phoneOnly, setPhoneOnly,
}) {
  return (
    <>
      <div className="search-box">
        <div className="search-input-wrap">
          <Search />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search PGs, areas..."
          />
        </div>
      </div>

      <FilterSection title="Location">
        {areaOptions.map((area) => (
          <button
            key={area}
            type="button"
            className={`chip ${selectedArea === area ? 'active' : ''}`}
            onClick={() => setSelectedArea(area)}
          >
            {area}
          </button>
        ))}
      </FilterSection>

      <FilterSection title="Type">
        <button
          type="button"
          className={`chip ${!maleFilter && !femaleFilter ? 'active' : ''}`}
          onClick={() => { setMaleFilter(false); setFemaleFilter(false) }}
        >
          <span className="chip-icon"><Users /></span>All
        </button>
        <button
          type="button"
          className={`chip ${maleFilter ? 'active' : ''}`}
          onClick={() => { setMaleFilter((v) => !v); setFemaleFilter(false) }}
        >
          <span className="chip-icon"><User /></span>Male
        </button>
        <button
          type="button"
          className={`chip ${femaleFilter ? 'active' : ''}`}
          onClick={() => { setFemaleFilter((v) => !v); setMaleFilter(false) }}
        >
          <span className="chip-icon"><User /></span>Female
        </button>
      </FilterSection>

      <FilterSection title="Contact" defaultOpen={false}>
        <button
          type="button"
          className={`chip ${phoneOnly ? 'active' : ''}`}
          onClick={() => setPhoneOnly((v) => !v)}
        >
          <span className="chip-icon"><Phone /></span>With phone number
        </button>
      </FilterSection>
    </>
  )
}

/* ── Listing Card Component ────────────────────── */

function ListingCard({ item, onSelect }) {
  return (
    <div
      className="listing-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(item)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(item) } }}
    >
      <div className="listing-card-main">
        <div className="listing-card-name">{item.name}</div>
        <div className="listing-card-meta">
          <span className="listing-card-area">
            <MapPin />{item.area}
          </span>
          <span className="listing-card-distance">{item.distance_from_srm_ktr_km.toFixed(1)} km</span>
        </div>
      </div>
      <div className="listing-card-right">
        <div className={`gender-badge ${item.gender ? item.gender.toLowerCase() : 'unknown'}`}>
          {genderLetter(item.gender)}
        </div>
        {item.phone && (
          <a href={getPhoneHref(item.phone)} className="listing-card-phone" onClick={(e) => e.stopPropagation()} title={item.phone}>
            <Phone />
          </a>
        )}
      </div>
    </div>
  )
}

/* ── Export Bar (shared desktop + mobile sheet) ── */

function ExportBar({ onExport, exporting, filteredCount, totalCount }) {
  return (
    <div className="export-bar">
      <button
        type="button"
        className="export-btn"
        onClick={() => onExport('filtered')}
        disabled={exporting || !filteredCount}
        title="Export the currently filtered listings as a PDF"
      >
        <Download />
        {exporting ? 'Preparing…' : 'Export PDF'}
      </button>
      <button
        type="button"
        className="export-btn ghost"
        onClick={() => onExport('all')}
        disabled={exporting || !totalCount}
        title="Export the complete PG list, ignoring filters"
      >
        <FileText />
        Complete list
      </button>
    </div>
  )
}

/* ── Main App ──────────────────────────────────── */

export default function App() {
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const clusterRef = useRef(null)
  const markersRef = useRef(new Map())
  const selectedIdRef = useRef(null)

  const [listings] = useState(() => normalizeListings(pgData))
  const [loading] = useState(false)
  const [error] = useState('')
  const [mapReady, setMapReady] = useState(false)
  const [maleFilter, setMaleFilter] = useState(false)
  const [femaleFilter, setFemaleFilter] = useState(false)
  const [phoneOnly, setPhoneOnly] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedArea, setSelectedArea] = useState('All')

  const [sheetOpen, setSheetOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  /* Reset mobile sheet on resize to desktop */
  useEffect(() => {
    const sync = () => {
      if (window.innerWidth > 980) setSheetOpen(false)
    }
    window.addEventListener('resize', sync)
    return () => window.removeEventListener('resize', sync)
  }, [])

  /* ── Derived State ───────────────────────────── */

  const areaOptions = useMemo(() => {
    const u = [...new Set(listings.map((i) => i.area).filter(Boolean))]
    return ['All', ...u]
  }, [listings])

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    return listings.filter((it) => {
      const gm = (!maleFilter && !femaleFilter) ||
        (maleFilter && it.gender === 'Male') ||
        (femaleFilter && it.gender === 'Female')
      const pm = !phoneOnly || it.has_phone
      const am = selectedArea === 'All' || it.area === selectedArea
      const qm = !q || it.name.toLowerCase().includes(q) || it.location.toLowerCase().includes(q) || it.area.toLowerCase().includes(q)
      return gm && pm && am && qm
    })
  }, [listings, maleFilter, femaleFilter, phoneOnly, selectedArea, searchTerm])

  const activeFilterCount = [maleFilter, femaleFilter, phoneOnly, selectedArea !== 'All'].filter(Boolean).length + (searchTerm ? 1 : 0)

  /* ── Map Init (must run before sync — sync waits on mapReady) ── */

  useEffect(() => {
    const map = L.map(mapContainerRef.current, {
      center: [SRM_KTR.lat, SRM_KTR.lng],
      zoom: 13,
      preferCanvas: true,
      zoomControl: true,
      attributionControl: true,
      scrollWheelZoom: window.innerWidth > 980,
    })

    const osm = L.tileLayer(OSM_TILE, { subdomains: 'abc', maxZoom: 19, attribution: '&copy; OSM' })
    const carto = L.tileLayer(CARTO_TILE, { subdomains: 'abcd', maxZoom: 20, attribution: '&copy; OSM &copy; CARTO' })

    let fallback = false
    osm.addTo(map)
    osm.on('tileerror', () => {
      if (!fallback) { fallback = true; map.removeLayer(osm); carto.addTo(map) }
    })

    mapRef.current = map
    setMapReady(true)
    return () => { map.remove(); mapRef.current = null; setMapReady(false) }
  }, [])

  /* ── Map Sync (markers follow the filtered list) ── */

  useEffect(() => {
    const map = mapRef.current
    if (!map || !mapReady) return

    if (clusterRef.current) {
      map.removeLayer(clusterRef.current)
      clusterRef.current = null
    }
    markersRef.current = new Map()

    const cg = L.markerClusterGroup({
      chunkedLoading: true,
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      disableClusteringAtZoom: 17,
      spiderfyOnMaxZoom: true,
      animate: true,
      iconCreateFunction: createClusterIcon,
    })

    const valid = filtered.filter((i) => Number.isFinite(i.latitude) && Number.isFinite(i.longitude))
    valid.forEach((it) => {
      const m = L.marker([it.latitude, it.longitude], {
        icon: createMarkerIcon(it.gender, it.id === selectedIdRef.current),
        riseOnHover: true,
      })
      m.bindPopup(buildPopup(it))
      markersRef.current.set(it.id, m)
      cg.addLayer(m)
    })

    map.addLayer(cg)
    clusterRef.current = cg

    if (valid.length > 0) {
      const bounds = L.latLngBounds(valid.map((i) => [i.latitude, i.longitude]))
      if (bounds.isValid()) {
        // Only refit when markers are NOT already in view — avoids zoom-jumps while typing
        const inView = map.getBounds().pad(0.05).contains(bounds)
        if (!inView) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })
      }
    } else {
      map.setView([SRM_KTR.lat, SRM_KTR.lng], 13)
    }
  }, [filtered, mapReady])

  /* ── Actions ─────────────────────────────────── */

  const clearAll = () => {
    setMaleFilter(false)
    setFemaleFilter(false)
    setPhoneOnly(false)
    setSearchTerm('')
    setSelectedArea('All')
  }

  const handleExportPdf = (scope) => {
    if (exporting) return
    const items = scope === 'all' ? listings : filtered
    if (!items.length) return
    setExporting(true)
    // Small delay so the button's "Preparing…" state paints before the sync PDF build
    setTimeout(() => {
      try {
        exportListingsPdf(items, {
          scopeLabel: scope,
          searchTerm, selectedArea, maleFilter, femaleFilter, phoneOnly,
        })
      } finally {
        setExporting(false)
      }
    }, 50)
  }

  const handleSelectListing = (item) => {
    const map = mapRef.current
    if (map && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)) {
      const marker = markersRef.current.get(item.id)
      if (marker) {
        selectedIdRef.current = item.id
        marker.setIcon(createMarkerIcon(item.gender, true))
        const reveal = () => {
          map.setView([item.latitude, item.longitude], Math.max(map.getZoom(), 16), { animate: true })
          marker.openPopup()
        }
        if (clusterRef.current) {
          clusterRef.current.zoomToShowLayer(marker, reveal)
        } else {
          reveal()
        }
      } else {
        map.setView([item.latitude, item.longitude], 16, { animate: true })
      }
    }
    setSheetOpen(false)
  }

  /* ── Shared filter props ─────────────────────── */

  const filterProps = {
    searchTerm, setSearchTerm,
    areaOptions, selectedArea, setSelectedArea,
    maleFilter, setMaleFilter,
    femaleFilter, setFemaleFilter,
    phoneOnly, setPhoneOnly,
  }

  /* ── List Content (shared desktop + mobile) ──── */

  const listContent = loading ? (
    <SkeletonList />
  ) : error ? (
    <div className="empty-state">
      <div className="empty-state-icon"><SearchX /></div>
      <h3>Something went wrong</h3>
      <p>{error}</p>
    </div>
  ) : filtered.length === 0 ? (
    <div className="empty-state">
      <div className="empty-state-icon"><Building2 /></div>
      <h3>No results found</h3>
      <p>Try adjusting your filters or search term.</p>
      <button type="button" className="chip" onClick={clearAll}>
        <span className="chip-icon"><X /></span>Clear all filters
      </button>
    </div>
  ) : (
    filtered.map((item) => (
      <ListingCard key={item.id} item={item} onSelect={handleSelectListing} />
    ))
  )

  /* ── Render ──────────────────────────────────── */

  return (
    <div className="app-shell">

      {/* ── Desktop Sidebar ────────────────────── */}
      <aside className="sidebar">
        <div className="brand-bar">
          <div className="brand-logo">P</div>
          <div className="brand-text">
            <span className="brand-name">PGIO</span>
            <span className="brand-sub">PG Directory · SRM KTR</span>
          </div>
        </div>

        <div className="sidebar-body">
          <FilterPanel {...filterProps} />

          <div className="results-bar">
            <span className="results-label">{filtered.length} listing{filtered.length !== 1 ? 's' : ''}</span>
            {activeFilterCount > 0 && (
              <button type="button" className="results-clear" onClick={clearAll}>
                <X /> Clear
              </button>
            )}
          </div>

          <ExportBar
            onExport={handleExportPdf}
            exporting={exporting}
            filteredCount={filtered.length}
            totalCount={listings.length}
          />

          <div className="list-scroll">
            {listContent}
          </div>
        </div>
      </aside>

      {/* ── Mobile Header ──────────────────────── */}
      <header className="mobile-header">
        <div className="mobile-brand">
          <div className="mobile-brand-logo">P</div>
          <span className="mobile-brand-name">PGIO</span>
        </div>
        <div className="mobile-actions">
          <button
            type="button"
            className="mobile-btn"
            onClick={() => handleExportPdf('filtered')}
            disabled={exporting || !filtered.length}
            title="Export filtered list as PDF"
          >
            <Download />
            <span className="label-text">PDF</span>
          </button>
          <button
            type="button"
            className="mobile-btn primary"
            onClick={() => setSheetOpen(true)}
            disabled={sheetOpen}
          >
            <List />
            <span className="label-text">List</span>
          </button>
        </div>
      </header>

      {/* ── Mobile Filter Bar (always visible, horizontally scrollable) ── */}
      <div className="mobile-filter-bar">
        {areaOptions.map((area) => (
          <button
            key={area}
            type="button"
            className={`chip ${selectedArea === area ? 'active' : ''}`}
            onClick={() => setSelectedArea(area)}
          >
            {area}
          </button>
        ))}
        <button
          type="button"
          className={`chip ${!maleFilter && !femaleFilter ? 'active' : ''}`}
          onClick={() => { setMaleFilter(false); setFemaleFilter(false) }}
        >
          <span className="chip-icon"><Users /></span>All
        </button>
        <button
          type="button"
          className={`chip ${maleFilter ? 'active' : ''}`}
          onClick={() => { setMaleFilter((v) => !v); setFemaleFilter(false) }}
        >
          <span className="chip-icon"><User /></span>Male
        </button>
        <button
          type="button"
          className={`chip ${femaleFilter ? 'active' : ''}`}
          onClick={() => { setFemaleFilter((v) => !v); setMaleFilter(false) }}
        >
          <span className="chip-icon"><User /></span>Female
        </button>
        <button
          type="button"
          className={`chip ${phoneOnly ? 'active' : ''}`}
          onClick={() => setPhoneOnly((v) => !v)}
        >
          <span className="chip-icon"><Phone /></span>Phone
        </button>
      </div>

      {/* ── Mobile List Sidebar (slide-in drawer) ─ */}
      <div className={`mobile-sheet-backdrop ${sheetOpen ? 'visible' : ''}`} onClick={() => setSheetOpen(false)} />
      <aside className={`mobile-sheet ${sheetOpen ? 'visible' : ''}`} aria-hidden={!sheetOpen}>
        <div className="mobile-sheet-brand">
          <div className="mobile-sheet-brand-text">
            <span className="mobile-sheet-title">Listings</span>
            <span className="mobile-sheet-sub">{filtered.length} found · PG Directory · SRM KTR</span>
          </div>
          <button
            type="button"
            className="mobile-sheet-close"
            onClick={() => setSheetOpen(false)}
            aria-label="Close list"
          >
            <X />
          </button>
        </div>

        <div className="mobile-sheet-body">
          <FilterPanel {...filterProps} />

          <div className="results-bar">
            <span className="results-label">{filtered.length} listing{filtered.length !== 1 ? 's' : ''}</span>
            {activeFilterCount > 0 && (
              <button type="button" className="results-clear" onClick={clearAll}>
                <X /> Clear
              </button>
            )}
          </div>

          <ExportBar
            onExport={handleExportPdf}
            exporting={exporting}
            filteredCount={filtered.length}
            totalCount={listings.length}
          />

          <div className="list-scroll">
            {listContent}
          </div>
        </div>
      </aside>

      {/* ── Map ────────────────────────────────── */}
      <div className="map-container">
        <div ref={mapContainerRef} className="map-view" aria-label="Map of PG listings" />
      </div>
    </div>
  )
}
