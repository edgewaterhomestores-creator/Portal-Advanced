'use strict';

const ESTIMATE_STORE_KEY = 'edgewater-estimates-v2';
const SYNC_LAST_KEY = 'edgewater-estimates-last-sync-v1';
const SYNC_CONFLICTS_KEY = 'edgewater-estimates-sync-conflicts-v1';
const DATA_RESET_KEY = 'edgewater-estimates-data-reset-id-v1';
const AUTH_TOKEN_KEY = 'edgewater-estimates-auth-token-v1';
const AUTH_TOKEN_EXPIRES_KEY = 'edgewater-estimates-auth-expires-v1';
const RESIZER_WIDTH_KEY = 'edgewater-estimates-editor-width-v1';
const CUSTOMER_SUGGESTION_LIMIT = 8;
const LINE_SUGGESTION_LIMIT = 8;
const API_BASE = '/api/estimate-module';
const ASSET_BASE = '/estimates-module';
const ZIP_LOOKUP_URL = `${ASSET_BASE}/USZIPCodes202602.csv`;

const DEFAULT_CABINET_ITEMS = [
    { label: 'Cabinets', amount: 0, taxable: true },
    { label: 'Countertops', amount: 0, taxable: true },
    { label: 'Other', amount: 0, taxable: true }
];

const DEFAULT_INSTALLATION_ITEMS = [];

const state = {
    currentEstimateId: '',
    uploadedLogoPath: `${ASSET_BASE}/defaultLogo.png`,
    cabinetItems: cloneItems(DEFAULT_CABINET_ITEMS),
    installationItems: cloneItems(DEFAULT_INSTALLATION_ITEMS),
    savedEstimates: [],
    remoteEntities: [],
    remoteCustomers: [],
    customerRecords: [],
    productRecords: [],
    installationItemRecords: [],
    visibleCustomerSuggestions: [],
    managerSelected: new Set(),
    entities: {
        customer: new Set(),
        supplier: new Set(),
        installer: new Set(),
        product: new Set()
    },
    syncInProgress: false
};

let estimateAutosaveTimer = null;
let estimateAutosaveInFlight = false;
let lastEstimateAutosaveSignature = '';
let lastGeneratedEstimateFilename = '';
let zipLookupPromise = null;
let zipLookupMap = null;
let installerQuickAddKeys = new Set();

function documentYearPrefix(dateValue = todayDateValue()) {
    const value = displayDate(dateValue) || todayDateValue();
    const yearMatch = value.match(/(\d{4})$/);
    const year = yearMatch ? Number(yearMatch[1]) : new Date().getFullYear();
    return String(Math.max(0, year - 2020));
}

function estimateNumberPrefix(dateValue = todayDateValue()) {
    return `ES${documentYearPrefix(dateValue)}05`;
}

function estimateSequenceForYear(dateValue = todayDateValue(), ignoreId = '') {
    const prefix = estimateNumberPrefix(dateValue);
    const used = state.savedEstimates
        .filter((estimate) => !estimate.deleted && estimate.estimateId !== ignoreId)
        .map((estimate) => String(estimate.estimateNumber || estimate.estimateId || ''))
        .filter((value) => new RegExp(`^${prefix}\\d{3}$`).test(value))
        .map((value) => Number(value.slice(prefix.length)))
        .filter(Number.isFinite);
    return Math.max(0, ...used) + 1;
}

function makeEstimateNumber(dateValue = todayDateValue()) {
    const sequence = estimateSequenceForYear(dateValue);
    return `${estimateNumberPrefix(dateValue)}${String(sequence).padStart(3, '0')}`;
}

function urlParams() {
    return new URLSearchParams(window.location.search);
}

function openedFromContract() {
    return urlParams().get('from') === 'contract';
}

function safeContractReturnPath(value) {
    const raw = String(value || '');
    if (!raw.startsWith('/') || raw.startsWith('//')) return '';
    try {
        const url = new URL(raw, window.location.origin);
        if (url.origin !== window.location.origin) return '';
        const path = `${url.pathname}${url.search}${url.hash}`;
        const isNewContract = path === '/contract/new' || path.startsWith('/contract/new?');
        const isEditContract = /^\/contract\/[^/]+\/edit(?:[?#]|$)/.test(path);
        return isNewContract || isEditContract ? path : '';
    } catch (_error) {
        return '';
    }
}

function $(id) {
    return document.getElementById(id);
}

function lookupSaveChoice(item = {}) {
    if (!Object.prototype.hasOwnProperty.call(item, 'saveForLookup')) return undefined;
    return item.saveForLookup === true;
}

function cloneItems(items) {
    return items.map((item) => ({
        label: cleanItemLabel(item.label),
        amount: parseValue(item.amount),
        taxable: Boolean(item.taxable),
        cabinetCount: item.cabinetCount || '',
        unitPrice: parseValue(item.unitPrice),
        vendorListPrice: item.vendorListPrice || item.listPrice || '',
        unitCost: item.unitCost || '',
        costMultiplier: item.costMultiplier || '',
        discountPercent: item.discountPercent || '',
        markupPercent: item.markupPercent || '',
        productCode: item.productCode || '',
        itemType: item.itemType || item.category || '',
        itemDescription: item.itemDescription || item.description || '',
        productSupplier: item.productSupplier || item.supplier || '',
        lookupSource: item.lookupSource || '',
        saveForLookup: lookupSaveChoice(item),
        sourceDocumentId: item.sourceDocumentId || '',
        sourceQuoteNumber: item.sourceQuoteNumber || ''
    }));
}

function cleanItemLabel(label) {
    return String(label || '')
        .replace(/\s+\((?:T|NT)\)$/i, '')
        .replace(/\s+(?:Taxable|Non[-\s]?Taxable)$/i, '')
        .trim();
}

function updateCalculatedLineAmount(item) {
    const count = parseValue(item.cabinetCount);
    const unitPrice = parseValue(item.unitPrice);
    if (count > 0 && unitPrice > 0) {
        item.amount = count * unitPrice;
    }
}

function parseValue(value) {
    const parsed = parseFloat(String(value || '').replace(/[$,\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseSalesTaxRate() {
    const rate = parseValue($('salesTaxRate')?.value || 6.5);
    return rate >= 0 ? rate : 6.5;
}

function formatAccounting(num) {
    return parseValue(num).toFixed(2);
}

function formatCurrency(num) {
    return parseValue(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(value) {
    return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatPhoneNumber(phone) {
    return formatPhoneDigits(phoneDigits(phone));
}

function phoneDigits(value) {
    return String(value || '').replace(/\D/g, '').replace(/^1+/, '').slice(0, 10);
}

function isValidEmail(value) {
    const email = String(value || '').trim();
    return !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function formatPhoneDigits(digits) {
    if (!digits) return '';
    if (digits.length <= 3) return `(${digits}`;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

function formatPhoneInput(input) {
    input.value = formatPhoneDigits(phoneDigits(input.value));
}

function addressDisplayLines(value) {
    const text = String(value || '').replace(/\r/g, '').trim();
    if (!text) return [];
    const normalizeCityLine = (line) => String(line || '').trim().replace(/\s+([A-Z]{2}\s+\d{5}(?:-\d{4})?)$/i, ', $1');
    const hardLines = text.split('\n').map((line) => line.trim()).filter(Boolean);
    if (hardLines.length > 1) return [hardLines[0], normalizeCityLine(hardLines.slice(1).join(' '))];

    const cityPattern = '([A-Z][A-Za-z .\'-]+,?\\s+[A-Z]{2}\\s+\\d{5}(?:-\\d{4})?)';
    const commaCityMatch = text.match(new RegExp(`^(.+?),\\s*${cityPattern}$`, 'i'));
    if (commaCityMatch) return [commaCityMatch[1].trim(), normalizeCityLine(commaCityMatch[2])];

    const suffixes = 'Avenue|Ave|Street|St|Road|Rd|Drive|Dr|Lane|Ln|Boulevard|Blvd|Court|Ct|Circle|Cir|Place|Pl|Trail|Trl|Parkway|Pkwy|Way';
    const cityStateMatch = text.match(new RegExp(`^(.+\\b(?:${suffixes})\\.?)\\s+${cityPattern}$`, 'i'));
    if (cityStateMatch) return [cityStateMatch[1].trim(), normalizeCityLine(cityStateMatch[2])];

    const smashedCityMatch = text.match(new RegExp(`^(.+\\b(?:${suffixes})\\.?)([A-Z][A-Za-z .'-]+,?\\s+[A-Z]{2}\\s+\\d{5}(?:-\\d{4})?)$`));
    if (smashedCityMatch) return [smashedCityMatch[1].trim(), normalizeCityLine(smashedCityMatch[2])];

    return [text];
}

function cityStateZip(city, stateValue, zip) {
    return [
        String(city || '').trim(),
        [stateValue, zip].filter(Boolean).join(' ').trim()
    ].filter(Boolean).join(', ');
}

function splitAddressParts(value) {
    const lines = addressDisplayLines(value);
    const street = lines[0] || '';
    const cityLine = lines.slice(1).join(' ');
    const match = cityLine.match(/^(.+?),?\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)$/i);
    return {
        street,
        city: match ? match[1].replace(/,$/, '').trim() : '',
        state: match ? match[2].toUpperCase() : '',
        zip: match ? match[3] : ''
    };
}

function customerAddressFromParts(parts = {}) {
    const street = String(parts.street || '').trim();
    const cityLine = cityStateZip(parts.city, String(parts.state || '').trim().toUpperCase(), parts.zip);
    return [street, cityLine].filter(Boolean).join('\n');
}

function customerAddressPartsFromEstimate(estimate = {}) {
    const parsed = splitAddressParts(estimate.customerAddress);
    return {
        street: String(estimate.customerStreet || parsed.street || '').trim(),
        city: String(estimate.customerCity || parsed.city || '').trim(),
        state: String(estimate.customerState || parsed.state || '').trim().toUpperCase(),
        zip: String(estimate.customerZip || parsed.zip || '').trim()
    };
}

function currentCustomerAddressParts() {
    return {
        street: $('customerStreet')?.value || '',
        city: $('customerCity')?.value || '',
        state: $('customerState')?.value || '',
        zip: $('customerZip')?.value || ''
    };
}

function setCustomerAddressFields(valueOrParts) {
    const parts = typeof valueOrParts === 'string' ? splitAddressParts(valueOrParts) : customerAddressPartsFromEstimate(valueOrParts || {});
    setValue('customerStreet', parts.street);
    setValue('customerZip', parts.zip);
    setValue('customerCity', parts.city);
    setValue('customerState', parts.state);
    if (parts.zip && (!parts.city || !parts.state)) {
        void autofillCityStateFromZip($('customerZip'), $('customerCity'), $('customerState'), { overwrite: false });
    }
}

function customerAddressDisplayLines(data = {}) {
    const parts = customerAddressPartsFromEstimate(data);
    return [parts.street, cityStateZip(parts.city, parts.state, parts.zip)].filter(Boolean);
}

function todayDateValue() {
    const today = new Date();
    return `${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}/${today.getFullYear()}`;
}

function displayDate(value) {
    if (!value) return '';
    const text = String(value).trim();
    const isoDate = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoDate) return `${isoDate[2]}/${isoDate[3]}/${isoDate[1]}`;
    return text;
}

function makeEstimateId(dateValue = $('estimateDate')?.value || todayDateValue()) {
    return makeEstimateNumber(dateValue);
}

function normalizeLookupKey(value) {
    return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function setValue(id, value) {
    const element = $(id);
    if (element) element.value = value || '';
}

function setValueIfPresent(id, value, formatter) {
    const element = $(id);
    const nextValue = value || '';
    if (element && nextValue) {
        element.value = typeof formatter === 'function' ? formatter(nextValue) : nextValue;
    }
}

function zipDigits(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 5);
}

function splitCsvLine(line) {
    const cells = [];
    let current = '';
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const next = line[i + 1];
        if (char === '"' && quoted && next === '"') {
            current += '"';
            i += 1;
        } else if (char === '"') {
            quoted = !quoted;
        } else if (char === ',' && !quoted) {
            cells.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    cells.push(current);
    return cells;
}

function zipHeaderKey(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function titleCaseCity(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\b[a-z]/g, (letter) => letter.toUpperCase());
}

async function loadZipLookupMap() {
    if (zipLookupMap) return zipLookupMap;
    if (zipLookupPromise) return zipLookupPromise;
    zipLookupPromise = fetch(ZIP_LOOKUP_URL)
        .then((response) => {
            if (!response.ok) throw new Error('ZIP lookup file is unavailable.');
            return response.text();
        })
        .then((csv) => {
            const rows = csv.split(/\r?\n/).filter(Boolean);
            const header = splitCsvLine(rows.shift() || '');
            const headerKeys = header.map(zipHeaderKey);
            let zipIndex = headerKeys.findIndex((key) => ['zip', 'zipcode', 'postalcode', 'zip5'].includes(key));
            let cityIndex = headerKeys.findIndex((key) => ['city', 'cityname', 'primarycity'].includes(key));
            let stateIndex = headerKeys.findIndex((key) => ['state', 'stateabbr', 'stateabbreviation', 'statecode'].includes(key));
            if (zipIndex < 0) zipIndex = 0;
            if (cityIndex < 0) cityIndex = 1;
            if (stateIndex < 0) stateIndex = 3;

            const lookup = new Map();
            rows.forEach((line) => {
                const cells = splitCsvLine(line);
                const zip = zipDigits(cells[zipIndex]);
                const city = titleCaseCity(cells[cityIndex]);
                const stateValue = String(cells[stateIndex] || '').trim().toUpperCase();
                if (zip.length === 5 && city && stateValue && !lookup.has(zip)) {
                    lookup.set(zip, { city, state: stateValue });
                }
            });
            zipLookupMap = lookup;
            return lookup;
        })
        .catch((error) => {
            console.warn(error.message || error);
            zipLookupMap = new Map();
            return zipLookupMap;
        });
    return zipLookupPromise;
}

async function autofillCityStateFromZip(zipInput, cityInput, stateInput, { overwrite = true } = {}) {
    if (!zipInput || !cityInput || !stateInput) return;
    const zip = zipDigits(zipInput.value);
    zipInput.value = zip;
    if (zip.length !== 5) return;

    const lookup = await loadZipLookupMap();
    const match = lookup.get(zip);
    if (!match) return;

    const shouldSetCity = overwrite || !cityInput.value.trim();
    const shouldSetState = overwrite || !stateInput.value.trim();
    if (shouldSetCity) cityInput.value = match.city;
    if (shouldSetState) stateInput.value = match.state;
    if (shouldSetCity || shouldSetState) handleDraftChanged();
}

function bindZipCityStateLookup({ zipId, cityId, stateId }) {
    const zipInput = $(zipId);
    const cityInput = $(cityId);
    const stateInput = $(stateId);
    if (!zipInput || !cityInput || !stateInput) return;
    zipInput.maxLength = 5;
    zipInput.inputMode = 'numeric';
    zipInput.addEventListener('input', () => {
        zipInput.value = zipDigits(zipInput.value);
        if (zipInput.value.length === 5) {
            void autofillCityStateFromZip(zipInput, cityInput, stateInput, { overwrite: true });
        }
    });
    zipInput.addEventListener('blur', () => {
        void autofillCityStateFromZip(zipInput, cityInput, stateInput, { overwrite: true });
    });
}

function setChecked(id, value) {
    const element = $(id);
    if (element) element.checked = Boolean(value);
}

function getAuthToken() {
    const token = sessionStorage.getItem(AUTH_TOKEN_KEY) || '';
    const expiresAt = Number(sessionStorage.getItem(AUTH_TOKEN_EXPIRES_KEY) || 0);
    if (!token || expiresAt <= Date.now()) {
        sessionStorage.removeItem(AUTH_TOKEN_KEY);
        sessionStorage.removeItem(AUTH_TOKEN_EXPIRES_KEY);
        return '';
    }
    return token;
}

function storeAuthToken(token, expiresAt) {
    if (!token) return;
    sessionStorage.setItem(AUTH_TOKEN_KEY, token);
    sessionStorage.setItem(AUTH_TOKEN_EXPIRES_KEY, String(expiresAt || Date.now() + 3600000));
}

function authHeaders(extra = {}) {
    const token = getAuthToken();
    return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

async function apiFetch(url, options = {}) {
    const headers = authHeaders(options.headers || {});
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401) {
        showUnlockPanel();
    }
    return response;
}

function setStatus(message, type = '') {
    const status = $('syncStatus');
    if (!status) return;
    status.textContent = message;
    status.className = `status-line ${type}`.trim();
}

function snapshotText(value) {
    return String(value || '').trim();
}

function snapshotNumber(value) {
    const parsed = parseFloat(String(value || '').replace(/[$,%\s]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
}

function snapshotEmail(value) {
    return snapshotText(value).toLowerCase();
}

function estimateApprovalSnapshot(data = {}) {
    const parsedAddress = splitAddressParts(data.customerAddress);
    const lineItemSnapshot = (items = []) => normalizeItems(items, [])
        .map((item) => ({
            label: snapshotText(item.label),
            amount: snapshotNumber(item.amount),
            taxable: Boolean(item.taxable),
            cabinetCount: snapshotText(item.cabinetCount),
            unitPrice: snapshotNumber(item.unitPrice),
            vendorListPrice: snapshotText(item.vendorListPrice),
            unitCost: snapshotText(item.unitCost),
            costMultiplier: snapshotText(item.costMultiplier),
            discountPercent: snapshotText(item.discountPercent),
            markupPercent: snapshotText(item.markupPercent),
            productCode: snapshotText(item.productCode),
            itemType: snapshotText(item.itemType),
            itemDescription: snapshotText(item.itemDescription),
            productSupplier: snapshotText(item.productSupplier)
        }));

    return JSON.stringify({
        estimateNumber: snapshotText(data.estimateNumber || data.estimateId),
        customer: snapshotText(data.customer),
        customerStreet: snapshotText(data.customerStreet || parsedAddress.street),
        customerCity: snapshotText(data.customerCity || parsedAddress.city),
        customerState: snapshotText(data.customerState || parsedAddress.state).toUpperCase(),
        customerZip: snapshotText(data.customerZip || parsedAddress.zip),
        customerPhone: snapshotText(data.customerPhone),
        customerEmail: snapshotEmail(data.customerEmail),
        estimateDate: snapshotText(data.estimateDate),
        supplier: snapshotText(data.supplier),
        styleDescription: snapshotText(data.styleDescription),
        installer: snapshotText(data.installer),
        notes: snapshotText(data.notes),
        salesTaxRate: snapshotNumber(data.salesTaxRate || 6.5) >= 0 ? snapshotNumber(data.salesTaxRate || 6.5) : 6.5,
        cabinetItems: lineItemSnapshot(data.cabinetItems),
        installationItems: lineItemSnapshot(data.installationItems)
    });
}

function estimateChangedAfterAcceptance(estimate = currentEstimateRecord()) {
    if (!isAcceptedEstimate(estimate)) return false;
    const acceptedSnapshot = snapshotText(estimate?.acceptedEstimateSnapshot);
    if (!acceptedSnapshot) return false;
    return estimateApprovalSnapshot(estimate) !== acceptedSnapshot;
}

function estimateResponseStatus(estimate = {}) {
    const status = String(estimate.estimateStatus || '').trim().toLowerCase();
    if (status === 'accepted') {
        if (estimateChangedAfterAcceptance(estimate)) {
            return {
                key: 'changed',
                label: 'Changed',
                detail: 'Changed after customer acceptance. Customer approval is needed before contract unless store bypasses.'
            };
        }
        return {
            key: 'accepted',
            label: 'Accepted',
            detail: estimate.acceptedAt
                ? `Accepted ${displayDate(estimate.acceptedAt)}${estimate.acceptedByName ? ` by ${estimate.acceptedByName}` : ''}`
                : 'Accepted by customer'
        };
    }
    if (status === 'declined') {
        return {
            key: 'declined',
            label: 'Declined',
            detail: estimate.declinedAt
                ? `Declined ${displayDate(estimate.declinedAt)}${estimate.declinedByName ? ` by ${estimate.declinedByName}` : ''}`
                : 'Declined by customer'
        };
    }
    if (status === 'sent' || estimate.responseTokenLastSentAt || estimate.responseToken) {
        return {
            key: 'sent',
            label: 'Sent',
            detail: estimate.responseTokenLastSentAt
                ? `Sent ${displayDate(estimate.responseTokenLastSentAt)}${estimate.responseTokenSentTo ? ` to ${estimate.responseTokenSentTo}` : ''}`
                : 'Sent, waiting for response'
        };
    }
    return {
        key: 'draft',
        label: 'Draft',
        detail: 'Not sent to customer yet'
    };
}

function estimateStatusBadgeHtml(estimate = {}) {
    const status = estimateResponseStatus(estimate);
    return `<span class="estimate-status-badge status-${escapeHtml(status.key)}">${escapeHtml(status.label)}</span>`;
}

function currentEstimateRecord() {
    return state.savedEstimates.find((estimate) => estimate.estimateId === state.currentEstimateId && !estimate.deleted) || null;
}

function isAcceptedEstimate(estimate = currentEstimateRecord()) {
    return String(estimate?.estimateStatus || '').trim().toLowerCase() === 'accepted';
}

function contractStartHref(filename = lastGeneratedEstimateFilename, options = {}) {
    const url = new URL('/contract/new', window.location.origin);
    const customerAddress = customerAddressFromParts(currentCustomerAddressParts()).trim();
    url.searchParams.set('restoreDraft', '1');
    url.searchParams.set('section', 'customer');
    url.searchParams.set('estimateAccepted', '1');
    url.searchParams.set('estimateStatus', 'accepted');
    if (options.changedAfterAcceptance) url.searchParams.set('estimateChangedAfterAcceptance', '1');
    if (options.approvalBypassed) {
        url.searchParams.set('estimateApprovalBypassed', '1');
        url.searchParams.set('estimateApprovalBypassedAt', options.approvalBypassedAt || new Date().toISOString());
    }
    if (filename) url.searchParams.set('estimateFile', filename);
    if (customerAddress) url.searchParams.set('estimateAddress', customerAddress);
    if ($('customer')?.value) url.searchParams.set('customer', $('customer').value);
    if ($('customerPhone')?.value) url.searchParams.set('phone', $('customerPhone').value);
    if ($('customerEmail')?.value) url.searchParams.set('email', $('customerEmail').value);
    if ($('estimateNumber')?.value) url.searchParams.set('estimateNumber', $('estimateNumber').value);
    const total = calculateTotals().grandTotal;
    if (Number.isFinite(total) && total > 0) url.searchParams.set('estimateTotal', total.toFixed(2));
    if (state.currentEstimateId) url.searchParams.set('estimateId', state.currentEstimateId);
    return `${url.pathname}?${url.searchParams.toString()}`;
}

function refreshContractStartAction() {
    const button = $('toContractsBtn');
    if (!button || openedFromContract()) return;
    const accepted = isAcceptedEstimate();
    button.classList.remove('hidden');
    button.textContent = accepted ? 'Start Contract' : 'Contracts Page';
    button.href = accepted ? contractStartHref() : '/portal';
    button.dataset.startAcceptedEstimate = accepted ? '1' : '0';
    button.title = accepted
        ? 'Start a contract using this accepted estimate.'
        : 'Contracts can still be created separately. This estimate must be accepted before starting a contract from it.';
    syncEstimateActionProxies();
}

function syncEstimateActionProxies() {
    document.querySelectorAll('[data-action-proxy]').forEach((proxy) => {
        const target = $(proxy.dataset.actionProxy);
        if (!target) return;
        proxy.textContent = target.textContent;
        proxy.className = target.className;
        proxy.classList.remove('estimate-actions-top');
        proxy.classList.toggle('hidden', target.classList.contains('hidden'));
        proxy.disabled = Boolean(target.disabled);
    });

    document.querySelectorAll('[data-action-proxy-link]').forEach((proxy) => {
        const target = $(proxy.dataset.actionProxyLink);
        if (!target) return;
        proxy.textContent = target.textContent;
        proxy.className = target.className;
        proxy.classList.remove('estimate-actions-top');
        proxy.classList.toggle('hidden', target.classList.contains('hidden'));
        proxy.href = target.href;
    });
}

function bindEstimateActionProxies() {
    document.querySelectorAll('[data-action-proxy]').forEach((proxy) => {
        proxy.addEventListener('click', () => {
            const target = $(proxy.dataset.actionProxy);
            if (target && !target.classList.contains('hidden')) target.click();
        });
    });

    document.querySelectorAll('[data-action-proxy-link]').forEach((proxy) => {
        proxy.addEventListener('click', (event) => {
            const target = $(proxy.dataset.actionProxyLink);
            if (!target || target.classList.contains('hidden')) return;
            event.preventDefault();
            target.click();
        });
    });
}

function setCreatedEstimateFile(filename = '') {
    const element = $('createdEstimateFile');
    if (!element) return;
    if (!filename) {
        element.classList.add('hidden');
        element.textContent = '';
        return;
    }
    element.textContent = `Created PDF: ${filename}`;
    element.classList.remove('hidden');
}

async function recordGeneratedPdf(result = {}) {
    if (!result.filename || !state.currentEstimateId) return;
    const index = state.savedEstimates.findIndex((item) => item.estimateId === state.currentEstimateId);
    if (index < 0) return;
    state.savedEstimates[index] = {
        ...state.savedEstimates[index],
        pdfFilename: result.filename,
        pdfSha256: result.sha256 || '',
        generatedPdfFilename: result.filename,
        generatedPdfSha256: result.sha256 || '',
        updatedAt: new Date().toISOString()
    };
    persistLocalStore();
    if (navigator.onLine) {
        await syncWithServer({ silent: true, forcePush: true });
    }
}

function mergeServerEstimateRecord(estimate = {}) {
    if (!estimate.estimateId) return false;
    const index = state.savedEstimates.findIndex((item) => item.estimateId === estimate.estimateId);
    const merged = {
        ...(index >= 0 ? state.savedEstimates[index] : {}),
        ...estimate
    };

    if (index >= 0) {
        state.savedEstimates[index] = merged;
    } else {
        state.savedEstimates.push(merged);
    }

    if (state.currentEstimateId === estimate.estimateId || !state.currentEstimateId) {
        state.currentEstimateId = estimate.estimateId;
        if (estimate.estimateNumber) setValue('estimateNumber', estimate.estimateNumber);
    }

    persistLocalStore();
    rebuildEntities();
    renderSavedList();
    refreshContractStartAction();
    return true;
}

function loadLocalStore() {
    try {
        const stored = JSON.parse(localStorage.getItem(ESTIMATE_STORE_KEY) || '[]');
        state.savedEstimates = Array.isArray(stored) ? stored : [];
    } catch {
        state.savedEstimates = [];
    }
    rebuildEntities();
}

function persistLocalStore() {
    localStorage.setItem(ESTIMATE_STORE_KEY, JSON.stringify(state.savedEstimates));
}

function clearLocalEstimateSyncData(serverResetId) {
    state.currentEstimateId = '';
    state.savedEstimates = [];
    state.remoteEntities = [];
    state.remoteCustomers = [];
    state.customerRecords = [];
    state.visibleCustomerSuggestions = [];
    state.managerSelected.clear();
    localStorage.removeItem(ESTIMATE_STORE_KEY);
    localStorage.removeItem(SYNC_LAST_KEY);
    localStorage.removeItem(SYNC_CONFLICTS_KEY);
    if (serverResetId) localStorage.setItem(DATA_RESET_KEY, serverResetId);
    rebuildEntities();
    renderSavedList();
}

function applyServerResetId(serverResetId) {
    const resetId = String(serverResetId || '').trim();
    if (!resetId) return false;

    const localResetId = localStorage.getItem(DATA_RESET_KEY) || '';
    if (!localResetId && resetId === 'initial') {
        localStorage.setItem(DATA_RESET_KEY, resetId);
        return false;
    }

    if (localResetId === resetId) return false;
    clearLocalEstimateSyncData(resetId);
    return true;
}

function rebuildEntities() {
    state.entities.customer = new Set();
    state.entities.supplier = new Set();
    state.entities.installer = new Set();
    state.entities.product = new Set();
    const customers = new Map();
    const products = new Map();
    const installationItems = new Map();

    state.savedEstimates.forEach((estimate) => {
        if (estimate.deleted) return;
        mergeCustomerRecord(customers, customerRecordFromEstimate(estimate));
        addEntity('supplier', estimate.supplier);
        addEntity('installer', estimate.installer);
        normalizeItems(estimate.cabinetItems, [])
            .filter((item) => item.saveForLookup === true)
            .forEach((item) => mergeLineRecord(products, productRecordFromLineItem(item, estimate, 'cabinet')));
        normalizeItems(estimate.installationItems, [])
            .filter((item) => item.saveForLookup === true)
            .forEach((item) => mergeLineRecord(installationItems, productRecordFromLineItem(item, estimate, 'installation')));
    });

    state.remoteEntities.forEach((entity) => {
        addEntity(entity.type, entity.name);
        if (entity.type === 'product') mergeLineRecord(products, productRecordFromEntity(entity));
    });
    state.remoteCustomers.forEach((customer) => mergeCustomerRecord(customers, customer));
    state.customerRecords = Array.from(customers.values())
        .sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')) || a.name.localeCompare(b.name));
    state.customerRecords.forEach((customer) => addEntity('customer', customer.name));
    state.productRecords = Array.from(products.values())
        .sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')) || a.label.localeCompare(b.label));
    state.installationItemRecords = Array.from(installationItems.values())
        .sort((a, b) => String(b.lastUsedAt || '').localeCompare(String(a.lastUsedAt || '')) || a.label.localeCompare(b.label));

    renderDatalists();
    renderCustomerSuggestions();
}

function addEntity(type, value) {
    const name = String(value || '').trim();
    if (!name || !state.entities[type]) return;
    state.entities[type].add(name);
}

function customerRecordFromEstimate(estimate = {}) {
    return normalizeCustomerRecord({
        name: estimate.customer,
        address: customerAddressFromParts(customerAddressPartsFromEstimate(estimate)),
        phone: estimate.customerPhone,
        email: estimate.customerEmail,
        lastUsedAt: estimate.updatedAt || estimate.createdAt || ''
    });
}

function normalizeCustomerRecord(record = {}) {
    const name = String(record.name || record.customer || '').trim();
    if (!name) return null;
    return {
        key: normalizeLookupKey(name),
        name,
        address: String(record.address || record.customerAddress || '').trim(),
        phone: String(record.phone || record.customerPhone || '').trim(),
        email: String(record.email || record.customerEmail || '').trim(),
        lastUsedAt: String(record.lastUsedAt || record.last_used_at || record.updatedAt || '')
    };
}

function mergeCustomerRecord(map, rawRecord) {
    const record = normalizeCustomerRecord(rawRecord);
    if (!record) return;
    const existing = map.get(record.key);
    if (!existing) {
        map.set(record.key, record);
        return;
    }

    const recordIsNewer = String(record.lastUsedAt || '') >= String(existing.lastUsedAt || '');
    existing.name = recordIsNewer && record.name ? record.name : existing.name;
    existing.address = (recordIsNewer && record.address) || existing.address || record.address;
    existing.phone = (recordIsNewer && record.phone) || existing.phone || record.phone;
    existing.email = (recordIsNewer && record.email) || existing.email || record.email;
    existing.lastUsedAt = [existing.lastUsedAt, record.lastUsedAt].filter(Boolean).sort().pop() || '';
}

function renderDatalists() {
    renderDatalist('customerList', state.entities.customer);
    renderDatalist('supplierList', state.entities.supplier);
    renderDatalist('installerList', state.entities.installer);
    renderDatalist('productList', new Set(state.productRecords.map((product) => product.label)));
}

function renderDatalist(id, values) {
    const list = $(id);
    if (!list) return;
    list.innerHTML = Array.from(values)
        .sort((a, b) => a.localeCompare(b))
        .map((value) => `<option value="${escapeHtml(value)}"></option>`)
        .join('');
}

async function saveInstallerNameToDirectory(name) {
    const installerName = String(name || '').trim();
    const installerKey = normalizeLookupKey(installerName);
    if (!installerKey || installerQuickAddKeys.has(installerKey)) return;
    installerQuickAddKeys.add(installerKey);

    try {
        const response = await apiFetch('/api/installers/quick-add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: installerName,
                storeDepartment: 'both'
            })
        });
        if (!response.ok) return;
        const data = await safeJson(response);
        if (data.installer?.name) {
            addEntity('installer', data.installer.name);
            renderDatalist('installerList', state.entities.installer);
        }
    } catch (_error) {
        // The estimate record still saves even if the shared installer list cannot be updated.
    }
}

function renderCustomerSuggestions() {
    const container = $('customerSuggestions');
    const input = $('customer');
    if (!container || !input) return;

    function hideSuggestions() {
        state.visibleCustomerSuggestions = [];
        container.hidden = true;
        container.innerHTML = '';
    }

    const query = normalizeLookupKey(input.value);
    if (!query || document.activeElement !== input) {
        hideSuggestions();
        return;
    }

    const matches = state.customerRecords
        .filter((customer) => customerSearchText(customer).includes(query))
        .slice(0, CUSTOMER_SUGGESTION_LIMIT);

    if (matches.some((customer) => normalizeLookupKey(customer.name) === query)) {
        hideSuggestions();
        return;
    }

    state.visibleCustomerSuggestions = matches;
    container.hidden = matches.length === 0;
    container.innerHTML = matches.map((customer, index) => {
        const detail = [
            customer.address,
            formatPhoneNumber(customer.phone),
            customer.email
        ].filter(Boolean).join(' | ');
        return `
            <button type="button" class="customer-suggestion" data-index="${index}">
                <strong>${escapeHtml(customer.name)}</strong>
                ${detail ? `<span>${escapeHtml(detail)}</span>` : '<span>Saved customer</span>'}
            </button>
        `;
    }).join('');
}

function customerSearchText(customer) {
    return [
        customer.name,
        customer.address,
        customer.phone,
        customer.email
    ].filter(Boolean).join(' ').toLowerCase();
}

function applyCustomerSuggestion(index) {
    const customer = state.visibleCustomerSuggestions[index];
    if (!customer) return;
    setValue('customer', customer.name);
    setCustomerAddressFields(customer.address);
    setValue('customerPhone', formatPhoneNumber(customer.phone));
    setValue('customerEmail', customer.email);
    state.visibleCustomerSuggestions = [];
    const container = $('customerSuggestions');
    if (container) {
        container.hidden = true;
        container.innerHTML = '';
    }
    handleDraftChanged();
}

function lineRecordKey(label, supplier = '', productCode = '') {
    const code = normalizeLookupKey(productCode);
    if (code) return `code:${code}`;
    return `label:${normalizeLookupKey(supplier)}:${normalizeLookupKey(label)}`;
}

function productRecordFromEntity(entity = {}) {
    const label = String(entity.itemName || entity.name || '').trim();
    if (!label) return null;
    return {
        key: lineRecordKey(label, entity.supplier, entity.productCode),
        label,
        productCode: String(entity.productCode || '').trim(),
        itemType: String(entity.itemType || entity.category || '').trim(),
        itemDescription: String(entity.itemDescription || '').trim(),
        supplier: String(entity.supplier || '').trim(),
        price: entity.price || '',
        vendorListPrice: entity.vendorListPrice || '',
        unitCost: entity.unitCost || '',
        costMultiplier: entity.costMultiplier || '',
        discountPercent: entity.discountPercent || '',
        markupPercent: entity.markupPercent || '',
        taxable: entity.taxable !== false,
        lastUsedAt: String(entity.lastUsedAt || '').trim(),
        source: 'product'
    };
}

function productRecordFromLineItem(item = {}, estimate = {}, type = 'cabinet') {
    const label = cleanItemLabel(item.label);
    if (!label) return null;
    return {
        key: lineRecordKey(label, item.productSupplier || estimate.supplier, item.productCode),
        label,
        productCode: String(item.productCode || '').trim(),
        itemType: String(item.itemType || estimate.styleDescription || (type === 'installation' ? 'Installation' : 'Cabinets / Countertops')).trim(),
        itemDescription: String(item.itemDescription || '').trim(),
        supplier: String(item.productSupplier || estimate.supplier || '').trim(),
        price: item.amount || '',
        vendorListPrice: item.vendorListPrice || '',
        unitCost: item.unitCost || '',
        costMultiplier: item.costMultiplier || '',
        discountPercent: item.discountPercent || '',
        markupPercent: item.markupPercent || '',
        taxable: item.taxable !== false,
        lastUsedAt: String(estimate.updatedAt || estimate.createdAt || '').trim(),
        source: type === 'installation' ? 'installation-history' : 'estimate-history'
    };
}

function mergeLineRecord(map, rawRecord) {
    if (!rawRecord || !rawRecord.label) return;
    const key = rawRecord.key || lineRecordKey(rawRecord.label, rawRecord.supplier, rawRecord.productCode);
    const existing = map.get(key);
    if (!existing) {
        map.set(key, { ...rawRecord, key });
        return;
    }
    const recordIsNewer = String(rawRecord.lastUsedAt || '') >= String(existing.lastUsedAt || '');
    if (recordIsNewer) {
        map.set(key, { ...existing, ...rawRecord, key });
    }
}

function lineRecordSearchText(record = {}) {
    return [
        record.label,
        record.productCode,
        record.itemType,
        record.itemDescription,
        record.supplier
    ].filter(Boolean).join(' ').toLowerCase();
}

function lineRecordDetail(record = {}) {
    return [
        record.productCode ? `Code ${record.productCode}` : '',
        record.supplier,
        record.itemType,
        record.itemDescription
    ].filter(Boolean).join(' | ');
}

function matchingLineSuggestions(query, type) {
    const normalizedQuery = normalizeLookupKey(query);
    if (!normalizedQuery) return [];
    const source = type === 'installation' ? state.installationItemRecords : state.productRecords;
    return source
        .filter((record) => lineRecordSearchText(record).includes(normalizedQuery))
        .slice(0, LINE_SUGGESTION_LIMIT);
}

function isDefaultLineLabel(type, label) {
    const defaults = type === 'cabinet' ? DEFAULT_CABINET_ITEMS : DEFAULT_INSTALLATION_ITEMS;
    const normalized = normalizeLookupKey(label);
    return defaults.some((item) => normalizeLookupKey(item.label) === normalized);
}

function lineAlreadyInLookup(type, item = {}) {
    if (item.productCode || item.lookupSource === 'product') return true;
    const source = type === 'installation' ? state.installationItemRecords : state.productRecords;
    const labelKey = normalizeLookupKey(item.label);
    const supplierKey = normalizeLookupKey(item.productSupplier || $('supplier')?.value || '');
    return source.some((record) => {
        if (normalizeLookupKey(record.label) !== labelKey) return false;
        if (!supplierKey) return true;
        return !record.supplier || normalizeLookupKey(record.supplier) === supplierKey;
    });
}

function unapprovedLookupCandidates() {
    const candidates = [];
    [
        { type: 'cabinet', items: state.cabinetItems },
        { type: 'installation', items: state.installationItems }
    ].forEach(({ type, items }) => {
        items.forEach((item) => {
            const label = cleanItemLabel(item.label);
            if (!label || item.saveForLookup === true || item.saveForLookup === false) return;
            if (isDefaultLineLabel(type, label)) return;
            if (lineAlreadyInLookup(type, item)) return;
            candidates.push({ type, item, label });
        });
    });
    return candidates;
}

function resolveNewLookupItems() {
    const candidates = unapprovedLookupCandidates();
    if (!candidates.length) return;
    const names = [...new Set(candidates.map((candidate) => candidate.label))].slice(0, 10);
    const extraCount = candidates.length - names.length;
    const saveForFuture = window.confirm([
        'Save these new line item names for future estimate lookup?',
        '',
        ...names.map((name) => `- ${name}`),
        extraCount > 0 ? `- plus ${extraCount} more` : '',
        '',
        'OK saves them as reusable suggestions.',
        'Cancel keeps them only in this estimate/customer file.'
    ].filter(Boolean).join('\n'));
    candidates.forEach(({ item }) => {
        item.saveForLookup = saveForFuture;
        item.lookupSource = saveForFuture ? 'staff-approved' : 'one-time';
    });
}

function hideLineSuggestions(container = document) {
    container.querySelectorAll('.line-suggestions').forEach((suggestions) => {
        suggestions.hidden = true;
        suggestions.innerHTML = '';
    });
}

function renderLineSuggestions(row) {
    if (!row) return;
    const input = row.querySelector('.line-label');
    const container = row.querySelector('.line-suggestions');
    if (!input || !container || document.activeElement !== input) return;
    const query = input.value.trim();
    const matches = matchingLineSuggestions(query, row.dataset.type);
    const exactMatch = matches.some((record) => normalizeLookupKey(record.label) === normalizeLookupKey(query));
    const newItemButton = query && !exactMatch
        ? `<button type="button" class="line-suggestion is-new" data-new-line="1">Use "${escapeHtml(query)}" as a new item</button>`
        : '';

    if (!matches.length && !newItemButton) {
        container.hidden = true;
        container.innerHTML = '';
        return;
    }

    container.innerHTML = [
        ...matches.map((record, index) => `
            <button type="button" class="line-suggestion" data-suggestion-index="${index}">
                <strong>${escapeHtml(record.label)}</strong>
                ${lineRecordDetail(record) ? `<span>${escapeHtml(lineRecordDetail(record))}</span>` : ''}
            </button>
        `),
        newItemButton
    ].join('');
    container.hidden = false;
    row._lineSuggestions = matches;
}

function applyLineSuggestion(row, suggestionIndex) {
    if (!row) return;
    const type = row.dataset.type;
    const index = Number(row.dataset.index);
    const target = type === 'cabinet' ? state.cabinetItems : state.installationItems;
    const item = target[index];
    const record = row._lineSuggestions?.[suggestionIndex];
    if (!item || !record) return;
    item.label = cleanItemLabel(record.label);
    item.productCode = record.productCode || '';
    item.itemType = record.itemType || '';
    item.itemDescription = record.itemDescription || '';
    item.productSupplier = record.supplier || '';
    item.vendorListPrice = record.vendorListPrice || item.vendorListPrice || '';
    item.unitCost = record.unitCost || item.unitCost || '';
    item.costMultiplier = record.costMultiplier || item.costMultiplier || '';
    item.discountPercent = record.discountPercent || item.discountPercent || '';
    item.markupPercent = record.markupPercent || item.markupPercent || '';
    item.lookupSource = record.source || '';
    item.saveForLookup = record.source !== 'product';
    if (type === 'cabinet') item.taxable = record.taxable !== false;
    if (type === 'cabinet' && record.supplier && !$('supplier')?.value) setValue('supplier', record.supplier);
    renderLineItems(type);
    handleDraftChanged();
}

function lineItemsSearchText(items) {
    return normalizeItems(items, [])
        .map((item) => `${item.label} ${item.amount} ${item.cabinetCount || ''}`)
        .join(' ');
}

function searchableText(estimate) {
    return [
        estimate.estimateId,
        estimate.estimateNumber,
        estimate.pdfFilename,
        estimate.generatedPdfFilename,
        estimate.customer,
        estimate.customerAddress,
        estimate.customerStreet,
        estimate.customerCity,
        estimate.customerState,
        estimate.customerZip,
        estimate.customerPhone,
        estimate.customerEmail,
        estimate.supplier,
        estimate.installer,
        estimate.estimateDate,
        estimate.businessName,
        estimate.address,
        estimate.city,
        estimate.state,
        estimate.zip,
        estimate.phone,
        estimate.email,
        estimate.website,
        estimate.notes,
        estimate.styleDescription,
        lineItemsSearchText(estimate.cabinetItems),
        lineItemsSearchText(estimate.installationItems)
    ].filter(Boolean).join(' ').toLowerCase();
}

function normalizeEstimateReference(value) {
    return String(value || '')
        .trim()
        .toLowerCase()
        .replace(/\\/g, '/')
        .split('/')
        .pop()
        .replace(/\.pdf$/i, '');
}

function directEstimateReference() {
    const params = urlParams();
    return params.get('estimateId')
        || params.get('estimateNumber')
        || params.get('estimateFile')
        || params.get('pdfFilename')
        || params.get('fileName')
        || '';
}

function estimateReferenceValues(estimate = {}) {
    return [
        estimate.estimateId,
        estimate.estimateNumber,
        estimate.pdfFilename,
        estimate.generatedPdfFilename
    ].map(normalizeEstimateReference).filter(Boolean);
}

function findEstimateByReference(reference) {
    const target = normalizeEstimateReference(reference);
    if (!target) return null;
    return state.savedEstimates.find((estimate) => {
        if (!estimate || estimate.deleted) return false;
        return estimateReferenceValues(estimate).includes(target);
    }) || null;
}

function loadInitialEstimateFromParams({ quiet = false } = {}) {
    const reference = directEstimateReference();
    if (!reference) return false;

    const estimate = findEstimateByReference(reference);
    if (!estimate) {
        if (!quiet) setStatus('Selected estimate is not available yet.', 'error');
        return false;
    }

    if (state.currentEstimateId !== estimate.estimateId) {
        setValue('estimateSearch', '');
        loadEstimate(estimate.estimateId);
    }
    return true;
}

function renderSavedList() {
    const list = $('savedEstimateList');
    if (!list) return;

    const query = String($('estimateSearch')?.value || '').trim().toLowerCase();
    const estimates = state.savedEstimates
        .filter((estimate) => !estimate.deleted)
        .filter((estimate) => !query || searchableText(estimate).includes(query))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    if (estimates.length === 0) {
        list.innerHTML = `<option value="">${query ? 'No matching estimates' : 'No saved estimates'}</option>`;
        return;
    }

    list.innerHTML = estimates.map((estimate) => {
        const customer = estimate.customer || 'No customer';
        const date = displayDate(estimate.estimateDate) || 'No date';
        const status = estimateResponseStatus(estimate).label;
        return `<option value="${escapeHtml(estimate.estimateId)}">${escapeHtml(customer)} - ${escapeHtml(date)} - ${escapeHtml(status)}</option>`;
    }).join('');

    if (state.currentEstimateId && estimates.some((estimate) => estimate.estimateId === state.currentEstimateId)) {
        list.value = state.currentEstimateId;
    }
    refreshContractStartAction();
}

function calculateTotals() {
    const cabinetSubtotal = state.cabinetItems.reduce((total, item) => total + parseValue(item.amount), 0);
    const taxableSubtotal = state.cabinetItems
        .filter((item) => item.taxable)
        .reduce((total, item) => total + parseValue(item.amount), 0);
    const salesTax = taxableSubtotal * (parseSalesTaxRate() / 100);
    const cabinetTotal = cabinetSubtotal + salesTax;
    const installationTotal = state.installationItems.reduce((total, item) => total + parseValue(item.amount), 0);
    return {
        cabinetSubtotal,
        taxableSubtotal,
        salesTax,
        cabinetTotal,
        installationTotal,
        grandTotal: cabinetTotal + installationTotal
    };
}

function updateTotals() {
    const totals = calculateTotals();
    setValue('cabinetSubtotal', formatAccounting(totals.cabinetSubtotal));
    setValue('taxAmount', formatAccounting(totals.salesTax));
    setValue('cabinetTotal', formatAccounting(totals.cabinetTotal));
    setValue('installationTotal', formatAccounting(totals.installationTotal));
    return totals;
}

function renderLineItems(type) {
    const isCabinet = type === 'cabinet';
    const container = $(isCabinet ? 'cabinetItems' : 'installationItems');
    const items = isCabinet ? state.cabinetItems : state.installationItems;
    if (!container) return;

    container.innerHTML = items.map((item, index) => `
        <div class="line-item-row ${isCabinet ? 'cabinet-line-item' : 'installation-line-item'}" data-type="${type}" data-index="${index}">
            <div class="line-label-wrap">
                <input class="line-label" type="text" value="${escapeHtml(cleanItemLabel(item.label))}" aria-label="Item name" placeholder="Item name"${isCabinet ? ' list="productList"' : ''}>
                <div class="line-suggestions" hidden></div>
            </div>
            ${isCabinet ? '' : `
                <input class="line-cabinet-count" type="number" min="0" step="1" value="${escapeHtml(item.cabinetCount || '')}" aria-label="Cabinet count for ${escapeHtml(item.label || 'item')}" placeholder="# Cabinets">
                <div class="line-amount-wrap">
                    <span class="currency">$</span>
                    <input class="line-unit-price" type="text" inputmode="decimal" value="${formatAccounting(item.unitPrice)}" aria-label="Unit price" placeholder="Unit price">
                </div>
            `}
            <div class="line-amount-wrap">
                <span class="currency">$</span>
                <input class="line-amount" type="text" inputmode="decimal" value="${formatAccounting(item.amount)}" aria-label="Amount">
            </div>
            ${isCabinet ? `
                <label class="line-taxable">
                    <input class="line-taxable-input" type="checkbox" ${item.taxable ? 'checked' : ''}>
                    <span>${item.taxable ? 'T' : 'N'}</span>
                </label>
            ` : ''}
            <button type="button" class="line-remove" aria-label="Remove item">Remove</button>
        </div>
    `).join('');
    if (isCabinet) syncTaxableAllCheckbox();
}

function syncTaxableAllCheckbox() {
    const checkbox = $('taxableAll');
    if (!checkbox) return;
    checkbox.checked = state.cabinetItems.length > 0 && state.cabinetItems.every((item) => item.taxable);
}

function setAllCabinetItemsTaxable(taxable) {
    state.cabinetItems = state.cabinetItems.map((item) => ({ ...item, taxable }));
    renderLineItems('cabinet');
    syncTaxableAllCheckbox();
    handleDraftChanged();
}

function addLineItem(type, item = { label: '', amount: 0, taxable: false, cabinetCount: '', unitPrice: 0 }) {
    const target = type === 'cabinet' ? state.cabinetItems : state.installationItems;
    const defaultTaxable = type === 'cabinet' && $('taxableAll') ? $('taxableAll').checked : false;
    target.push({
        label: cleanItemLabel(item.label),
        amount: parseValue(item.amount),
        taxable: Object.prototype.hasOwnProperty.call(item, 'taxable') ? Boolean(item.taxable) : defaultTaxable,
        cabinetCount: item.cabinetCount || '',
        unitPrice: parseValue(item.unitPrice),
        vendorListPrice: item.vendorListPrice || item.listPrice || '',
        unitCost: item.unitCost || '',
        costMultiplier: item.costMultiplier || '',
        discountPercent: item.discountPercent || '',
        markupPercent: item.markupPercent || '',
        productCode: item.productCode || '',
        itemType: item.itemType || item.category || '',
        itemDescription: item.itemDescription || item.description || '',
        productSupplier: item.productSupplier || item.supplier || '',
        lookupSource: item.lookupSource || '',
        saveForLookup: lookupSaveChoice(item),
        sourceDocumentId: item.sourceDocumentId || '',
        sourceQuoteNumber: item.sourceQuoteNumber || ''
    });
    renderLineItems(type);
    if (type === 'cabinet') syncTaxableAllCheckbox();
    handleDraftChanged();
}

function removeLineItem(type, index) {
    const target = type === 'cabinet' ? state.cabinetItems : state.installationItems;
    target.splice(index, 1);
    if (target.length === 0) {
        target.push({
            label: '',
            amount: 0,
            taxable: type === 'cabinet' && $('taxableAll') ? $('taxableAll').checked : false,
            cabinetCount: '',
            unitPrice: 0,
            vendorListPrice: '',
            unitCost: '',
            costMultiplier: '',
            discountPercent: '',
            markupPercent: '',
            productCode: '',
            itemType: '',
            itemDescription: '',
            productSupplier: '',
            lookupSource: '',
            saveForLookup: undefined,
            sourceDocumentId: '',
            sourceQuoteNumber: ''
        });
    }
    renderLineItems(type);
    if (type === 'cabinet') syncTaxableAllCheckbox();
    handleDraftChanged();
}

function handleLineItemInput(event) {
    const row = event.target.closest('.line-item-row');
    if (!row) return;
    const type = row.dataset.type;
    const index = Number(row.dataset.index);
    const target = type === 'cabinet' ? state.cabinetItems : state.installationItems;
    if (!target[index]) return;

    if (event.target.classList.contains('line-label')) {
        target[index].label = cleanItemLabel(event.target.value);
        renderLineSuggestions(row);
    }
    if (event.target.classList.contains('line-amount')) {
        target[index].amount = parseValue(event.target.value);
    }
    if (event.target.classList.contains('line-cabinet-count')) {
        target[index].cabinetCount = event.target.value;
        updateCalculatedLineAmount(target[index]);
        const amountInput = row.querySelector('.line-amount');
        if (amountInput) amountInput.value = formatAccounting(target[index].amount);
    }
    if (event.target.classList.contains('line-unit-price')) {
        target[index].unitPrice = parseValue(event.target.value);
        updateCalculatedLineAmount(target[index]);
        const amountInput = row.querySelector('.line-amount');
        if (amountInput) amountInput.value = formatAccounting(target[index].amount);
    }
    if (event.target.classList.contains('line-taxable-input')) {
        target[index].taxable = event.target.checked;
        const marker = event.target.closest('.line-taxable')?.querySelector('span');
        if (marker) marker.textContent = event.target.checked ? 'T' : 'N';
        syncTaxableAllCheckbox();
    }
    handleDraftChanged();
}

function handleLineItemClick(event) {
    const suggestion = event.target.closest('.line-suggestion');
    if (suggestion) {
        const row = suggestion.closest('.line-item-row');
        if (suggestion.dataset.newLine === '1') {
            hideLineSuggestions(row);
            handleDraftChanged();
            return;
        }
        applyLineSuggestion(row, Number(suggestion.dataset.suggestionIndex));
        return;
    }
    if (!event.target.classList.contains('line-remove')) return;
    const row = event.target.closest('.line-item-row');
    removeLineItem(row.dataset.type, Number(row.dataset.index));
}

function handleLineItemBlur(event) {
    if (event.target.classList.contains('line-label')) {
        window.setTimeout(() => hideLineSuggestions(event.target.closest('.line-item-row')), 120);
        return;
    }
    if (!event.target.classList.contains('line-amount') && !event.target.classList.contains('line-unit-price')) return;
    event.target.value = formatAccounting(event.target.value);
}

function handleLineItemFocus(event) {
    if (!event.target.classList.contains('line-label')) return;
    renderLineSuggestions(event.target.closest('.line-item-row'));
}

function collectFormData() {
    const existing = state.savedEstimates.find((estimate) => estimate.estimateId === state.currentEstimateId);
    const totals = calculateTotals();
    const now = new Date().toISOString();
    const customerAddressParts = currentCustomerAddressParts();
    return {
        estimateId: state.currentEstimateId || $('estimateNumber')?.value || makeEstimateId(),
        createdAt: existing?.createdAt || now,
        updatedAt: existing?.updatedAt || now,
        logoPath: state.uploadedLogoPath,
        businessName: $('businessName').value,
        address: $('address').value,
        city: $('city').value,
        state: $('state').value,
        zip: $('zip').value,
        phone: $('phone').value,
        email: $('email').value,
        website: $('website').value,
        salesTaxRate: parseSalesTaxRate(),
        customer: $('customer').value,
        customerStreet: customerAddressParts.street,
        customerCity: customerAddressParts.city,
        customerState: customerAddressParts.state,
        customerZip: customerAddressParts.zip,
        customerAddress: customerAddressFromParts(customerAddressParts),
        customerPhone: $('customerPhone').value,
        customerEmail: $('customerEmail').value,
        estimateDate: $('estimateDate').value,
        estimateNumber: $('estimateNumber')?.value || state.currentEstimateId || makeEstimateNumber($('estimateDate').value),
        supplier: $('supplier').value,
        styleDescription: $('styleDescription').value,
        sourceQuoteFilename: existing?.sourceQuoteFilename || '',
        sourceQuotePath: existing?.sourceQuotePath || '',
        sourceQuoteSha256: existing?.sourceQuoteSha256 || '',
        sourceQuoteTotal: existing?.sourceQuoteTotal || '',
        customerMarkupPercent: existing?.customerMarkupPercent || existing?.markupPercent || '',
        sourceDocuments: Array.isArray(existing?.sourceDocuments) ? existing.sourceDocuments : [],
        responseToken: existing?.responseToken || '',
        responseTokenCreatedAt: existing?.responseTokenCreatedAt || '',
        responseTokenSentTo: existing?.responseTokenSentTo || '',
        responseTokenLastSentAt: existing?.responseTokenLastSentAt || '',
        estimateStatus: existing?.estimateStatus || '',
        acceptedAt: existing?.acceptedAt || '',
        acceptedByName: existing?.acceptedByName || '',
        acceptedEstimateSnapshot: existing?.acceptedEstimateSnapshot || '',
        acceptedEstimateSnapshotAt: existing?.acceptedEstimateSnapshotAt || '',
        declinedAt: existing?.declinedAt || '',
        declinedByName: existing?.declinedByName || '',
        declineNotes: existing?.declineNotes || '',
        estimateResponses: Array.isArray(existing?.estimateResponses) ? existing.estimateResponses : [],
        estimateEmailEvents: Array.isArray(existing?.estimateEmailEvents) ? existing.estimateEmailEvents : [],
        cabinetItems: cloneItems(state.cabinetItems),
        taxable: state.cabinetItems.some((item) => item.taxable),
        installer: $('installer').value,
        numCabinets: state.installationItems.map((item) => item.cabinetCount).filter(Boolean).join(', '),
        installationItems: cloneItems(state.installationItems),
        notes: $('notes').value,
        cabinetSubtotal: totals.cabinetSubtotal,
        taxAmount: totals.salesTax,
        cabinetTotal: totals.cabinetTotal,
        installationTotal: totals.installationTotal,
        grandTotal: totals.grandTotal,
        deleted: false
    };
}

function updateBusinessSummary() {
    if (!$('businessSummaryName')) return;
    const businessName = $('businessName').value || 'Edgewater Cabinet Store, LLC';
    const address = [$('address').value, cityStateZip($('city').value, $('state').value, $('zip').value)].filter(Boolean).join(', ');
    const contact = [$('phone').value, $('email').value].filter(Boolean).join(' | ');
    $('businessSummaryName').textContent = businessName;
    $('businessSummaryAddress').textContent = address || 'Business address';
    $('businessSummaryContact').textContent = contact || 'Phone and email';
    $('businessSummaryWebsite').textContent = $('website').value || '';
}

function renderPreview() {
    // Staff guidance only; official save/download/print/email output is server-generated PDF.
    const data = collectFormData();
    const totals = updateTotals();
    const businessAddress = [
        data.address,
        cityStateZip(data.city, data.state, data.zip)
    ].filter(Boolean).map(escapeHtml).join('<br>');
    const cabinetRows = state.cabinetItems
        .filter((item) => item.label || parseValue(item.amount) > 0)
        .map((item) => previewAmountRow(cleanItemLabel(item.label) || 'Item', item.amount, false, '', item.taxable ? 'T' : 'NT'))
        .join('');
    const visibleInstallationItems = state.installationItems
        .filter((item) => item.label && (
            parseValue(item.amount) > 0
            || parseValue(item.unitPrice) > 0
            || String(item.cabinetCount || '').trim()
        ));
    const installationRows = visibleInstallationItems
        .map((item) => previewAmountRow(installationItemLabel(item), item.amount))
        .join('');
    const installationSection = installationRows || data.installer ? `
        <section class="preview-section-block">
            <div class="preview-section-title">INSTALLATION</div>
            <div class="preview-meta">
                <span>${data.installer ? `Installer: ${escapeHtml(data.installer)}` : ''}</span>
            </div>
            ${installationRows ? `
                <table class="preview-table">
                    <tbody>
                        ${installationRows}
                        ${previewAmountRow('Licensed & Insured Independent Installer Subtotal', totals.installationTotal, true, 'total')}
                    </tbody>
                </table>
                <p class="preview-note">Installation work is performed by a licensed & insured independent installer unless special arrangements are made.</p>
            ` : ''}
        </section>
    ` : '';
    const customerContactLines = [
        data.customerEmail,
        formatPhoneNumber(data.customerPhone)
    ].filter(Boolean);
    const customerAddressLines = customerAddressDisplayLines(data);

    $('estimatePreview').innerHTML = `
        <header class="preview-header">
            <div class="preview-business">
                <img src="${escapeHtml(data.logoPath || `${ASSET_BASE}/defaultLogo.png`)}" alt="">
                <div>
                    <strong>${escapeHtml(data.businessName || 'Edgewater Cabinet Store, LLC')}</strong>
                    <span>${businessAddress || '&nbsp;'}</span>
                    <span>${escapeHtml(formatPhoneNumber(data.phone))}${data.email ? ` | ${escapeHtml(data.email)}` : ''}</span>
                    <span>${escapeHtml(data.website || '')}</span>
                </div>
            </div>
            <div class="preview-title">
                <h2>ESTIMATE</h2>
                <strong>${escapeHtml(data.estimateNumber || '')}</strong>
                <span>${escapeHtml(displayDate(data.estimateDate))}</span>
            </div>
        </header>

        <section class="preview-customer">
            <div class="preview-customer-main">
                <span>Customer</span>
                <strong>${escapeHtml(data.customer || 'Customer Name')}</strong>
                ${customerContactLines.length ? `
                    <div class="preview-customer-lines">
                        ${customerContactLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
                    </div>
                ` : ''}
            </div>
            ${customerAddressLines.length ? `
                <div class="preview-customer-address">
                    ${customerAddressLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
                </div>
            ` : ''}
        </section>

        <section class="preview-section-block">
            <div class="preview-section-title">CABINETS / COUNTERTOPS</div>
            <div class="preview-meta">
                <span>${data.supplier ? `Supplier: ${escapeHtml(data.supplier)}` : ''}</span>
                <span>${data.styleDescription ? `Style: ${escapeHtml(data.styleDescription)}` : ''}</span>
            </div>
            <table class="preview-table">
                <tbody>
                    ${cabinetRows || previewAmountRow('Item', 0)}
                    ${previewAmountRow('Subtotal', totals.cabinetSubtotal, true)}
                    ${previewAmountRow('Sales Tax', totals.salesTax)}
                    ${previewAmountRow('Cabinets / Countertops Total', totals.cabinetTotal, true, 'total')}
                </tbody>
            </table>
        </section>

        ${installationSection}

        <section class="preview-section-block combined-total-block">
            <table class="preview-table">
                <tbody>
                    ${previewAmountRow('ESTIMATED COMBINED TOTAL (subject to change)', totals.grandTotal, true, 'total')}
                </tbody>
            </table>
        </section>

        ${data.notes ? `<section class="preview-notes"><strong>NOTES:</strong><p>${escapeHtml(data.notes)}</p></section>` : ''}
    `;
}

function installationItemLabel(item) {
    const label = cleanItemLabel(item.label) || 'Item';
    const count = String(item.cabinetCount || '').trim();
    const unitPrice = parseValue(item.unitPrice);
    const details = [
        count ? `${count} cabinets` : '',
        unitPrice > 0 ? `@ $${formatCurrency(unitPrice)}` : ''
    ].filter(Boolean).join(' ');
    return details ? `${label} - ${details}` : label;
}

function previewAmountRow(label, amount, bold = false, className = '', taxCode = '') {
    return `
        <tr class="${bold ? 'bold-row' : ''} ${className}">
            <td>${escapeHtml(label)}</td>
            <td><span>$</span>${formatCurrency(amount)}${taxCode ? ` <span class="preview-tax-code">${escapeHtml(taxCode)}</span>` : ''}</td>
        </tr>
    `;
}

function handleDraftChanged() {
    updateBusinessSummary();
    updateTotals();
    renderPreview();
    scheduleEstimateAutosave();
}

function estimateHasAutosaveContent(data) {
    return Boolean(
        data.customer
        || data.customerAddress
        || data.customerStreet
        || data.customerCity
        || data.customerState
        || data.customerZip
        || data.customerPhone
        || data.customerEmail
        || data.supplier
        || data.styleDescription
        || data.installer
        || data.notes
        || (data.cabinetItems || []).some((item) => item.label && (parseValue(item.amount) > 0 || !DEFAULT_CABINET_ITEMS.some((base) => base.label === item.label)))
        || (data.installationItems || []).some((item) => item.label && parseValue(item.amount) > 0)
    );
}

function scheduleEstimateAutosave() {
    window.clearTimeout(estimateAutosaveTimer);
    estimateAutosaveTimer = window.setTimeout(autosaveEstimateRecord, 2200);
}

async function autosaveEstimateRecord() {
    if (estimateAutosaveInFlight) {
        scheduleEstimateAutosave();
        return;
    }
    const data = collectFormData();
    if (!estimateHasAutosaveContent(data)) return;

    const signature = JSON.stringify(data);
    if (signature === lastEstimateAutosaveSignature) return;

    estimateAutosaveInFlight = true;
    try {
        await saveCurrentEstimate({ skipConfirm: true, silent: true });
        lastEstimateAutosaveSignature = signature;
    } finally {
        estimateAutosaveInFlight = false;
    }
}

function checkMissingFields() {
    const requiredFields = [
        { id: 'businessName', label: 'Business Name' },
        { id: 'address', label: 'Address' },
        { id: 'city', label: 'City' },
        { id: 'state', label: 'State' },
        { id: 'zip', label: 'Zip' },
        { id: 'phone', label: 'Phone' },
        { id: 'email', label: 'Email' },
        { id: 'website', label: 'Website' },
        { id: 'customer', label: 'Customer' },
        { id: 'customerStreet', label: 'Customer Street Address' },
        { id: 'customerCity', label: 'Customer City' },
        { id: 'customerState', label: 'Customer State' },
        { id: 'customerZip', label: 'Customer ZIP' },
        { id: 'estimateDate', label: 'Date' },
        { id: 'supplier', label: 'Supplier' },
        { id: 'styleDescription', label: 'Style/Description' }
    ];
    return requiredFields
        .filter((field) => {
            const element = $(field.id);
            return element && !String(element.value || '').trim();
        })
        .map((field) => field.label);
    const hasCustomerPhone = phoneDigits($('customerPhone')?.value).length === 10;
    const customerEmail = String($('customerEmail')?.value || '').trim();
    if (!hasCustomerPhone && !customerEmail) missing.push('Customer phone or email');
    if (customerEmail && !isValidEmail(customerEmail)) missing.push('Valid customer email');
    return missing;
}

function confirmMissingFields() {
    const missing = checkMissingFields();
    if (missing.length === 0) return true;
    return window.confirm(`The following fields are empty:\n\n${missing.join(', ')}\n\nAre you sure you want to continue?`);
}

function requireCompleteEstimate() {
    const missing = checkMissingFields();
    if (missing.length === 0) return true;
    alert(`Complete these required estimate fields before creating an official PDF or sending email:\n\n${missing.join(', ')}`);
    return false;
}

async function saveCurrentEstimate({ skipConfirm = false, silent = false, askToSaveLookup = !silent } = {}) {
    if (!skipConfirm && !confirmMissingFields()) return null;
    if (askToSaveLookup) resolveNewLookupItems();
    const now = new Date().toISOString();
    const estimate = collectFormData();
    estimate.updatedAt = now;
    estimate.createdAt = estimate.createdAt || now;
    estimate.estimateNumber = estimate.estimateNumber || estimate.estimateId || makeEstimateNumber(estimate.estimateDate);
    state.currentEstimateId = estimate.estimateId;
    setValue('estimateNumber', estimate.estimateNumber);

    const index = state.savedEstimates.findIndex((item) => item.estimateId === estimate.estimateId);
    if (index >= 0) {
        state.savedEstimates[index] = estimate;
    } else {
        state.savedEstimates.push(estimate);
    }

    persistLocalStore();
    rebuildEntities();
    renderSavedList();
    if (!silent) setStatus(`Saved estimate for ${estimate.customer || 'customer'}.`, 'ready');

    if (navigator.onLine) {
        if (askToSaveLookup || !silent) await saveInstallerNameToDirectory(estimate.installer);
        await syncWithServer({ silent: true, forcePush: true });
    }
    return estimate;
}

function loadEstimate(id) {
    const estimate = state.savedEstimates.find((item) => item.estimateId === id && !item.deleted);
    if (!estimate) {
        setStatus('That saved estimate could not be found.', 'error');
        return;
    }

    state.currentEstimateId = estimate.estimateId;
    state.uploadedLogoPath = state.uploadedLogoPath || `${ASSET_BASE}/defaultLogo.png`;
    state.cabinetItems = normalizeItems(estimate.cabinetItems, DEFAULT_CABINET_ITEMS, estimate.taxable);
    state.installationItems = normalizeItems(estimate.installationItems, DEFAULT_INSTALLATION_ITEMS, false, estimate.numCabinets);

    setValue('customer', estimate.customer);
    setCustomerAddressFields(estimate);
    setValue('customerPhone', formatPhoneNumber(estimate.customerPhone));
    setValue('customerEmail', estimate.customerEmail);
    setValue('estimateDate', estimate.estimateDate || todayDateValue());
    setValue('estimateNumber', estimate.estimateNumber || estimate.estimateId);
    setValue('supplier', estimate.supplier);
    setValue('styleDescription', estimate.styleDescription);
    setValue('installer', estimate.installer);
    setValue('notes', estimate.notes);
    renderLineItems('cabinet');
    renderLineItems('installation');
    handleDraftChanged();
    renderSavedList();
    const status = estimateResponseStatus(estimate);
    setStatus(`Loaded estimate for ${estimate.customer || 'customer'}. ${status.detail}.`, 'ready');
    refreshContractStartAction();
}

function normalizeItems(items, fallback, taxableFallback = false, cabinetCountFallback = '') {
    const source = Array.isArray(items) && items.length > 0 ? items : fallback;
    return source.map((item) => ({
        label: cleanItemLabel(item.label),
        amount: parseValue(item.amount),
        taxable: Object.prototype.hasOwnProperty.call(item, 'taxable') ? Boolean(item.taxable) : Boolean(taxableFallback),
        cabinetCount: item.cabinetCount || cabinetCountFallback || '',
        unitPrice: parseValue(item.unitPrice),
        vendorListPrice: item.vendorListPrice || item.listPrice || '',
        unitCost: item.unitCost || '',
        costMultiplier: item.costMultiplier || '',
        discountPercent: item.discountPercent || '',
        markupPercent: item.markupPercent || '',
        productCode: item.productCode || '',
        itemType: item.itemType || item.category || '',
        itemDescription: item.itemDescription || item.description || '',
        productSupplier: item.productSupplier || item.supplier || '',
        lookupSource: item.lookupSource || '',
        saveForLookup: lookupSaveChoice(item),
        sourceDocumentId: item.sourceDocumentId || '',
        sourceQuoteNumber: item.sourceQuoteNumber || ''
    }));
}

function newEstimate() {
    state.currentEstimateId = '';
    state.cabinetItems = cloneItems(DEFAULT_CABINET_ITEMS);
    state.installationItems = cloneItems(DEFAULT_INSTALLATION_ITEMS);

    setValue('customer', '');
    setCustomerAddressFields('');
    setValue('customerPhone', '');
    setValue('customerEmail', '');
    setValue('estimateDate', todayDateValue());
    setValue('estimateNumber', makeEstimateNumber(todayDateValue()));
    setValue('supplier', '');
    setValue('styleDescription', '');
    setValue('installer', '');
    setValue('notes', '');

    renderLineItems('cabinet');
    renderLineItems('installation');
    handleDraftChanged();
    renderSavedList();
    setStatus('New blank estimate.', 'ready');
    setCreatedEstimateFile('');
    refreshContractStartAction();
}

async function deleteSelectedEstimate() {
    const id = $('savedEstimateList').value || state.currentEstimateId;
    if (!id) {
        setStatus('Select an estimate to delete.', 'error');
        return;
    }
    const estimate = state.savedEstimates.find((item) => item.estimateId === id);
    if (!estimate) return;
    await deleteEstimatesByIds([id], `Delete estimate for ${estimate.customer || 'customer'}?`);
}

async function deleteEstimatesByIds(ids, confirmMessage) {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    if (uniqueIds.length === 0) return;
    if (confirmMessage && !window.confirm(confirmMessage)) return;

    const now = new Date().toISOString();
    let deletedCount = 0;
    uniqueIds.forEach((id) => {
        const estimate = state.savedEstimates.find((item) => item.estimateId === id);
        if (!estimate || estimate.deleted) return;
        estimate.deleted = true;
        estimate.updatedAt = now;
        deletedCount++;
    });

    if (deletedCount === 0) return;
    persistLocalStore();
    rebuildEntities();
    renderSavedList();
    if (uniqueIds.includes(state.currentEstimateId)) newEstimate();
    if (navigator.onLine) await syncWithServer({ silent: true, forcePush: true });
    setStatus(`${deletedCount} estimate${deletedCount === 1 ? '' : 's'} deleted locally.`, 'ready');
}

function getActiveEstimates(query = '') {
    const normalizedQuery = String(query || '').trim().toLowerCase();
    return state.savedEstimates
        .filter((estimate) => !estimate.deleted)
        .filter((estimate) => !normalizedQuery || searchableText(estimate).includes(normalizedQuery))
        .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function ensureEstimateManager() {
    let modal = $('estimateManagerModal');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'estimateManagerModal';
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content wide-modal">
            <button type="button" class="close" data-manager-close aria-label="Close">&times;</button>
            <h2>Manage Estimates</h2>
            <div class="manager-toolbar">
                <div class="form-group">
                    <label for="managerSearch">Search estimates</label>
                    <input type="search" id="managerSearch" autocomplete="off" placeholder="Search customer, address, line item, or total">
                </div>
                <button type="button" id="managerSelectVisible" class="btn btn-secondary compact-btn">Select Shown</button>
                <button type="button" id="managerDeleteSelected" class="btn btn-danger compact-btn">Delete Selected</button>
            </div>
            <div class="manager-summary" id="managerSummary"></div>
            <div class="manager-list" id="managerList"></div>
        </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', async (event) => {
        if (event.target === modal || event.target.matches('[data-manager-close]')) {
            closeEstimateManager();
            return;
        }

        const id = event.target.dataset.id;
        if (event.target.classList.contains('manager-load') && id) {
            loadEstimate(id);
            closeEstimateManager();
            return;
        }

        if (event.target.classList.contains('manager-start-contract') && id) {
            loadEstimate(id);
            closeEstimateManager();
            await startContractFromAcceptedEstimate();
            return;
        }

        if (event.target.classList.contains('manager-delete') && id) {
            const estimate = state.savedEstimates.find((item) => item.estimateId === id);
            await deleteEstimatesByIds([id], `Delete estimate for ${estimate?.customer || 'customer'}?`);
            state.managerSelected.delete(id);
            renderEstimateManager();
            return;
        }

        if (event.target.classList.contains('manager-check') && id) {
            if (event.target.checked) state.managerSelected.add(id);
            else state.managerSelected.delete(id);
            renderEstimateManager();
        }
    });

    modal.addEventListener('input', (event) => {
        if (event.target.id === 'managerSearch') renderEstimateManager();
    });

    modal.querySelector('#managerDeleteSelected').addEventListener('click', async () => {
        const ids = Array.from(state.managerSelected);
        if (ids.length === 0) {
            setStatus('Select estimates to delete.', 'error');
            return;
        }
        await deleteEstimatesByIds(ids, `Delete ${ids.length} selected estimate${ids.length === 1 ? '' : 's'}?`);
        state.managerSelected.clear();
        renderEstimateManager();
    });

    return modal;
}

async function openEstimateManager() {
    const modal = ensureEstimateManager();
    state.managerSelected.clear();
    modal.style.display = 'block';
    const search = $('managerSearch');
    if (search) {
        search.value = $('estimateSearch')?.value || '';
        search.focus();
    }
    renderEstimateManager();
    if (navigator.onLine) {
        await syncWithServer({ silent: true });
        renderEstimateManager();
    }
}

function closeEstimateManager() {
    const modal = $('estimateManagerModal');
    if (modal) modal.style.display = 'none';
}

function renderEstimateManager() {
    const list = $('managerList');
    const summary = $('managerSummary');
    const query = $('managerSearch')?.value || '';
    if (!list || !summary) return;

    const estimates = getActiveEstimates(query);
    const visibleIds = new Set(estimates.map((estimate) => estimate.estimateId));
    state.managerSelected.forEach((id) => {
        if (!state.savedEstimates.some((estimate) => estimate.estimateId === id && !estimate.deleted)) {
            state.managerSelected.delete(id);
        }
    });

    summary.textContent = `${estimates.length} estimate${estimates.length === 1 ? '' : 's'} shown${state.managerSelected.size ? `, ${state.managerSelected.size} selected` : ''}.`;
    const selectButton = $('managerSelectVisible');
    if (selectButton) {
        const allVisibleSelected = estimates.length > 0 && estimates.every((estimate) => state.managerSelected.has(estimate.estimateId));
        selectButton.textContent = allVisibleSelected ? 'Clear Shown' : 'Select Shown';
        selectButton.onclick = () => {
            if (allVisibleSelected) visibleIds.forEach((id) => state.managerSelected.delete(id));
            else visibleIds.forEach((id) => state.managerSelected.add(id));
            renderEstimateManager();
        };
    }

    if (estimates.length === 0) {
        list.innerHTML = '<div class="manager-empty">No matching estimates.</div>';
        return;
    }

    list.innerHTML = estimates.map((estimate) => {
        const id = escapeHtml(estimate.estimateId);
        const title = estimate.customer || 'No customer';
        const detail = [
            customerAddressFromParts(customerAddressPartsFromEstimate(estimate)),
            formatPhoneNumber(estimate.customerPhone),
            estimate.customerEmail
        ].filter(Boolean).join(' | ');
        const meta = [
            estimateStatusBadgeHtml(estimate),
            displayDate(estimate.estimateDate) || 'No date',
            estimate.supplier ? `Supplier: ${estimate.supplier}` : '',
            estimate.installer ? `Installer: ${estimate.installer}` : '',
            `Total: $${formatCurrency(estimate.grandTotal)}`
        ].filter(Boolean).join(' ');
        const statusDetail = estimateResponseStatus(estimate).detail;

        return `
            <div class="manager-row" data-id="${id}">
                <input class="manager-check" type="checkbox" data-id="${id}" ${state.managerSelected.has(estimate.estimateId) ? 'checked' : ''} aria-label="Select estimate for ${escapeHtml(title)}">
                <div>
                    <div class="manager-row-title">${escapeHtml(title)}</div>
                    <div class="manager-row-meta">${meta}</div>
                    <div class="manager-row-detail">${escapeHtml(statusDetail)}</div>
                    ${detail ? `<div class="manager-row-detail">${escapeHtml(detail)}</div>` : ''}
                </div>
                <div class="manager-row-actions">
                    <button type="button" class="btn btn-secondary compact-btn manager-load" data-id="${id}">Load</button>
                    ${isAcceptedEstimate(estimate) ? `<button type="button" class="btn btn-primary compact-btn manager-start-contract" data-id="${id}">Start Contract</button>` : ''}
                    <button type="button" class="btn btn-danger compact-btn manager-delete" data-id="${id}">Delete</button>
                </div>
            </div>
        `;
    }).join('');
}

function generateFilename() {
    let customerName = $('customer').value.trim();
    if (!customerName) {
        customerName = prompt('Please enter the customer name:', 'Valued Customer') || 'Not Provided';
        setValue('customer', customerName);
    }
    const date = $('estimateDate').value || todayDateValue();
    const number = $('estimateNumber')?.value || makeEstimateNumber(date);
    return `${number}_${customerName.replace(/[^a-z0-9]/gi, '_')}_${date.replace(/\D/g, '')}.pdf`;
}

function contractReturnHref(filename = lastGeneratedEstimateFilename) {
    const fallback = '/contract/new?restoreDraft=1&section=estimate';
    const returnPath = safeContractReturnPath(urlParams().get('returnTo')) || fallback;
    const url = new URL(returnPath, window.location.origin);
    const customerAddress = customerAddressFromParts(currentCustomerAddressParts()).trim();
    url.searchParams.set('restoreDraft', '1');
    url.searchParams.set('section', 'estimate');
    if (filename) url.searchParams.set('estimateFile', filename);
    if (customerAddress) url.searchParams.set('estimateAddress', customerAddress);
    if ($('customer')?.value) url.searchParams.set('customer', $('customer').value);
    if ($('customerPhone')?.value) url.searchParams.set('phone', $('customerPhone').value);
    if ($('customerEmail')?.value) url.searchParams.set('email', $('customerEmail').value);
    if ($('estimateNumber')?.value) url.searchParams.set('estimateNumber', $('estimateNumber').value);
    const total = calculateTotals().grandTotal;
    if (Number.isFinite(total) && total > 0) url.searchParams.set('estimateTotal', total.toFixed(2));
    if (state.currentEstimateId) url.searchParams.set('estimateId', state.currentEstimateId);
    return `${url.pathname}?${url.searchParams.toString()}${url.hash}`;
}

async function generatePDF() {
    if (!requireCompleteEstimate()) return null;
    await saveCurrentEstimate({ skipConfirm: true, silent: true, askToSaveLookup: true });
    try {
        const response = await fetch(`${API_BASE}/generate-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(collectFormData())
        });
        const result = await response.json();
        if (result.success) {
            lastGeneratedEstimateFilename = result.filename || '';
            setCreatedEstimateFile(lastGeneratedEstimateFilename);
            await recordGeneratedPdf(result);
            setStatus('Estimate PDF created.', 'ready');
            return result.filename;
        }
        alert('Error generating PDF: ' + (result.message || 'Unknown error'));
    } catch (error) {
        alert('Error generating PDF: ' + error.message);
    }
    return null;
}

async function saveForContractAndReturn() {
    const filename = await generatePDF();
    if (!filename) return;
    setStatus('Estimate saved. Returning to contract...', 'ready');
    window.location.href = contractReturnHref(filename);
}

async function startContractFromAcceptedEstimate() {
    const estimate = currentEstimateRecord();
    if (!isAcceptedEstimate(estimate)) {
        setStatus('This estimate must be accepted before starting a contract from it.', 'error');
        return;
    }
    const changedAfterAcceptance = estimateChangedAfterAcceptance(estimate);
    if (changedAfterAcceptance) {
        const confirmed = window.confirm('This estimate changed after customer acceptance. The customer should approve the changed estimate before it becomes a contract. Start creating the contract anyway?');
        if (!confirmed) {
            setStatus('Contract start cancelled. Send the changed estimate for customer approval first.', 'error');
            return;
        }
    }
    const filename = await generatePDF();
    if (!filename) return;
    setStatus('Accepted estimate saved. Starting contract...', 'ready');
    window.location.href = contractStartHref(filename, {
        changedAfterAcceptance,
        approvalBypassed: changedAfterAcceptance
    });
}

async function syncWithServer({ silent = false, forcePush = false } = {}) {
    if (state.syncInProgress) return;
    state.syncInProgress = true;

    try {
        let lastSync = localStorage.getItem(SYNC_LAST_KEY) || '';
        let pullResponse = await apiFetch(`${API_BASE}/sync/pull${lastSync ? `?since=${encodeURIComponent(lastSync)}` : ''}`);
        if (pullResponse.status === 401) {
            if (!silent) setStatus('Unlock online sync to use the hosted database.', 'error');
            return;
        }
        if (!pullResponse.ok) {
            const result = await safeJson(pullResponse);
            throw new Error(result.error || result.message || 'Cloud sync unavailable.');
        }

        let pulled = await pullResponse.json();
        if (applyServerResetId(pulled.dataResetId)) {
            lastSync = '';
            pullResponse = await apiFetch(`${API_BASE}/sync/pull`);
            if (!pullResponse.ok) {
                const result = await safeJson(pullResponse);
                throw new Error(result.error || result.message || 'Cloud sync unavailable after server reset.');
            }
            pulled = await pullResponse.json();
            applyServerResetId(pulled.dataResetId);
        }
        mergePulledEstimates(pulled.estimates || []);
        mergePulledEntities(pulled.entities || []);
        mergePulledCustomers(pulled.customers || []);

        const pushResponse = await apiFetch(`${API_BASE}/sync/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                estimates: state.savedEstimates,
                customers: state.customerRecords,
                lastSync,
                forcePush,
                dataResetId: localStorage.getItem(DATA_RESET_KEY) || ''
            })
        });

        if (pushResponse.status === 401) {
            if (!silent) setStatus('Unlock online sync to update the hosted database.', 'error');
            return;
        }
        if (!pushResponse.ok) {
            const result = await safeJson(pushResponse);
            if (pushResponse.status === 409 && result.resetRequired) {
                applyServerResetId(result.dataResetId);
                setStatus('Server was reset. This browser cache was cleared; refresh or search again.', 'error');
                return;
            }
            throw new Error(result.error || result.message || 'Cloud push unavailable.');
        }

        const pushed = await pushResponse.json();
        applyServerResetId(pushed.dataResetId);
        localStorage.setItem(SYNC_LAST_KEY, new Date().toISOString());
        if (Array.isArray(pushed.conflicts) && pushed.conflicts.length > 0) {
            localStorage.setItem(SYNC_CONFLICTS_KEY, JSON.stringify(pushed.conflicts));
            setStatus(`Cloud sync conflict on ${pushed.conflicts.length} estimate(s). Local data was kept.`, 'error');
        } else if (!silent) {
            setStatus('Cloud sync is up to date.', 'ready');
        } else {
            setStatus('Saved locally. Cloud sync is up to date.', 'ready');
        }
    } catch (error) {
        if (!silent) {
            setStatus(error.message, 'error');
        } else {
            const prefix = forcePush ? 'Saved locally.' : 'Local estimates ready.';
            setStatus(`${prefix} Online sync unavailable: ${error.message}`, 'error');
        }
    } finally {
        state.syncInProgress = false;
    }
}

function mergePulledEstimates(estimates) {
    let changed = false;
    estimates.forEach((remote) => {
        if (!remote || !remote.estimateId) return;
        const index = state.savedEstimates.findIndex((item) => item.estimateId === remote.estimateId);
        if (index === -1) {
            state.savedEstimates.push(remote);
            changed = true;
            return;
        }
        const localUpdated = String(state.savedEstimates[index].updatedAt || '');
        const remoteUpdated = String(remote.updatedAt || '');
        if (remoteUpdated > localUpdated) {
            state.savedEstimates[index] = remote;
            changed = true;
        }
    });
    if (changed) {
        persistLocalStore();
        rebuildEntities();
        renderSavedList();
        if (state.currentEstimateId) {
            const current = state.savedEstimates.find((estimate) => estimate.estimateId === state.currentEstimateId);
            if (current && !current.deleted) loadEstimate(current.estimateId);
        }
    }
}

function mergePulledEntities(entities) {
    const entityMap = new Map(state.remoteEntities.map((entity) => [`${entity.type}:${normalizeLookupKey(entity.name)}`, entity]));
    entities.forEach((entity) => {
        if (!entity || !entity.type || !entity.name) return;
        entityMap.set(`${entity.type}:${normalizeLookupKey(entity.name)}`, {
            ...entity,
            type: String(entity.type || '').trim(),
            name: String(entity.name || '').trim(),
            lastUsedAt: entity.lastUsedAt || entity.last_used_at || ''
        });
    });
    state.remoteEntities = Array.from(entityMap.values());
    rebuildEntities();
}

function mergePulledCustomers(customers) {
    const customerMap = new Map();
    state.remoteCustomers.forEach((customer) => mergeCustomerRecord(customerMap, customer));
    customers.forEach((customer) => mergeCustomerRecord(customerMap, customer));
    state.remoteCustomers = Array.from(customerMap.values());
    rebuildEntities();
}

async function safeJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

function showUnlockPanel() {
    const panel = $('syncUnlockSection');
    if (panel) panel.hidden = false;
}

function hideUnlockPanel() {
    const panel = $('syncUnlockSection');
    if (panel) panel.hidden = true;
}

async function checkSession() {
    try {
        const response = await apiFetch(`${API_BASE}/session`);
        if (!response.ok) return;
        const result = await response.json();
        if (result.authRequired && !result.authorized) {
            showUnlockPanel();
            setStatus('Local estimates ready. Unlock to sync online.', 'error');
        } else {
            hideUnlockPanel();
            await syncWithServer({ silent: true });
            loadInitialEstimateFromParams({ quiet: true });
        }
    } catch {
        setStatus('Local estimates ready. Online sync is unavailable.', 'error');
    }
}

async function unlockSync() {
    const password = $('syncPassword').value;
    if (!password) {
        setStatus('Enter the sync password.', 'error');
        return;
    }
    try {
        const response = await fetch(`${API_BASE}/session`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const result = await response.json();
        if (!response.ok) {
            setStatus(result.error || 'Incorrect password.', 'error');
            return;
        }
        storeAuthToken(result.token, result.expiresAt);
        $('syncPassword').value = '';
        hideUnlockPanel();
        setStatus('Online sync unlocked.', 'ready');
        await syncWithServer();
    } catch (error) {
        setStatus(error.message, 'error');
    }
}

function togglePasswordVisibility() {
    const input = $('syncPassword');
    const button = $('toggleSyncPassword');
    if (!input || !button) return;
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.textContent = showing ? 'Show' : 'Hide';
}

function applyEditorWidth(width) {
    const shell = document.querySelector('.app-shell');
    if (!shell || window.innerWidth <= 1120) {
        if (shell) shell.style.gridTemplateColumns = '';
        return;
    }

    const available = shell.clientWidth - 28;
    const minEditor = 430;
    const minPreview = 420;
    const maxEditor = Math.max(minEditor, available - minPreview);
    const nextWidth = Math.min(Math.max(width, minEditor), maxEditor);
    shell.style.gridTemplateColumns = `${nextWidth}px 8px minmax(${minPreview}px, 1fr)`;
    const resizer = $('shellResizer');
    if (resizer) resizer.setAttribute('aria-valuenow', String(Math.round(nextWidth)));
    localStorage.setItem(RESIZER_WIDTH_KEY, String(Math.round(nextWidth)));
}

function bindShellResizer() {
    const resizer = $('shellResizer');
    const shell = document.querySelector('.app-shell');
    if (!resizer || !shell) return;

    const savedWidth = Number(localStorage.getItem(RESIZER_WIDTH_KEY) || 0);
    if (savedWidth) applyEditorWidth(savedWidth);

    let dragging = false;
    const move = (clientX) => {
        const rect = shell.getBoundingClientRect();
        applyEditorWidth(clientX - rect.left);
    };

    resizer.addEventListener('pointerdown', (event) => {
        if (window.innerWidth <= 1120) return;
        dragging = true;
        resizer.classList.add('is-dragging');
        resizer.setPointerCapture(event.pointerId);
        move(event.clientX);
    });

    resizer.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        move(event.clientX);
    });

    resizer.addEventListener('pointerup', (event) => {
        dragging = false;
        resizer.classList.remove('is-dragging');
        if (resizer.hasPointerCapture(event.pointerId)) {
            resizer.releasePointerCapture(event.pointerId);
        }
    });

    resizer.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
        event.preventDefault();
        const current = Number(localStorage.getItem(RESIZER_WIDTH_KEY) || 760);
        applyEditorWidth(current + (event.key === 'ArrowRight' ? 24 : -24));
    });

    window.addEventListener('resize', () => {
        const current = Number(localStorage.getItem(RESIZER_WIDTH_KEY) || 760);
        applyEditorWidth(current);
    });
}

function bindEvents() {
    $('estimateForm').addEventListener('input', handleDraftChanged);
    $('estimateForm').addEventListener('change', handleDraftChanged);

    [$('phone'), $('customerPhone')].filter(Boolean).forEach((input) => {
        input.inputMode = 'numeric';
        input.maxLength = 14;
        input.pattern = '\\(\\d{3}\\) \\d{3}-\\d{4}';
        input.addEventListener('input', () => {
            formatPhoneInput(input);
            handleDraftChanged();
        });
        input.addEventListener('blur', () => {
            formatPhoneInput(input);
            handleDraftChanged();
        });
    });

    bindZipCityStateLookup({
        zipId: 'customerZip',
        cityId: 'customerCity',
        stateId: 'customerState'
    });

    $('customer').addEventListener('input', renderCustomerSuggestions);
    $('customerSuggestions').addEventListener('click', (event) => {
        const button = event.target.closest('.customer-suggestion');
        if (!button) return;
        applyCustomerSuggestion(Number(button.dataset.index));
    });
    document.addEventListener('click', (event) => {
        const suggestions = $('customerSuggestions');
        if (!suggestions || suggestions.hidden) return;
        if (event.target === $('customer') || suggestions.contains(event.target)) return;
        suggestions.hidden = true;
    });

    $('toggleSyncPassword').addEventListener('click', togglePasswordVisibility);
    $('unlockSyncBtn').addEventListener('click', unlockSync);
    $('syncPassword').addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            unlockSync();
        }
    });

    $('estimateSearch').addEventListener('input', renderSavedList);
    $('estimateDate').addEventListener('change', () => {
        if (!state.currentEstimateId) setValue('estimateNumber', makeEstimateNumber($('estimateDate').value || todayDateValue()));
    });
    $('loadEstimateBtn').addEventListener('click', () => loadEstimate($('savedEstimateList').value));
    $('savedEstimateList').addEventListener('change', (event) => {
        if (event.target.value) loadEstimate(event.target.value);
    });
    $('newEstimateBtn').addEventListener('click', newEstimate);
    $('deleteEstimateBtn').addEventListener('click', deleteSelectedEstimate);
    $('manageEstimatesBtn').addEventListener('click', openEstimateManager);
    $('saveEstimateBtn').addEventListener('click', () => saveCurrentEstimate());
    $('saveBackContractBtn').addEventListener('click', saveForContractAndReturn);
    $('clearEstimateBtn').addEventListener('click', () => {
        newEstimate();
        setStatus('Estimate cleared.', 'ready');
    });
    $('toContractsBtn').addEventListener('click', async (event) => {
        if (event.currentTarget.dataset.startAcceptedEstimate !== '1') return;
        event.preventDefault();
        await startContractFromAcceptedEstimate();
    });
    bindEstimateActionProxies();
    $('addCabinetItemBtn').addEventListener('click', () => addLineItem('cabinet'));
    $('addInstallationItemBtn').addEventListener('click', () => addLineItem('installation'));
    $('taxableAll').addEventListener('change', () => setAllCabinetItemsTaxable($('taxableAll').checked));

    $('cabinetItems').addEventListener('input', handleLineItemInput);
    $('cabinetItems').addEventListener('change', handleLineItemInput);
    $('cabinetItems').addEventListener('click', handleLineItemClick);
    $('cabinetItems').addEventListener('focusout', handleLineItemBlur);
    $('cabinetItems').addEventListener('focusin', handleLineItemFocus);
    $('installationItems').addEventListener('input', handleLineItemInput);
    $('installationItems').addEventListener('change', handleLineItemInput);
    $('installationItems').addEventListener('click', handleLineItemClick);
    $('installationItems').addEventListener('focusout', handleLineItemBlur);
    $('installationItems').addEventListener('focusin', handleLineItemFocus);
    document.addEventListener('click', (event) => {
        if (event.target.closest('.line-item-row')) return;
        hideLineSuggestions();
    });

    bindModals();
    bindDownloadAndEmail();
    window.addEventListener('online', () => syncWithServer({ silent: true }));
}

function bindModals() {
    const downloadPrintModal = $('downloadPrintModal');
    const emailModal = $('emailModal');

    $('downloadPrintBtn').addEventListener('click', () => {
        if (!requireCompleteEstimate()) return;
        downloadPrintModal.style.display = 'block';
    });

    $('emailBtn').addEventListener('click', () => {
        if (!requireCompleteEstimate()) return;
        setValue('recipientEmail', $('customerEmail')?.value || '');
        emailModal.style.display = 'block';
    });

    document.querySelectorAll('.close').forEach((button) => {
        button.addEventListener('click', function() {
            const modalType = this.getAttribute('data-modal');
            if (modalType === 'downloadPrint') downloadPrintModal.style.display = 'none';
            if (modalType === 'email') emailModal.style.display = 'none';
        });
    });

    window.addEventListener('click', (event) => {
        if (event.target === downloadPrintModal) downloadPrintModal.style.display = 'none';
        if (event.target === emailModal) emailModal.style.display = 'none';
    });
}

function bindDownloadAndEmail() {
    $('downloadEstimateBtn').addEventListener('click', async () => {
        const filename = await generatePDF();
        if (!filename) return;
        const link = document.createElement('a');
        link.href = `${API_BASE}/download-pdf/${filename}`;
        link.download = generateFilename();
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        $('downloadPrintModal').style.display = 'none';
        window.setTimeout(showEstimateCompletionPrompt, 600);
    });

    $('printEstimateBtn').addEventListener('click', async () => {
        const filename = await generatePDF();
        if (!filename) return;
        const printWindow = window.open(`${API_BASE}/download-pdf/${filename}`, '_blank');
        if (printWindow) {
            printWindow.addEventListener('load', () => {
                printWindow.focus();
                setTimeout(() => {
                    printWindow.print();
                    showEstimateCompletionPrompt();
                }, 500);
            });
        } else {
            window.setTimeout(showEstimateCompletionPrompt, 600);
        }
        $('downloadPrintModal').style.display = 'none';
    });

    $('emailForm').addEventListener('submit', async function(event) {
        event.preventDefault();
        if (!requireCompleteEstimate()) return;
        await saveCurrentEstimate({ skipConfirm: true, silent: true, askToSaveLookup: true });
        try {
            const response = await fetch(`${API_BASE}/email-estimate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    estimateData: collectFormData(),
                    recipientEmail: $('recipientEmail').value
                })
            });
            const result = await response.json();
            if (result.success) {
                const mergedEstimate = mergeServerEstimateRecord(result.estimate || {});
                if (result.filename) {
                    lastGeneratedEstimateFilename = result.filename || '';
                    setCreatedEstimateFile(lastGeneratedEstimateFilename);
                    if (!mergedEstimate) await recordGeneratedPdf(result);
                }
                setStatus(result.message || 'Estimate email sent successfully.', 'ready');
                $('emailModal').style.display = 'none';
                this.reset();
                showEstimateCompletionPrompt();
            } else {
                alert('Error sending email: ' + result.message);
            }
        } catch (error) {
            alert('Error sending email: ' + error.message);
        }
    });
}

function estimateReturnTarget() {
    return openedFromContract()
        ? { href: contractReturnHref(), label: 'Back to Contract' }
        : { href: '/portal', label: 'To Contracts' };
}

function updateCancelEstimateAction() {
    const link = $('cancelEstimateBtn');
    if (!link) return;
    link.href = estimateReturnTarget().href;
    syncEstimateActionProxies();
}

function showEstimateCompletionPrompt() {
    let modal = $('estimateCompleteModal');
    const target = estimateReturnTarget();
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'estimateCompleteModal';
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-content">
                <button type="button" class="close" data-complete-close aria-label="Close">&times;</button>
                <h2>Estimate Complete</h2>
                <p>Do you need another estimate, or do you want to return to the previous workflow?</p>
                <div class="modal-actions">
                    <button type="button" id="completeNewEstimate" class="btn btn-primary">New Estimate</button>
                    <a id="completeReturnLink" class="btn btn-secondary" href="/portal">Back to Home</a>
                </div>
            </div>
        `;
        document.body.append(modal);
        modal.querySelector('[data-complete-close]').addEventListener('click', () => {
            modal.style.display = 'none';
        });
        modal.querySelector('#completeNewEstimate').addEventListener('click', () => {
            modal.style.display = 'none';
            newEstimate();
        });
    }
    const link = modal.querySelector('#completeReturnLink');
    link.href = target.href;
    link.textContent = target.label;
    modal.style.display = 'block';
}

function configureEstimateMode() {
    if (openedFromContract()) {
        $('saveEstimateBtn').textContent = 'Save Estimate';
        $('downloadPrintBtn').classList.add('hidden');
        $('emailBtn').classList.add('hidden');
        $('saveBackContractBtn').textContent = 'Save and Attach to Contract';
        $('saveBackContractBtn').classList.remove('hidden');
        updateCancelEstimateAction();
        syncEstimateActionProxies();
        return;
    }

    refreshContractStartAction();
    updateCancelEstimateAction();
    syncEstimateActionProxies();
}

function applyInitialEstimateParams() {
    const params = urlParams();
    setValueIfPresent('customer', params.get('customer'));
    setValueIfPresent('customerEmail', params.get('email'));
    setValueIfPresent('customerPhone', params.get('phone'), formatPhoneNumber);
    if (params.get('address')) setCustomerAddressFields(params.get('address'));
    if (!$('estimateNumber').value) setValue('estimateNumber', makeEstimateNumber($('estimateDate').value || todayDateValue()));
}

async function loadBusinessSettings() {
    try {
        const response = await fetch(`${API_BASE}/settings`);
        if (!response.ok) throw new Error('Settings unavailable');
        const settings = await response.json();
        setValue('businessName', settings.businessName);
        setValue('address', settings.address);
        setValue('city', settings.city);
        setValue('state', settings.state);
        setValue('zip', settings.zip);
        setValue('phone', settings.phone);
        setValue('email', settings.email);
        setValue('website', settings.website);
        setValue('salesTaxRate', settings.salesTaxRate || 6.5);
        state.uploadedLogoPath = settings.logoPath || `${ASSET_BASE}/defaultLogo.png`;
    } catch {
        await loadDefaultLogo();
    }
}

function loadDefaultLogo() {
    return fetch(`${ASSET_BASE}/defaultLogo.png`, { method: 'HEAD' })
        .then((response) => {
            if (response.ok) {
                state.uploadedLogoPath = `${ASSET_BASE}/defaultLogo.png`;
            }
        })
        .catch(() => {});
}

async function init() {
    loadLocalStore();
    await loadBusinessSettings();
    bindEvents();
    bindShellResizer();
    setValue('estimateDate', todayDateValue());
    setValue('estimateNumber', makeEstimateNumber(todayDateValue()));
    renderLineItems('cabinet');
    renderLineItems('installation');
    applyInitialEstimateParams();
    const initialQuery = urlParams().get('q');
    const selectedEstimateReference = directEstimateReference();
    if (initialQuery && !selectedEstimateReference) setValue('estimateSearch', initialQuery);
    configureEstimateMode();
    renderSavedList();
    const loadedSelectedEstimate = loadInitialEstimateFromParams({ quiet: true });
    handleDraftChanged();
    setStatus(loadedSelectedEstimate ? 'Selected estimate loaded.' : 'Local estimates ready.', 'ready');
    checkSession();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
