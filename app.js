// Same server that serves this page (works on phone, PC, Render or localhost). Falls back to Render if the file is opened directly.
const SERVER_URL = (location.protocol === 'file:') ? 'https://digital-calendar-wvzc.onrender.com' : location.origin;

function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease reverse forwards';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function toggleTheme() {
    const html = document.documentElement;
    const newTheme = html.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('calendarTheme', newTheme);
    document.getElementById('themeBtn').innerText = newTheme === 'dark' ? '☀️' : '🌙';
}
const savedTheme = localStorage.getItem('calendarTheme') || 'light';
document.documentElement.setAttribute('data-theme', savedTheme);
document.getElementById('themeBtn').innerText = savedTheme === 'dark' ? '☀️' : '🌙';

// ==========================================
// STATE MANAGEMENT
// ==========================================
let currentView = { year: new Date().getFullYear(), month: new Date().getMonth(), monthString: "" };
let localDatabase = {}; 

let selectedColorHex = "#f50057";
let selectedIdentifier = null; 
let selectedType = null;

let isMultiSelectMode = false;
let selectedItems = new Set(); 
let bulkSelectedColorHex = "#f50057";

const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; 
const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const today = new Date();

function getContrastColor(hexcolor) {
    if (!hexcolor || hexcolor === 'transparent') return 'var(--text-main)';
    hexcolor = hexcolor.replace("#", "");
    var r = parseInt(hexcolor.substr(0, 2), 16);
    var g = parseInt(hexcolor.substr(2, 2), 16);
    var b = parseInt(hexcolor.substr(4, 2), 16);
    var yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
    return (yiq >= 128) ? '#000000' : '#ffffff';
}

// ==========================================
// DATA FETCHING
// ==========================================
async function fetchDataAndRender() {
    try {
        console.log("Fetching data from DB...");
        const response = await fetch(`${SERVER_URL}/api/get-state`);
        const data = await response.json();
        if (!response.ok || !Array.isArray(data)) {
            throw new Error(data.error || `HTTP ${response.status}`);
        }
        
        console.log("Data received from DB:", data);

        localDatabase = {};
        data.forEach(led => { 
            localDatabase[led.dateString] = led; 
        });
        
        renderCalendar();
    } catch (error) {
        console.error("❌ Fetch Error:", error);
        // "Failed to fetch" = server unreachable. Anything else = the server answered with an error (usually MongoDB).
        showToast(`Could not load data: ${error.message}`, "error");
        renderCalendar(); // Render empty just in case
    }
}

// ==========================================
// RENDER ENGINE
// ==========================================
function renderCalendar() {
    const daysGridContainer = document.getElementById('daysGridContainer');
    const datesCont = document.getElementById('datesContainer');
    const monthsCont = document.getElementById('monthsContainer');
    const headerTitle = document.getElementById('currentMonthDisplay');
    
    // 1. Render Days
    daysGridContainer.innerHTML = '';
    days.forEach((day, index) => {
        const btn = document.createElement('button');
        btn.className = 'day-btn';
        btn.innerText = day;
        const dayString = `day-${index}`;
        btn.id = `led-${dayString}`;
        
        btn.onclick = () => {
            if (isMultiSelectMode) toggleItemSelection(dayString, 'day', btn);
            else openSingleEditPanel(dayString, 'day', day);
        };
        
        daysGridContainer.appendChild(btn); // must be in the DOM BEFORE applying saved state
        if (localDatabase[dayString]) {
            const d = localDatabase[dayString];
            updateUIState(dayString, d.color, d.isOn, d.eventNote, 'day');
        }
    });

    // 2. Render Dates Header
    const daysHeader = document.getElementById('daysHeader');
    daysHeader.innerHTML = '';
    days.forEach(day => {
        const el = document.createElement('div');
        el.className = 'day-label';
        el.innerText = day.substring(0, 2); 
        daysHeader.appendChild(el);
    });

    // 3. Render Dates & Months
    datesCont.innerHTML = ''; 
    monthsCont.innerHTML = ''; 

    const monthPad = String(currentView.month + 1).padStart(2, '0');
    currentView.monthString = `${currentView.year}-${monthPad}`;
    headerTitle.innerText = `${months[currentView.month]} ${currentView.year}`;

    const firstDayOfMonth = new Date(currentView.year, currentView.month, 1).getDay();
    let emptySlots = firstDayOfMonth; 

    for (let i = 0; i < emptySlots; i++) {
        const empty = document.createElement('div');
        empty.className = 'date-btn empty-slot';
        datesCont.appendChild(empty);
    }

    const daysInMonth = new Date(currentView.year, currentView.month + 1, 0).getDate();
    for (let i = 1; i <= daysInMonth; i++) {
        const btn = document.createElement('button');
        btn.className = 'date-btn';
        btn.innerText = i;
        const dateString = `${currentView.year}-${monthPad}-${String(i).padStart(2, '0')}`;
        btn.id = `led-${dateString}`;
        
        btn.onclick = () => {
            if (isMultiSelectMode) toggleItemSelection(dateString, 'date', btn);
            else openSingleEditPanel(dateString, 'date', i);
        };
        
        if (i === today.getDate() && currentView.month === today.getMonth() && currentView.year === today.getFullYear()) {
            btn.classList.add('is-today');
        }

        datesCont.appendChild(btn); // must be in the DOM BEFORE applying saved state
        if (localDatabase[dateString]) {
            const d = localDatabase[dateString];
            updateUIState(dateString, d.color, d.isOn, d.eventNote, 'date');
        }
    }

    months.forEach((month, index) => {
        const btn = document.createElement('button');
        btn.className = 'month-btn';
        btn.innerText = month;
        const monthString = `${currentView.year}-${String(index + 1).padStart(2, '0')}`;
        btn.id = `led-${monthString}`;
        
        btn.onclick = () => {
            if (isMultiSelectMode) toggleItemSelection(monthString, 'month', btn);
            else openSingleEditPanel(monthString, 'month', month);
        };
        
        if (index === today.getMonth() && currentView.year === today.getFullYear()) {
            btn.classList.add('is-current-month');
        }

        monthsCont.appendChild(btn); // must be in the DOM BEFORE applying saved state
        if (localDatabase[monthString]) {
            const d = localDatabase[monthString];
            updateUIState(monthString, d.color, d.isOn, d.eventNote, 'month');
        }
    });
}

function updateUIState(identifier, color, isOn, eventText, type) {
    const btn = document.getElementById(`led-${identifier}`);
    if (!btn) return;

    if (isOn && color) {
        // Force the background color to apply
        btn.style.setProperty('background-color', color, 'important');
        
        // Calculate text color for visibility
        const textColor = getContrastColor(color);
        btn.style.setProperty('color', textColor, 'important');
        
        btn.classList.add('active');
        
        if (eventText && eventText.trim() !== "") {
            btn.classList.add('has-event');
            btn.title = eventText; 
        } else {
            btn.classList.remove('has-event');
            btn.title = "";
        }
    } else {
        btn.style.backgroundColor = ''; 
        btn.style.color = ''; 
        btn.classList.remove('active');
        btn.classList.remove('has-event');
        btn.title = "";
    }
}

// ==========================================
// SAVE & CLEAR LOGIC
// ==========================================
async function saveLedData() {
    if (!selectedIdentifier) return;
    const eventText = document.getElementById('eventInput').value.trim();
    const payload = { dateString: selectedIdentifier, type: selectedType, color: selectedColorHex, isOn: true, eventNote: eventText };

    localDatabase[selectedIdentifier] = payload;
    updateUIState(selectedIdentifier, selectedColorHex, true, eventText, selectedType);
    
    document.getElementById('bannerText').innerText = eventText !== "" ? eventText : "No remarks added yet.";
    closeSinglePanel();

    try {
        const response = await fetch(`${SERVER_URL}/api/update-led`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Server Error");
        showToast("Saved to Database!", "success");
        
        // Wait for DB to confirm, then reload the entire calendar
        await fetchDataAndRender(); 
    } catch (error) {
        console.error("Save Error:", error);
        showToast(`Failed to save!`, "error");
    }
}

async function turnOffLed() {
    if (!selectedIdentifier) return;
    const payload = { dateString: selectedIdentifier, type: selectedType, color: '#000000', isOn: false, eventNote: "" };

    localDatabase[selectedIdentifier] = payload;
    updateUIState(selectedIdentifier, null, false, "", selectedType);
    document.getElementById('eventInput').value = "";
    document.getElementById('bannerText').innerText = "No remarks added yet.";
    closeSinglePanel();

    try {
        await fetch(`${SERVER_URL}/api/update-led`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        showToast("Cleared from Database", "info");
        await fetchDataAndRender(); 
    } catch (error) {
        console.error("Clear Error:", error);
        showToast("Failed to clear!", "error");
    }
}

// ==========================================
// MONTH NAVIGATION
// ==========================================
async function changeMonth(offset) {
    currentView.month += offset;
    if (currentView.month > 11) { currentView.month = 0; currentView.year++; }
    else if (currentView.month < 0) { currentView.month = 11; currentView.year--; }
    closeSinglePanel();
    clearSelection(); 
    
    await fetchDataAndRender(); 
}

// ==========================================
// UI INTERACTION LOGIC
// ==========================================
function openSingleEditPanel(identifier, type, label) {
    selectedIdentifier = identifier;
    selectedType = type;
    document.getElementById('selectedLabel').innerText = label;
    
    const currentColor = localDatabase[identifier]?.color || '#f50057';
    selectColor(rgbToHex(currentColor), null); 

    const eventGroup = document.getElementById('eventGroup');
    const banner = document.getElementById('eventBanner');

    eventGroup.style.display = 'flex';
    const currentEvent = localDatabase[identifier]?.eventNote || "";
    document.getElementById('eventInput').value = currentEvent;
    document.getElementById('bannerTitle').innerText = `Remarks for ${label}`;
    document.getElementById('bannerText').innerText = currentEvent !== "" ? currentEvent : "No remarks added yet.";
    banner.classList.add('show');
    document.getElementById('singleEditPanel').classList.add('open');
}

function closeSinglePanel() {
    document.getElementById('singleEditPanel').classList.remove('open');
}

function selectColor(hex, element) {
    document.querySelectorAll('#singleEditPanel .swatch, #singleEditPanel .custom-color-wrapper').forEach(el => el.classList.remove('selected'));
    if (element) element.classList.add('selected');
    selectedColorHex = hex;
    document.getElementById('colorPicker').value = hex;
}

function handleCustomColor(hex) {
    document.querySelectorAll('#singleEditPanel .swatch').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#singleEditPanel .custom-color-wrapper').forEach(el => el.classList.add('selected'));
    selectedColorHex = hex;
}

function rgbToHex(rgb) {
    if (!rgb) return "#f50057";
    if (rgb.startsWith("#")) return rgb; 
    const colors = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
    if (!colors) return "#f50057";
    function hex(x) { return ("0" + parseInt(x).toString(16)).slice(-2); }
    return "#" + hex(colors[1]) + hex(colors[2]) + hex(colors[3]);
}

// ==========================================
// MULTI-SELECT LOGIC
// ==========================================
function toggleMultiSelect(forceState = null) {
    isMultiSelectMode = forceState !== null ? forceState : !isMultiSelectMode;
    const btn = document.getElementById('multiSelectBtn');
    const singlePanel = document.getElementById('singleEditPanel');
    const bulkPanel = document.getElementById('bulkEditPanel');

    if (isMultiSelectMode) {
        btn.classList.add('active');
        btn.innerText = "Exit Multi-Select";
        singlePanel.classList.remove('open');
        bulkPanel.classList.add('open');
    } else {
        btn.classList.remove('active');
        btn.innerText = "Select Multiple";
        bulkPanel.classList.remove('open');
        clearSelection();
    }
}

function toggleItemSelection(identifier, type, element) {
    if (!isMultiSelectMode) return; 

    if (selectedItems.has(identifier)) {
        selectedItems.delete(identifier);
        element.classList.remove('selected-for-bulk');
    } else {
        selectedItems.add(identifier);
        element.classList.add('selected-for-bulk');
    }
    updateBulkCount();
}

function clearSelection() {
    selectedItems.clear();
    document.querySelectorAll('.selected-for-bulk').forEach(el => el.classList.remove('selected-for-bulk'));
    updateBulkCount();
}

function selectAllVisible() {
    days.forEach((_, i) => {
        const id = `day-${i}`;
        selectedItems.add(id);
        document.getElementById(`led-${id}`)?.classList.add('selected-for-bulk');
    });

    const daysInMonth = new Date(currentView.year, currentView.month + 1, 0).getDate();
    const monthPad = String(currentView.month + 1).padStart(2, '0');
    for (let i = 1; i <= daysInMonth; i++) {
        const id = `${currentView.year}-${monthPad}-${String(i).padStart(2, '0')}`;
        selectedItems.add(id);
        document.getElementById(`led-${id}`)?.classList.add('selected-for-bulk');
    }

    months.forEach((_, i) => {
        const id = `${currentView.year}-${String(i + 1).padStart(2, '0')}`;
        selectedItems.add(id);
        document.getElementById(`led-${id}`)?.classList.add('selected-for-bulk');
    });

    updateBulkCount();
}

function updateBulkCount() {
    document.getElementById('bulkCount').innerText = selectedItems.size;
}

function selectBulkColor(hex, element) {
    document.querySelectorAll('#bulkEditPanel .swatch, #bulkEditPanel .custom-color-wrapper').forEach(el => el.classList.remove('selected'));
    if (element) element.classList.add('selected');
    bulkSelectedColorHex = hex;
    document.getElementById('bulkColorPicker').value = hex;
}

function handleBulkCustomColor(hex) {
    document.querySelectorAll('#bulkEditPanel .swatch').forEach(el => el.classList.remove('selected'));
    document.querySelectorAll('#bulkEditPanel .custom-color-wrapper').forEach(el => el.classList.add('selected'));
    bulkSelectedColorHex = hex;
}

async function applyBulkColor() {
    if (selectedItems.size === 0) {
        showToast("Please select at least one item", "error");
        return;
    }

    const itemsToUpdate = Array.from(selectedItems);
    let successCount = 0;

    for (const identifier of itemsToUpdate) {
        let type = 'date';
        if (identifier.startsWith('day-')) type = 'day';
        else if (identifier.length === 7) type = 'month'; 

        const payload = { dateString: identifier, type: type, color: bulkSelectedColorHex, isOn: true, eventNote: localDatabase[identifier]?.eventNote || "" };
        
        localDatabase[identifier] = payload;
        updateUIState(identifier, bulkSelectedColorHex, true, payload.eventNote, type);

        try {
            await fetch(`${SERVER_URL}/api/update-led`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            successCount++;
        } catch (error) {
            console.error("Failed to update", identifier);
        }
    }
    
    showToast(`Applied color to ${successCount} items!`, "success");
    clearSelection();
    await fetchDataAndRender();
}

// ==========================================
// INITIALIZE
// ==========================================
document.addEventListener("DOMContentLoaded", () => {
    fetchDataAndRender();

    // Live sync: changes saved from another tab/device/admin panel update this view
    if (typeof io !== 'undefined') {
        const socket = io(SERVER_URL);
        socket.on('led_updated', (led) => {
            if (led.isOn) localDatabase[led.dateString] = led;
            else delete localDatabase[led.dateString];
            renderCalendar();
        });
        socket.on('leds_deleted', (dateStrings) => {
            dateStrings.forEach(d => delete localDatabase[d]);
            renderCalendar();
        });
        socket.on('connect', fetchDataAndRender); // re-sync after any reconnect
    }

    // Re-check the database whenever the user returns to this tab
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) fetchDataAndRender();
    });
});