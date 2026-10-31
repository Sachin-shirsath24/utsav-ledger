// ==============================================================================
// UTSAVLEDGER - APPLICATION JAVASCRIPT
// Handles State, Offline LocalStorage, Live QR, WhatsApp Share & Supabase Sync
// ==============================================================================

// -----------------------------------------------------------------------------
// SUPABASE INIT — Universal Cloud Sync across all devices
// -----------------------------------------------------------------------------
const DEFAULT_SUPABASE_URL = "https://nkbcpqbgmaytqneyphta.supabase.co";
const DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rYmNwcWJnbWF5dHFuZXlwaHRhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI5MjUxODEsImV4cCI6MjEwODUwMTE4MX0.mVtKOt_mSNOIn-xW4fCSj45gCnYx6bnfH2alGh2CA-E";

function initSupabaseFromStorage() {
  const url = localStorage.getItem("utsav_sb_url") || DEFAULT_SUPABASE_URL;
  const key = localStorage.getItem("utsav_sb_key") || DEFAULT_SUPABASE_KEY;
  if (url && key) {
    try {
      supabaseClient = supabase.createClient(url, key);
      console.log("✅ Supabase client initialized");

      // Verify actual database connectivity in background
      supabaseClient.from("collections_simple").select("id").limit(1).then(({ error }) => {
        if (!error) {
          updateSupabaseBadge(true, "✅ Cloud Live (सिंक चालू)");
        } else {
          console.warn("⚠️ Supabase connection warning (check table):", error.message);
          updateSupabaseBadge(false, "⚠️ Cloud Offline (SQL तपासा)");
        }
      }).catch(err => {
        console.warn("⚠️ Supabase connection catch:", err);
        updateSupabaseBadge(false, "⚠️ Cloud Offline (लोकल मोड)");
      });

      return true;
    } catch (e) {
      console.warn("⚠️ Supabase init failed:", e);
      supabaseClient = null;
      updateSupabaseBadge(false, "Not Connected");
      return false;
    }
  }
  updateSupabaseBadge(false, "Not Connected");
  return false;
}

function updateSupabaseBadge(connected, text = null) {
  const badge = document.getElementById("supabaseStatusBadge");
  if (!badge) return;
  if (connected) {
    badge.className = "ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300";
    badge.innerText = text || "✅ Cloud Live";
  } else {
    badge.className = "ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300";
    badge.innerText = text || "⚠️ Offline मोड";
  }
}

function getTargetBudget() {
  return parseFloat(localStorage.getItem("utsav_target_budget")) || 200000;
}

let collections = [];
let expenses = [];
let volunteers = [];
let galleryItems = [];
let currentReceiptNumber = "SJ-2027-0001";
let supabaseClient = null;

// -----------------------------------------------------------------------------
// CORE UTILITIES: XSS Protection & Indian Standard Time (IST) Helpers
// -----------------------------------------------------------------------------
function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getLocalDateIso(dateObj = new Date()) {
  // Use Indian Standard Time (Asia/Kolkata, UTC+05:30)
  try {
    const parts = new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).formatToParts(dateObj);
    const y = parts.find(p => p.type === "year")?.value;
    const m = parts.find(p => p.type === "month")?.value;
    const d = parts.find(p => p.type === "day")?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (e) {}
  // Fallback: local browser offset
  const d = new Date(dateObj.getTime() - dateObj.getTimezoneOffset() * 60000);
  return d.toISOString().split("T")[0];
}

// Initialize when DOM loads
document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  
  // 1. Initialize Supabase Client and Local Data FIRST before checking URL
  const sbConnected = initSupabaseFromStorage();
  loadStoredData();
  loadVolunteers();
  loadOrgBrandSettings();
  setupInitialQrs();
  updateLiveStats();
  renderCollectionsTable();
  renderExpensesTable();
  updateNextReceiptNumber();
  populateVolunteerDropdown();
  loadGallery();

  // 2. NOW check if page was opened via WhatsApp Digital Receipt Link (?receipt=SJ-2027-0001)
  // Data is loaded, so verification lookup will succeed immediately!
  await checkUrlForReceiptVerification();

  // Initialize today's date in expense date picker with local date
  const expenseDateInput = document.getElementById("expenseDate");
  if (expenseDateInput && !expenseDateInput.value) {
    expenseDateInput.value = getLocalDateIso();
  }

  // 3. If Supabase is connected, automatically fetch latest cloud data & subscribe to live updates
  if (sbConnected) {
    await loadFromSupabase();
    subscribeToSupabaseChanges();
  }

  // Initialize Festival Countdown to 19 Feb 2027
  startFestivalCountdown();
});

function startFestivalCountdown() {
  const targetDate = new Date("2027-02-19T00:00:00+05:30").getTime();

  function update() {
    const now = new Date().getTime();
    const diff = targetDate - now;

    if (diff <= 0) {
      const daysEl = document.getElementById("countDays");
      if (daysEl) daysEl.innerText = "0";
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((diff % (1000 * 60)) / 1000);

    const dEl = document.getElementById("countDays");
    const hEl = document.getElementById("countHours");
    const mEl = document.getElementById("countMins");
    const sEl = document.getElementById("countSecs");

    if (dEl) dEl.innerText = String(days);
    if (hEl) hEl.innerText = String(hours).padStart(2, "0");
    if (mEl) mEl.innerText = String(mins).padStart(2, "0");
    if (sEl) sEl.innerText = String(secs).padStart(2, "0");
  }

  update();
  setInterval(update, 1000);
}

// -----------------------------------------------------------------------------
// 1. DATA INITIALIZATION & LOCALSTORAGE
// -----------------------------------------------------------------------------
function loadOrgBrandSettings() {
  const orgName = localStorage.getItem("utsav_org_name") || "शिवाजी राजे संघटना";
  const badge = localStorage.getItem("utsav_event_badge") || "19 Feb उत्सव";
  const subtitle = localStorage.getItem("utsav_event_subtitle") || "छत्रपती शिवाजी महाराज जयंती महोत्सव (19 फेब्रुवारी)";

  const headerOrg = document.getElementById("headerOrgName");
  const headerBadge = document.getElementById("headerEventBadge");
  const receiptTitle = document.getElementById("receiptOrgTitle");
  const receiptSubtitle = document.getElementById("receiptEventSubtitle");

  if (headerOrg) headerOrg.innerText = orgName;
  if (headerBadge) headerBadge.innerText = badge;
  if (receiptTitle) receiptTitle.innerText = orgName;
  if (receiptSubtitle) receiptSubtitle.innerText = subtitle;

  const prevDateEl = document.getElementById("prevDate");
  if (prevDateEl) {
    const now = new Date();
    const dStr = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
    const tStr = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
    prevDateEl.innerText = `${dStr} | ${tStr}`;
  }
}

function loadVolunteers() {
  const stored = localStorage.getItem("utsav_volunteers");
  const deletedVols = getDeletedVolunteers();

  if (stored !== null) {
    try {
      volunteers = JSON.parse(stored);
      if (!Array.isArray(volunteers)) volunteers = [];
      // Clean out deleted volunteers and old dummy demo entries
      volunteers = volunteers.filter(v =>
        v &&
        v.id !== "vol-1" &&
        v.id !== "vol-2" &&
        v.id !== "vol-3" &&
        !v.name.includes("रोहित पाटील") &&
        !v.name.includes("अनिकेत शिंदे") &&
        !v.name.includes("स्वप्नील गायकवाड") &&
        !deletedVols.includes(v.id)
      );
    } catch (e) {
      volunteers = [];
    }
  } else {
    volunteers = [];
  }

  // If no volunteers remain or empty, default to the user's authentic volunteer: शिरसाठ सचिन (unless explicitly deleted)
  if (volunteers.length === 0 && !deletedVols.includes("vol-sachin")) {
    volunteers = [
      { id: "vol-sachin", name: "शिरसाठ सचिन", phone: "9822000000", area: "मुख्य कमिटी" }
    ];
  }

  localStorage.setItem("utsav_volunteers", JSON.stringify(volunteers));
  populateVolunteerDropdown();
  renderAdminVolunteersTable();
  renderPublicVolunteers();
}

function saveVolunteers(volToSync = null) {
  localStorage.setItem("utsav_volunteers", JSON.stringify(volunteers));
  populateVolunteerDropdown();
  renderAdminVolunteersTable();
  renderPublicVolunteers();

  // Cloud sync to Supabase if connected
  if (supabaseClient) {
    if (volToSync) {
      syncVolunteerToSupabase(volToSync);
    } else {
      volunteers.forEach(v => syncVolunteerToSupabase(v));
    }
  }
}

async function syncVolunteerToSupabase(vol) {
  if (!supabaseClient || !vol) return false;
  try {
    const { error } = await supabaseClient.from("volunteers_simple").upsert({
      id: vol.id,
      full_name: vol.name,
      phone: vol.phone || "",
      area: vol.area || "",
      photo_url: vol.photoUrl || "",
      is_active: true
    }, { onConflict: "id" });
    if (error) {
      console.warn("Supabase volunteer sync note:", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("Supabase volunteer sync exception:", e);
    return false;
  }
}

function renderPublicVolunteers() {
  const container = document.getElementById("publicVolunteerGrid");
  const countBadge = document.getElementById("publicVolTotalCount");
  if (!container) return;

  if (countBadge) {
    countBadge.innerText = `${volunteers.length} अधिकृत कार्यकर्ते`;
  }

  container.innerHTML = "";

  if (volunteers.length === 0) {
    container.innerHTML = `<div class="col-span-full text-center py-6 text-slate-400 text-xs">कोणतीही कार्यकर्ता माहिती उपलब्ध नाही. ऍडमिन पॅनेलमधून जोडा.</div>`;
    return;
  }

  volunteers.forEach(v => {
    // Total collection and count by this volunteer
    const volCollections = collections.filter(c => c.volunteer === v.name && (c.status === "RECEIVED" || c.status === "PENDING_VERIFY"));
    const totalAmount = volCollections.reduce((sum, c) => sum + c.amount, 0);
    const receiptCount = volCollections.length;

    const photoHtml = v.photoUrl 
      ? `<img src="${escapeHtml(v.photoUrl)}" alt="${escapeHtml(v.name)}" class="w-9 h-9 rounded-full object-cover border-2 border-orange-400 shadow-xs">`
      : `<div class="w-9 h-9 rounded-full bg-gradient-to-br from-bhagwa-500 to-amber-600 text-white font-bold flex items-center justify-center text-xs shadow-xs border border-orange-300">${escapeHtml(v.name.charAt(0))}</div>`;

    const card = document.createElement("div");
    card.className = "bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs hover:border-orange-300 transition flex flex-col justify-between";
    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-1 mb-1.5">
          <div class="flex items-center gap-2.5">
            ${photoHtml}
            <div>
              <h4 class="text-xs font-bold text-slate-800 leading-tight">${escapeHtml(v.name)}</h4>
              <p class="text-[10px] text-slate-400">${escapeHtml(v.area || "सोसायटी परिसर")}</p>
            </div>
          </div>
          <span class="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
            ${receiptCount} पावत्या
          </span>
        </div>

        <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <a href="tel:${escapeHtml(v.phone)}" class="text-[11px] font-mono font-semibold text-slate-600 hover:text-bhagwa-700 flex items-center gap-1">
            <i data-lucide="phone" class="w-3 h-3 text-slate-400"></i> ${escapeHtml(v.phone)}
          </a>
          <span class="font-extrabold text-emerald-700">₹${totalAmount.toLocaleString("en-IN")}</span>
        </div>
      </div>
    `;
    container.appendChild(card);
  });

  lucide.createIcons();
}

function populateVolunteerDropdown() {
  const select = document.getElementById("volunteerSelect");
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = "";

  if (volunteers.length === 0) {
    select.innerHTML = `<option value="अधिकृत कार्यकर्ता">अधिकृत कार्यकर्ता</option>`;
    return;
  }

  volunteers.forEach(v => {
    const opt = document.createElement("option");
    opt.value = v.name;
    opt.innerText = `${v.name} (${v.area || v.phone})`;
    select.appendChild(opt);
  });

  if (currentVal) select.value = currentVal;
}
// -----------------------------------------------------------------------------
// DELETED RECORDS REGISTRY (Tombstone tracker to prevent re-appearance on refresh)
// -----------------------------------------------------------------------------
function getDeletedReceipts() {
  try {
    const raw = localStorage.getItem("utsav_deleted_receipts");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function markReceiptAsDeleted(receiptNo, id = null) {
  const list = getDeletedReceipts();
  if (id && !list.includes(id)) list.push(id);
  localStorage.setItem("utsav_deleted_receipts", JSON.stringify(list));
}

function unmarkReceiptAsDeleted(receiptNo, id = null) {
  let list = getDeletedReceipts();
  list = list.filter(item => item !== receiptNo && item !== id);
  localStorage.setItem("utsav_deleted_receipts", JSON.stringify(list));
}

function getDeletedExpenses() {
  try {
    const raw = localStorage.getItem("utsav_deleted_expenses");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function markExpenseAsDeleted(id) {
  const list = getDeletedExpenses();
  if (id && !list.includes(id)) list.push(id);
  localStorage.setItem("utsav_deleted_expenses", JSON.stringify(list));
}

function unmarkExpenseAsDeleted(id) {
  if (!id) return;
  let list = getDeletedExpenses();
  list = list.filter(item => item !== id);
  localStorage.setItem("utsav_deleted_expenses", JSON.stringify(list));
}

function getDeletedVolunteers() {
  try {
    const raw = localStorage.getItem("utsav_deleted_volunteers");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function markVolunteerAsDeleted(id) {
  const list = getDeletedVolunteers();
  if (id && !list.includes(id)) list.push(id);
  localStorage.setItem("utsav_deleted_volunteers", JSON.stringify(list));
}

function unmarkVolunteerAsDeleted(id) {
  if (!id) return;
  let list = getDeletedVolunteers();
  list = list.filter(item => item !== id);
  localStorage.setItem("utsav_deleted_volunteers", JSON.stringify(list));
}

function loadStoredData() {
  const storedCollections = localStorage.getItem("utsav_collections");
  const storedExpenses = localStorage.getItem("utsav_expenses");
  const deletedReceipts = getDeletedReceipts();
  const deletedExpenses = getDeletedExpenses();

  if (storedCollections !== null) {
    try {
      collections = JSON.parse(storedCollections);
      if (!Array.isArray(collections)) collections = [];
      // Clean out deleted records by unique ID
      collections = collections.filter(c => 
        c && 
        c.id &&
        !deletedReceipts.includes(c.id)
      );
    } catch (e) {
      collections = [];
    }
  } else {
    collections = [];
  }

  if (storedExpenses !== null) {
    try {
      expenses = JSON.parse(storedExpenses);
      if (!Array.isArray(expenses)) expenses = [];
      expenses = expenses.filter(e => 
        e && 
        e.id &&
        !deletedExpenses.includes(e.id)
      );
    } catch (e) {
      expenses = [];
    }
  } else {
    expenses = [];
  }
}

function saveCollections(recordToSync = null) {
  localStorage.setItem("utsav_collections", JSON.stringify(collections));
  updateLiveStats();
  renderCollectionsTable();
  // Auto-sync latest entry to Supabase if connected
  if (supabaseClient && collections.length > 0) {
    const toSync = recordToSync || collections[0];
    syncCollectionToSupabase(toSync);
  }
}

function saveExpenses(recordToSync = null) {
  try {
    localStorage.setItem("utsav_expenses", JSON.stringify(expenses));
  } catch (err) {
    console.warn("⚠️ localStorage quota reached for expenses, compressing:", err);
    // Fallback: save without heavy base64 images if storage is restricted
    try {
      const lightweightExpenses = expenses.map(e => ({
        ...e,
        billUrl: (e.billUrl && e.billUrl.length > 50000) ? "" : e.billUrl
      }));
      localStorage.setItem("utsav_expenses", JSON.stringify(lightweightExpenses));
    } catch (e2) {
      console.error("Critical localStorage quota exceeded:", e2);
    }
  }
  updateLiveStats();
  renderExpensesTable();
  // Auto-sync latest entry to Supabase if connected
  if (supabaseClient && expenses.length > 0) {
    const toSync = recordToSync || expenses[0];
    syncExpenseToSupabase(toSync);
  }
}

// -----------------------------------------------------------------------------
// 2. TAB SWITCHING LOGIC
// -----------------------------------------------------------------------------
function switchTab(tabName) {
  document.querySelectorAll(".tab-view").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".tab-btn").forEach(el => {
    el.classList.remove("border-white", "text-white");
    el.classList.add("border-transparent", "text-orange-200");
  });

  const activeView = document.getElementById(`view-${tabName}`);
  const activeTabBtn = document.getElementById(`tab-${tabName}`);

  if (activeView) activeView.classList.remove("hidden");
  if (activeTabBtn) {
    activeTabBtn.classList.remove("border-transparent", "text-orange-200");
    activeTabBtn.classList.add("border-white", "text-white");
  }

  if (tabName === "expenses") {
    const expDate = document.getElementById("expenseDate");
    if (expDate && !expDate.value) {
      expDate.value = new Date().toISOString().split("T")[0];
    }
    renderExpensesTable();
  }

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// 3. DONATION SUBMIT & RECEIPT GENERATOR
// -----------------------------------------------------------------------------
async function updateNextReceiptNumber() {
  let maxNum = 0;
  collections.forEach(c => {
    if (c.receiptNo) {
      const match = c.receiptNo.match(/(\d+)$/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
  });

  // Check Supabase Cloud sequence or highest receipt_no so multi-devices don't collide
  if (supabaseClient) {
    try {
      const { data, error } = await supabaseClient
        .from("collections_simple")
        .select("receipt_no")
        .order("receipt_no", { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        const cloudMatch = data[0].receipt_no.match(/(\d+)$/);
        if (cloudMatch) {
          const cloudNum = parseInt(cloudMatch[1], 10);
          if (cloudNum > maxNum) maxNum = cloudNum;
        }
      }
    } catch (e) {
      console.warn("Cloud receipt sequence check note:", e);
    }
  }

  const nextNum = maxNum + 1;
  currentReceiptNumber = `SJ-2027-${String(nextNum).padStart(4, "0")}`;
  const el = document.getElementById("autoReceiptNo");
  if (el) el.innerText = `Receipt: ${currentReceiptNumber}`;
}

function setPaymentMode(mode) {
  document.getElementById("paymentMode").value = mode;

  // Visual button active states
  const btnCash = document.getElementById("btn-mode-cash");
  const btnUpi = document.getElementById("btn-mode-upi");
  const btnPledge = document.getElementById("btn-mode-pledge");
  const upiSection = document.getElementById("upiSection");

  [btnCash, btnUpi, btnPledge].forEach(btn => {
    if (btn) {
      btn.className = "py-2 px-1 text-xs font-bold rounded-lg border-2 border-slate-200 bg-white text-slate-700 transition text-center shadow-xs";
    }
  });

  if (mode === "CASH") {
    btnCash.className = "py-2 px-1 text-xs font-bold rounded-lg border-2 border-bhagwa-600 bg-orange-50 text-bhagwa-800 transition text-center shadow-xs";
    if (upiSection) upiSection.classList.add("hidden");
  } else if (mode === "UPI") {
    btnUpi.className = "py-2 px-1 text-xs font-bold rounded-lg border-2 border-amber-500 bg-amber-100 text-amber-900 transition text-center shadow-sm";
    if (upiSection) {
      upiSection.classList.remove("hidden");
      const amount = document.getElementById("donationAmount")?.value || "500";
      generateLiveUpiQr(amount);
    }
  } else if (mode === "PLEDGE") {
    btnPledge.className = "py-2 px-1 text-xs font-bold rounded-lg border-2 border-slate-700 bg-slate-100 text-slate-900 transition text-center shadow-xs";
    if (upiSection) upiSection.classList.add("hidden");
  }
}

function togglePaymentMode() {
  const mode = document.getElementById("paymentMode")?.value || "CASH";
  setPaymentMode(mode);
}

function setQuickDonationAmt(amount) {
  const input = document.getElementById("donationAmount");
  if (input) {
    input.value = amount;
    const mode = document.getElementById("paymentMode")?.value;
    if (mode === "UPI") {
      generateLiveUpiQr(amount);
    }
  }
}

function renderQrSafely(container, text, size = 120) {
  if (!container) return;
  container.innerHTML = "";

  if (typeof QRCode !== "undefined") {
    try {
      new QRCode(container, {
        text: text,
        width: size,
        height: size,
        colorDark: "#1e293b",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
      });
      return;
    } catch (e) {
      console.warn("QRCode canvas error:", e);
    }
  }

  // Safe offline fallback: Never leak UPI IDs or financial parameters to third-party servers
  container.innerHTML = `<div class="p-3 text-center text-[10px] text-amber-900 font-semibold border border-amber-300 rounded-lg bg-amber-50">QR कोड लोड होत आहे... कृपया क्षणभर थांबा किंवा रिफ्रेश करा.</div>`;
}

// Helper: NPCI compliant Clean ASCII Payee Name (prevents scanner crashes)
function getCleanUpiPayeeName() {
  const rawName = localStorage.getItem("utsav_upi_name") || "Shivaji Raje Sanghatana";
  // Strip non-ASCII characters to prevent NPCI barcode scanner parsing errors
  const asciiOnly = rawName.replace(/[^\x20-\x7E]/g, "").trim();
  return asciiOnly.length >= 3 ? asciiOnly : "Shivaji Raje Sanghatana";
}

// Helper: Standard NPCI UPI Intent Builder (Spec v1.6)
function buildStandardUpiUrl(amount) {
  const upiId = (localStorage.getItem("utsav_upi_id") || "shivajiraje@upi").trim();
  const cleanName = encodeURIComponent(getCleanUpiPayeeName());

  let url = `upi://pay?pa=${upiId}&pn=${cleanName}&cu=INR&tn=ShivJayanti2027`;

  if (amount) {
    const num = parseFloat(amount);
    if (!isNaN(num) && num > 0) {
      // NPCI standard recommends 2 decimal format (e.g. 500.00)
      url += `&am=${num.toFixed(2)}`;
    }
  }
  return url;
}

function checkUpiIdStatus() {
  const currentId = (localStorage.getItem("utsav_upi_id") || "shivajiraje@upi").trim();
  return {
    isDummy: currentId === "shivajiraje@upi" || currentId === "",
    upiId: currentId
  };
}

function generateLiveUpiQr(amount) {
  const upiQrContainer = document.getElementById("liveUpiQr");
  if (!upiQrContainer) return;

  const { isDummy, upiId } = checkUpiIdStatus();
  const upiName = localStorage.getItem("utsav_upi_name") || "शिवाजी राजे संघटना";

  // Update locked account display
  const displayId = document.getElementById("displayLockedUpiId");
  const displayName = document.getElementById("displayLockedUpiName");
  if (displayId) {
    displayId.innerText = upiId;
    if (isDummy) {
      displayId.innerHTML = `<span class="text-rose-600 font-bold">${upiId} (डमी आयडी - बदलणे आवश्यक)</span>`;
    }
  }
  if (displayName) displayName.innerText = upiName;

  const upiUrl = buildStandardUpiUrl(amount);
  renderQrSafely(upiQrContainer, upiUrl, 130);
}

// -----------------------------------------------------------------------------
// DIRECT ONLINE DONATION MODAL LOGIC (HEADER ONLINE QR BUTTON)
// -----------------------------------------------------------------------------
let currentDirectAmount = 501;

function openDirectUpiModal() {
  const orgName = localStorage.getItem("utsav_org_name") || "शिवाजी राजे संघटना";
  const { isDummy, upiId } = checkUpiIdStatus();

  document.getElementById("directModalOrgName").innerText = orgName;
  const idEl = document.getElementById("directModalUpiId");
  if (idEl) {
    idEl.innerText = upiId;
    if (isDummy) {
      idEl.innerHTML = `<span class="text-rose-600 font-bold">${upiId} (डमी आयडी)</span>`;
    }
  }

  setDirectUpiAmount(currentDirectAmount);

  document.getElementById("directUpiModal").classList.remove("hidden");
  lucide.createIcons();
}

function closeDirectUpiModal() {
  document.getElementById("directUpiModal").classList.add("hidden");
}

function setDirectUpiAmount(amount) {
  currentDirectAmount = amount;
  const upiUrl = buildStandardUpiUrl(amount);

  document.getElementById("directModalAmountDisplay").innerText = `स्कॅन करा: ₹${amount.toLocaleString("en-IN")}.00`;

  // Highlight selected chip
  document.querySelectorAll(".amt-chip").forEach(btn => {
    if (btn.innerText.includes(amount.toString()) || (amount === 1100 && btn.innerText.includes("1,100")) || (amount === 2100 && btn.innerText.includes("2,100"))) {
      btn.className = "amt-chip px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-bhagwa-600 bg-orange-100 text-bhagwa-800 shadow-xs";
    } else {
      btn.className = "amt-chip px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 hover:border-bhagwa-500 bg-slate-50 text-slate-700";
    }
  });

  const box = document.getElementById("directModalQrBox");
  renderQrSafely(box, upiUrl, 160);
}

function handleDirectCustomAmt(val) {
  const amt = parseFloat(val);
  if (!isNaN(amt) && amt > 0) {
    currentDirectAmount = amt;
    const upiUrl = buildStandardUpiUrl(amt);
    const displayEl = document.getElementById("directModalAmountDisplay");
    if (displayEl) {
      displayEl.innerText = `स्कॅन करा: ₹${amt.toLocaleString("en-IN")}.00`;
    }
    // Deselect preset chips
    document.querySelectorAll(".amt-chip").forEach(btn => {
      btn.className = "amt-chip px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 hover:border-bhagwa-500 bg-slate-50 text-slate-700";
    });
    const box = document.getElementById("directModalQrBox");
    renderQrSafely(box, upiUrl, 160);
  }
}

function setDirectUpiOpenAmount() {
  // Amount is null -> generates open/flexible UPI intent without &am= parameter
  const upiUrl = buildStandardUpiUrl(null);

  document.getElementById("directModalAmountDisplay").innerText = "स्कॅन करून PhonePe/GPay वर स्वतः हवी ती रक्कम टाका (Any Amount)";

  document.querySelectorAll(".amt-chip").forEach(btn => {
    btn.className = "amt-chip px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 hover:border-bhagwa-500 bg-slate-50 text-slate-700";
  });
  const openBtn = document.getElementById("btn-chip-open");
  if (openBtn) {
    openBtn.className = "amt-chip px-2.5 py-1 text-xs font-bold rounded-lg border-2 border-bhagwa-600 bg-orange-100 text-bhagwa-800 shadow-xs";
  }

  const customInput = document.getElementById("directCustomAmtInput");
  if (customInput) customInput.value = "";

  const box = document.getElementById("directModalQrBox");
  renderQrSafely(box, upiUrl, 160);
}

function copyUpiId() {
  const upiId = localStorage.getItem("utsav_upi_id") || "shivajiraje@upi";
  navigator.clipboard.writeText(upiId).then(() => {
    alert(`✓ UPI ID कॉपी झाला: ${upiId}\nPhonePe किंवा Google Pay मध्ये पेस्ट करून थेट पेमेंट करू शकता.`);
  }).catch(() => {
    prompt("UPI ID कॉपी करा:", upiId);
  });
}

// Helper: Detect fake/random UTR patterns (e.g. 111111111111, 123456789012, 000000000000)
function isSuspiciousUtr(utr) {
  if (!utr || utr.length !== 12) return true;
  // All identical digits (e.g. 999999999999, 111111111111)
  if (/^(\d)\1{11}$/.test(utr)) return true;
  // Obvious sequences
  if (utr === "123456789012" || utr === "012345678901" || utr === "987654321098") return true;
  // Starting with triple zeroes (NPCI UTRs start with year/julian date, not 000)
  if (utr.startsWith("0000")) return true;
  return false;
}

function validateUtrLive(val) {
  const clean = val.replace(/[^0-9]/g, "");
  const badge = document.getElementById("utrStatusBadge");
  const input = document.getElementById("transactionRef");
  if (!badge || !input) return;

  input.value = clean;

  if (clean.length === 0) {
    badge.innerText = "0/12 अंक आवश्यक";
    badge.className = "text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300";
    input.className = "w-full text-xs px-3 py-2 border-2 border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-bhagwa-500 font-mono font-bold tracking-widest text-slate-900 bg-white shadow-inner";
    return;
  }

  if (clean.length < 12) {
    badge.innerText = `🟡 ${clean.length}/12 अंक`;
    badge.className = "text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300";
    input.className = "w-full text-xs px-3 py-2 border-2 border-amber-400 rounded-lg focus:outline-none focus:ring-2 focus:ring-bhagwa-500 font-mono font-bold tracking-widest text-slate-900 bg-white shadow-inner";
  } else {
    // Exactly 12 digits: Check fake patterns
    if (isSuspiciousUtr(clean)) {
      badge.innerText = `🚨 बनावट/फेक UTR नमुना!`;
      badge.className = "text-[10px] font-mono font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-300";
      input.className = "w-full text-xs px-3 py-2 border-2 border-rose-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono font-bold tracking-widest text-rose-900 bg-rose-50";
      return;
    }

    // Check duplicate
    const duplicate = collections.find(c => c.transactionRef && c.transactionRef === clean);
    if (duplicate) {
      badge.innerText = `🚨 डुप्लिकेट UTR!`;
      badge.className = "text-[10px] font-mono font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full border border-rose-300";
      input.className = "w-full text-xs px-3 py-2 border-2 border-rose-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-rose-500 font-mono font-bold tracking-widest text-rose-900 bg-rose-50";
    } else {
      badge.innerText = `✓ 12-अंकी वैध UTR`;
      badge.className = "text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full border border-emerald-300";
      input.className = "w-full text-xs px-3 py-2 border-2 border-emerald-500 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono font-bold tracking-widest text-emerald-900 bg-emerald-50/40";
    }
  }
}

async function handleDonationSubmit(e) {
  e.preventDefault();

  const donorName = document.getElementById("donorName").value.trim();
  const phone = document.getElementById("donorPhone").value.trim();
  const society = document.getElementById("donorSociety").value.trim();
  const wing = document.getElementById("donorWing").value;
  const flat = document.getElementById("donorFlat").value.trim();
  const amount = parseFloat(document.getElementById("donationAmount").value);
  const mode = document.getElementById("paymentMode").value;
  const volunteer = document.getElementById("volunteerSelect") ? document.getElementById("volunteerSelect").value : "कार्यकर्ता";

  // Strict Donation Amount Validation
  if (isNaN(amount) || amount <= 0) {
    alert("⚠️ कृपया वैध वर्गणी रक्कम टाका (किमान ₹1)!");
    document.getElementById("donationAmount").focus();
    return;
  }
  if (amount > 10000000) {
    alert("⚠️ वर्गणी रक्कम मर्यादेपेक्षा जास्त आहे (कमाल ₹1 कोटी)!");
    document.getElementById("donationAmount").focus();
    return;
  }
  
  const now = new Date();
  // Accurate IST Date (solves UTC date mismatch before 05:30 AM IST)
  const todayIso = getLocalDateIso(now);
  const dateFormatted = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  const nowTime = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  const fullDateTime = `${dateFormatted} | ${nowTime}`;

  let transactionRef = "";

  // STRICT PAYMENT SUCCESS GATE FOR ONLINE UPI
  if (mode === "UPI") {
    transactionRef = document.getElementById("transactionRef").value.trim().replace(/[^0-9]/g, "");

    if (!transactionRef) {
      alert("⚠️ पेमेंट यशस्वी झाल्याशिवाय पावती जनरेट होणार नाही!\n\nकृपया डोनरच्या PhonePe/GooglePay वर पेमेंट सक्सेस झाल्यावर आलेला 12-अंकी UTR नंबर खाली टाका.");
      document.getElementById("transactionRef").focus();
      return;
    }

    if (transactionRef.length !== 12) {
      alert(`⚠️ अवैध UTR नंबर (${transactionRef.length}/12 अंक)!\n\nबँकेचा UTR नंबर नेमका 12 अंकी असतो (उदा. 429182736152). कृपया डोनरच्या फोनपे/गुगलपे स्क्रीनवर पुन्हा तपासा.`);
      document.getElementById("transactionRef").focus();
      return;
    }

    // Check suspicious/random patterns (e.g. 111111111111, 123456789012, 000000000000)
    if (isSuspiciousUtr(transactionRef)) {
      alert(`🚨 बनावट UTR अलर्ट (Fake Pattern Detected):\n\nहा UTR नंबर (${transactionRef}) अवैध वाटतो (उदा. सलग आकडे किंवा डमी पॅटर्न).\n\nकृपया डोनरच्या PhonePe/GooglePay वरील मूळ 12-अंकी बँक UTR तपासून प्रविष्ट करा.`);
      document.getElementById("transactionRef").focus();
      return;
    }

    // 1. Local Duplicate UTR check
    const duplicate = collections.find(c => c.transactionRef && c.transactionRef === transactionRef && c.status !== "CANCELLED");
    if (duplicate) {
      alert(`🚨 फसवणूक अलर्ट (Duplicate Payment Detected):\n\nहा UTR नंबर (${transactionRef}) आधीच पावती क्र. ${duplicate.receiptNo} (${duplicate.donorName}) साठी वापरला गेला आहे!\n\nएकाच पेमेंटवर दोन पावत्या बनवता येणार नाहीत.`);
      document.getElementById("transactionRef").focus();
      return;
    }

    // 2. Real-Time Cloud Duplicate UTR check (prevents cross-device simultaneous UTR reuse)
    if (supabaseClient) {
      try {
        const { data: cloudUtr, error: cUtrErr } = await supabaseClient
          .from("collections_simple")
          .select("receipt_no, donor_name, payment_status")
          .eq("utr_number", transactionRef)
          .neq("payment_status", "CANCELLED")
          .limit(1);

        if (!cUtrErr && cloudUtr && cloudUtr.length > 0) {
          alert(`🚨 फसवणूक अलर्ट (Cloud Duplicate UTR Detected):\n\nहा UTR नंबर (${transactionRef}) दुसऱ्या मोबाईलवरून पावती क्र. ${cloudUtr[0].receipt_no} (${cloudUtr[0].donor_name}) साठी आधीच वापरला गेला आहे!\n\nकृपया खरा UTR नंबर प्रविष्ट करा.`);
          document.getElementById("transactionRef").focus();
          return;
        }
      } catch (err) {
        console.warn("Cloud UTR check warning:", err);
      }
    }
  }

  // Duplicate Warning for Same Flat or Phone
  const duplicatePhoneOrFlat = collections.find(c => 
    c.status !== "CANCELLED" && 
    ((c.phone && phone && c.phone === phone) || (flat && c.flat && c.flat === flat && c.wing === wing && c.society === society))
  );

  if (duplicatePhoneOrFlat) {
    const cont = confirm(`⚠️ संभाव्य दुबार नोंद इशारा (Duplicate Warning):\n\nयापूर्वीच पावती क्र. ${duplicatePhoneOrFlat.receiptNo} वर ${duplicatePhoneOrFlat.donorName} (फ्लॅट: ${duplicatePhoneOrFlat.wing}-${duplicatePhoneOrFlat.flat}) यांच्याकडून ₹${duplicatePhoneOrFlat.amount} ची नोंद झाली आहे.\n\nतुम्हाला तरीही नवीन पावती बनवायची आहे का?`);
    if (!cont) return;
  }

  const isOptIn = document.getElementById("donorOptInCheck") ? document.getElementById("donorOptInCheck").checked : false;

  // Collision-free Receipt Number via atomic cloud sequence
  let finalReceiptNo = currentReceiptNumber;
  if (supabaseClient) {
    try {
      const { data: rpcNo, error: rpcErr } = await supabaseClient.rpc("get_next_receipt_number");
      if (!rpcErr && rpcNo) {
        finalReceiptNo = rpcNo;
      }
    } catch (re) {
      console.warn("RPC receipt sequence fallback:", re);
    }
  }

  const newRecord = {
    id: "col-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6),
    receiptNo: finalReceiptNo,
    donorName,
    phone,
    society,
    wing,
    flat,
    amount,
    mode,
    transactionRef: transactionRef,
    status: mode === "PLEDGE" ? "PLEDGED" : (mode === "UPI" ? "PENDING_VERIFY" : "RECEIVED"),
    volunteer,
    isPublicOptIn: isOptIn,
    date: todayIso,
    time: nowTime,
    dateTime: fullDateTime,
    createdAt: now.toISOString(),
    _isLocalOfflineOnly: !supabaseClient
  };

  // ONLY NOW: Add to collections register & persist
  unmarkReceiptAsDeleted(newRecord.receiptNo, newRecord.id);
  collections.unshift(newRecord);
  saveCollections(newRecord);
  updateNextReceiptNumber();

  // Update Live Preview Card
  document.getElementById("prevReceiptNo").innerText = newRecord.receiptNo;
  document.getElementById("prevDonorName").innerText = newRecord.donorName;
  document.getElementById("prevAddress").innerText = `${newRecord.wing}, ${newRecord.society} (फ्लॅट: ${newRecord.flat})`;
  document.getElementById("prevPaymentMode").innerText = `${newRecord.mode} (${newRecord.status})`;
  document.getElementById("prevAmount").innerText = `₹${newRecord.amount.toFixed(2)}`;
  document.getElementById("prevVolunteer").innerText = newRecord.volunteer;
  document.getElementById("prevDate").innerText = fullDateTime;

  // Show/Hide UTR on Receipt Card
  const utrRow = document.getElementById("prevUtrRow");
  const utrDisplay = document.getElementById("prevUtr");
  if (utrRow && utrDisplay) {
    if (newRecord.mode === "UPI" && newRecord.transactionRef) {
      utrDisplay.innerText = newRecord.transactionRef;
      utrRow.classList.remove("hidden");
    } else {
      utrRow.classList.add("hidden");
    }
  }

  // Generate Receipt Verification QR (Direct link to this application's verification view)
  const qrBox = document.getElementById("receiptQr");
  qrBox.innerHTML = "";
  const currentBaseUrl = window.location.origin + window.location.pathname;
  const directVerifyUrl = `${currentBaseUrl}?receipt=${encodeURIComponent(newRecord.receiptNo)}`;
  new QRCode(qrBox, {
    text: directVerifyUrl,
    width: 52,
    height: 52,
    colorDark: "#1e293b",
    colorLight: "#ffffff"
  });

  // Auto Send WhatsApp PDF Receipt if checked
  const shouldSendWhatsApp = document.getElementById("autoWhatsAppCheck")?.checked;
  if (shouldSendWhatsApp && newRecord.phone) {
    shareReceiptPdfOnWhatsApp(newRecord);
  } else {
    alert(`✓ पावती क्र. ${newRecord.receiptNo} यशस्वीरीत्या तयार झाली आणि रजिस्टरमध्ये जोडली!\nरक्कम: ₹${newRecord.amount}\nपेमेंट: ${newRecord.mode} ${newRecord.transactionRef ? '(UTR: ' + newRecord.transactionRef + ')' : ''}`);
  }

  document.getElementById("donationForm").reset();
  const txRef = document.getElementById("transactionRef");
  if (txRef) txRef.value = "";
  const utrBadge = document.getElementById("utrStatusBadge");
  if (utrBadge) {
    utrBadge.innerText = "0/12 अंक आवश्यक";
    utrBadge.className = "text-[10px] font-mono font-bold bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full border border-amber-300";
  }
  setPaymentMode("CASH");
  updateNextReceiptNumber();
}

function copyOnlyReceiptLink() {
  const receiptNo = document.getElementById("prevReceiptNo")?.innerText || "SJ-2027-0001";
  let baseUrl = localStorage.getItem("utsav_live_url");
  if (!baseUrl || baseUrl.trim() === "") {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      baseUrl = window.location.href.split("?")[0];
    } else {
      baseUrl = "https://utsav-ledger.vercel.app";
    }
  }
  baseUrl = baseUrl.replace(/\/+$/, "");
  const directLink = `${baseUrl}?receipt=${receiptNo}&download=pdf`;

  navigator.clipboard.writeText(directLink).then(() => {
    alert(`✓ थेट PDF पावती लिंक क्लिपबोर्डवर कॉपी झाली!\n${directLink}`);
  }).catch(() => {
    prompt("पावती लिंक कॉपी करा:", directLink);
  });
}

// -----------------------------------------------------------------------------
// PDF DOCUMENT GENERATION & WHATSAPP PDF SHARING
// -----------------------------------------------------------------------------

// Helper to generate a genuine PDF Blob using html2pdf
async function generateReceiptPdfBlob(item) {
  if (typeof html2pdf === "undefined") return null;

  populateStandaloneReceiptCard(item);

  const card = document.getElementById("standaloneReceiptCard");
  const view = document.getElementById("standaloneReceiptView");
  if (!card || !view) return null;

  const wasViewHidden = view.classList.contains("hidden");
  const wasCardHidden = card.classList.contains("hidden");

  if (wasViewHidden || wasCardHidden) {
    view.style.position = "fixed";
    view.style.left = "-9999px";
    view.style.top = "0";
    view.style.width = "800px";
    view.classList.remove("hidden");
    card.classList.remove("hidden");
  }

  const opt = {
    margin: [6, 6, 6, 6],
    filename: `पावती-${item.receiptNo}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    const pdfBlob = await html2pdf().set(opt).from(card).outputPdf('blob');
    return pdfBlob;
  } finally {
    if (wasViewHidden || wasCardHidden) {
      view.style.position = "";
      view.style.left = "";
      view.style.top = "";
      view.style.width = "";
      if (wasViewHidden) view.classList.add("hidden");
      if (wasCardHidden) card.classList.add("hidden");
    }
  }
}

// Download Active Receipt as clean .pdf file
async function downloadActiveReceiptPdf(item = null) {
  if (!item) {
    const currentReceiptNo = document.getElementById("prevReceiptNo")?.innerText?.trim();
    if (currentReceiptNo) {
      item = collections.find(c => c.receiptNo && c.receiptNo.toUpperCase() === currentReceiptNo.toUpperCase());
    }
    if (!item && collections.length > 0) {
      item = collections[0];
    }
  }

  if (!item) {
    alert("⚠️ अद्याप कोणतीही पावती तयार झालेली नाही!");
    return;
  }

  if (typeof html2pdf === "undefined") {
    window.print();
    return;
  }

  populateStandaloneReceiptCard(item);

  const card = document.getElementById("standaloneReceiptCard");
  const view = document.getElementById("standaloneReceiptView");
  if (!card || !view) return;

  const wasViewHidden = view.classList.contains("hidden");
  const wasCardHidden = card.classList.contains("hidden");

  if (wasViewHidden || wasCardHidden) {
    view.style.position = "fixed";
    view.style.left = "-9999px";
    view.style.top = "0";
    view.style.width = "800px";
    view.classList.remove("hidden");
    card.classList.remove("hidden");
  }

  const opt = {
    margin: [6, 6, 6, 6],
    filename: `पावती-${item.receiptNo}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, logging: false },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  try {
    await html2pdf().set(opt).from(card).save();
  } catch (err) {
    console.warn("html2pdf save error, fallback to print:", err);
    window.print();
  } finally {
    if (wasViewHidden || wasCardHidden) {
      view.style.position = "";
      view.style.left = "";
      view.style.top = "";
      view.style.width = "";
      if (wasViewHidden) view.classList.add("hidden");
      if (wasCardHidden) card.classList.add("hidden");
    }
  }
}

// Clean & normalize Indian phone numbers to international 91 format for WhatsApp
function getCleanWhatsAppPhone(rawPhone) {
  if (!rawPhone) return "";
  let digits = rawPhone.toString().replace(/[^0-9]/g, "");
  // Strip leading zeroes (e.g. 09822..., 0091...)
  digits = digits.replace(/^0+/, "");
  // If 10 digits (standard Indian mobile number), prepend 91
  if (digits.length === 10) {
    digits = "91" + digits;
  }
  return digits;
}

// Share receipt directly to WhatsApp with donor's phone number fetched automatically (PC/Laptop + Mobile)
function shareReceiptPdfOnWhatsApp(item = null) {
  // 1. Resolve item from parameter or active receipt preview
  if (!item) {
    const docReceiptNo = document.getElementById("receiptDocNo")?.innerText?.trim();
    const prevReceiptNo = document.getElementById("prevReceiptNo")?.innerText?.trim();
    const searchNo = docReceiptNo || prevReceiptNo;

    if (searchNo) {
      item = collections.find(c => c.receiptNo && c.receiptNo.toUpperCase() === searchNo.toUpperCase());
    }
    if (!item && collections.length > 0) {
      item = collections[0];
    }
  }

  // Fallback: If not found in collections yet, resolve directly from current form inputs
  if (!item) {
    const fName = document.getElementById("donorName")?.value?.trim();
    const fPhone = document.getElementById("donorPhone")?.value?.trim();
    const fAmt = document.getElementById("donationAmount")?.value?.trim();
    if (fName && fPhone) {
      item = {
        receiptNo: currentReceiptNumber || "SJ-2027-0001",
        donorName: fName,
        phone: fPhone,
        society: document.getElementById("donorSociety")?.value || "",
        wing: document.getElementById("donorWing")?.value || "",
        flat: document.getElementById("donorFlat")?.value || "",
        amount: parseFloat(fAmt || "0"),
        mode: document.getElementById("paymentMode")?.value || "CASH",
        status: "RECEIVED",
        volunteer: document.getElementById("volunteerSelect")?.value || "शिरसाठ सचिन",
        date: new Date().toISOString().split("T")[0]
      };
    }
  }

  if (!item) {
    alert("⚠️ अद्याप कोणतीही पावती निवडलेली नाही!");
    return;
  }

  const rawPhone = item.phone || (document.getElementById("donorPhone") ? document.getElementById("donorPhone").value : "");
  const cleanPhone = getCleanWhatsAppPhone(rawPhone);

  if (!cleanPhone || cleanPhone.length < 10) {
    alert("⚠️ डोनरचा फोन नंबर उपलब्ध नाही किंवा चुकीचा आहे!\nकृपया पावतीमध्ये डोनरचा १०-अंकी वैध मोबाइल नंबर टाका.");
    return;
  }

  // Format the official receipt text with direct PDF download link
  const receiptMsg = formatWhatsAppReceipt(item);
  const encodedMsg = encodeURIComponent(receiptMsg);

  // Detect PC / Laptop vs Mobile phone (robust check supporting all mobile browsers & desktop mode)
  const ua = navigator.userAgent || "";
  const isTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isMobileUa = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(ua);
  const isSmallScreen = window.innerWidth <= 1024 || window.screen.width <= 1024;
  const isMobile = isMobileUa || (isTouchScreen && isSmallScreen);

  const nativeWhatsAppUri = `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;

  if (isMobile) {
    // ON MOBILE PHONES & TABLETS (Android & iOS):
    // Directly launch the operator's installed WhatsApp / WhatsApp Business app!
    // Never redirect to web.whatsapp.com or api.whatsapp.com on mobile.
    window.location.href = nativeWhatsAppUri;

    // Direct anchor click trigger for specialized Android mobile WebViews
    const link = document.createElement("a");
    link.href = nativeWhatsAppUri;
    document.body.appendChild(link);
    link.click();
    setTimeout(() => {
      try { document.body.removeChild(link); } catch (e) {}
    }, 500);
  } else {
    // ON PC / LAPTOP:
    // Open web.whatsapp.com directly in a new tab so chat loads automatically
    const webWhatsAppUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;
    const win = window.open(webWhatsAppUrl, "_blank");
    if (!win || win.closed || typeof win.closed === "undefined") {
      window.location.href = webWhatsAppUrl;
    }
  }
}

function shareWhatsApp() {
  shareReceiptPdfOnWhatsApp();
}

function sendWhatsAppReceipt(item) {
  shareReceiptPdfOnWhatsApp(item);
}

function formatReceiptDateTime(item) {
  if (!item) return "";
  if (item.dateTime) return item.dateTime;

  // Format date part nicely as DD-MM-YYYY if it's YYYY-MM-DD
  let dStr = item.date || "";
  if (dStr && /^\d{4}-\d{2}-\d{2}$/.test(dStr)) {
    const parts = dStr.split("-");
    dStr = `${parts[2]}-${parts[1]}-${parts[0]}`;
  }

  if (item.time) {
    return `${dStr} | ${item.time}`;
  }

  if (item.createdAt) {
    try {
      const d = new Date(item.createdAt);
      if (!isNaN(d.getTime())) {
        const formattedDate = d.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
        const formattedTime = d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
        return `${formattedDate} | ${formattedTime}`;
      }
    } catch (e) {}
  }

  if (dStr) return dStr;
  const now = new Date();
  const defDate = now.toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }).replace(/\//g, "-");
  const defTime = now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
  return `${defDate} | ${defTime}`;
}

function formatWhatsAppReceipt(item) {
  const orgName = localStorage.getItem("utsav_org_name") || "शिवाजी राजे संघटना";
  const eventSubtitle = localStorage.getItem("utsav_event_subtitle") || "छत्रपती शिवाजी महाराज जयंती महोत्सव (19 फेब्रुवारी)";

  let baseUrl = localStorage.getItem("utsav_live_url");
  if (!baseUrl || baseUrl.trim() === "") {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      baseUrl = window.location.href.split("?")[0];
    } else {
      baseUrl = "https://utsav-ledger.vercel.app";
    }
  }

  baseUrl = baseUrl.replace(/\/+$/, "");
  // Direct PDF download link
  const directReceiptLink = `${baseUrl}?receipt=${encodeURIComponent(item.receiptNo)}&amount=${item.amount}&download=pdf`;
  const displayDateTime = formatReceiptDateTime(item);

  return `🚩 *जय भवानी | जय शिवाजी* 🚩
=============================
🏛️ *${orgName.toUpperCase()}*
✨ *${eventSubtitle}*
=============================

सस्नेह नमस्कार श्री/श्रीमती *${item.donorName}*,
उत्सवासाठी आपली वर्गणी यशस्वीरीत्या जमा झाली असून अधिकृत पावती PDF स्वरूपात तयार आहे:

📄 *पावती क्र:* ${item.receiptNo}
📅 *दिनांक व वेळ:* ${displayDateTime}
🏠 *पत्ता:* ${item.wing || ''}, ${item.society || ''} ${item.flat ? '(फ्लॅट: ' + item.flat + ')' : ''}
💰 *रक्कम:* ₹${parseFloat(item.amount).toLocaleString("en-IN")}/- (${formatMarathiCurrencyWords(item.amount)})
💳 *मोड:* ${item.mode} (${item.status || 'RECEIVED'})${item.transactionRef ? `\n🔢 *बँक UTR क्र:* ${item.transactionRef}` : ''}
👤 *कार्यकर्ता:* ${item.volunteer || 'अधिकृत कमिटी'}

📥 *आपली अधिकृत A4 PDF पावती डाउनलोड करण्यासाठी खालील लिंकवर क्लिक करा:*

${directReceiptLink}

(टीप: वरील लिंकवर क्लिक करताच तुमची अधिकृत PDF पावती थेट उघडेल व आपोआप सेव्ह होईल)

आपल्या सहकार्याबद्दल मनःपूर्वक धन्यवाद! 🙏
|| जय भवानी | जय शिवाजी ||`;
}

function resendWhatsApp(id) {
  const item = collections.find(c => c.id === id);
  if (item) {
    shareReceiptPdfOnWhatsApp(item);
  }
}

// -----------------------------------------------------------------------------
// 5. PUBLIC DIGITAL RECEIPT DIRECT LINK VERIFICATION
// -----------------------------------------------------------------------------
// 5. STANDALONE DIGITAL RECEIPT VIEW (WHATSAPP DONOR LINK)
// When ?receipt=SJ-2027-XXXX is opened:
// Hides all management screens & displays only the clean official printable receipt
// -----------------------------------------------------------------------------

function formatMarathiCurrencyWords(num) {
  if (!num || isNaN(num) || num <= 0) return "शून्य रुपये फक्त";
  num = Math.floor(num);

  const units = [
    "", "एक", "दोन", "तीन", "चार", "पाच", "सहा", "सात", "आठ", "नऊ", "दहा",
    "अकरा", "बारा", "तेरा", "चौदा", "पंधरा", "सोळा", "सतरा", "अठरा", "एकोणीस", "वीस",
    "एकवीस", "बावीस", "तेवीस", "चोवीस", "पंचवीस", "सव्वीस", "सत्तावीस", "अठ्ठावीस", "एकोणतीस", "तीस",
    "एकतीस", "बत्तीस", "तेहेतीस", "चौतीस", "पस्तीस", "छत्तीस", "सदतीस", "अडतीस", "एकेचाळीस", "चाळीस",
    "एक्केचाळीस", "बेचाळीस", "त्रेचाळीस", "चव्वेचाळीस", "पंचेचाळीस", "शेचाळीस", "सत्तेचाळीस", "अठ्ठेचाळीस", "एकोणपन्नास", "पन्नास",
    "एक्कावन्न", "बावन्न", "त्रेपन्न", "चोपन्न", "पंचावन्न", "छप्पन्न", "सत्तावन्न", "अठ्ठावन्न", "एकोणसाठ", "साठ",
    "एकसष्ठ", "बासष्ठ", "त्रेसष्ठ", "चौसष्ठ", "पासष्ठ", "सहासष्ठ", "सदुसष्ठ", "अडुसष्ठ", "एकोणसत्तर", "सत्तर",
    "एकाहत्तर", "बाहत्तर", "त्र्याहत्तर", "चौऱ्याहत्तर", "पंच्याहत्तर", "शहात्तर", "सत्त्याहत्तर", "अठ्ठ्याहत्तर", "एकोणऐंशी", "ऐंशी",
    "एक्याऐंशी", "ब्याऐंशी", "त्र्याऐंशी", "चौऱ्याऐंशी", "पंच्याऐंशी", "शहाऐंशी", "सत्त्याऐंशी", "अठ्ठ्याऐंशी", "एकोणनव्वद", "नव्वद",
    "एक्याण्णव", "ब्याण्णव", "त्र्याण्णव", "चौऱ्याण्णव", "पंच्याण्णव", "शहाण्णव", "सत्त्याण्णव", "अठ्ठाण्णव", "नव्व्याण्णव"
  ];

  const hundreds = ["", "एकशे", "दोनशे", "तीनशे", "चारशे", "पाचशे", "सहाशे", "सातशे", "आठशे", "नऊशे"];

  let words = [];

  // Crores (कोटी)
  if (num >= 10000000) {
    const cr = Math.floor(num / 10000000);
    words.push((units[cr] || cr) + " कोटी");
    num %= 10000000;
  }
  // Lakhs (लाख)
  if (num >= 100000) {
    const lk = Math.floor(num / 100000);
    words.push((units[lk] || lk) + " लाख");
    num %= 100000;
  }
  // Thousands (हजार)
  if (num >= 1000) {
    const th = Math.floor(num / 1000);
    words.push((units[th] || th) + " हजार");
    num %= 1000;
  }
  // Hundreds (शे)
  if (num >= 100) {
    const h = Math.floor(num / 100);
    if (h === 1) words.push("एकशे");
    else words.push(hundreds[h] || (units[h] + " शे"));
    num %= 100;
  }
  // Remaining (1-99)
  if (num > 0) {
    words.push(units[num] || num);
  }

  return words.join(" ") + " रुपये फक्त";
}

function checkUrlForReceiptVerification() {
  try {
    const params = new URLSearchParams(window.location.search);
    const receiptQuery = params.get("receipt") || params.get("no");
    if (receiptQuery && receiptQuery.trim() !== "") {
      enterStandaloneReceiptMode(receiptQuery.trim());
    }
  } catch (err) {
    console.error("URL check error:", err);
  }
}

async function enterStandaloneReceiptMode(receiptNo) {
  // 1. Immediately hide main web app components
  const header = document.getElementById("appMainHeader");
  const summary = document.getElementById("appLiveSummarySection");
  const main = document.getElementById("appMainContainer");
  const footer = document.getElementById("appFooter");
  const pubModal = document.getElementById("publicReceiptModal");

  if (header) header.classList.add("hidden");
  if (summary) summary.classList.add("hidden");
  if (main) main.classList.add("hidden");
  if (footer) footer.classList.add("hidden");
  if (pubModal) pubModal.classList.add("hidden");

  // 2. Display the standalone receipt container
  const view = document.getElementById("standaloneReceiptView");
  const loading = document.getElementById("receiptDocLoading");
  const errorBox = document.getElementById("receiptDocError");
  const card = document.getElementById("standaloneReceiptCard");

  if (!view) return;
  view.classList.remove("hidden");
  if (loading) loading.classList.remove("hidden");
  if (errorBox) errorBox.classList.add("hidden");
  if (card) card.classList.add("hidden");

  // 3. Search for the receipt record in memory
  const cleanReceiptNo = receiptNo.trim().toUpperCase();
  let item = collections.find(c => c.receiptNo && c.receiptNo.toUpperCase() === cleanReceiptNo);

  // If not found in local collections (e.g. mobile donor opened link on fresh browser),
  // ensure Supabase is initialized and fetch directly from Supabase Cloud
  if (!item) {
    if (!supabaseClient) {
      initSupabaseFromStorage();
    }
    if (supabaseClient) {
      try {
        const { data, error } = await supabaseClient
          .from("collections_simple")
          .select("*")
          .ilike("receipt_no", cleanReceiptNo)
          .maybeSingle();

        if (data && !error) {
          let cTime = "";
          if (data.created_at) {
            try {
              cTime = new Date(data.created_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
            } catch (e) {}
          }
          item = {
            id: data.id,
            receiptNo: data.receipt_no,
            donorName: data.donor_name,
            phone: data.phone,
            society: data.society,
            wing: data.wing,
            flat: data.flat,
            amount: parseFloat(data.amount),
            mode: data.payment_mode,
            status: data.payment_status,
            volunteer: data.volunteer_name,
            transactionRef: data.utr_number || "",
            utr: data.utr_number || "",
            date: data.collected_date,
            time: cTime,
            createdAt: data.created_at
          };
          collections.unshift(item);
        }
      } catch (e) {
        console.warn("Supabase single receipt fetch warning:", e);
      }
    }
  }

  // 4. Render Receipt or Error (Security: Strictly reject forged URL parameters)
  if (loading) loading.classList.add("hidden");

  if (item) {
    populateStandaloneReceiptCard(item);
    if (card) card.classList.remove("hidden");

    // Check if auto-download requested via &download=pdf
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("download") === "pdf" || urlParams.get("pdf") === "true") {
      setTimeout(() => {
        downloadOrPrintPdfReceipt();
      }, 700);
    }
  } else {
    // Authentic validation: Show error for non-existent or cancelled receipts
    if (errorBox) {
      const errorText = document.getElementById("receiptDocErrorText");
      if (errorText) {
        errorText.innerText = `पावती क्रमांक "${receiptNo}" सापडला नाही किंवा ही पावती रद्द करण्यात आली आहे. कृपया अधिकृत पावती क्रमांक तपासा.`;
      }
      errorBox.classList.remove("hidden");
    }
  }

  lucide.createIcons();
}

function populateStandaloneReceiptCard(item) {
  const orgName = localStorage.getItem("utsav_org_name") || "शिवाजी राजे संघटना";
  const eventSubtitle = localStorage.getItem("utsav_event_subtitle") || "छत्रपती शिवाजी महाराज जयंती महोत्सव (19 फेब्रुवारी)";

  const orgEl = document.getElementById("receiptDocOrgName");
  const subEl = document.getElementById("receiptDocSubtitle");
  const noEl = document.getElementById("receiptDocNo");
  const dateEl = document.getElementById("receiptDocDate");
  const dateTimeEl = document.getElementById("receiptDocDateTime");
  const nameEl = document.getElementById("receiptDocDonorName");
  const phoneEl = document.getElementById("receiptDocPhone");
  const addrEl = document.getElementById("receiptDocAddress");
  const modeEl = document.getElementById("receiptDocMode");
  const utrRow = document.getElementById("receiptDocUtrRow");
  const utrEl = document.getElementById("receiptDocUtr");
  const volEl = document.getElementById("receiptDocVolunteer");
  const amtEl = document.getElementById("receiptDocAmount");
  const wordsEl = document.getElementById("receiptDocInWords");

  const fullDateTime = formatReceiptDateTime(item);

  if (orgEl) orgEl.innerText = orgName;
  if (subEl) subEl.innerText = eventSubtitle;
  if (noEl) noEl.innerText = item.receiptNo;
  if (dateEl) dateEl.innerText = fullDateTime;
  if (dateTimeEl) dateTimeEl.innerText = fullDateTime;
  if (nameEl) nameEl.innerText = item.donorName;
  if (phoneEl) {
    phoneEl.innerText = item.phone ? `+91 ${item.phone}` : "उपलब्ध नाही";
  }

  let addressText = [];
  if (item.wing) addressText.push(item.wing);
  if (item.society) addressText.push(item.society);
  if (item.flat) addressText.push(`(फ्लॅट: ${item.flat})`);
  if (addrEl) addrEl.innerText = addressText.join(", ") || "स्थानिक रहिवासी";

  if (modeEl) {
    modeEl.innerText = `${item.mode} (${item.status || 'RECEIVED'})`;
  }

  if (utrRow && utrEl) {
    const utr = item.transactionRef || item.utr;
    if (utr) {
      utrEl.innerText = utr;
      utrRow.classList.remove("hidden");
    } else {
      utrRow.classList.add("hidden");
    }
  }

  if (volEl) volEl.innerText = item.volunteer || "अधिकृत कमिटी";
  if (amtEl) amtEl.innerText = `₹${parseFloat(item.amount).toLocaleString("en-IN")}.00`;
  if (wordsEl) wordsEl.innerText = formatMarathiCurrencyWords(item.amount);

  // Generate QR Code for Receipt Card
  const qrBox = document.getElementById("receiptDocQrCode");
  if (qrBox) {
    qrBox.innerHTML = "";
    let baseUrl = localStorage.getItem("utsav_live_url");
    if (!baseUrl || baseUrl.trim() === "") {
      if (window.location.protocol === "http:" || window.location.protocol === "https:") {
        baseUrl = window.location.href.split("?")[0];
      } else {
        baseUrl = "https://utsav-ledger.vercel.app";
      }
    }
    baseUrl = baseUrl.replace(/\/+$/, "");
    const verifyUrl = `${baseUrl}?receipt=${item.receiptNo}`;

    new QRCode(qrBox, {
      text: verifyUrl,
      width: 72,
      height: 72,
      colorDark: "#1e293b",
      colorLight: "#ffffff"
    });
  }
}

async function downloadOrPrintPdfReceipt() {
  const card = document.getElementById("standaloneReceiptCard");
  const no = document.getElementById("receiptDocNo")?.innerText?.trim() || "SJ-2027";
  if (typeof html2pdf !== "undefined" && card) {
    const opt = {
      margin: [6, 6, 6, 6],
      filename: `पावती-${no}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };
    try {
      await html2pdf().set(opt).from(card).save();
      return;
    } catch (e) {
      console.warn("html2pdf save error, falling back to print:", e);
    }
  }
  window.print();
}

function exitReceiptViewToApp() {
  if (window.history && window.history.replaceState) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }

  const view = document.getElementById("standaloneReceiptView");
  if (view) view.classList.add("hidden");

  const header = document.getElementById("appMainHeader");
  const summary = document.getElementById("appLiveSummarySection");
  const main = document.getElementById("appMainContainer");
  const footer = document.getElementById("appFooter");

  if (header) header.classList.remove("hidden");
  if (summary) summary.classList.remove("hidden");
  if (main) main.classList.remove("hidden");
  if (footer) footer.classList.remove("hidden");

  switchTab("donation");
  lucide.createIcons();
}

function showPublicReceiptModal(receiptNo) {
  enterStandaloneReceiptMode(receiptNo);
}

function openStandaloneReceiptView(receiptNo) {
  enterStandaloneReceiptMode(receiptNo);
}

function closePublicReceiptModal() {
  exitReceiptViewToApp();
}

// -----------------------------------------------------------------------------
// 4. EXPENSE VOUCHER & BILL UPLOAD
// -----------------------------------------------------------------------------
let uploadedBillDataUrl = "";

function previewBillImage(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    const img = new Image();
    img.onload = function() {
      // Auto-compress and scale down mobile camera pictures to max 800px
      const canvas = document.createElement("canvas");
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);

      // 0.65 quality JPEG -> ~40-60KB (super lightweight, ultra safe)
      uploadedBillDataUrl = canvas.toDataURL("image/jpeg", 0.65);
      const previewImg = document.getElementById("billPreviewImg");
      if (previewImg) previewImg.src = uploadedBillDataUrl;
      const previewContainer = document.getElementById("billPreviewContainer");
      if (previewContainer) previewContainer.classList.remove("hidden");
    };
    img.onerror = function() {
      uploadedBillDataUrl = event.target.result;
      const previewImg = document.getElementById("billPreviewImg");
      if (previewImg) previewImg.src = uploadedBillDataUrl;
      const previewContainer = document.getElementById("billPreviewContainer");
      if (previewContainer) previewContainer.classList.remove("hidden");
    };
    img.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function handleExpenseSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  try {
    const categoryEl = document.getElementById("expenseCategory");
    const vendorEl = document.getElementById("expenseVendor");
    const amountEl = document.getElementById("expenseAmount");
    const dateEl = document.getElementById("expenseDate");
    const descEl = document.getElementById("expenseDesc");

    const category = categoryEl ? categoryEl.value : "Miscellaneous";
    const vendor = vendorEl ? vendorEl.value.trim() : "";
    const rawAmount = amountEl ? amountEl.value.trim() : "";
    const amount = parseFloat(rawAmount);
    const date = (dateEl && dateEl.value) ? dateEl.value : getLocalDateIso();
    const desc = descEl ? descEl.value.trim() : "";

    // User-friendly Marathi validations
    if (!vendor) {
      alert("⚠️ कृपया दुकानदार / वेंडरचे नाव टाका!");
      if (vendorEl) vendorEl.focus();
      return;
    }

    if (isNaN(amount) || amount <= 0) {
      alert("⚠️ कृपया योग्य खर्च रक्कम (उदा. 500) टाका!");
      if (amountEl) amountEl.focus();
      return;
    }

    const newExpense = {
      id: "exp-" + Date.now(),
      category,
      vendor,
      amount,
      date,
      billUrl: uploadedBillDataUrl || "",
      desc,
      createdAt: new Date().toISOString()
    };

    if (typeof unmarkExpenseAsDeleted === "function") {
      unmarkExpenseAsDeleted(newExpense.id);
    }
    expenses.unshift(newExpense);
    saveExpenses();

    alert(`✅ खर्च नोंद यशस्वी झाली!\n\nदुकानदार/वेंडर: ${newExpense.vendor}\nरक्कम: ₹${newExpense.amount.toLocaleString("en-IN")}\nवर्गवारी: ${newExpense.category}`);
    
    const form = document.getElementById("expenseForm");
    if (form) form.reset();
    
    const preview = document.getElementById("billPreviewContainer");
    if (preview) preview.classList.add("hidden");
    
    uploadedBillDataUrl = "";

    // Reset date to today's date for convenient next entry
    if (dateEl) {
      dateEl.value = new Date().toISOString().split("T")[0];
    }
  } catch (err) {
    console.error("Expense submit exception:", err);
    alert("⚠️ खर्च नोंद करताना त्रुटी आली: " + err.message);
  }
}

// -----------------------------------------------------------------------------
// 5. RENDERING & STATISTICS
// -----------------------------------------------------------------------------
function updateLiveStats() {
  const currentBudget = getTargetBudget();
  const totalCollected = collections
    .filter(c => c.status === "RECEIVED" || c.status === "PENDING_VERIFY")
    .reduce((sum, c) => sum + c.amount, 0);

  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  const balance = totalCollected - totalSpent;

  const formatInr = n => {
    if (n < 0) return "-₹" + Math.abs(n).toLocaleString("en-IN");
    return "₹" + n.toLocaleString("en-IN");
  };

  // Top header stats
  document.getElementById("statTarget").innerText = formatInr(currentBudget);
  document.getElementById("statCollected").innerText = formatInr(totalCollected);
  document.getElementById("statSpent").innerText = formatInr(totalSpent);
  const balEl = document.getElementById("statBalance");
  if (balEl) {
    balEl.innerText = formatInr(balance);
    if (balance < 0) {
      balEl.className = "text-xl font-bold font-mono text-rose-600";
    } else {
      balEl.className = "text-xl font-bold font-mono text-emerald-700";
    }
  }

  // Public Transparency stats
  document.getElementById("pubStatCollected").innerText = formatInr(totalCollected);
  document.getElementById("pubStatSpent").innerText = formatInr(totalSpent);
  const pubBalEl = document.getElementById("pubStatBalance");
  if (pubBalEl) {
    pubBalEl.innerText = formatInr(balance);
    if (balance < 0) {
      pubBalEl.className = "text-xl font-bold text-rose-600";
    } else {
      pubBalEl.className = "text-xl font-bold text-emerald-800";
    }
  }

  // Progress Bar
  const pct = currentBudget > 0 ? Math.min(100, Math.round((totalCollected / currentBudget) * 100)) : 0;
  document.getElementById("publicProgressPct").innerText = `${pct}% (टार्गेट: ${formatInr(currentBudget)})`;
  document.getElementById("publicProgressBar").style.width = `${pct}%`;

  // Update public volunteers team tally on dashboard
  renderPublicVolunteers();
  renderPublicDonorWall();
  renderCategoryBudgetWatch();
}

function renderPublicDonorWall() {
  const grid = document.getElementById("publicDonorWallGrid");
  const countBadge = document.getElementById("publicOptInCount");
  if (!grid) return;

  const optInDonors = collections.filter(c => 
    c.isPublicOptIn === true && 
    (c.status === "RECEIVED" || c.status === "PENDING_VERIFY")
  );

  if (countBadge) countBadge.innerText = `${optInDonors.length} देणगीदार`;

  if (optInDonors.length === 0) {
    grid.innerHTML = `<div class="col-span-full py-4 text-center text-slate-400 text-xs italic">पावती भरताना 'नाव दाखवण्यास संमती' निवडलेल्या देणगीदारांची नामावली येथे सन्मानाने दिसेल.</div>`;
    return;
  }

  grid.innerHTML = optInDonors.map(d => `
    <div class="bg-white/90 p-2.5 rounded-xl border border-amber-200/90 shadow-2xs flex items-center justify-between">
      <div class="truncate mr-2">
        <p class="font-bold text-slate-900 text-xs truncate flex items-center gap-1">
          <span class="text-amber-600">🚩</span> ${escapeHtml(d.donorName)}
        </p>
        <p class="text-[10px] text-slate-500 font-medium">${escapeHtml(d.society)} (${escapeHtml(d.wing)}-${escapeHtml(d.flat)})</p>
      </div>
      <span class="text-xs font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 shrink-0">₹${d.amount.toLocaleString("en-IN")}</span>
    </div>
  `).join("");
}

function renderCategoryBudgetWatch() {
  const container = document.getElementById("expenseCategoryBudgetBars");
  if (!container) return;

  const categoryBudgets = {
    "मंडप व डेकोरेशन": 60000,
    "ध्वज व भगवे झेंडे": 25000,
    "प्रसाद व वाटप": 35000,
    "साउंड व लाईटिंग": 40000,
    "पोवाडे व व्याख्यान": 25000,
    "इतर संकीर्ण": 15000
  };

  const spentByCategory = {};
  expenses.forEach(e => {
    const cat = e.category || "इतर संकीर्ण";
    spentByCategory[cat] = (spentByCategory[cat] || 0) + (parseFloat(e.amount) || 0);
  });

  const catKeys = Object.keys(categoryBudgets);
  container.innerHTML = catKeys.map(cat => {
    const limit = categoryBudgets[cat];
    const spent = spentByCategory[cat] || 0;
    const pct = Math.min(100, Math.round((spent / limit) * 100));
    const isNearLimit = pct >= 85;
    const isOverLimit = spent > limit;
    const barColor = isOverLimit ? "bg-rose-600" : (isNearLimit ? "bg-amber-500" : "bg-bhagwa-500");
    const textColor = isOverLimit ? "text-rose-700 font-bold" : "text-slate-600";

    return `
      <div>
        <div class="flex justify-between items-center mb-0.5">
          <span class="font-semibold text-slate-800">${cat}</span>
          <span class="${textColor}">₹${spent.toLocaleString("en-IN")} / ₹${limit.toLocaleString("en-IN")} (${pct}%)</span>
        </div>
        <div class="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
          <div class="${barColor} h-full" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join("");
}

function renderCollectionsTable(filterQuery = "") {
  const tbody = document.getElementById("collectionTableBody");
  tbody.innerHTML = "";

  const filtered = collections.filter(c => {
    if (isFollowUpFilterActive && c.status !== "PLEDGED") return false;
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      (c.donorName && c.donorName.toLowerCase().includes(q)) ||
      (c.receiptNo && c.receiptNo.toLowerCase().includes(q)) ||
      (c.flat && c.flat.toLowerCase().includes(q)) ||
      (c.society && c.society.toLowerCase().includes(q))
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-6 text-slate-400">कोणतीही नोंद सापडली नाही.</td></tr>`;
    return;
  }

  filtered.forEach(c => {
    let statusBadge = "";
    let verifyActionBtns = "";

    if (c.status === "PLEDGED") {
      statusBadge = `<span class="bg-amber-100 text-amber-900 px-2 py-0.5 rounded-full font-bold text-[10px]">⏳ नंतर देणार</span>`;
    } else if (c.status === "PENDING_VERIFY") {
      statusBadge = `<span class="bg-amber-50 text-amber-900 px-2 py-0.5 rounded-full font-bold text-[10px] border border-amber-300">🟡 बँक पडताळणी बाकी</span>`;
      verifyActionBtns = `
        <button onclick="adminVerifyUtr('${escapeHtml(c.id)}')" class="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded font-bold ml-1 shadow-xs" title="बँक SMS तपासून खात्री करा">✓ खात्री</button>
        <button onclick="adminRejectFakeUtr('${escapeHtml(c.id)}')" class="text-[10px] bg-rose-600 hover:bg-rose-700 text-white px-1.5 py-0.5 rounded font-bold ml-0.5 shadow-xs" title="बनावट असल्यास पावती रद्द करा">❌ फेक</button>
      `;
    } else if (c.status === "CANCELLED_FAKE") {
      statusBadge = `<span class="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold text-[10px] line-through border border-rose-300" title="${escapeHtml(c.cancelledReason || '')}">❌ रद्द/बनावट</span>`;
    } else if (c.status === "CANCELLED") {
      statusBadge = `<span class="bg-slate-200 text-slate-700 px-2 py-0.5 rounded-full font-bold text-[10px] line-through border border-slate-300" title="${escapeHtml(c.cancelledReason || '')}">🚫 रद्द (Cancelled)</span>`;
    } else {
      statusBadge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">🟢 ✓ सत्यापित</span>`;
    }

    const utrInfo = (c.mode === "UPI" && c.transactionRef)
      ? `<span class="block text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-0.5">UTR: ${c.transactionRef}</span>`
      : "";

    const dtStr = formatReceiptDateTime(c) || c.date || "-";
    const dtParts = dtStr.includes("|") ? dtStr.split("|") : [dtStr, ""];
    const dPart = dtParts[0]?.trim() || "";
    const tPart = dtParts[1]?.trim() || "";

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition";
    tr.innerHTML = `
      <td class="p-3 font-mono font-bold text-bhagwa-700">${escapeHtml(c.receiptNo)}</td>
      <td class="p-3 text-xs text-slate-700 whitespace-nowrap">
        <span class="font-bold text-slate-900 block font-mono text-[11px]">${escapeHtml(dPart)}</span>
        ${tPart ? `<span class="text-[10px] text-slate-500 font-semibold block">${escapeHtml(tPart)}</span>` : ''}
      </td>
      <td class="p-3 font-semibold text-slate-800">${escapeHtml(c.donorName)}<br><span class="text-[10px] text-slate-400">${escapeHtml(c.phone)}</span></td>
      <td class="p-3">${escapeHtml(c.society)} (${escapeHtml(c.wing)} - ${escapeHtml(c.flat)})</td>
      <td class="p-3 font-bold ${(c.status === 'CANCELLED_FAKE' || c.status === 'CANCELLED') ? 'line-through text-slate-400' : (c.status === 'PLEDGED' ? 'text-amber-600' : 'text-emerald-700')}">₹${c.amount.toLocaleString("en-IN")}</td>
      <td class="p-3 font-mono">${escapeHtml(c.mode)}${utrInfo}</td>
      <td class="p-3">${statusBadge}</td>
      <td class="p-3 text-slate-500">${escapeHtml(c.volunteer)}</td>
      <td class="p-3 whitespace-nowrap">
        <button onclick="viewReceiptDirectly('${escapeHtml(c.id)}')" class="text-[11px] bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded font-semibold" title="पावती प्रिव्ह्यू व प्रिंट">
          📜 पावती
        </button>
        ${c.status === 'PLEDGED' ? `<button onclick="sendFollowUpReminder('${escapeHtml(c.id)}')" class="text-[11px] bg-amber-500 hover:bg-amber-600 text-white font-bold px-2 py-1 rounded ml-1 shadow-2xs" title="स्मरणपत्र (WhatsApp Reminder) पाठवा">🔔 फॉलो-अप</button>` : ''}
        <button onclick="resendWhatsApp('${escapeHtml(c.id)}')" class="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-1 rounded ml-1 font-semibold" title="डोनरला WhatsApp वर पाठवा">
          💬 WhatsApp
        </button>
        ${verifyActionBtns}
        <button onclick="cancelCollectionWithReason('${escapeHtml(c.id)}')" class="text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded ml-1 font-bold shadow-2xs" title="फक्त खजिनदार/ऍडमिन: पावती कारणासह रद्द करा">
          🚫 रद्द करा
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function adminVerifyUtr(id) {
  const item = collections.find(c => c.id === id);
  if (!item) return;

  const pin = prompt("बँक SMS/स्टेटमेंटशी खात्री करण्यासाठी खजिनदार/ऍडमिन पिन टाका:");
  if (!isCorrectAdminPin(pin)) {
    alert("⚠️ चुकीचा पिन!");
    return;
  }

  item.status = "RECEIVED";
  item.verifiedBy = "खजिनदार";
  item.verifiedAt = new Date().toISOString();
  saveCollections(item);
  if (typeof logAuditEvent === "function") {
    logAuditEvent("UTR_VERIFY", "COLLECTION", item.id, { receiptNo: item.receiptNo, utr: item.transactionRef }, "खजिनदार");
  }
  alert(`✓ पावती क्र. ${item.receiptNo} (UTR: ${item.transactionRef}) अधिकृतपणे बँकेत तपासून सत्यापित (Verified) झाली!`);
}

function adminRejectFakeUtr(id) {
  const item = collections.find(c => c.id === id);
  if (!item) return;

  const pin = prompt("बनावट UTR पावती रद्द करण्यासाठी खजिनदार/ऍडमिन पिन टाका:");
  if (!isCorrectAdminPin(pin)) {
    alert("⚠️ चुकीचा पिन!");
    return;
  }

  const reason = prompt("पावती रद्द करण्याचे कारण टाका (उदा. बँकेत UTR आला नाही / बनावट स्क्रीनशॉट):", "बँक खात्यात रक्कम जमा नाही (बनावट UTR)");
  if (!reason) return;

  item.status = "CANCELLED_FAKE";
  item.cancelledReason = reason;
  item.cancelledBy = "खजिनदार";
  item.cancelledAt = new Date().toISOString();
  saveCollections(item);
  if (typeof logAuditEvent === "function") {
    logAuditEvent("RECEIPT_CANCEL", "COLLECTION", item.id, { receiptNo: item.receiptNo, reason: reason }, "खजिनदार");
  }
  alert(`❌ बनावट UTR पावती रद्द केली गेली! हिशोबातून ₹${item.amount} रक्कम वजा झाली व ऑडिट लॉग सेव्ह झाला.`);
}

function filterCollections() {
  const q = document.getElementById("searchCollection").value;
  renderCollectionsTable(q);
}

let isFollowUpFilterActive = false;

function toggleFollowUpFilter() {
  isFollowUpFilterActive = !isFollowUpFilterActive;
  const btn = document.getElementById("btnFilterFollowUp");
  if (btn) {
    if (isFollowUpFilterActive) {
      btn.className = "text-xs bg-amber-600 border border-amber-700 font-bold px-3 py-2 rounded-lg text-white flex items-center gap-1.5 shadow-sm";
    } else {
      btn.className = "text-xs bg-amber-50 hover:bg-amber-100 border border-amber-300 font-bold px-3 py-2 rounded-lg text-amber-900 flex items-center gap-1.5";
    }
  }
  renderCollectionsTable(document.getElementById("searchCollection")?.value || "");
}

function sendFollowUpReminder(id) {
  const item = collections.find(c => c.id === id);
  if (!item || !item.phone) {
    alert("⚠️ डोनरचा फोन नंबर उपलब्ध नाही!");
    return;
  }

  const cleanPhone = getCleanWhatsAppPhone(item.phone);
  const upiId = (localStorage.getItem("utsav_upi_id") || "shivajiraje@upi").trim();
  const upiPayUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(getCleanUpiPayeeName())}&am=${item.amount}&cu=INR&tn=ShivJayanti2027`;

  const msg = `🚩 *जय शिवराय! सादर सस्नेह नमस्कार* 🚩\n\n` +
    `*शिवाजी राजे संघटना — १९ फेब्रुवारी शिवजयंती महोत्सव २०२७*\n\n` +
    `आदरणीय *${item.donorName}* जी,\n` +
    `आपण शिवजयंती महोत्सवासाठी *₹${item.amount.toLocaleString("en-IN")}* ची वर्गणी देण्याचे नम्रपणे निश्चित केले होते (पावती क्र. *${item.receiptNo}*).\n\n` +
    `आपण खालील अधिकृत UPI द्वारे घरबसल्या वर्गणी पाठवू शकता:\n` +
    `💳 *UPI ID:* \`${upiId}\`\n\n` +
    `थेट UPI पेमेंट लिंक:\n${upiPayUrl}\n\n` +
    `पेमेंट झाल्यावर कृपया आलेला १२-अंकी UTR नंबर आम्हाला कळवावा, जेणेकरून आपली अधिकृत डिजिटल पावती त्वरित पाठवण्यात येईल.\n\n` +
    `॥ जय भवानी । जय शिवाजी ॥\n` +
    `*शिवाजी राजे संघटना उत्सव समिती*`;

  const encodedMsg = encodeURIComponent(msg);
  const ua = navigator.userAgent || "";
  const isTouchScreen = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  const isMobileUa = /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(ua);
  const isSmallScreen = window.innerWidth <= 1024 || window.screen.width <= 1024;
  const isMobile = isMobileUa || (isTouchScreen && isSmallScreen);

  const nativeWhatsAppUri = `whatsapp://send?phone=${cleanPhone}&text=${encodedMsg}`;

  if (isMobile) {
    window.location.href = nativeWhatsAppUri;
  } else {
    window.open(`https://web.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`, "_blank");
  }
}

function renderExpensesTable() {
  const tbody = document.getElementById("expenseTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";
  
  const countEl = document.getElementById("expenseCountText");
  if (countEl) countEl.innerText = `${expenses.length} नोंदी`;

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">अद्याप कोणताही खर्च नोंदवलेला नाही.</td></tr>`;
    return;
  }

  expenses.forEach(e => {
    const billBtn = e.billUrl 
      ? `<button onclick="viewBillByExpenseId('${escapeHtml(e.id)}')" class="text-bhagwa-600 underline font-semibold cursor-pointer">बिल पाहा</button>`
      : `<span class="text-slate-400">फोटो नाही</span>`;

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition";
    tr.innerHTML = `
      <td class="p-2.5 font-mono text-slate-500">${escapeHtml(e.date || "-")}</td>
      <td class="p-2.5 font-semibold text-slate-800">${escapeHtml(e.category || "-")}</td>
      <td class="p-2.5">${escapeHtml(e.vendor || "-")}<br><span class="text-[10px] text-slate-400">${escapeHtml(e.desc || "")}</span></td>
      <td class="p-2.5 font-bold text-rose-700">₹${(e.amount || 0).toLocaleString("en-IN")}</td>
      <td class="p-2.5 whitespace-nowrap">
        ${billBtn}
        <button onclick="deleteExpense('${escapeHtml(e.id)}')" class="text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-2 py-0.5 rounded ml-2 font-bold shadow-2xs" title="फक्त ऍडमिनसाठी: खर्च नोंद हटवा">
          🔒 हटवा
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function viewBillByExpenseId(expId) {
  const item = expenses.find(e => e.id === expId);
  if (item && item.billUrl) {
    showBillModal(item.billUrl);
  } else {
    alert("या खर्चाचे बिल फोटो जोडलेले नाही.");
  }
}

function showBillModal(imgUrl) {
  if (!imgUrl) return;
  const modal = document.getElementById("galleryLightboxModal");
  const img = document.getElementById("lightboxImage");
  if (modal && img) {
    img.src = imgUrl;
    modal.classList.remove("hidden");
  } else {
    const win = window.open();
    if (win) {
      win.document.write(`<img src="${imgUrl}" style="max-width:100%; height:auto;" />`);
    }
  }
}

function viewReceiptDirectly(id) {
  const item = collections.find(c => c.id === id);
  if (!item) return;

  // 1. Update preview card in donation tab
  const prevRecNoEl = document.getElementById("prevReceiptNo");
  if (prevRecNoEl) prevRecNoEl.innerText = item.receiptNo;
  const prevDonorEl = document.getElementById("prevDonorName");
  if (prevDonorEl) prevDonorEl.innerText = item.donorName;
  const prevAddrEl = document.getElementById("prevAddress");
  if (prevAddrEl) prevAddrEl.innerText = `${item.wing}, ${item.society} (फ्लॅट: ${item.flat})`;
  const prevModeEl = document.getElementById("prevPaymentMode");
  if (prevModeEl) prevModeEl.innerText = `${item.mode} (${item.status})`;
  const prevAmtEl = document.getElementById("prevAmount");
  if (prevAmtEl) prevAmtEl.innerText = `₹${item.amount.toFixed(2)}`;
  const prevVolEl = document.getElementById("prevVolunteer");
  if (prevVolEl) prevVolEl.innerText = item.volunteer;
  const prevDateEl = document.getElementById("prevDate");
  if (prevDateEl) prevDateEl.innerText = formatReceiptDateTime(item);

  const utrRow = document.getElementById("prevUtrRow");
  const utrDisplay = document.getElementById("prevUtr");
  if (utrRow && utrDisplay) {
    if (item.mode === "UPI" && item.transactionRef) {
      utrDisplay.innerText = item.transactionRef;
      utrRow.classList.remove("hidden");
    } else {
      utrRow.classList.add("hidden");
    }
  }

  const qrBox = document.getElementById("receiptQr");
  if (qrBox) {
    qrBox.innerHTML = "";
    const currentBaseUrl = window.location.origin + window.location.pathname;
    const directVerifyUrl = `${currentBaseUrl}?receipt=${encodeURIComponent(item.receiptNo)}`;
    new QRCode(qrBox, {
      text: directVerifyUrl,
      width: 52,
      height: 52
    });
  }

  // 2. Open full official standalone receipt view directly for instant preview & PDF/WhatsApp actions
  openStandaloneReceiptView(item.receiptNo);
}

function setupInitialQrs() {
  // Notice board QR
  const noticeBox = document.getElementById("noticeBoardQr");
  if (noticeBox) {
    noticeBox.innerHTML = "";
    new QRCode(noticeBox, {
      text: window.location.href,
      width: 80,
      height: 80,
      colorDark: "#c2410c",
      colorLight: "#ffffff"
    });
  }

  // Initial receipt QR
  const qrBox = document.getElementById("receiptQr");
  if (qrBox) {
    qrBox.innerHTML = "";
    const currentBaseUrl = window.location.origin + window.location.pathname;
    new QRCode(qrBox, {
      text: `${currentBaseUrl}?receipt=SJ-2027-0001`,
      width: 52,
      height: 52
    });
  }
}

// -----------------------------------------------------------------------------
// 6. CSV EXPORT & SECURE FORMATTING
// -----------------------------------------------------------------------------
function formatCsvCell(val) {
  if (val === null || val === undefined) return '""';
  let s = String(val);
  // Neutralize CSV formula injection (=, +, -, @, tab, carriage return)
  if (/^[=+\-@\t\r]/.test(s)) {
    s = "'" + s;
  }
  // Escape quotes by doubling them per RFC 4180
  s = s.replace(/"/g, '""');
  return `"${s}"`;
}

function exportCollectionsCsv() {
  let csv = "ReceiptNo,DateTime,DonorName,Phone,Society,Wing,Flat,Amount,Mode,Status,Volunteer,Date\n";
  collections.forEach(c => {
    csv += `${formatCsvCell(c.receiptNo)},${formatCsvCell(formatReceiptDateTime(c))},${formatCsvCell(c.donorName)},${formatCsvCell(c.phone)},${formatCsvCell(c.society)},${formatCsvCell(c.wing)},${formatCsvCell(c.flat)},${Number(c.amount) || 0},${formatCsvCell(c.mode)},${formatCsvCell(c.status)},${formatCsvCell(c.volunteer)},${formatCsvCell(c.date)}\n`;
  });

  // \uFEFF Byte Order Mark ensures Marathi/Devanagari renders correctly in Excel
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ShivJayanti_Collections_${getLocalDateIso()}.csv`;
  link.click();
}

// -----------------------------------------------------------------------------
// 7. ADMIN SECURITY LOCK (SHA-256 SALTED HASH - ZERO PLAINTEXT PIN IN STORAGE)
// -----------------------------------------------------------------------------
const PIN_SALT = "utsav_ledger_2027_sec_salt_";
// SHA-256 salted hash of default PIN "2027" (Never store plaintext PIN in code or storage)
const DEFAULT_ADMIN_PIN_HASH = "96c1840a0a200bdcb22af57b8832c78999f92c752db3d2afad617341f7de791f";

function hashPin(pin) {
  const ascii = PIN_SALT + String(pin || "").trim();
  function rightRotate(value, amount) { return (value >>> amount) | (value << (32 - amount)); }
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  let lengthProperty = "length";
  let i, j;
  let result = "";
  let words = [];
  let asciiBitLength = ascii[lengthProperty] * 8;
  let hash = [];
  let k = [];
  let primeCounter = 0;
  const isComposite = {};
  for (let candidate = 2; primeCounter < 64; candidate++) {
    if (!isComposite[candidate]) {
      for (i = 0; i < 313; i += candidate) { isComposite[i] = candidate; }
      hash[primeCounter] = (mathPow(candidate, 0.5) * maxWord) | 0;
      k[primeCounter++] = (mathPow(candidate, 1 / 3) * maxWord) | 0;
    }
  }
  ascii += "\x80";
  while (ascii[lengthProperty] % 64 - 56) ascii += "\x00";
  for (i = 0; i < ascii[lengthProperty]; i++) {
    j = ascii.charCodeAt(i);
    words[i >> 2] |= j << ((3 - i) % 4) * 8;
  }
  words[words[lengthProperty]] = (asciiBitLength / maxWord) | 0;
  words[words[lengthProperty]] = asciiBitLength;
  for (j = 0; j < words[lengthProperty];) {
    let w = words.slice(j, j += 16);
    let oldHash = hash;
    hash = hash.slice(0, 8);
    for (i = 0; i < 64; i++) {
      let w15 = w[i - 15], w2 = w[i - 2];
      let a = hash[0], e = hash[4];
      let temp1 = hash[7]
        + (rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25))
        + ((e & hash[5]) ^ ((~e) & hash[6]))
        + k[i]
        + (w[i] = (i < 16) ? w[i] : (
            w[i - 16]
            + (rightRotate(w15, 7) ^ rightRotate(w15, 18) ^ (w15 >>> 3))
            + w[i - 7]
            + (rightRotate(w2, 17) ^ rightRotate(w2, 19) ^ (w2 >>> 10))
          ) | 0
        );
      let temp2 = (rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22))
        + ((a & hash[1]) ^ (a & hash[2]) ^ (hash[1] & hash[2]));
      hash = [(temp1 + temp2) | 0].concat(hash);
      hash[4] = (hash[4] + temp1) | 0;
    }
    for (i = 0; i < 8; i++) {
      hash[i] = (hash[i] + oldHash[i]) | 0;
    }
  }
  for (i = 0; i < 8; i++) {
    for (j = 3; j + 1; j--) {
      let b = (hash[i] >> (j * 8)) & 255;
      result += ((b < 16) ? 0 : "") + b.toString(16);
    }
  }
  return result;
}

// Purge any legacy plaintext PIN from localStorage immediately on execution
try {
  const legacyPin = localStorage.getItem("utsav_admin_pin");
  if (legacyPin) {
    localStorage.setItem("utsav_admin_pin_hash", hashPin(legacyPin));
    localStorage.removeItem("utsav_admin_pin");
  }
} catch (e) {}

function isCorrectAdminPin(enteredPin) {
  if (!enteredPin) return false;
  const hash = hashPin(enteredPin);
  const storedHash = localStorage.getItem("utsav_admin_pin_hash") || DEFAULT_ADMIN_PIN_HASH;
  return hash === storedHash;
}

function getAdminPin() {
  console.warn("getAdminPin() is deprecated for security reasons; use isCorrectAdminPin()");
  return null;
}

function promptAdminPin() {
  const pinInput = document.getElementById("adminPinInput");
  if (pinInput) pinInput.value = "";
  const err = document.getElementById("pinErrorMsg");
  if (err) err.classList.add("hidden");
  document.getElementById("adminPinModal").classList.remove("hidden");
  lucide.createIcons();
}

function closeAdminPinModal() {
  document.getElementById("adminPinModal").classList.add("hidden");
}

function handleAdminPinSubmit(e) {
  e.preventDefault();
  const enteredPin = document.getElementById("adminPinInput").value.trim();

  if (isCorrectAdminPin(enteredPin)) {
    closeAdminPinModal();
    openConfigModal();
  } else {
    const err = document.getElementById("pinErrorMsg");
    if (err) err.classList.remove("hidden");
  }
}

function switchAdminTab(subTab) {
  document.querySelectorAll(".admin-subview").forEach(el => el.classList.add("hidden"));
  document.querySelectorAll(".admin-tab-btn").forEach(el => {
    el.classList.remove("border-bhagwa-600", "text-bhagwa-700");
    el.classList.add("border-transparent", "text-slate-500");
  });

  const activeView = document.getElementById(`adm-view-${subTab}`);
  const activeBtn = document.getElementById(`adm-tab-${subTab}`);

  if (activeView) activeView.classList.remove("hidden");
  if (activeBtn) {
    activeBtn.classList.remove("border-transparent", "text-slate-500");
    activeBtn.classList.add("border-bhagwa-600", "text-bhagwa-700");
  }
  lucide.createIcons();
}

function openConfigModal() {
  // Populate Org Details
  document.getElementById("orgNameInput").value = localStorage.getItem("utsav_org_name") || "शिवाजी राजे संघटना";
  document.getElementById("eventBadgeInput").value = localStorage.getItem("utsav_event_badge") || "19 Feb उत्सव";
  document.getElementById("eventSubtitleInput").value = localStorage.getItem("utsav_event_subtitle") || "छत्रपती शिवाजी महाराज जयंती महोत्सव (19 फेब्रुवारी)";

  // Populate Budget & UPI
  document.getElementById("targetBudgetInput").value = getTargetBudget();
  document.getElementById("liveUrlInput").value = localStorage.getItem("utsav_live_url") || "";
  document.getElementById("upiIdInput").value = localStorage.getItem("utsav_upi_id") || "shivajiraje@upi";
  document.getElementById("upiNameInput").value = localStorage.getItem("utsav_upi_name") || "शिवाजी राजे संघटना";
  document.getElementById("supabaseUrlInput").value = localStorage.getItem("utsav_sb_url") || DEFAULT_SUPABASE_URL;
  document.getElementById("supabaseKeyInput").value = localStorage.getItem("utsav_sb_key") || DEFAULT_SUPABASE_KEY;
  document.getElementById("newAdminPinInput").value = "";
  document.getElementById("confirmAdminPinInput").value = "";

  // Render Volunteers
  renderAdminVolunteersTable();

  // Reset to first tab
  switchAdminTab("general");

  document.getElementById("configModal").classList.remove("hidden");
  lucide.createIcons();
}

function closeConfigModal() {
  document.getElementById("configModal").classList.add("hidden");
}

function renderAdminVolunteersTable() {
  const tbody = document.getElementById("adminVolunteerTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  const countBadge = document.getElementById("adminVolCount");
  if (countBadge) countBadge.innerText = volunteers.length;

  if (volunteers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4 text-slate-400">कोणताही कार्यकर्ता जोडलेला नाही. वरून नवीन जोडा.</td></tr>`;
    return;
  }

  volunteers.forEach(v => {
    // Calculate total collection done by this volunteer
    const volunteerTotal = collections
      .filter(c => c.volunteer === v.name && c.status === "RECEIVED")
      .reduce((sum, c) => sum + c.amount, 0);

    const thumbHtml = v.photoUrl
      ? `<img src="${v.photoUrl}" alt="${v.name}" class="w-7 h-7 rounded-full object-cover border border-orange-400">`
      : `<div class="w-7 h-7 rounded-full bg-orange-100 text-bhagwa-700 font-bold flex items-center justify-center text-[10px]">${v.name.charAt(0)}</div>`;

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition";
    tr.innerHTML = `
      <td class="p-2.5 font-bold text-slate-800 flex items-center gap-2">
        ${thumbHtml}
        <span>${v.name}</span>
      </td>
      <td class="p-2.5 font-mono text-slate-600">${v.phone}</td>
      <td class="p-2.5 text-slate-600">${v.area || "-"}</td>
      <td class="p-2.5 font-bold text-emerald-700">₹${volunteerTotal.toLocaleString("en-IN")}</td>
      <td class="p-2.5 text-center">
        <button onclick="deleteVolunteer('${v.id}')" class="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold rounded text-[11px]" title="कार्यकर्ता यादीतून हटवा">
          हटवा
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

let tempVolunteerPhotoUrl = "";

function previewVolunteerPhoto(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(event) {
    tempVolunteerPhotoUrl = event.target.result;
    const previewImg = document.getElementById("newVolPhotoPreviewImg");
    const previewBox = document.getElementById("newVolPhotoPreviewBox");
    if (previewImg) previewImg.src = tempVolunteerPhotoUrl;
    if (previewBox) previewBox.classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

function addNewVolunteer() {
  const name = document.getElementById("newVolName").value.trim();
  const phone = document.getElementById("newVolPhone").value.trim();
  const area = document.getElementById("newVolArea").value.trim();

  if (!name || !phone) {
    alert("⚠️ कृपया कार्यकर्त्याचे नाव आणि फोन नंबर प्रविष्ट करा!");
    return;
  }

  const newVol = {
    id: "vol-" + Date.now(),
    name,
    phone,
    area,
    photoUrl: tempVolunteerPhotoUrl || ""
  };

  unmarkVolunteerAsDeleted(newVol.id);
  volunteers.push(newVol);
  saveVolunteers(newVol);

  document.getElementById("newVolName").value = "";
  document.getElementById("newVolPhone").value = "";
  document.getElementById("newVolArea").value = "";
  const photoInput = document.getElementById("newVolPhoto");
  if (photoInput) photoInput.value = "";
  const previewBox = document.getElementById("newVolPhotoPreviewBox");
  if (previewBox) previewBox.classList.add("hidden");
  tempVolunteerPhotoUrl = "";

  alert(`✓ नवीन कार्यकर्ता '${name}' फोटोसह यशस्वीरीत्या जोडला गेला!`);
}

function deleteVolunteer(id) {
  const vol = volunteers.find(v => v.id === id);
  if (!vol) return;

  const pin = prompt(`🔒 सुरक्षेसाठी ऍडमिन पिन आवश्यक:\n\nकार्यकर्ता '${vol.name}' यादीतून काढण्यासाठी ऍडमिन पिन प्रविष्ट करा :`);
  if (pin === null) return;

  if (!isCorrectAdminPin(pin.trim())) {
    alert("🚨 अनधिकृत कृती! चुकीचा ऍडमिन पिन. कार्यकर्ता काढण्याची परवानगी फक्त मुख्य ऍडमिनला आहे.");
    return;
  }

  if (confirm(`तुम्हाला '${vol.name}' या कार्यकर्त्याला कमिटी यादीतून कायमचे काढायचे आहे का?`)) {
    markVolunteerAsDeleted(id);
    volunteers = volunteers.filter(v => v.id !== id);
    saveVolunteers();
    if (supabaseClient) {
      try {
        supabaseClient.from("volunteers_simple").delete().eq("id", id).then();
      } catch (e) {
        console.warn("Supabase delete volunteer note:", e);
      }
    }
    alert(`✓ कार्यकर्ता '${vol.name}' कमिटी यादीतून काढला.`);
  }
}

function saveAdminSettings() {
  const orgName = document.getElementById("orgNameInput").value.trim();
  const eventBadge = document.getElementById("eventBadgeInput").value.trim();
  const eventSubtitle = document.getElementById("eventSubtitleInput").value.trim();
  const targetBudget = parseFloat(document.getElementById("targetBudgetInput").value);
  const liveUrl = document.getElementById("liveUrlInput").value.trim();
  const upiId = document.getElementById("upiIdInput").value.trim();
  const upiName = document.getElementById("upiNameInput").value.trim();
  const url = document.getElementById("supabaseUrlInput").value.trim();
  const key = document.getElementById("supabaseKeyInput").value.trim();
  const newPin = document.getElementById("newAdminPinInput").value.trim();
  const confirmPin = document.getElementById("confirmAdminPinInput").value.trim();

  // Save Org Branding
  if (orgName) localStorage.setItem("utsav_org_name", orgName);
  if (eventBadge) localStorage.setItem("utsav_event_badge", eventBadge);
  if (eventSubtitle) localStorage.setItem("utsav_event_subtitle", eventSubtitle);
  if (liveUrl) localStorage.setItem("utsav_live_url", liveUrl);

  // Save Target Budget
  if (!isNaN(targetBudget) && targetBudget > 0) {
    localStorage.setItem("utsav_target_budget", targetBudget);
  }

  // Handle PIN change if requested
  if (newPin) {
    if (newPin !== confirmPin) {
      alert("⚠️ नवीन पिन आणि कन्फर्म पिन जुळत नाहीत!");
      return;
    }
    if (newPin.length < 4) {
      alert("⚠️ पिन किमान 4 अंकी असावा!");
      return;
    }
    const hashed = hashPin(newPin);
    localStorage.setItem("utsav_admin_pin_hash", hashed);
    localStorage.removeItem("utsav_admin_pin");

    // Sync admin PIN hash to Supabase settings so all devices share the same secure hash
    if (supabaseClient) {
      supabaseClient.from("settings_simple").upsert({
        key: "admin_pin_hash",
        value: hashed,
        updated_at: new Date().toISOString()
      }, { onConflict: "key" }).then(({ error }) => {
        if (error) console.warn("Supabase PIN sync note (table may be pending):", error.message);
      }).catch(err => console.warn("Supabase PIN sync error:", err));
    }
  }

  if (upiId) localStorage.setItem("utsav_upi_id", upiId);
  if (upiName) localStorage.setItem("utsav_upi_name", upiName);
  if (url && key) {
    localStorage.setItem("utsav_sb_url", url);
    localStorage.setItem("utsav_sb_key", key);
  }

  // Refresh active QR if in UPI mode
  const currentMode = document.getElementById("paymentMode")?.value;
  if (currentMode === "UPI") {
    const amount = document.getElementById("donationAmount")?.value || "500";
    generateLiveUpiQr(amount);
  }

  loadOrgBrandSettings();
  updateLiveStats();
  alert("✓ सर्व ऍडमिन सेटिंग्ज यशस्वीरीत्या सेव्ह झाल्या!");
  closeConfigModal();
}

// -----------------------------------------------------------------------------
// 8. AUDIT LOG & RECEIPT CANCELLATION (Replaces Hard Deletes)
// -----------------------------------------------------------------------------
function getAuditLogs() {
  try {
    const raw = localStorage.getItem("utsav_audit_logs");
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function logAuditEvent(action, entityType, entityId, details, performedBy = "ऍडमिन") {
  const log = {
    id: "log-" + Date.now(),
    action,
    entityType,
    entityId: String(entityId),
    details,
    performedBy,
    timestamp: new Date().toISOString()
  };

  const logs = getAuditLogs();
  logs.unshift(log);
  localStorage.setItem("utsav_audit_logs", JSON.stringify(logs.slice(0, 100)));

  if (supabaseClient) {
    supabaseClient.from("audit_logs").insert([{
      action,
      entity_type: entityType,
      entity_id: String(entityId),
      details,
      performed_by: performedBy
    }]).then(({ error }) => {
      if (error) console.warn("Audit log note:", error.message);
    }).catch(err => console.warn("Audit log catch:", err));
  }
}

async function cancelCollectionWithReason(id) {
  const item = collections.find(c => c.id === id);
  if (!item) return;

  const pin = prompt(`🔒 सुरक्षेसाठी खजिनदार/ऍडमिन पिन आवश्यक:\n\nपावती क्र: ${item.receiptNo}\nदेणगीदार: ${item.donorName} (₹${item.amount})\n\nपावती रद्द करण्यासाठी पिन प्रविष्ट करा:`);
  if (pin === null) return;

  if (!isCorrectAdminPin(pin.trim())) {
    alert("🚨 अनधिकृत कृती! चुकीचा पिन. पावती रद्द करण्याचा अधिकार फक्त खजिनदार/ऍडमिनला आहे.");
    return;
  }

  const reason = prompt(`पावती क्र. ${item.receiptNo} रद्द करण्याचे कारण प्रविष्ट करा:\n(उदा. चुकीची रक्कम, डोनरची विनंती, दुबार नोंद)`, "तांत्रिक चूक / दुबार नोंद");
  if (!reason) {
    alert("⚠️ कारण प्रविष्ट न केल्यामुळे पावती रद्द केली नाही.");
    return;
  }

  if (confirm(`⚠️ खात्री करा: पावती क्र. ${item.receiptNo} (${item.donorName} - ₹${item.amount}) रद्द करायची आहे का?\n\nही रक्कम एकूण जमा रकमेतून वजा होईल परंतु ऑडिट ट्रेलमध्ये कायम राहील.`)) {
    item.status = "CANCELLED";
    item.cancelledReason = reason;
    item.cancelledBy = "ऍडमिन/खजिनदार";
    item.cancelledAt = new Date().toISOString();

    saveCollections(item);
    logAuditEvent("RECEIPT_CANCEL", "COLLECTION", item.id, { receiptNo: item.receiptNo, amount: item.amount, reason }, "ऍडमिन/खजिनदार");

    alert(`✓ पावती क्र. ${item.receiptNo} रद्द करण्यात आली आणि ऑडिट लॉगमध्ये सुरक्षित नोंद झाली.`);
  }
}

async function deleteCollection(id) {
  await cancelCollectionWithReason(id);
}

async function deleteExpense(id) {
  const item = expenses.find(e => e.id === id);
  if (!item) return;

  // STRICT ADMIN / AUTHORIZED VOLUNTEER AUTHENTICATION
  const pin = prompt(`🔒 सुरक्षेसाठी ऍडमिन पिन आवश्यक:\n\nखर्च नोंद: ${item.vendor} (₹${item.amount})\n\nखर्च पावती डिलीट करण्याचा अधिकार फक्त मुख्य ऍडमिनला आहे.\nकृपया ऍडमिन पिन प्रविष्ट करा :`);

  if (pin === null) return;

  if (!isCorrectAdminPin(pin.trim())) {
    alert("🚨 अनधिकृत कृती (Access Denied)!\n\nचुकीचा ऍडमिन पिन! सामान्य कार्यकर्त्यांना खर्च नोंद डिलीट करण्याची परवानगी नाही.\nफक्त मुख्य ऍडमिन हा खर्च डिलीट करू शकतात.");
    return;
  }

  if (confirm(`⚠️ सावधान: खर्च नोंद (${item.vendor} - ₹${item.amount}) कायमस्वरूपी डिलीट करायची आहे का?`)) {
    // 1. Permanently register in deleted expenses registry
    markExpenseAsDeleted(id);

    // 2. Remove immediately from active expenses
    expenses = expenses.filter(e => e.id !== id);

    // 3. Save to localStorage & update UI immediately
    saveExpenses();

    // 4. Sync deletion to Supabase cloud
    if (supabaseClient) {
      try {
        await supabaseClient.from("expenses_simple").delete().eq("id", id);
      } catch (err) {
        console.warn("Supabase expense delete error:", err);
      }
    }

    alert(`✓ खर्च नोंद यशस्वीरीत्या डिलीट केली गेली.`);
  }
}

async function confirmResetAllData() {
  const pin = prompt("डेटा पूर्णपणे रिसेट करण्यासाठी ऍडमिन पिन टाका :");
  if (!isCorrectAdminPin(pin)) {
    alert("⚠️ चुकीचा ऍडमिन पिन! डेटा रिसेट रद्द केला.");
    return;
  }

  if (confirm("⚠️ सावधान: सर्व जमा पावत्या आणि खर्चे डिलीट होऊन ₹0 ने नवीन सुरुवात होईल. तुम्ही खात्री करता का?")) {
    const allRecNos = collections.map(c => c.receiptNo).filter(Boolean);
    const allColIds = collections.map(c => c.id).filter(Boolean);
    const allExpIds = expenses.map(e => e.id).filter(Boolean);
    allRecNos.forEach(r => markReceiptAsDeleted(r));
    allColIds.forEach(i => markReceiptAsDeleted(i));
    allExpIds.forEach(i => markExpenseAsDeleted(i));

    collections = [];
    expenses = [];
    localStorage.removeItem("utsav_collections");
    localStorage.removeItem("utsav_expenses");
    if (supabaseClient) {
      try {
        // 1. Try secure Server-Side RPC with PIN check
        const { error: rpcErr } = await supabaseClient.rpc("admin_reset_all_data", { provided_pin: pin });
        if (rpcErr) {
          // Fallback to direct delete if RPC not deployed yet
          await supabaseClient.from("collections_simple").delete().neq("id", "keep_empty");
          await supabaseClient.from("expenses_simple").delete().neq("id", "keep_empty");
        }
      } catch (e) {
        console.warn("Cloud reset warning:", e);
      }
    }
    saveCollections();
    saveExpenses();
    updateNextReceiptNumber();
    closeConfigModal();
    alert("✓ सर्व डेटा यशस्वीरीत्या साफ झाला! शिल्लक: ₹0. नवीन पावत्या SJ-2027-0001 ने सुरू होतील.");
  }
}

// =============================================================================
// 9. SUPABASE CLOUD SYNC FUNCTIONS
// =============================================================================

// Save Supabase keys and test connection
async function saveSupabaseConfig() {
  let url = document.getElementById("supabaseUrlInput")?.value?.trim() || "";
  let key = document.getElementById("supabaseKeyInput")?.value?.trim() || "";

  // Remove trailing slashes and clean URL
  url = url.replace(/\/+$/, "");

  if (!url || !key) {
    alert("⚠️ Supabase URL आणि Anon Key दोन्ही टाका!");
    return;
  }
  if (!url.startsWith("https://") || !url.includes(".supabase.co")) {
    alert("⚠️ Supabase URL चुकीचा आहे!\nफॉर्मॅट असा असावा: https://abcdefgh.supabase.co");
    return;
  }

  try {
    // Test connection
    const testClient = supabase.createClient(url, key);
    const { data, error } = await testClient.from("collections_simple").select("id").limit(1);

    if (error) {
      alert("⚠️ कनेक्शन अयशस्वी (Failed)!\n\nतपशील: " + (error.message || JSON.stringify(error)) + "\n\nकृपया Supabase SQL Editor मध्ये टेबल तयार केले आहे का ते तपासा.");
      return;
    }

    // Save to localStorage
    localStorage.setItem("utsav_sb_url", url);
    localStorage.setItem("utsav_sb_key", key);

    // Activate client globally
    supabaseClient = testClient;
    updateSupabaseBadge(true);

    alert("✅ Supabase Cloud Database जोडले! आता सर्व data cloud मध्ये save होईल.\n\nआधीचा LocalStorage data cloud वर sync करायचा आहे का?");

    // Offer to sync existing data
    if (collections.length > 0 || expenses.length > 0) {
      if (confirm(`${collections.length} पावत्या आणि ${expenses.length} खर्चे cloud वर sync करायचे?`)) {
        await syncAllToSupabase();
      }
    }
  } catch (e) {
    alert("⚠️ Supabase connect करताना error आला: " + e.message);
  }
}

// Sync a single collection to Supabase
async function syncCollectionToSupabase(col) {
  if (!supabaseClient || !col) return false;
  try {
    const payload = {
      id: col.id,
      receipt_no: col.receiptNo,
      donor_name: col.donorName,
      phone: col.phone || "",
      society: col.society || "",
      wing: col.wing || "",
      flat: col.flat || "",
      amount: col.amount,
      payment_mode: col.mode,
      payment_status: col.status,
      volunteer_name: col.volunteer,
      utr_number: col.utr || col.transactionRef || null,
      collected_date: col.date,
      is_public_opt_in: col.isPublicOptIn || false,
      cancelled_reason: col.cancelledReason || null,
      cancelled_by: col.cancelledBy || null,
      cancelled_at: col.cancelledAt || null,
      verified_by: col.verifiedBy || null,
      verified_at: col.verifiedAt || null,
      created_at: col.createdAt || new Date().toISOString()
    };

    let { error } = await supabaseClient.from("collections_simple").upsert(payload, { onConflict: "id" });
    if (error && (error.code === "23505" || String(error.message).includes("receipt_no"))) {
      console.warn("⚠️ Receipt collision detected on cloud for:", col.receiptNo, "Re-sequencing to protect donor data...");
      try {
        const { data: newSeq, error: rpcErr } = await supabaseClient.rpc("get_next_receipt_number");
        if (!rpcErr && newSeq) {
          col.receiptNo = newSeq;
          payload.receipt_no = newSeq;
          const retry = await supabaseClient.from("collections_simple").upsert(payload, { onConflict: "id" });
          error = retry.error;
        }
      } catch (errSeq) {
        console.warn("Could not re-sequence:", errSeq);
      }
    }

    if (error) {
      console.warn("Supabase sync error (collection):", error.message);
      return false;
    }
    // Mark as synced to cloud
    col._isLocalOfflineOnly = false;
    localStorage.setItem("utsav_collections", JSON.stringify(collections));
    console.log("☁️ Collection synced to Supabase:", col.receiptNo);
    return true;
  } catch (e) {
    console.warn("Supabase sync exception:", e);
    return false;
  }
}

// Live Real-Time Subscription (Instant Updates Across All Devices)
function subscribeToSupabaseChanges() {
  if (!supabaseClient) return;
  try {
    supabaseClient
      .channel("public-db-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "collections_simple" },
        (payload) => {
          console.log("🔔 Realtime collection update from cloud:", payload);
          loadFromSupabase();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses_simple" },
        (payload) => {
          console.log("🔔 Realtime expense update from cloud:", payload);
          loadFromSupabase();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "volunteers_simple" },
        (payload) => {
          console.log("🔔 Realtime volunteer update from cloud:", payload);
          loadFromSupabase();
        }
      )
      .subscribe();
    console.log("📡 Real-time live subscription active on Supabase");
  } catch (err) {
    console.warn("Realtime subscription error:", err);
  }
}

// Sync a single expense to Supabase
async function syncExpenseToSupabase(exp) {
  if (!supabaseClient) return false;
  try {
    const { error } = await supabaseClient.from("expenses_simple").upsert({
      id: exp.id,
      category: exp.category,
      vendor_name: exp.vendor,
      amount: exp.amount,
      bill_date: exp.date,
      description: exp.desc || "",
      bill_image_url: exp.billUrl || null,
      created_at: exp.createdAt || new Date().toISOString()
    }, { onConflict: "id" });

    if (error) {
      console.warn("Supabase sync error (expense):", error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("Supabase sync exception:", e);
    return false;
  }
}

// Sync ALL existing LocalStorage data to Supabase
async function syncAllToSupabase() {
  if (!supabaseClient) {
    alert("⚠️ Supabase connect नाही! Admin panel मधून keys टाका.");
    return;
  }

  let colOk = 0, expOk = 0, volOk = 0;

  for (const col of collections) {
    const ok = await syncCollectionToSupabase(col);
    if (ok) colOk++;
  }
  for (const exp of expenses) {
    const ok = await syncExpenseToSupabase(exp);
    if (ok) expOk++;
  }
  for (const vol of volunteers) {
    const ok = await syncVolunteerToSupabase(vol);
    if (ok) volOk++;
  }

  alert(`✅ Sync पूर्ण!\n✓ ${colOk}/${collections.length} पावत्या cloud वर\n✓ ${expOk}/${expenses.length} खर्चे cloud वर\n✓ ${volOk}/${volunteers.length} कार्यकर्ते cloud वर`);
}

// Load data FROM Supabase (for multi-device sync)
async function loadFromSupabase() {
  if (!supabaseClient) return;

  try {
    const { data: colData, error: colErr } = await supabaseClient
      .from("collections_simple")
      .select("*")
      .order("receipt_no", { ascending: false });

    const { data: expData, error: expErr } = await supabaseClient
      .from("expenses_simple")
      .select("*")
      .order("bill_date", { ascending: false });

    const deletedReceipts = getDeletedReceipts();
    const deletedExpenses = getDeletedExpenses();

    // 1. SMART MERGE COLLECTIONS: Clean & Realtime Multi-Device Sync
    if (!colErr && Array.isArray(colData)) {
      const mergedMap = new Map();

      // First add cloud records (Cloud is Single Source of Truth for verified history)
      colData.forEach(r => {
        if (!r || !r.id || deletedReceipts.includes(r.id)) return;

        const cloudItem = {
          id: r.id,
          receiptNo: r.receipt_no,
          donorName: r.donor_name,
          phone: r.phone,
          society: r.society,
          wing: r.wing,
          flat: r.flat,
          amount: parseFloat(r.amount),
          mode: r.payment_mode,
          status: r.payment_status,
          volunteer: r.volunteer_name,
          transactionRef: r.utr_number || "",
          utr: r.utr_number || "",
          isPublicOptIn: r.is_public_opt_in || false,
          cancelledReason: r.cancelled_reason || null,
          cancelledBy: r.cancelled_by || null,
          cancelledAt: r.cancelled_at || null,
          verifiedBy: r.verified_by || null,
          verifiedAt: r.verified_at || null,
          date: r.collected_date,
          createdAt: r.created_at,
          _isLocalOfflineOnly: false
        };

        // Key by unique record ID so receipts are never hidden or collided in memory
        mergedMap.set(r.id, cloudItem);
      });

      // Keep only genuine pending offline local collections that haven't reached cloud yet
      const cloudIds = new Set(colData.map(r => r.id));
      const cloudReceipts = new Set(colData.map(r => r.receipt_no));
      const pendingOffline = [];
      collections.forEach(c => {
        if (c && c.id && !deletedReceipts.includes(c.id)) {
          if (!cloudIds.has(c.id) && !cloudReceipts.has(c.receiptNo) && c._isLocalOfflineOnly === true) {
            mergedMap.set(c.id, c);
            pendingOffline.push(c);
          }
        }
      });

      collections = Array.from(mergedMap.values()).sort((a, b) => {
        return (b.receiptNo || "").localeCompare(a.receiptNo || "");
      });

      localStorage.setItem("utsav_collections", JSON.stringify(collections));
      updateLiveStats();
      renderCollectionsTable();
      updateNextReceiptNumber();

      // Push any pending offline records to cloud now that connection is active
      pendingOffline.forEach(c => {
        syncCollectionToSupabase(c);
      });
    } else if (colErr) {
      console.warn("⚠️ Supabase collections fetch warning (local data preserved):", colErr.message);
    }

    // 2. SMART MERGE EXPENSES: Cloud is Single Source of Truth for cross-device sync!
    if (!expErr && Array.isArray(expData)) {
      // Clean and set expenses strictly from cloud so deleted items on mobile A disappear immediately on mobile B
      const cloudExpenses = expData
        .filter(r => r && r.id && !deletedExpenses.includes(r.id))
        .map(r => ({
          id: r.id,
          category: r.category,
          vendor: r.vendor_name,
          amount: parseFloat(r.amount),
          date: r.bill_date,
          desc: r.description,
          billUrl: r.bill_image_url,
          createdAt: r.created_at
        }));

      expenses = cloudExpenses.sort((a, b) => {
        return (b.date || "").localeCompare(a.date || "");
      });

      localStorage.setItem("utsav_expenses", JSON.stringify(expenses));
      renderExpensesTable();
    } else if (expErr) {
      console.warn("⚠️ Supabase expenses fetch warning (local data preserved):", expErr.message);
    }

    // Load Volunteers from Supabase (for multi-device sync)
    try {
      const deletedVols = getDeletedVolunteers();
      const { data: volData, error: volErr } = await supabaseClient
        .from("volunteers_simple")
        .select("*")
        .order("created_at", { ascending: true });

      if (!volErr && volData && volData.length > 0) {
        const cloudVols = volData
          .filter(v =>
            v.id !== "vol-1" &&
            v.id !== "vol-2" &&
            v.id !== "vol-3" &&
            !v.full_name.includes("रोहित पाटील") &&
            !v.full_name.includes("अनिकेत शिंदे") &&
            !v.full_name.includes("स्वप्नील गायकवाड") &&
            !deletedVols.includes(v.id)
          )
          .map(v => ({
            id: v.id,
            name: v.full_name,
            phone: v.phone || "",
            area: v.area || "",
            photoUrl: v.photo_url || ""
          }));

        if (cloudVols.length > 0) {
          volunteers = cloudVols;
          localStorage.setItem("utsav_volunteers", JSON.stringify(volunteers));
          populateVolunteerDropdown();
          renderAdminVolunteersTable();
        }
      }
    } catch (ve) {
      console.warn("Supabase volunteer fetch note:", ve);
    }

    // 4. Cloud Settings Sync (Admin PIN & Global Config across devices)
    try {
      const { data: setData, error: setErr } = await supabaseClient
        .from("settings_simple")
        .select("*");

      if (!setErr && setData && Array.isArray(setData)) {
        setData.forEach(s => {
          if (s.key === "admin_pin_hash" && s.value) {
            localStorage.setItem("utsav_admin_pin_hash", s.value);
            localStorage.removeItem("utsav_admin_pin");
          } else if (s.key === "admin_pin" && s.value) {
            localStorage.setItem("utsav_admin_pin_hash", hashPin(s.value));
            localStorage.removeItem("utsav_admin_pin");
          } else if (s.key === "upi_id" && s.value) {
            localStorage.setItem("utsav_upi_id", s.value);
          } else if (s.key === "upi_name" && s.value) {
            localStorage.setItem("utsav_upi_name", s.value);
          }
        });
      }
    } catch (se) {
      console.warn("Supabase settings note:", se);
    }

    updateLiveStats();
    renderCollectionsTable();
    renderExpensesTable();
    updateNextReceiptNumber();
    if (typeof renderPublicVolunteers === "function") renderPublicVolunteers();

    // If opened via WhatsApp link, refresh receipt view with fresh cloud data
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get("receipt") || urlParams.get("no")) {
      checkUrlForReceiptVerification();
    }

    console.log("✅ Supabase data loaded successfully (Total:", collections.length, "collections)");
  } catch (e) {
    console.warn("Supabase load failed, using LocalStorage:", e);
  }
}

// =============================================================================
// 10. EVENT GALLERY SYSTEM (उत्सव गॅलरी)
// =============================================================================
const DEFAULT_GALLERY_PHOTOS = [];

function loadGallery() {
  // Fresh clean storage key (removes any stuck dummy/sample photos completely)
  localStorage.removeItem("utsav_gallery"); // Wipe out old stuck sample photos
  
  const stored = localStorage.getItem("utsav_gallery_v2");
  if (stored !== null) {
    try {
      galleryItems = JSON.parse(stored);
      if (!Array.isArray(galleryItems)) galleryItems = [];
    } catch (e) {
      galleryItems = [];
    }
  } else {
    galleryItems = [];
    localStorage.setItem("utsav_gallery_v2", JSON.stringify([]));
  }
  renderGallery();
}

function saveGallery(newItem = null) {
  try {
    localStorage.setItem("utsav_gallery_v2", JSON.stringify(galleryItems));
    renderGallery();
    return true;
  } catch (err) {
    console.warn("⚠️ localStorage quota reached for gallery:", err);
    // Rollback memory state if quota exceeded so memory and storage stay in sync
    if (newItem && newItem.id) {
      galleryItems = galleryItems.filter(item => item.id !== newItem.id);
    }
    alert("⚠️ ब्राऊझर मेमरी (LocalStorage Quota) मर्यादा आली आहे!\nफोटो खूप मोठा असल्यामुळे सेव्ह करता आला नाही.\nकृपया फोटो कॉम्प्रॅस करा किंवा थेट URL लिंक वापरा.");
    renderGallery();
    return false;
  }
}

function renderGallery(yearFilter = "ALL") {
  const grid = document.getElementById("galleryGrid");
  const empty = document.getElementById("galleryEmptyState");
  if (!grid) return;

  grid.innerHTML = "";
  
  const filtered = yearFilter === "ALL" 
    ? galleryItems 
    : galleryItems.filter(item => item.year === yearFilter);

  if (filtered.length === 0) {
    if (empty) empty.classList.remove("hidden");
    return;
  }

  if (empty) empty.classList.add("hidden");

  filtered.forEach(item => {
    const card = document.createElement("div");
    card.className = "bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition group flex flex-col justify-between";
    card.innerHTML = `
      <div class="relative overflow-hidden aspect-video bg-slate-100 cursor-pointer" onclick="openGalleryLightbox('${encodeURIComponent(item.url)}', '${encodeURIComponent(item.title)}', '${item.year}')">
        <img src="${item.url}" alt="${item.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-300" onerror="this.src='https://upload.wikimedia.org/wikipedia/commons/2/25/Raigad_Fort-Raigad_-Maharashtra-001.jpg'">
        <span class="absolute top-2 left-2 bg-black/60 backdrop-blur-xs text-white text-[10px] font-bold px-2 py-0.5 rounded-md">
          🚩 ${item.year}
        </span>
        <div class="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
          <i data-lucide="zoom-in" class="w-6 h-6"></i>
        </div>
      </div>
      <div class="p-3">
        <h4 class="text-xs font-bold text-slate-800 line-clamp-1">${item.title}</h4>
        <div class="mt-2 flex items-center justify-between text-[10px] text-slate-400">
          <span>${item.type === "VIDEO" ? "🎥 व्हिडिओ" : "📸 फोटो"}</span>
          <button onclick="deleteGalleryItem('${item.id}')" class="text-rose-500 hover:text-rose-700 font-semibold p-1" title="काढून टाका">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  lucide.createIcons();
}

function filterGalleryByYear(year) {
  renderGallery(year);
}

function openGalleryLightbox(url, title, year) {
  const modal = document.getElementById("galleryLightboxModal");
  const img = document.getElementById("lightboxImage");
  const titleEl = document.getElementById("lightboxTitle");
  const metaEl = document.getElementById("lightboxMeta");

  if (!modal || !img) return;

  img.src = decodeURIComponent(url);
  if (titleEl) titleEl.innerText = decodeURIComponent(title);
  if (metaEl) metaEl.innerText = `🚩 शिवजयंती महोत्सव • वर्ष ${year}`;

  modal.classList.remove("hidden");
}

function closeGalleryLightbox() {
  const modal = document.getElementById("galleryLightboxModal");
  if (modal) modal.classList.add("hidden");
}

function openGalleryUploadModal() {
  const pin = prompt("गॅलरीमध्ये फोटो जोडण्यासाठी ऍडमिन पिन टाका :");
  if (!isCorrectAdminPin(pin)) {
    alert("⚠️ चुकीचा ऍडमिन पिन! प्रवेश नाकारला.");
    return;
  }
  const modal = document.getElementById("galleryUploadModal");
  if (modal) modal.classList.remove("hidden");
}

function closeGalleryUploadModal() {
  const modal = document.getElementById("galleryUploadModal");
  if (modal) modal.classList.add("hidden");
}

function submitGalleryItem() {
  const title = document.getElementById("galTitleInput")?.value?.trim();
  const year = document.getElementById("galYearInput")?.value || "2026";
  const type = document.getElementById("galTypeInput")?.value || "PHOTO";
  const urlInput = document.getElementById("galUrlInput")?.value?.trim();
  const fileInput = document.getElementById("galFileInput");

  if (!title) {
    alert("⚠️ कृपया फोटोचे शीर्षक किंवा नाव टाका!");
    return;
  }

  // If file uploaded, compress via Canvas before saving to prevent LocalStorage Quota Crashes
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(readerEvent) {
      const img = new Image();
      img.onload = function() {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          const MAX_WIDTH = 1000;
          let width = img.width;
          let height = img.height;

          if (width > MAX_WIDTH) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Compress to lightweight JPEG (75% quality)
          const compressedDataUrl = canvas.toDataURL("image/jpeg", 0.75);
          saveNewGalleryRecord(title, year, type, compressedDataUrl);
        } catch (err) {
          console.warn("Canvas compression fallback:", err);
          saveNewGalleryRecord(title, year, type, readerEvent.target.result);
        }
      };
      img.onerror = function() {
        saveNewGalleryRecord(title, year, type, readerEvent.target.result);
      };
      img.src = readerEvent.target.result;
    };
    reader.readAsDataURL(file);
  } else if (urlInput) {
    saveNewGalleryRecord(title, year, type, urlInput);
  } else {
    alert("⚠️ कृपया फोटोची लिंक (URL) टाका किंवा मोबाईल/कॉम्प्युटरवरून फोटो निवडा!");
  }
}

function saveNewGalleryRecord(title, year, type, url) {
  const newItem = {
    id: "gal-" + Date.now(),
    title: title,
    year: year,
    type: type,
    url: url,
    createdAt: new Date().toISOString()
  };

  galleryItems.unshift(newItem);
  const success = saveGallery(newItem);
  if (!success) return; // Quota error rolled back memory

  closeGalleryUploadModal();

  // Reset inputs
  if (document.getElementById("galTitleInput")) document.getElementById("galTitleInput").value = "";
  if (document.getElementById("galUrlInput")) document.getElementById("galUrlInput").value = "";
  if (document.getElementById("galFileInput")) document.getElementById("galFileInput").value = "";

  alert("✅ फोटो गॅलरीमध्ये यशस्वीरीत्या जोडला गेला!");
}

function deleteGalleryItem(id) {
  const pin = prompt("फोटो डिलीट करण्यासाठी ऍडमिन पिन टाका :");
  if (!isCorrectAdminPin(pin)) {
    alert("⚠️ चुकीचा ऍडमिन पिन! ");
    return;
  }

  if (confirm("हा फोटो गॅलरीतून कायमचा काढून टाकायचा का?")) {
    galleryItems = galleryItems.filter(item => item.id !== id);
    saveGallery();
    alert("✓ फोटो यशस्वीरीत्या डिलीट झाला!");
  }
}

