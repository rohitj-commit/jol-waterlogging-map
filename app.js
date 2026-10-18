let reports = [];
let currentUser = null;
let activeFilter = 'all';
let activeView = 'map';
const CITIES = ['Bengaluru', 'Mumbai', 'Delhi', 'Chennai', 'Hyderabad', 'Kolkata', 'Pune', 'Ahmedabad'];
// Coordinates are city-centre estimates, used only to frame the community map.
const CITY_MAP_DATA = {
  Bengaluru: { center: [12.9716, 77.5946], zoom: 12, labels: ['Indiranagar', 'Domlur', 'Halasuru Lake'] },
  Mumbai: { center: [19.0760, 72.8777], zoom: 11, labels: ['Bandra', 'Andheri', 'Dadar'] },
  Delhi: { center: [28.6139, 77.2090], zoom: 11, labels: ['Connaught Place', 'Lajpat Nagar', 'Rohini'] },
  Chennai: { center: [13.0827, 80.2707], zoom: 11, labels: ['Adyar', 'T. Nagar', 'Velachery'] },
  Hyderabad: { center: [17.3850, 78.4867], zoom: 11, labels: ['Banjara Hills', 'Hitech City', 'Secunderabad'] },
  Kolkata: { center: [22.5726, 88.3639], zoom: 11, labels: ['Salt Lake', 'Park Street', 'Howrah'] },
  Pune: { center: [18.5204, 73.8567], zoom: 11, labels: ['Kothrud', 'Viman Nagar', 'Hinjewadi'] },
  Ahmedabad: { center: [23.0225, 72.5714], zoom: 11, labels: ['Navrangpura', 'Maninagar', 'Satellite'] },
  custom: { center: [20.5937, 78.9629], zoom: 5, labels: ['Selected area', 'Nearby reports', 'Community map'] }
};
let selectedLocation = JSON.parse(localStorage.getItem('jol-location') || 'null') || { city: 'Bengaluru', label: 'Bengaluru' };
let leafletMap = null;
let leafletMarkers = [];
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);

const api = async (path, options = {}) => {
  const response = await fetch(path, { headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }, ...options });
  let body = {};
  try { body = await response.json(); } catch (error) { /* non-JSON response */ }
  if (!response.ok) { const error = new Error(body.error || `Request failed (${response.status})`); error.status = response.status; throw error; }
  return body;
};
const on = (selector, event, handler) => { const element = $(selector); if (element) element.addEventListener(event, handler); };
const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
const labelFor = status => ({ safe: 'Passable', caution: 'Caution', blocked: 'Blocked' }[status] || status);
const cityMapConfig = city => CITY_MAP_DATA[city] || CITY_MAP_DATA.custom;
function stableNumber(value) { return Array.from(String(value || '')).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 1009, 7); }
function reportCoordinates(report, index = 0) {
  if (Number.isFinite(Number(report.latitude)) && Number.isFinite(Number(report.longitude))) return { lat: Number(report.latitude), lng: Number(report.longitude), approximate: false };
  const config = cityMapConfig(report.city || selectedLocation.city);
  const seed = stableNumber(`${report.id}-${report.place}-${index}`);
  // Deliberately broad neighbourhood offsets: these are approximate, not street GPS.
  return { lat: config.center[0] + ((seed % 17) - 8) * 0.003, lng: config.center[1] + ((Math.floor(seed / 17) % 17) - 8) * 0.003, approximate: true };
}
function initLeafletMap() {
  if (leafletMap || !window.L || !$('#map')) return;
  try {
    leafletMap = L.map('map', { zoomControl: false, attributionControl: true }).setView(cityMapConfig(selectedLocation.city).center, cityMapConfig(selectedLocation.city).zoom);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(leafletMap);
    L.control.zoom({ position: 'bottomright' }).addTo(leafletMap);
    $('#map').classList.add('leaflet-ready');
  } catch (error) { leafletMap = null; }
}
function updateMapLocation() {
  const config = selectedLocation.latitude ? { center: [selectedLocation.latitude, selectedLocation.longitude], zoom: 14, labels: ['Your location', 'Nearby reports', 'Community map'] } : cityMapConfig(selectedLocation.city);
  const labels = $$('.map-label');
  config.labels.forEach((label, index) => { if (labels[index]) labels[index].textContent = label.toUpperCase(); });
  if (leafletMap) { leafletMap.setView(config.center, config.zoom, { animate: true }); leafletMap.invalidateSize(); }
  renderMarkers();
}

function initials(email) { return email.split('@')[0].slice(0, 2).toUpperCase(); }
function setUser(user) {
  currentUser = user;
  const name = user.name || user.email.split('@')[0];
  $('#profileName').textContent = name; $('#greetingName').textContent = name; $('#profileAvatar').textContent = initials(name); $('#topAvatar').textContent = initials(name);
  $('#loginOverlay').hidden = true; $('#appShell').hidden = false;
}
function returnToLogin() { currentUser = null; $('#appShell').hidden = true; $('#loginOverlay').hidden = false; $('#loginPassword').value = ''; $('#loginEmail').focus(); }
function showToast(text) {
  const toast = $('#toast'); if (!toast) return;
  $('#toastText').textContent = text; toast.classList.add('show'); clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
}

function renderReports(filter = activeFilter) {
  activeFilter = filter;
  const list = $('#reportList');
  const visible = filter === 'all' ? reports : reports.filter(report => report.status === filter);
  if (list) list.innerHTML = visible.length ? visible.map(report => `<button class="report-item" data-report="${report.id}"><span class="report-thumb ${report.thumb || ''}"></span><span class="report-copy"><strong>${escapeHtml(report.place)}</strong><span>${escapeHtml(report.time || 'just now')} · ${escapeHtml(report.depth)} · Community report</span></span><span class="status ${report.status}">${escapeHtml(report.label || labelFor(report.status))}</span></button>`).join('') : `<div class="empty-reports">${reports.length ? 'No reports match this filter yet.' : `No flood reports have been shared in ${escapeHtml(selectedLocation.label)} yet.`}</div>`;
  $$('.filter').forEach(button => { const count = button.querySelector('b'); if (count) count.textContent = button.dataset.filter === 'all' ? reports.length : reports.filter(report => report.status === button.dataset.filter).length; });
  const navCount = $('.nav-count'); if (navCount) navCount.textContent = reports.length;
  renderMarkers();
  renderMyReports();
}
function renderMarkers() {
  leafletMarkers.forEach(marker => marker.remove()); leafletMarkers = [];
  $$('.map-marker.dynamic').forEach(marker => marker.remove());
  $$('.map-marker:not(.dynamic)').forEach(marker => { marker.hidden = true; });
  const visible = activeFilter === 'all' ? reports : reports.filter(report => report.status === activeFilter);
  visible.slice(0, 20).forEach((report, index) => {
    const coords = reportCoordinates(report, index);
    if (leafletMap) {
      const color = report.status === 'safe' ? '#2d72d9' : report.status === 'blocked' ? '#e85d5d' : '#e9a62b';
      const marker = L.circleMarker([coords.lat, coords.lng], { radius: 9, color, fillColor: color, fillOpacity: .9, weight: 3 });
      marker.bindPopup(`<strong>${escapeHtml(report.place)}</strong><br>${escapeHtml(report.depth)} · ${escapeHtml(report.label || labelFor(report.status))}<br>${escapeHtml(report.time || 'just now')}<br><small>${coords.approximate ? 'Approximate community location' : 'Reported location'}</small>`);
      marker.on('click', () => showDetail(report.id)); marker.addTo(leafletMap); leafletMarkers.push(marker); return;
    }
    const marker = document.createElement('div');
    marker.className = `map-marker dynamic marker-${report.status === 'safe' ? 'blue' : report.status === 'blocked' ? 'red' : 'amber'}`;
    const frame = cityMapConfig(selectedLocation.city);
    const left = Math.max(8, Math.min(92, 50 + (coords.lng - frame.center[1]) * 900));
    const top = Math.max(12, Math.min(86, 50 - (coords.lat - frame.center[0]) * 900));
    marker.dataset.id = report.id; marker.style.left = `${left}%`; marker.style.top = `${top}%`;
    marker.innerHTML = `<span>${escapeHtml(report.depth)}</span>`; $('#map').appendChild(marker);
  });
  let empty = $('#mapEmptyState');
  if (!empty) { empty = document.createElement('div'); empty.id = 'mapEmptyState'; empty.className = 'map-empty-state'; $('#map').appendChild(empty); }
  empty.textContent = reports.length ? '' : `No reports in ${selectedLocation.label} yet`;
  empty.hidden = reports.length > 0;
  if (!reports.length && $('#selectedReport')) $('#selectedReport').hidden = true;
}
function selectReport(id) { $$('.map-marker').forEach(marker => marker.classList.toggle('selected', marker.dataset.id === String(id))); }
function showDetail(id) {
  const report = reports.find(item => String(item.id) === String(id)); if (!report) return;
  $('#detailPlace').textContent = report.place; $('#detailMeta').textContent = `Reported ${report.time || 'just now'} · ${report.depth} advisory estimate`;
  $('#detailObservation').textContent = `Community-reported · ${report.confidence || 'Advisory'} confidence${report.observations ? ' · ' + report.observations : ''}`;
  $('#detailStatus').textContent = (report.label || labelFor(report.status)).toUpperCase(); $('#detailStatus').className = `status ${report.status}`;
  $('#detailSafety').textContent = report.status === 'blocked' ? 'Do not attempt this route' : report.status === 'caution' ? 'Pass through with extra care' : 'You can get through with care';
  $('#selectedReport').hidden = false; selectReport(id);
}
function renderMyReports() {
  const list = $('#myReportList'); if (!list) return;
  const ids = JSON.parse(localStorage.getItem('jol-my-reports') || '[]').map(String);
  const mine = reports.filter(report => ids.includes(String(report.id)));
  list.innerHTML = mine.length ? mine.map(report => `<div class="my-report-item"><strong>${escapeHtml(report.place)}</strong><span>${escapeHtml(report.time || 'just now')} · ${escapeHtml(report.label || labelFor(report.status))}</span></div>`).join('') : '<div class="view-empty"><strong>You have not reported a flood here yet.</strong><span>Use “Report a flood” on the live map to help your neighbours.</span></div>';
}
function renderSavedPlaces() {
  const list = $('#savedPlaceList'); if (!list) return;
  const places = JSON.parse(localStorage.getItem('jol-saved-places') || '[]');
  list.innerHTML = places.length ? places.map(place => `<button class="saved-place" data-saved-city="${escapeHtml(place.city)}"><span class="city-dot"></span><span><strong>${escapeHtml(place.label)}</strong><small>View flood reports</small></span></button>`).join('') : '<div class="view-empty"><strong>No saved places yet.</strong><span>Save a city from the live map when you want quick access to its reports.</span></div>';
}
function switchView(view) {
  activeView = view;
  $$('.nav-item').forEach(item => item.classList.toggle('active', item.dataset.view === view));
  $$('.app-view').forEach(section => section.hidden = section.dataset.view !== view);
  const name = view === 'map' ? 'Live map' : view === 'reports' ? 'My reports' : 'Saved places';
  const breadcrumb = $('.breadcrumb strong'); if (breadcrumb) breadcrumb.textContent = name;
  if (view === 'reports') renderMyReports(); if (view === 'saved') renderSavedPlaces();
}
function applyLocation(location) {
  selectedLocation = location; localStorage.setItem('jol-location', JSON.stringify(location));
  $('#selectedCity').textContent = location.label; $('#mapCity').textContent = location.label; $('#cityPicker').hidden = true;
  const search = $('#mapSearch'); if (search) search.value = location.label;
   updateMapLocation(); loadReports(); showToast(`Showing reports near ${location.label}.`);
}
function cityMatches(query) { return CITIES.filter(city => city.toLowerCase().includes(query.trim().toLowerCase())); }
function renderCitySearch(query = '') {
  const results = $('#citySearchResults'); if (!results) return;
  const matches = cityMatches(query); results.innerHTML = matches.length ? matches.map(city => `<button type="button" class="city-search-option" data-city="${city}"><span class="city-dot"></span>${city}</button>`).join('') : '<span class="city-search-empty">No matching city. Try another name.</span>';
  results.hidden = false;
}
function openCityPicker() { $('#cityOptions').innerHTML = CITIES.map(city => `<button class="city-option" type="button" data-city="${city}"><span class="city-dot"></span>${city}</button>`).join('') + '<button class="city-option custom-option" type="button" data-city="custom">⌖ Enter a place or address</button>'; $('#customLocation').hidden = true; $('#cityPicker').hidden = false; }
function openModal() { if (!currentUser) return returnToLogin(); $('#uploadModal').hidden = false; document.body.style.overflow = 'hidden'; resetModal(); }
function closeModal() { $('#uploadModal').hidden = true; document.body.style.overflow = ''; }
function resetModal() { ['uploadStep', 'previewStep'].forEach(id => { if ($('#' + id)) $('#' + id).hidden = id !== 'uploadStep'; }); ['loadingStep', 'resultStep'].forEach(id => { if ($('#' + id)) $('#' + id).hidden = true; }); if ($('#fileInput')) $('#fileInput').value = ''; if ($('#modalError')) $('#modalError').hidden = true; }
function showError(text) { $('#modalError').textContent = text; $('#modalError').hidden = false; }
function loadPhoto(file) { if (!file) return; if (!file.type.startsWith('image/')) return showError('Please choose a JPG, PNG or WEBP image.'); if (file.size > 10 * 1024 * 1024) return showError('That file is larger than 10MB. Try a smaller photo.'); const reader = new FileReader(); reader.onload = () => { $('#previewImage').src = reader.result; $('#fileName').textContent = file.name; $('#fileSize').textContent = `${(file.size / 1024 / 1024).toFixed(1)} MB · Ready for analysis`; $('#uploadStep').hidden = true; $('#previewStep').hidden = false; }; reader.readAsDataURL(file); }
function analyse() { $('#previewStep').hidden = true; $('#loadingStep').hidden = false; setTimeout(() => { $('#loadingStep').hidden = true; $('#resultStep').hidden = false; }, 900); }
function ensureResultActions() { const result = $('.result-step'); if (!result || $('#publishBtn')) return; const actions = document.createElement('div'); actions.className = 'result-actions'; actions.innerHTML = '<button class="primary-button full" id="publishBtn" type="button">Publish to live map</button><button class="secondary-button full" id="doneBtn" type="button">Done</button>'; result.appendChild(actions); on('#publishBtn', 'click', publish); on('#doneBtn', 'click', closeModal); }
async function publish() { const button = $('#publishBtn'); if (button) button.disabled = true; try { const result = await api('/api/reports', { method: 'POST', body: JSON.stringify({ city: selectedLocation.city, location: selectedLocation.label, place: selectedLocation.label, depth: '0.45m', status: 'safe', photoName: $('#fileName').textContent }) }); reports.unshift(result.report); const ids = JSON.parse(localStorage.getItem('jol-my-reports') || '[]'); ids.unshift(result.report.id); localStorage.setItem('jol-my-reports', JSON.stringify([...new Set(ids)])); renderReports(); closeModal(); showToast('Your report is live. Thanks for helping your neighbours!'); showDetail(result.report.id); } catch (error) { if (error.status === 401) return returnToLogin(); showError(error.message); } finally { if (button) button.disabled = false; } }
async function loadReports() { try { const result = await api('/api/reports?city=' + encodeURIComponent(selectedLocation.city)); reports = result.reports || []; renderReports(); if (reports[0]) showDetail(reports[0].id); } catch (error) { if (error.status === 401) return returnToLogin(); showToast('Could not load reports. Please try again.'); } }
async function login(event) { event.preventDefault(); const name = $('#loginName').value.trim(), email = $('#loginEmail').value.trim(), password = $('#loginPassword').value, error = $('#loginError'), button = $('#loginSubmit'); error.hidden = true; if (!name || !email || !password) { error.textContent = 'Enter your name, email and password to continue.'; error.hidden = false; return; } button.disabled = true; button.textContent = 'Signing you in…'; try { const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ name, email, password }) }); setUser(result.user); await loadReports(); } catch (requestError) { error.textContent = requestError.message || 'Unable to sign in. Try again.'; error.hidden = false; } finally { button.disabled = false; button.innerHTML = 'Continue to Jol <svg><use href="#i-chevron"/></svg>'; } }
async function logout() { await api('/api/logout', { method: 'POST' }).catch(() => {}); returnToLogin(); }

document.addEventListener('DOMContentLoaded', () => {
  initLeafletMap();
  on('#loginForm', 'submit', login); on('#profileButton', 'click', logout); on('#openUpload', 'click', openModal); on('#tipReport', 'click', openModal); on('#closeUpload', 'click', closeModal); on('#analyseBtn', 'click', analyse); on('#publishBtn', 'click', publish); on('#doneBtn', 'click', closeModal); on('#removePhoto', 'click', resetModal); on('#fileInput', 'change', event => loadPhoto(event.target.files[0]));
  on('#dropzone', 'dragover', event => event.preventDefault()); on('#dropzone', 'drop', event => { event.preventDefault(); loadPhoto(event.dataTransfer.files[0]); });
  on('#demoPhoto', 'click', () => { const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500"><rect width="800" height="500" fill="#527b87"/><path d="M0 330Q200 250 400 340T800 280V500H0Z" fill="#39758a"/><circle cx="550" cy="280" r="70" fill="#e4b33b"/></svg>'; loadPhoto(new File([svg], 'sample-flood.svg', { type: 'image/svg+xml' })); });
  on('#uploadModal', 'click', event => { if (event.target === $('#uploadModal')) closeModal(); });
  ensureResultActions();
  $$('.filter').forEach(button => button.addEventListener('click', () => { $$('.filter').forEach(item => item.classList.remove('active')); button.classList.add('active'); renderReports(button.dataset.filter); }));
  $$('.nav-item').forEach(item => item.addEventListener('click', () => { switchView(item.dataset.view); if (window.innerWidth < 701) $('#sidebar').classList.remove('open'); }));
  on('#citySelect', 'click', openCityPicker); on('#closeCityPicker', 'click', () => $('#cityPicker').hidden = true);
  on('#cityOptions', 'click', event => { const button = event.target.closest('.city-option'); if (!button) return; if (button.dataset.city === 'custom') { $('#customLocation').hidden = false; $('#customLocationInput').focus(); } else applyLocation({ city: button.dataset.city, label: button.dataset.city }); });
  on('#saveCustomLocation', 'click', () => { const label = $('#customLocationInput').value.trim(); if (label) applyLocation({ city: label, label }); });
  on('#mapSearch', 'input', event => renderCitySearch(event.target.value)); on('#mapSearch', 'focus', event => renderCitySearch(event.target.value));
  on('#citySearchResults', 'click', event => { const button = event.target.closest('[data-city]'); if (button) applyLocation({ city: button.dataset.city, label: button.dataset.city }); });
  document.addEventListener('click', event => { if (!event.target.closest('.search-field')) { const results = $('#citySearchResults'); if (results) results.hidden = true; } });
  on('#useGeolocation', 'click', () => { if (!navigator.geolocation) return showToast('Location is not available in this browser.'); navigator.geolocation.getCurrentPosition(position => applyLocation({ city: 'Custom location', label: `Near you (${position.coords.latitude.toFixed(3)}, ${position.coords.longitude.toFixed(3)})`, latitude: position.coords.latitude, longitude: position.coords.longitude }), () => showToast('Could not access your location. You can enter an address instead.')); });
  on('#locateBtn', 'click', () => showToast('Map centred on your location.')); on('#menuBtn', 'click', () => $('#sidebar').classList.toggle('open')); on('#closeDetail', 'click', () => $('#selectedReport').hidden = true);
  on('#reportList', 'click', event => { const item = event.target.closest('.report-item'); if (item) showDetail(item.dataset.report); });
  on('#toggleRoads', 'click', () => { $('.toggle').classList.toggle('on'); $('.map').classList.toggle('traffic-on'); showToast('Traffic view updated.'); });
  on('#savePlaceBtn', 'click', () => { const places = JSON.parse(localStorage.getItem('jol-saved-places') || '[]'); if (!places.some(place => place.city === selectedLocation.city)) { places.push(selectedLocation); localStorage.setItem('jol-saved-places', JSON.stringify(places)); renderSavedPlaces(); showToast(`${selectedLocation.label} saved.`); } else showToast(`${selectedLocation.label} is already saved.`); });
  on('#savedPlaceList', 'click', event => { const button = event.target.closest('[data-saved-city]'); if (button) { const city = button.dataset.savedCity; switchView('map'); applyLocation({ city, label: city }); } });
   $('#selectedCity').textContent = selectedLocation.label; $('#mapCity').textContent = selectedLocation.label; updateMapLocation(); renderSavedPlaces(); switchView('map');
  api('/api/session').then(session => { if (session.authenticated && !currentUser) { setUser(session.user); return loadReports(); } }).catch(() => { if (!currentUser) returnToLogin(); });
});
