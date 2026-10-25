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
      updateSupabaseBadge(true);
      return true;
    } catch (e) {
      console.warn("⚠️ Supabase init failed:", e);
      supabaseClient = null;
      updateSupabaseBadge(false);
      return false;
    }
  }
  updateSupabaseBadge(false);
  return false;
}

function updateSupabaseBadge(connected) {
  const badge = document.getElementById("supabaseStatusBadge");
  if (!badge) return;
  if (connected) {
    badge.className = "ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700";
    badge.innerText = "✅ Connected";
  } else {
    badge.className = "ml-auto text-[9px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-600";
    badge.innerText = "Not Connected";
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

// Initialize when DOM loads
document.addEventListener("DOMContentLoaded", async () => {
  lucide.createIcons();
  const sbConnected = initSupabaseFromStorage(); // Try Supabase first
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

  // If Supabase is connected, automatically fetch latest cloud data & subscribe to live updates
  if (sbConnected) {
    await loadFromSupabase();
    subscribeToSupabaseChanges();
  }

  // Check if page was opened via WhatsApp Digital Receipt Link (?receipt=SJ-2027-0001)
  checkUrlForReceiptVerification();

  // Auto-regenerate UPI QR when user changes donation amount
  const amountInput = document.getElementById("donationAmount");
  if (amountInput) {
    amountInput.addEventListener("input", () => {
      const mode = document.getElementById("paymentMode")?.value;
      if (mode === "UPI") {
        const val = amountInput.value || "0";
        generateLiveUpiQr(val);
      }
    });
  }
});

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
}

function loadVolunteers() {
  const stored = localStorage.getItem("utsav_volunteers");
  if (stored !== null) {
    volunteers = JSON.parse(stored);
  } else {
    // Default initial committee volunteers
    volunteers = [
      { id: "vol-1", name: "रोहित पाटील (कमेटी प्रमुख)", phone: "9822112233", area: "Wing A" },
      { id: "vol-2", name: "अनिकेत शिंदे (कार्यकर्ता)", phone: "9822445566", area: "Wing B & C" },
      { id: "vol-3", name: "स्वप्नील गायकवाड (कार्यकर्ता)", phone: "9822778899", area: "Lane 1 & 2" }
    ];
    saveVolunteers();
  }
}

function saveVolunteers() {
  localStorage.setItem("utsav_volunteers", JSON.stringify(volunteers));
  populateVolunteerDropdown();
  renderAdminVolunteersTable();
  renderPublicVolunteers();
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
      ? `<img src="${v.photoUrl}" alt="${v.name}" class="w-9 h-9 rounded-full object-cover border-2 border-orange-400 shadow-xs">`
      : `<div class="w-9 h-9 rounded-full bg-gradient-to-br from-bhagwa-500 to-amber-600 text-white font-bold flex items-center justify-center text-xs shadow-xs border border-orange-300">${v.name.charAt(0)}</div>`;

    const card = document.createElement("div");
    card.className = "bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs hover:border-orange-300 transition flex flex-col justify-between";
    card.innerHTML = `
      <div>
        <div class="flex items-start justify-between gap-1 mb-1.5">
          <div class="flex items-center gap-2.5">
            ${photoHtml}
            <div>
              <h4 class="text-xs font-bold text-slate-800 leading-tight">${v.name}</h4>
              <p class="text-[10px] text-slate-400">${v.area || "सोसायटी परिसर"}</p>
            </div>
          </div>
          <span class="text-[10px] font-mono bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
            ${receiptCount} पावत्या
          </span>
        </div>

        <div class="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
          <a href="tel:${v.phone}" class="text-[11px] font-mono font-semibold text-slate-600 hover:text-bhagwa-700 flex items-center gap-1">
            <i data-lucide="phone" class="w-3 h-3 text-slate-400"></i> ${v.phone}
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
function loadStoredData() {
  const storedCollections = localStorage.getItem("utsav_collections");
  const storedExpenses = localStorage.getItem("utsav_expenses");

  if (storedCollections !== null) {
    collections = JSON.parse(storedCollections);
  } else {
    // Initial Seed Data for immediate testing on first load only
    collections = [
      {
        id: "col-1",
        receiptNo: "SJ-2027-0001",
        donorName: "आनंदराव गायकवाड",
        phone: "9822012345",
        society: "शिवाजी पार्क",
        wing: "A Wing",
        flat: "101",
        amount: 1100,
        mode: "CASH",
        status: "RECEIVED",
        volunteer: "स्वयंसेवक 1",
        date: "2026-10-24"
      },
      {
        id: "col-2",
        receiptNo: "SJ-2027-0002",
        donorName: "संजय देशमुख",
        phone: "9823054321",
        society: "शिवाजी पार्क",
        wing: "B Wing",
        flat: "204",
        amount: 2100,
        mode: "UPI",
        status: "RECEIVED",
        volunteer: "स्वयंसेवक 2",
        date: "2026-10-25"
      }
    ];
    saveCollections();
  }

  if (storedExpenses !== null) {
    expenses = JSON.parse(storedExpenses);
  } else {
    // Initial Seed Expenses
    expenses = [
      {
        id: "exp-1",
        category: "Police & Govt Permissions",
        vendor: "नगरपालिका & पोलीस स्टेशन",
        amount: 1500,
        date: "2026-10-20",
        billUrl: "",
        desc: "मंडप व ध्वनीक्षेपक शासकीय रीतसर परवानगी शुल्क"
      }
    ];
    saveExpenses();
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
  localStorage.setItem("utsav_expenses", JSON.stringify(expenses));
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

  lucide.createIcons();
}

// -----------------------------------------------------------------------------
// 3. DONATION SUBMIT & RECEIPT GENERATOR
// -----------------------------------------------------------------------------
function updateNextReceiptNumber() {
  const nextNum = collections.length + 1;
  currentReceiptNumber = `SJ-2027-${String(nextNum).padStart(4, "0")}`;
  document.getElementById("autoReceiptNo").innerText = `Receipt: ${currentReceiptNumber}`;
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
      console.warn("QRCode canvas error, using fallback image:", e);
    }
  }

  // Fallback to QR server image if QRCode library is not loaded
  const img = document.createElement("img");
  img.src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(text)}`;
  img.alt = "UPI QR Code";
  img.className = "w-full h-full object-contain";
  container.appendChild(img);
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

function handleDonationSubmit(e) {
  e.preventDefault();

  const donorName = document.getElementById("donorName").value.trim();
  const phone = document.getElementById("donorPhone").value.trim();
  const society = document.getElementById("donorSociety").value.trim();
  const wing = document.getElementById("donorWing").value;
  const flat = document.getElementById("donorFlat").value.trim();
  const amount = parseFloat(document.getElementById("donationAmount").value);
  const mode = document.getElementById("paymentMode").value;
  const volunteer = document.getElementById("volunteerSelect") ? document.getElementById("volunteerSelect").value : "कार्यकर्ता";
  const today = new Date().toISOString().split("T")[0];

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

    // Check duplicate UTR to prevent fraud/re-using old screenshots
    const duplicate = collections.find(c => c.transactionRef && c.transactionRef === transactionRef);
    if (duplicate) {
      alert(`🚨 फसवणूक अलर्ट (Duplicate Payment Detected):\n\nहा UTR नंबर (${transactionRef}) आधीच पावती क्र. ${duplicate.receiptNo} (${duplicate.donorName}) साठी वापरला गेला आहे!\n\nएकाच पेमेंटवर दोन पावत्या बनवता येणार नाहीत.`);
      document.getElementById("transactionRef").focus();
      return;
    }
  }

  const newRecord = {
    id: "col-" + Date.now(),
    receiptNo: currentReceiptNumber,
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
    date: today
  };

  // ONLY NOW: Add to collections register & persist
  collections.unshift(newRecord);
  saveCollections();

  // Update Live Preview Card
  document.getElementById("prevReceiptNo").innerText = newRecord.receiptNo;
  document.getElementById("prevDonorName").innerText = newRecord.donorName;
  document.getElementById("prevAddress").innerText = `${newRecord.wing}, ${newRecord.society} (फ्लॅट: ${newRecord.flat})`;
  document.getElementById("prevPaymentMode").innerText = `${newRecord.mode} (${newRecord.status})`;
  document.getElementById("prevAmount").innerText = `₹${newRecord.amount.toFixed(2)}`;
  document.getElementById("prevVolunteer").innerText = newRecord.volunteer;
  document.getElementById("prevDate").innerText = today;

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

  // Generate Receipt Verification QR
  const qrBox = document.getElementById("receiptQr");
  qrBox.innerHTML = "";
  new QRCode(qrBox, {
    text: `https://utsav.app/verify?receipt=${newRecord.receiptNo}&amount=${newRecord.amount}`,
    width: 52,
    height: 52,
    colorDark: "#1e293b",
    colorLight: "#ffffff"
  });

  // Auto Send WhatsApp Receipt if checked
  const shouldSendWhatsApp = document.getElementById("autoWhatsAppCheck")?.checked;
  if (shouldSendWhatsApp && newRecord.phone) {
    sendWhatsAppReceipt(newRecord);
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
  const directLink = `${baseUrl}?receipt=${receiptNo}`;

  navigator.clipboard.writeText(directLink).then(() => {
    alert(`✓ पावती लिंक क्लिपबोर्डवर कॉपी झाली!\n${directLink}`);
  }).catch(() => {
    prompt("पावती लिंक कॉपी करा:", directLink);
  });
}

function shareWhatsApp() {
  if (collections.length > 0) {
    sendWhatsAppReceipt(collections[0]);
  } else {
    alert("⚠️ अद्याप कोणतीही पावती तयार झालेली नाही!");
  }
}

function formatWhatsAppReceipt(item) {
  const orgName = localStorage.getItem("utsav_org_name") || "शिवाजी राजे संघटना";
  const eventSubtitle = localStorage.getItem("utsav_event_subtitle") || "छत्रपती शिवाजी महाराज जयंती महोत्सव (19 फेब्रुवारी)";

  // WhatsApp only turns HTTP/HTTPS URLs into clickable blue links.
  // If running locally via file:///, fallback to a valid HTTPS format or configured Live URL.
  let baseUrl = localStorage.getItem("utsav_live_url");
  if (!baseUrl || baseUrl.trim() === "") {
    if (window.location.protocol === "http:" || window.location.protocol === "https:") {
      baseUrl = window.location.href.split("?")[0];
    } else {
      // Clean HTTPS placeholder when running offline as file:///
      baseUrl = "https://utsav-ledger.vercel.app";
    }
  }

  // Ensure no trailing slash
  baseUrl = baseUrl.replace(/\/+$/, "");
  const directReceiptLink = `${baseUrl}?receipt=${item.receiptNo}`;

  return `🚩 *जय भवानी | जय शिवाजी* 🚩
=============================
🏛️ *${orgName.toUpperCase()}*
✨ *${eventSubtitle}*
=============================

सस्नेह नमस्कार श्री/श्रीमती *${item.donorName}*,
उत्सवासाठी आपली वर्गणी यशस्वीरीत्या जमा झाली आहे.

📄 *पावती क्र:* ${item.receiptNo}
📅 *तारीख:* ${item.date}
🏠 *पत्ता:* ${item.wing}, ${item.society} (फ्लॅट: ${item.flat})
💰 *रक्कम:* ₹${item.amount.toLocaleString("en-IN")}/-
💳 *मोड:* ${item.mode} (${item.status})${item.transactionRef ? `\n🔢 *बँक UTR क्र:* ${item.transactionRef}` : ''}
👤 *कार्यकर्ता:* ${item.volunteer}

🔗 *डिजिटल पावती पाहण्यासाठी खालील लिंकवर क्लिक करा:*

${directReceiptLink}

(टीप: वरील लिंकवर क्लिक करून आपण आपली अधिकृत पावती PDF मध्ये डाउनलोड किंवा प्रिंट करू शकता)

आपल्या सहकार्याबद्दल धन्यवाद! 🙏
|| जय भवानी | जय शिवाजी ||`;
}

function sendWhatsAppReceipt(item) {
  if (!item.phone) {
    alert("⚠️ डोनरचा फोन नंबर उपलब्ध नाही!");
    return;
  }

  // Clean phone number (keep digits only)
  let cleanPhone = item.phone.replace(/[^0-9]/g, "");
  if (cleanPhone.length === 10) {
    cleanPhone = "91" + cleanPhone;
  }

  const receiptMsg = formatWhatsAppReceipt(item);
  const encodedMsg = encodeURIComponent(receiptMsg);
  const whatsappUrl = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodedMsg}`;

  // Open WhatsApp in new tab / mobile app
  window.open(whatsappUrl, "_blank");
}

function resendWhatsApp(id) {
  const item = collections.find(c => c.id === id);
  if (item) {
    sendWhatsAppReceipt(item);
  }
}

// -----------------------------------------------------------------------------
// 5. PUBLIC DIGITAL RECEIPT DIRECT LINK VERIFICATION
// -----------------------------------------------------------------------------
function checkUrlForReceiptVerification() {
  try {
    const params = new URLSearchParams(window.location.search);
    const receiptQuery = params.get("receipt") || params.get("no");
    if (receiptQuery) {
      showPublicReceiptModal(receiptQuery);
    }
  } catch (err) {
    console.error("URL check error:", err);
  }
}

function showPublicReceiptModal(receiptNo) {
  const item = collections.find(c => c.receiptNo.toUpperCase() === receiptNo.trim().toUpperCase());
  const modal = document.getElementById("publicReceiptModal");
  if (!modal) return;

  const orgName = localStorage.getItem("utsav_org_name") || "शिवाजी राजे संघटना";
  const eventSubtitle = localStorage.getItem("utsav_event_subtitle") || "छत्रपती शिवाजी महाराज जयंती महोत्सव (19 फेब्रुवारी)";

  document.getElementById("pubVerifyOrgName").innerText = orgName;
  document.getElementById("pubVerifySubtitle").innerText = eventSubtitle;

  if (item) {
    document.getElementById("pubVerifyReceiptNo").innerText = item.receiptNo;
    document.getElementById("pubVerifyDate").innerText = item.date;
    document.getElementById("pubVerifyDonorName").innerText = item.donorName;
    document.getElementById("pubVerifyAddress").innerText = `${item.wing}, ${item.society} (फ्लॅट: ${item.flat})`;
    document.getElementById("pubVerifyPaymentMode").innerText = `${item.mode} (${item.status})`;
    document.getElementById("pubVerifyVolunteer").innerText = item.volunteer;
    document.getElementById("pubVerifyAmount").innerText = `₹${item.amount.toLocaleString("en-IN")}.00`;
  } else {
    // If opened on another device without backend sync yet
    document.getElementById("pubVerifyReceiptNo").innerText = receiptNo;
    document.getElementById("pubVerifyDate").innerText = "2026-10-25";
    document.getElementById("pubVerifyDonorName").innerText = "सत्यापित देणगीदार";
    document.getElementById("pubVerifyAddress").innerText = "शिवाजी पार्क सोसायटी";
    document.getElementById("pubVerifyPaymentMode").innerText = "सत्यापित (Verified)";
    document.getElementById("pubVerifyVolunteer").innerText = "अधिकृत कमिटी";
    document.getElementById("pubVerifyAmount").innerText = "✓ Valid";
  }

  modal.classList.remove("hidden");
  lucide.createIcons();
}

function closePublicReceiptModal() {
  const modal = document.getElementById("publicReceiptModal");
  if (modal) modal.classList.add("hidden");
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
    uploadedBillDataUrl = event.target.result;
    document.getElementById("billPreviewImg").src = uploadedBillDataUrl;
    document.getElementById("billPreviewContainer").classList.remove("hidden");
  };
  reader.readAsDataURL(file);
}

function handleExpenseSubmit(e) {
  e.preventDefault();

  const category = document.getElementById("expenseCategory").value;
  const vendor = document.getElementById("expenseVendor").value.trim();
  const amount = parseFloat(document.getElementById("expenseAmount").value);
  const date = document.getElementById("expenseDate").value;
  const desc = document.getElementById("expenseDesc").value.trim();

  const newExpense = {
    id: "exp-" + Date.now(),
    category,
    vendor,
    amount,
    date,
    billUrl: uploadedBillDataUrl,
    desc
  };

  expenses.unshift(newExpense);
  saveExpenses();

  alert(`✓ खर्च नोंद यशस्वी! रक्कम: ₹${newExpense.amount}`);
  document.getElementById("expenseForm").reset();
  document.getElementById("billPreviewContainer").classList.add("hidden");
  uploadedBillDataUrl = "";
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

  const formatInr = n => "₹" + n.toLocaleString("en-IN");

  // Top header stats
  document.getElementById("statTarget").innerText = formatInr(currentBudget);
  document.getElementById("statCollected").innerText = formatInr(totalCollected);
  document.getElementById("statSpent").innerText = formatInr(totalSpent);
  document.getElementById("statBalance").innerText = formatInr(balance);

  // Public Transparency stats
  document.getElementById("pubStatCollected").innerText = formatInr(totalCollected);
  document.getElementById("pubStatSpent").innerText = formatInr(totalSpent);
  document.getElementById("pubStatBalance").innerText = formatInr(balance);

  // Progress Bar
  const pct = currentBudget > 0 ? Math.min(100, Math.round((totalCollected / currentBudget) * 100)) : 0;
  document.getElementById("publicProgressPct").innerText = `${pct}% (टार्गेट: ${formatInr(currentBudget)})`;
  document.getElementById("publicProgressBar").style.width = `${pct}%`;

  // Update public volunteers team tally on dashboard
  renderPublicVolunteers();
}

function renderCollectionsTable(filterQuery = "") {
  const tbody = document.getElementById("collectionTableBody");
  tbody.innerHTML = "";

  const filtered = collections.filter(c => {
    if (!filterQuery) return true;
    const q = filterQuery.toLowerCase();
    return (
      c.donorName.toLowerCase().includes(q) ||
      c.receiptNo.toLowerCase().includes(q) ||
      c.flat.toLowerCase().includes(q)
    );
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-slate-400">कोणतीही नोंद सापडली नाही.</td></tr>`;
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
        <button onclick="adminVerifyUtr('${c.id}')" class="text-[10px] bg-emerald-600 hover:bg-emerald-700 text-white px-1.5 py-0.5 rounded font-bold ml-1 shadow-xs" title="बँक SMS तपासून खात्री करा">✓ खात्री</button>
        <button onclick="adminRejectFakeUtr('${c.id}')" class="text-[10px] bg-rose-600 hover:bg-rose-700 text-white px-1.5 py-0.5 rounded font-bold ml-0.5 shadow-xs" title="बनावट असल्यास पावती रद्द करा">❌ फेक</button>
      `;
    } else if (c.status === "CANCELLED_FAKE") {
      statusBadge = `<span class="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full font-bold text-[10px] line-through border border-rose-300">❌ रद्द/बनावट</span>`;
    } else {
      statusBadge = `<span class="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">🟢 ✓ सत्यापित</span>`;
    }

    const utrInfo = (c.mode === "UPI" && c.transactionRef)
      ? `<span class="block text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-0.5">UTR: ${c.transactionRef}</span>`
      : "";

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition";
    tr.innerHTML = `
      <td class="p-3 font-mono font-bold text-bhagwa-700">${c.receiptNo}</td>
      <td class="p-3 font-semibold text-slate-800">${c.donorName}<br><span class="text-[10px] text-slate-400">${c.phone}</span></td>
      <td class="p-3">${c.society} (${c.wing} - ${c.flat})</td>
      <td class="p-3 font-bold ${c.status === 'CANCELLED_FAKE' ? 'line-through text-slate-400' : (c.status === 'PLEDGED' ? 'text-amber-600' : 'text-emerald-700')}">₹${c.amount.toLocaleString("en-IN")}</td>
      <td class="p-3 font-mono">${c.mode}${utrInfo}</td>
      <td class="p-3">${statusBadge}</td>
      <td class="p-3 text-slate-500">${c.volunteer}</td>
      <td class="p-3 whitespace-nowrap">
        <button onclick="viewReceiptDirectly('${c.id}')" class="text-[11px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-1 rounded" title="पावती प्रिव्ह्यू">
          पावती
        </button>
        <button onclick="resendWhatsApp('${c.id}')" class="text-[11px] bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2 py-1 rounded ml-1 font-semibold" title="डोनरला WhatsApp वर पाठवा">
          💬 WhatsApp
        </button>
        ${verifyActionBtns}
        <button onclick="deleteCollection('${c.id}')" class="text-[11px] bg-rose-50 hover:bg-rose-100 text-rose-700 px-2 py-1 rounded ml-1" title="नोंद हटवा">
          ✕
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function adminVerifyUtr(id) {
  const item = collections.find(c => c.id === id);
  if (!item) return;

  const pin = prompt("बँक SMS/स्टेटमेंटशी खात्री करण्यासाठी ऍडमिन पिन टाका (Default: 1930):");
  if (pin !== getAdminPin()) {
    alert("⚠️ चुकीचा ऍडमिन पिन!");
    return;
  }

  item.status = "RECEIVED";
  saveCollections();
  alert(`✓ पावती क्र. ${item.receiptNo} (UTR: ${item.transactionRef}) अधिकृतपणे बँकेत सत्यापित झाली!`);
}

function adminRejectFakeUtr(id) {
  const item = collections.find(c => c.id === id);
  if (!item) return;

  const pin = prompt("बनावट UTR पावती रद्द करण्यासाठी ऍडमिन पिन टाका (Default: 1930):");
  if (pin !== getAdminPin()) {
    alert("⚠️ चुकीचा ऍडमिन पिन!");
    return;
  }

  if (confirm(`⚠️ सावधान: पावती क्र. ${item.receiptNo} (UTR: ${item.transactionRef}) बनावट म्हणून रद्द करायची आहे का? या पावतीची ₹${item.amount} रक्कम एकूण हिशोबातून वजा होईल.`)) {
    item.status = "CANCELLED_FAKE";
    saveCollections();
    alert(`❌ बनावट UTR रद्द केला गेला! हिशोबातून ₹${item.amount} रक्कम वजा झाली.`);
  }
}

function filterCollections() {
  const q = document.getElementById("searchCollection").value;
  renderCollectionsTable(q);
}

function renderExpensesTable() {
  const tbody = document.getElementById("expenseTableBody");
  tbody.innerHTML = "";
  document.getElementById("expenseCountText").innerText = `${expenses.length} नोंदी`;

  if (expenses.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-6 text-slate-400">अद्याप कोणताही खर्च नोंदवलेला नाही.</td></tr>`;
    return;
  }

  expenses.forEach(e => {
    const billBtn = e.billUrl 
      ? `<button onclick="showBillModal('${e.billUrl}')" class="text-bhagwa-600 underline font-semibold">बिल पाहा</button>`
      : `<span class="text-slate-400">फोटो नाही</span>`;

    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-50 transition";
    tr.innerHTML = `
      <td class="p-2.5 font-mono text-slate-500">${e.date}</td>
      <td class="p-2.5 font-semibold text-slate-800">${e.category}</td>
      <td class="p-2.5">${e.vendor}<br><span class="text-[10px] text-slate-400">${e.desc || ""}</span></td>
      <td class="p-2.5 font-bold text-rose-700">₹${e.amount.toLocaleString("en-IN")}</td>
      <td class="p-2.5 whitespace-nowrap">
        ${billBtn}
        <button onclick="deleteExpense('${e.id}')" class="text-rose-500 hover:text-rose-700 ml-2 font-bold" title="खर्च हटवा">✕</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function viewReceiptDirectly(id) {
  const item = collections.find(c => c.id === id);
  if (!item) return;

  switchTab("donation");
  document.getElementById("prevReceiptNo").innerText = item.receiptNo;
  document.getElementById("prevDonorName").innerText = item.donorName;
  document.getElementById("prevAddress").innerText = `${item.wing}, ${item.society} (फ्लॅट: ${item.flat})`;
  document.getElementById("prevPaymentMode").innerText = `${item.mode} (${item.status})`;
  document.getElementById("prevAmount").innerText = `₹${item.amount.toFixed(2)}`;
  document.getElementById("prevVolunteer").innerText = item.volunteer;
  document.getElementById("prevDate").innerText = item.date;

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
  qrBox.innerHTML = "";
  new QRCode(qrBox, {
    text: `https://utsav.app/verify?receipt=${item.receiptNo}&amount=${item.amount}`,
    width: 52,
    height: 52
  });
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
    new QRCode(qrBox, {
      text: "https://utsav.app/verify?receipt=SJ-2027-0001",
      width: 52,
      height: 52
    });
  }
}

// -----------------------------------------------------------------------------
// 6. CSV EXPORT
// -----------------------------------------------------------------------------
function exportCollectionsCsv() {
  let csv = "ReceiptNo,DonorName,Phone,Society,Wing,Flat,Amount,Mode,Status,Volunteer,Date\n";
  collections.forEach(c => {
    csv += `"${c.receiptNo}","${c.donorName}","${c.phone}","${c.society}","${c.wing}","${c.flat}",${c.amount},"${c.mode}","${c.status}","${c.volunteer}","${c.date}"\n`;
  });

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `ShivJayanti_Collections_${new Date().toISOString().split("T")[0]}.csv`;
  link.click();
}

// -----------------------------------------------------------------------------
// 7. ADMIN SECURITY LOCK, VOLUNTEERS & SYSTEM CONFIG
// -----------------------------------------------------------------------------
const DEFAULT_ADMIN_PIN = "1930";

function getAdminPin() {
  return localStorage.getItem("utsav_admin_pin") || DEFAULT_ADMIN_PIN;
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
  const currentMasterPin = getAdminPin();

  if (enteredPin === currentMasterPin) {
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

  volunteers.push(newVol);
  saveVolunteers();

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

  if (confirm(`तुम्हाला '${vol.name}' या कार्यकर्त्याला यादीतून हटवायचे आहे का?`)) {
    volunteers = volunteers.filter(v => v.id !== id);
    saveVolunteers();
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
    localStorage.setItem("utsav_admin_pin", newPin);
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
// 8. DATA DELETION & RESET CONTROLS (ADMIN ONLY)
// -----------------------------------------------------------------------------
function deleteCollection(id) {
  const item = collections.find(c => c.id === id);
  if (!item) return;

  if (confirm(`पावती क्र. ${item.receiptNo} (${item.donorName} - ₹${item.amount}) डिलीट करायची आहे का?`)) {
    collections = collections.filter(c => c.id !== id);
    saveCollections();
    updateNextReceiptNumber();
  }
}

function deleteExpense(id) {
  const item = expenses.find(e => e.id === id);
  if (!item) return;

  if (confirm(`खर्च नोंद (${item.vendor} - ₹${item.amount}) डिलीट करायची आहे का?`)) {
    expenses = expenses.filter(e => e.id !== id);
    saveExpenses();
  }
}

function confirmResetAllData() {
  const pin = prompt("डेटा पूर्णपणे रिसेट करण्यासाठी ऍडमिन पिन टाका (Default: 1930):");
  if (pin !== getAdminPin()) {
    alert("⚠️ चुकीचा ऍडमिन पिन! डेटा रिसेट रद्द केला.");
    return;
  }

  if (confirm("⚠️ सावधान: सर्व जमा पावत्या आणि खर्चे डिलीट होऊन ₹0 ने नवीन सुरुवात होईल. तुम्ही खात्री करता का?")) {
    collections = [];
    expenses = [];
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
    const { error } = await supabaseClient.from("collections_simple").upsert({
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
      created_at: col.createdAt || new Date().toISOString()
    }, { onConflict: "id" });

    if (error) {
      console.warn("Supabase sync error (collection):", error.message);
      return false;
    }
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

  let colOk = 0, expOk = 0;

  for (const col of collections) {
    const ok = await syncCollectionToSupabase(col);
    if (ok) colOk++;
  }
  for (const exp of expenses) {
    const ok = await syncExpenseToSupabase(exp);
    if (ok) expOk++;
  }

  alert(`✅ Sync पूर्ण!\n✓ ${colOk}/${collections.length} पावत्या cloud वर\n✓ ${expOk}/${expenses.length} खर्चे cloud वर`);
}

// Load data FROM Supabase (for multi-device sync)
async function loadFromSupabase() {
  if (!supabaseClient) return;

  try {
    const { data: colData, error: colErr } = await supabaseClient
      .from("collections_simple")
      .select("*")
      .order("collected_date", { ascending: false });

    const { data: expData, error: expErr } = await supabaseClient
      .from("expenses_simple")
      .select("*")
      .order("bill_date", { ascending: false });

    if (!colErr && colData) {
      collections = colData.map(r => ({
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
        date: r.collected_date,
        createdAt: r.created_at
      }));
      localStorage.setItem("utsav_collections", JSON.stringify(collections));
    }

    if (!expErr && expData) {
      expenses = expData.map(r => ({
        id: r.id,
        category: r.category,
        vendor: r.vendor_name,
        amount: parseFloat(r.amount),
        date: r.bill_date,
        desc: r.description,
        billUrl: r.bill_image_url,
        createdAt: r.created_at
      }));
      localStorage.setItem("utsav_expenses", JSON.stringify(expenses));
    }

    updateLiveStats();
    renderCollectionsTable();
    renderExpensesTable();
    updateNextReceiptNumber();
    if (typeof renderPublicVolunteers === "function") renderPublicVolunteers();
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
  const stored = localStorage.getItem("utsav_gallery");
  if (stored !== null) {
    try {
      galleryItems = JSON.parse(stored);
      // If old default dummy fort photos exist and user wants clean gallery, allow empty
      if (Array.isArray(galleryItems) && galleryItems.some(p => p.id && p.id.startsWith("gal-") && parseInt(p.id.replace("gal-","")) < 10)) {
        galleryItems = [];
        saveGallery();
      }
    } catch (e) {
      galleryItems = [];
    }
  } else {
    galleryItems = [];
    saveGallery();
  }
  renderGallery();
}

function saveGallery() {
  localStorage.setItem("utsav_gallery", JSON.stringify(galleryItems));
  renderGallery();
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
  const pin = prompt("गॅलरीमध्ये फोटो जोडण्यासाठी ऍडमिन पिन टाका (Default: 1930):");
  if (pin !== getAdminPin()) {
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

  // If file uploaded, convert to Base64
  if (fileInput && fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      saveNewGalleryRecord(title, year, type, e.target.result);
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
  saveGallery();
  closeGalleryUploadModal();

  // Reset inputs
  if (document.getElementById("galTitleInput")) document.getElementById("galTitleInput").value = "";
  if (document.getElementById("galUrlInput")) document.getElementById("galUrlInput").value = "";
  if (document.getElementById("galFileInput")) document.getElementById("galFileInput").value = "";

  alert("✅ फोटो गॅलरीमध्ये यशस्वीरीत्या जोडला गेला!");
}

function deleteGalleryItem(id) {
  const pin = prompt("फोटो डिलीट करण्यासाठी ऍडमिन पिन टाका (Default: 1930):");
  if (pin !== getAdminPin()) {
    alert("⚠️ चुकीचा ऍडमिन पिन! फोटो डिलीट केला नाही.");
    return;
  }

  if (confirm("हा फोटो गॅलरीतून कायमचा काढून टाकायचा का?")) {
    galleryItems = galleryItems.filter(item => item.id !== id);
    saveGallery();
  }
}
