const appEl = document.getElementById("app");
let liveClockTimer = null;
let introTimer = null;

const PAYMENT_METHODS = ["Cash", "M-Pesa", "Gift Card", "Card", "Buy Goods", "Paybill", "Airtel Money", "Bank Transfer"];
const VAT_RATE = 0.16;
const PRODUCT_NAME = "Benjoji Business Suite";
const PRODUCT_LABEL = "Business Management Platform";
const PRODUCT_LOGO = "/benjoji-business-suite-logo.png";
const INTRO_DURATION_MS = 5500;
const MAX_IMAGE_UPLOAD_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_UPLOAD_SIZE_LABEL = "20MB";
const LOGO_IMAGE_MAX_DIMENSION = 1600;
const LOGO_IMAGE_OUTPUT_QUALITY = 0.9;
const pendingLogoUploads = new WeakMap();
let deferredInstallPrompt = null;

function isStandaloneApp() {
  return Boolean(globalThis.matchMedia?.("(display-mode: standalone)").matches || globalThis.navigator?.standalone === true);
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(globalThis.navigator?.userAgent || "");
}

function canShowInstallAction() {
  return !isStandaloneApp() && (Boolean(deferredInstallPrompt) || isIosDevice());
}

function installActionLabel() {
  return deferredInstallPrompt ? "Install App" : "Add to Home Screen";
}

function installHelperText() {
  if (deferredInstallPrompt) {
    return "Install on Windows or Android from a supported browser for a cleaner app-style experience.";
  }
  if (isIosDevice()) {
    return "On iPhone, open this in Safari, tap Share, then choose Add to Home Screen.";
  }
  return "";
}

function getReceiptPrintDefault() {
  return localStorage.getItem("benjoji_receipt_print_default") !== "false";
}

function getLastWorkspaceKey() {
  return localStorage.getItem("benjoji_last_workspace") || "";
}

function currentLocalIsoDate() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60 * 1000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function readState() {
  return globalThis.__benjojiState || null;
}

function availablePaymentMethods() {
  const enabled = readState()?.bootstrap?.workspaceConfig?.paymentProfile?.enabledMethods;
  return Array.isArray(enabled) && enabled.length ? enabled : PAYMENT_METHODS;
}

function defaultPaymentMethod() {
  return availablePaymentMethods()[0] || "Cash";
}

function getPaymentRouteConfig(method) {
  return readState()?.bootstrap?.workspaceConfig?.paymentProfile?.routes?.[method] || {};
}

function currentBusinessProfile() {
  return readState()?.bootstrap?.workspaceConfig?.businessProfile || {};
}

function businessPlaceholderLogo(name = "Business") {
  const safeName = String(name || "Business").trim() || "Business";
  const initials = safeName
    .split(/\s+/)
    .map((part) => part[0] || "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "B";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 160 160">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#191919"/>
          <stop offset="100%" stop-color="#2a2110"/>
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="34" fill="url(#g)"/>
      <circle cx="80" cy="80" r="58" fill="none" stroke="#d7a54a" stroke-width="5"/>
      <text x="80" y="95" text-anchor="middle" fill="#f3c86d" font-family="Georgia, serif" font-size="54" font-weight="700">${initials}</text>
    </svg>
  `;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function selectedWorkspaceSummary() {
  const selectedKey = readState()?.authWorkspaceKey || getLastWorkspaceKey();
  if (!selectedKey) {
    return null;
  }
  const workspaces = Array.isArray(readState()?.bootstrap?.workspaces) ? readState().bootstrap.workspaces : [];
  return workspaces.find((workspace) => workspace.workspaceKey === selectedKey) || null;
}

function selectedWorkspaceLogo() {
  const workspace = selectedWorkspaceSummary();
  return workspace?.logoDataUrl || businessPlaceholderLogo(workspace?.businessName || "Business");
}

function currentBusinessName() {
  if (!readState()?.bootstrap?.user) {
    return "";
  }
  const business = currentBusinessProfile();
  return business.businessName || readState()?.bootstrap?.activeWorkspace?.businessName || "";
}

function currentBusinessBranch() {
  if (!readState()?.bootstrap?.user) {
    return "Main Branch";
  }
  return currentBusinessProfile().branchName || readState()?.bootstrap?.activeWorkspace?.branchName || "Main Branch";
}

function currentBusinessLogo() {
  if (!readState()?.bootstrap?.user) {
    return PRODUCT_LOGO;
  }
  const businessName = currentBusinessName() || "Business";
  return currentBusinessProfile().logoDataUrl || readState()?.bootstrap?.activeWorkspace?.logoDataUrl || businessPlaceholderLogo(businessName);
}

function mergeWorkspaceSummaryIntoBootstrap(summary) {
  if (!summary || !state.bootstrap) {
    return;
  }

  const workspaceKey = summary.workspaceKey || currentWorkspaceKey();
  if (state.bootstrap.activeWorkspace && state.bootstrap.activeWorkspace.workspaceKey === workspaceKey) {
    state.bootstrap.activeWorkspace = {
      ...state.bootstrap.activeWorkspace,
      ...summary,
    };
  }

  if (Array.isArray(state.bootstrap.workspaces)) {
    state.bootstrap.workspaces = state.bootstrap.workspaces.map((workspace) => (
      workspace.workspaceKey === workspaceKey
        ? { ...workspace, ...summary }
        : workspace
    ));
  }
}

function applyBusinessProfileToState(profile = {}, workspaceSummary = null) {
  if (!state.bootstrap) {
    return;
  }

  const currentProfile = currentBusinessProfile();
  const nextProfile = {
    ...currentProfile,
    ...profile,
  };

  state.bootstrap.workspaceConfig = {
    ...(state.bootstrap.workspaceConfig || {}),
    businessProfile: nextProfile,
  };

  if (nextProfile.businessName) {
    state.bootstrap.businessName = nextProfile.businessName;
  }

  const currentSummary = state.bootstrap.activeWorkspace || {};
  mergeWorkspaceSummaryIntoBootstrap(workspaceSummary || {
    ...currentSummary,
    workspaceKey: currentSummary.workspaceKey || currentWorkspaceKey(),
    businessName: nextProfile.businessName || currentSummary.businessName || state.bootstrap.businessName || "Business Workspace",
    branchName: nextProfile.branchName || currentSummary.branchName || "Main Branch",
    logoDataUrl: Object.prototype.hasOwnProperty.call(nextProfile, "logoDataUrl")
      ? (nextProfile.logoDataUrl || "")
      : (currentSummary.logoDataUrl || ""),
  });

  if (state.ownerControl) {
    state.ownerControl = {
      ...state.ownerControl,
      businessProfile: {
        ...(state.ownerControl.businessProfile || {}),
        ...nextProfile,
      },
    };
  }
}

function syncWorkspaceBrandPreviewFromBusinessForm(form) {
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const data = formDataObject(form);
  const currentProfile = currentBusinessProfile();
  const businessName = (data.businessName || currentProfile.businessName || currentBusinessName() || "Business").trim() || "Business";
  const branchName = (data.branchName || currentProfile.branchName || currentBusinessBranch() || "Main Branch").trim() || "Main Branch";
  const logoDataUrl = Object.prototype.hasOwnProperty.call(data, "logoDataUrl")
    ? (data.logoDataUrl || "")
    : (currentProfile.logoDataUrl || "");
  const effectiveLogo = logoDataUrl || businessPlaceholderLogo(businessName);

  applyBusinessProfileToState({
    ...currentProfile,
    businessName,
    branchName,
    logoDataUrl,
  });

  document.querySelectorAll(".brand-logo").forEach((node) => {
    if (node instanceof HTMLImageElement) {
      node.src = effectiveLogo;
      node.alt = `${businessName} logo`;
    }
  });
  document.querySelectorAll(".super-brand-name").forEach((node) => {
    node.textContent = businessName;
  });
  document.querySelectorAll(".super-brand-role").forEach((node) => {
    node.textContent = branchName;
  });
  document.querySelectorAll(".super-view-kicker").forEach((node) => {
    node.textContent = `${businessName} Workspace`;
  });
  document.querySelectorAll(".super-branch-chip span").forEach((node) => {
    node.textContent = branchName;
  });
}

function currentWorkspaceKey() {
  return readState()?.bootstrap?.user?.workspaceKey || readState()?.bootstrap?.activeWorkspace?.workspaceKey || getLastWorkspaceKey();
}

function currentUserRoleLabel() {
  if (!readState()?.bootstrap?.user) {
    return "Business Access";
  }
  return readState().bootstrap.user.role === "OWNER" ? "Owner / Manager" : "Staff / Cashier";
}

function currentPanelLabel() {
  if (!readState()?.bootstrap?.user) {
    return "Business Workspace";
  }
  return readState().bootstrap.user.role === "OWNER" ? "Owner Workspace" : "Staff Workspace";
}

const PAYMENT_METHOD_CONFIG = {
  Cash: {
    subtitle: "Use for notes and coins received at the counter.",
    approvalModes: ["Cash Desk"],
    showPhone: false,
    showTarget: false,
    showReference: false,
    showPurpose: false,
  },
  "M-Pesa": {
    subtitle: "Choose STK push, SIM Toolkit, or manual confirmation.",
    approvalModes: ["STK Push", "SIM Toolkit", "Manual Confirmation"],
    showPhone: true,
    phoneLabel: "Customer Phone",
    phonePlaceholder: "254712345678",
    showTarget: true,
    targetLabel: "Business M-Pesa Line",
    targetPlaceholder: "Store payment line",
    showReference: true,
    referenceLabel: "M-Pesa Reference",
    referencePlaceholder: "Optional transaction code",
    showPurpose: true,
    purposeLabel: "Payment Purpose",
    purposePlaceholder: "Shopping, order number, or invoice purpose",
  },
  "Buy Goods": {
    subtitle: "Guide the customer through M-Pesa SIM Toolkit and till payment.",
    approvalModes: ["SIM Toolkit", "Till Prompt", "Manual Confirmation"],
    showPhone: true,
    phoneLabel: "Customer Phone",
    phonePlaceholder: "254712345678",
    showTarget: true,
    targetLabel: "Till Number",
    targetPlaceholder: "123456",
    showReference: true,
    referenceLabel: "Receipt / Message Reference",
    referencePlaceholder: "Optional Buy Goods reference",
    showPurpose: true,
    purposeLabel: "Payment Purpose",
    purposePlaceholder: "Shopping basket or service purpose",
  },
  Paybill: {
    subtitle: "Capture the paybill business number and account reference.",
    approvalModes: ["SIM Toolkit", "Paybill Prompt", "Manual Confirmation"],
    showPhone: true,
    phoneLabel: "Customer Phone",
    phonePlaceholder: "254712345678",
    showTarget: true,
    targetLabel: "Business Number",
    targetPlaceholder: "400200",
    showReference: true,
    referenceLabel: "Account Reference",
    referencePlaceholder: "Invoice, shelf order, or customer name",
    showPurpose: true,
    purposeLabel: "Payment Purpose",
    purposePlaceholder: "What this paybill payment is for",
  },
  "Airtel Money": {
    subtitle: "Use Airtel USSD or manual confirmation for transfers.",
    approvalModes: ["USSD Prompt", "SIM Toolkit", "Manual Confirmation"],
    showPhone: true,
    phoneLabel: "Customer Phone",
    phonePlaceholder: "254733123456",
    showTarget: true,
    targetLabel: "Receiver Line",
    targetPlaceholder: "Business Airtel line",
    showReference: true,
    referenceLabel: "Reference",
    referencePlaceholder: "Optional Airtel Money reference",
    showPurpose: true,
    purposeLabel: "Payment Purpose",
    purposePlaceholder: "What the Airtel payment is covering",
  },
  Card: {
    subtitle: "Use the POS terminal and capture the approval code if available.",
    approvalModes: ["POS Terminal", "Manual Confirmation"],
    showPhone: false,
    showTarget: false,
    showReference: true,
    referenceLabel: "Approval Code",
    referencePlaceholder: "POS approval or terminal slip number",
    showPurpose: false,
  },
  "Gift Card": {
    subtitle: "Validate the voucher or gift card before approving the tender line.",
    approvalModes: ["Gift Voucher", "Manual Confirmation"],
    showPhone: false,
    showTarget: false,
    showReference: true,
    referenceLabel: "Voucher / Gift Card Code",
    referencePlaceholder: "Gift card or voucher code",
    showPurpose: false,
  },
  "Bank Transfer": {
    subtitle: "Record the transfer reference and bank app approval flow.",
    approvalModes: ["Bank App", "Manual Confirmation"],
    showPhone: false,
    showTarget: true,
    targetLabel: "Receiving Account",
    targetPlaceholder: "Bank account or business code",
    showReference: true,
    referenceLabel: "Transfer Reference",
    referencePlaceholder: "Bank reference number",
    showPurpose: true,
    purposeLabel: "Payment Purpose",
    purposePlaceholder: "Stock order, invoice, or payment reason",
  },
};

const state = {
  theme: localStorage.getItem("benjoji_theme") || "dark",
  bootstrap: null,
  activeView: "dashboard",
  loading: false,
  error: "",
  notice: "",
  authTab: "password",
  authPopupOpen: false,
  authChallenge: null,
  authWorkspaceKey: getLastWorkspaceKey(),
  authPin: "",
  scannerPaused: localStorage.getItem("benjoji_scanner_paused") !== "false",
  receiptPrintDefault: getReceiptPrintDefault(),
  settingsOpen: false,
  settingsQuery: "",
  settingsSection: "overview",
  showIntro: true,
  securityPrompt: null,
  dashboard: null,
  dashboardDetail: "today-sales",
  inventoryDetail: "products",
  products: [],
  stockRecords: [],
  sales: [],
  credits: [],
  openCredits: [],
  paymentLedger: [],
  accounting: null,
  users: [],
  ownerControl: null,
  inventoryFormOpen: false,
  inventoryFormMode: "create",
  inventoryProductId: "",
  inventoryStockAction: "STOCK_IN",
  heldSales: loadHeldSales(),
  saleDraft: createSaleDraft(),
  invoiceDraft: createInvoiceDraft(),
  paymentWorkflow: createPaymentWorkflowState(),
  debtDraft: createDebtDraft(),
  reportDate: currentLocalIsoDate(),
  calendarAnchorDate: currentLocalIsoDate(),
  reportOutput: "",
  lastReport: null,
  reportDayModalDate: "",
};
globalThis.__benjojiState = state;

initInstallSupport();
init();

async function init() {
  applyTheme();
  startLiveClock();
  await loadBootstrap();
  if (state.bootstrap?.user) {
    await loadAppData();
  }
  render();
}

function createSaleDraft() {
  return {
    customerName: "",
    phoneNumber: "",
    customerIdNumber: "",
    processedBy: "",
    search: "",
    items: [],
    payments: [],
    paymentStageOpen: false,
    printReceipt: getReceiptPrintDefault(),
    paymentForm: defaultPaymentDraft(defaultPaymentMethod()),
    output: "",
  };
}

function createDebtDraft() {
  return {
    customerName: "",
    payments: [],
    paymentForm: defaultPaymentDraft(defaultPaymentMethod()),
    output: "",
  };
}

function createInvoiceDraft() {
  return {
    customerName: "",
    phoneNumber: "",
    customerIdNumber: "",
    notes: "",
    output: "",
  };
}

function createPaymentWorkflowState() {
  return {
    status: "idle",
    message: "",
    heading: "",
    detail: "",
    receiptText: "",
    sale: null,
    printReceipt: false,
  };
}

function defaultPaymentDraft(method) {
  const paymentMethod = availablePaymentMethods().includes(method) ? method : defaultPaymentMethod();
  const config = getPaymentConfig(paymentMethod);
  const route = getPaymentRouteConfig(paymentMethod);
  return {
    paymentMethod,
    amount: "",
    approvalMode: config.approvalModes[0],
    customerPhone: "",
    targetNumber: route.targetNumber || "",
    accountReference: "",
    paymentPurpose: "",
  };
}

function getPaymentConfig(method) {
  return PAYMENT_METHOD_CONFIG[method] || PAYMENT_METHOD_CONFIG.Cash;
}

function loadHeldSales() {
  try {
    const stored = JSON.parse(localStorage.getItem("benjoji_held_sales") || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function persistHeldSales() {
  localStorage.setItem("benjoji_held_sales", JSON.stringify(state.heldSales));
}

function holdCurrentSale() {
  if (!state.saleDraft.items.length) {
    throw new Error("Add items before holding a sale.");
  }

  state.heldSales.unshift({
    id: `held-${Date.now()}`,
    label: state.saleDraft.customerName || `Held Sale ${state.heldSales.length + 1}`,
    createdAt: new Date().toLocaleString("en-KE"),
    totalDue: saleTotalDue(),
    draft: JSON.parse(JSON.stringify(state.saleDraft)),
    items: [...state.saleDraft.items],
  });
  persistHeldSales();
  state.saleDraft = createSaleDraft();
}

function resumeHeldSale(heldId) {
  const index = state.heldSales.findIndex((entry) => entry.id === heldId);
  if (index === -1) {
    throw new Error("Held sale not found.");
  }
  const [entry] = state.heldSales.splice(index, 1);
  persistHeldSales();
  state.saleDraft = {
    ...createSaleDraft(),
    ...entry.draft,
  };
}

function deleteHeldSale(heldId) {
  state.heldSales = state.heldSales.filter((entry) => entry.id !== heldId);
  persistHeldSales();
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
}

function startLiveClock() {
  if (!liveClockTimer) {
    liveClockTimer = window.setInterval(refreshLiveClock, 1000);
  }
  refreshLiveClock();
}

function refreshLiveClock() {
  const now = new Date();
  const timeText = now.toLocaleTimeString("en-KE", { hour: "numeric", minute: "2-digit", second: "2-digit" });
  const dateText = now.toLocaleDateString("en-KE", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });

  document.querySelectorAll("[data-live-time]").forEach((node) => {
    node.textContent = timeText;
  });
  document.querySelectorAll("[data-live-date]").forEach((node) => {
    node.textContent = dateText;
  });
}

async function loadBootstrap() {
  state.loading = true;
  try {
    state.bootstrap = await api("/api/bootstrap");
    state.error = "";
  } catch (error) {
    state.error = error.message;
  } finally {
    state.loading = false;
  }
}

async function loadAppData() {
  const [dashboard, productsResult, stockResult, salesResult, creditResult, paymentResult, accounting] = await Promise.all([
    api("/api/dashboard"),
    api("/api/products"),
    api("/api/stock"),
    api("/api/sales"),
    api("/api/credits"),
    api("/api/payments"),
    api("/api/accounting"),
  ]);

  state.dashboard = dashboard;
  state.products = productsResult.products;
  state.stockRecords = stockResult.stockRecords;
  state.sales = salesResult.sales;
  state.credits = creditResult.credits;
  state.openCredits = creditResult.openCredits;
  state.paymentLedger = paymentResult.paymentLedger;
  state.accounting = accounting;

  if (state.bootstrap.user?.role === "OWNER") {
    const usersResult = await api("/api/users");
    state.users = usersResult.users;
    state.ownerControl = await api("/api/admin/control-center");
  } else {
    state.users = [];
    state.ownerControl = null;
  }
}

function render() {
  applyTheme();

  if (!state.bootstrap) {
    appEl.innerHTML = screenShell(`<div class="empty-state">Loading application...</div>`);
    refreshLiveClock();
    return;
  }

  try {
    if (state.showIntro) {
      try {
        appEl.innerHTML = renderIntroModal();
        syncIntroTimer();
        refreshLiveClock();
        return;
      } catch (introError) {
        console.error("Intro render failed:", introError);
        state.showIntro = false;
      }
    }

    const baseScreen = !state.bootstrap.user
      ? renderAuthScreen()
      : renderAppShell();

    appEl.innerHTML = baseScreen;
    syncIntroTimer();
  } catch (renderError) {
    console.error("App render failed:", renderError);
    state.showIntro = false;
    appEl.innerHTML = screenShell(`
      <div class="app-card" style="padding:24px;">
        <div class="status-banner error">The app hit a display problem and recovered to a safe screen.</div>
        <h2>Benjoji Business Suite</h2>
        <p class="muted">Please refresh once. If this keeps happening, the latest visual change needs another fix.</p>
      </div>
    `);
  }
  refreshLiveClock();
}

function syncIntroTimer() {
  if (state.showIntro) {
    if (!introTimer) {
      introTimer = window.setTimeout(() => {
        state.showIntro = false;
        introTimer = null;
        render();
      }, INTRO_DURATION_MS);
    }
    return;
  }
  if (introTimer) {
    window.clearTimeout(introTimer);
    introTimer = null;
  }
}

function screenShell(content) {
  return `<div class="shell">${content}</div>`;
}

function renderAuthScreen() {
  const hasWorkspaces = Boolean(state.bootstrap.hasWorkspaces);
  const selectedWorkspace = selectedWorkspaceSummary();
  const navLinks = [
    { label: "Overview", href: "#auth-hero" },
    { label: "Modules", href: "#auth-modules" },
    { label: "Industries", href: "#auth-industries" },
    { label: "Access", href: "#auth-access" },
  ];
  const highlightCards = [
    {
      title: "Checkout That Feels Premium",
      copy: "Fast selling, split payment support, and clean tender flow that feels ready for real business counters.",
      iconName: "sales",
    },
    {
      title: "Inventory Under Control",
      copy: "Manage products, stock movement, low-stock visibility, and price updates from one organized workspace.",
      iconName: "inventory",
    },
    {
      title: "Access You Can Trust",
      copy: "Owner and staff accounts stay clear, secure, and role-aware for sensitive actions and approvals.",
      iconName: "access",
    },
    {
      title: "Reports That Answer Questions",
      copy: "Review what was sold, what moved, and how the business performed across daily to annual periods.",
      iconName: "reports",
    },
  ];
  const moduleCards = [
    {
      title: "Point of Sale",
      copy: "Basket-first checkout, quantity control, split tenders, and receipt-ready payment flow for cashier teams.",
      kicker: "Fast cashier experience",
      iconName: "sales",
    },
    {
      title: "Inventory",
      copy: "Track stock in and stock out, manage products, and monitor what needs replenishment before it hurts sales.",
      kicker: "Control stock movement",
      iconName: "inventory",
    },
    {
      title: "Reports",
      copy: "Daily, weekly, monthly, and annual reporting that makes end-of-day and management review easier.",
      kicker: "See what the business is doing",
      iconName: "reports",
    },
    {
      title: "Access Control",
      copy: "Keep ownership, staff permissions, and protected actions organized across one or many business users.",
      kicker: "Protect sensitive actions",
      iconName: "access",
    },
  ];
  const outcomeCards = [
    { label: "Professional first impression", value: "Product-grade welcome page and clean account entry." },
    { label: "Ready for client demos", value: "Clear value story before anyone even logs in." },
    { label: "Built to scale", value: "Suitable for single stores, chains, and multi-branch businesses." },
  ];
  const industries = ["Retail", "Supermarkets", "Pharmacies", "Restaurants", "Salons", "Multi-branch shops"];
  return screenShell(`
    <div class="auth-shell auth-landing-shell">
      <header class="auth-landing-nav app-card">
        <div class="auth-nav-brand">
          <img class="logo-image" src="${PRODUCT_LOGO}" alt="Benjoji Business Suite logo" />
          <div>
            <div class="eyebrow auth-eyebrow">${escapeHtml(PRODUCT_LABEL)}</div>
            <strong>${escapeHtml(PRODUCT_NAME)}</strong>
          </div>
      </div>
        <div class="auth-nav-links">
          ${navLinks.map((item) => `<a href="${item.href}">${escapeHtml(item.label)}</a>`).join("")}
        </div>
        <div class="auth-top-actions">
          ${canShowInstallAction() ? `<button type="button" class="ghost-button install-button" data-action="install-app">${escapeHtml(installActionLabel())}</button>` : ""}
          <button type="button" class="secondary-button" data-action="open-auth-popup" data-tab="password">Login</button>
          <button type="button" class="primary-button" data-action="open-auth-popup" data-tab="create-account">Sign Up</button>
        </div>
      </header>

      <section id="auth-hero" class="auth-hero-section app-card">
        <div class="auth-hero-grid">
          <div class="auth-hero-copy">
            <div class="auth-platform-badge">${hasWorkspaces ? "Workspace-ready for many businesses" : "Create the first business workspace"}</div>
            <h1>Give clients a business suite that feels premium from the very first page.</h1>
            <p>Benjoji Business Suite brings together checkout, stock control, staff access, and reporting in one refined platform built for businesses that want a serious operational system and a strong first impression.</p>
            <div class="auth-hero-actions">
              ${canShowInstallAction() ? `<button type="button" class="ghost-button install-button" data-action="install-app">${escapeHtml(installActionLabel())}</button>` : ""}
              <button type="button" class="primary-button" data-action="open-auth-popup" data-tab="create-account">Create Workspace</button>
              <button type="button" class="secondary-button" data-action="open-auth-popup" data-tab="password">Login</button>
            </div>
            ${installHelperText() ? `<div class="status-banner auth-status">${escapeHtml(installHelperText())}</div>` : ""}
            ${state.notice ? `<div class="status-banner auth-status">${escapeHtml(state.notice)}</div>` : ""}
            ${state.error ? `<div class="status-banner error auth-status">${escapeHtml(state.error)}</div>` : ""}
            ${
              selectedWorkspace
                ? `
              <div class="auth-workspace-callout">
                <img class="auth-workspace-callout-logo" src="${escapeAttr(selectedWorkspaceLogo())}" alt="${escapeAttr(selectedWorkspace.businessName)} logo" />
                <div>
                  <strong>Saved Workspace Ready</strong>
                  <span>${escapeHtml(selectedWorkspace.businessName)} | ${escapeHtml(selectedWorkspace.workspaceKey)} | Use Login to continue into that business.</span>
                </div>
              </div>
            `
                : ""
            }
            <div class="auth-proof-grid">
              <div class="auth-proof-card">
                <strong>One connected workspace</strong>
                <span>Checkout, inventory, credits, staff accounts, and reporting in one coordinated system.</span>
              </div>
              <div class="auth-proof-card">
                <strong>Built for many business types</strong>
                <span>Retail, pharmacy, restaurant, salon, and chain business operations.</span>
              </div>
              <div class="auth-proof-card">
                <strong>Client-facing presentation</strong>
                <span>Simple entry, premium layout, and a stronger software first impression.</span>
              </div>
            </div>
          </div>
          <div class="auth-hero-preview">
            ${renderAuthHeroPreview({ hasWorkspaces, selectedWorkspace })}
          </div>
        </div>
      </section>

      <section class="auth-outcomes-grid">
        ${outcomeCards.map((item) => `
          <article class="auth-outcome-card app-card">
            <span>${escapeHtml(item.label)}</span>
            <strong>${escapeHtml(item.value)}</strong>
          </article>
        `).join("")}
      </section>

      <section class="auth-section-grid">
        ${highlightCards.map((card) => renderAuthHighlightCard(card)).join("")}
      </section>

      <section id="auth-modules" class="auth-module-section app-card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Platform Modules</div>
            <h2 class="section-title">A clean software homepage that explains the product quickly</h2>
            <div class="section-subtitle">The page is organized like a real commercial landing experience: strong hero section, clear modules, visible business fit, and obvious actions.</div>
          </div>
        </div>
        <div class="auth-modules-grid">
          ${moduleCards.map((card) => renderAuthModuleCard(card)).join("")}
        </div>
      </section>

      <section id="auth-industries" class="auth-market-grid">
        <article class="auth-market-card app-card">
          <div>
            <div class="eyebrow">Built To Sell</div>
            <h2>${hasWorkspaces ? "Reusable across many client businesses" : "Create the first workspace for a new business"}</h2>
          </div>
          <div class="auth-market-list">
            ${industries.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}
          </div>
          <div class="auth-trust-strip">
            ${!hasWorkspaces
              ? "Start with the business name, create the owner account, and the system is ready for staff onboarding."
              : "Clients see a clean product landing page first, then log in or create their own independent business workspace."}
          </div>
        </article>
        <article class="auth-journey-card app-card">
          <div class="eyebrow">Client Journey</div>
          <div class="auth-journey-steps">
            <div><strong>1. Discover</strong><span>They land on a premium page that explains the value clearly.</span></div>
            <div><strong>2. Access</strong><span>They use Login for an existing workspace or Sign Up to create a new business workspace.</span></div>
            <div><strong>3. Operate</strong><span>They enter a branded workspace built for sales, inventory, staff control, and reports.</span></div>
          </div>
        </article>
      </section>

      <section id="auth-access" class="auth-bottom-cta app-card">
        <div>
          <div class="eyebrow">Ready To Start</div>
          <h2 class="section-title">Make the first impression feel like software a client can trust and buy.</h2>
          <div class="section-subtitle">Keep the entry simple, attractive, and professional while giving every business an independent workspace of its own.</div>
        </div>
        <div class="auth-bottom-actions">
          <button type="button" class="primary-button" data-action="open-auth-popup" data-tab="create-account">Create Workspace</button>
          <button type="button" class="secondary-button" data-action="open-auth-popup" data-tab="password">Login</button>
        </div>
      </section>
      ${renderAuthPopup()}
    </div>
  `);
}

function renderAuthHeroPreview({ hasWorkspaces, selectedWorkspace }) {
  return `
    <div class="auth-interface-shell">
      ${
        selectedWorkspace
          ? `
        <div class="auth-interface-mini auth-interface-workspace">
          <div class="auth-interface-brand">
            <img src="${escapeAttr(selectedWorkspace.logoDataUrl || businessPlaceholderLogo(selectedWorkspace.businessName))}" alt="${escapeAttr(selectedWorkspace.businessName)} logo" />
            <div>
              <span>Saved Workspace</span>
              <strong>${escapeHtml(selectedWorkspace.businessName)}</strong>
            </div>
          </div>
          <strong>Workspace ID: ${escapeHtml(selectedWorkspace.workspaceKey)}</strong>
        </div>
      `
          : ""
      }
      <div class="auth-interface-window auth-interface-primary">
        <div class="auth-interface-top">
          <span>Live Operations</span>
          <strong>Business Snapshot</strong>
        </div>
        <div class="auth-interface-metrics">
          <div><span>Today's Sales</span><strong>KES 208,840</strong></div>
          <div><span>Items In Stock</span><strong>14,620</strong></div>
          <div><span>Open Credits</span><strong>18</strong></div>
        </div>
        <div class="auth-interface-chart">
          <span style="height: 42%"></span>
          <span style="height: 68%"></span>
          <span style="height: 56%"></span>
          <span style="height: 84%"></span>
          <span style="height: 72%"></span>
          <span style="height: 94%"></span>
        </div>
      </div>
      <div class="auth-interface-window auth-interface-secondary">
        <div class="auth-interface-top">
          <span>Counter Flow</span>
          <strong>Checkout Experience</strong>
        </div>
        <div class="auth-interface-lines">
          <div><span>Sugar 2kg</span><strong>KES 700</strong></div>
          <div><span>Bread Brown</span><strong>KES 180</strong></div>
          <div><span>Milk 500ml</span><strong>KES 120</strong></div>
        </div>
        <div class="auth-interface-total">
          <span>Total Due</span>
          <strong>KES 1,000</strong>
        </div>
      </div>
      <div class="auth-interface-mini">
        <span>Payments</span>
        <strong>${hasWorkspaces ? "Independent workspaces | Independent branding" : "Cash | Card | M-Pesa | Airtel"}</strong>
      </div>
    </div>
  `;
}

function renderAuthHighlightCard({ title, copy, iconName }) {
  return `
    <article class="auth-highlight-card app-card">
      <div class="auth-card-top">
        <span class="auth-card-icon">${icon(iconName)}</span>
        <div class="eyebrow">Client-ready value</div>
      </div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(copy)}</span>
    </article>
  `;
}

function renderAuthModuleCard({ title, copy, kicker, iconName }) {
  return `
    <article class="auth-module-card">
      <div class="auth-card-top">
        <span class="auth-card-icon">${icon(iconName)}</span>
        <div class="eyebrow">${escapeHtml(kicker)}</div>
      </div>
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(copy)}</span>
    </article>
  `;
}

function renderAuthPopup() {
  if (!state.authPopupOpen) {
    return "";
  }

  const selectedWorkspace = selectedWorkspaceSummary();
  const workspaceKey = selectedWorkspace?.workspaceKey || state.authWorkspaceKey || currentWorkspaceKey();
  const title = state.authChallenge
    ? "Two-step verification"
    : state.authTab === "create-account" ? "Create a new business workspace" : "Login to a workspace";
  const subtitle = state.authChallenge
    ? "Complete the second step to finish signing in."
    : state.authTab === "create-account"
      ? "Create an independent workspace for a new company and customize it from day one."
      : "Enter the workspace ID, username, and password to access an existing business workspace.";

  return `
    <div class="modal-layer open auth-popup-layer">
      <button type="button" class="settings-backdrop" data-action="close-auth-popup" aria-label="Close auth popup"></button>
      <div class="inventory-modal auth-modal app-card" role="dialog" aria-modal="true" aria-labelledby="auth-popup-title">
        <div class="section-header">
          <div>
            <div class="eyebrow">Secure Access</div>
            <h2 id="auth-popup-title" class="section-title">${escapeHtml(title)}</h2>
            <div class="section-subtitle">${escapeHtml(subtitle)}</div>
          </div>
          <button class="ghost-button icon-button" type="button" data-action="close-auth-popup">${icon("close")}</button>
        </div>
        ${
          !state.authChallenge && selectedWorkspace && state.authTab === "password"
            ? `
          <div class="auth-workspace-banner">
            <img class="auth-workspace-banner-logo" src="${escapeAttr(selectedWorkspace.logoDataUrl || businessPlaceholderLogo(selectedWorkspace.businessName))}" alt="${escapeAttr(selectedWorkspace.businessName)} logo" />
            <div>
              <strong>${escapeHtml(selectedWorkspace.businessName)}</strong>
              <span>${escapeHtml(selectedWorkspace.branchName || "Main Branch")} | Workspace ID: ${escapeHtml(workspaceKey || "Not selected")}</span>
            </div>
          </div>
        `
            : ""
        }
        ${
          !state.authChallenge
            ? `
          <div class="tabs-inline auth-popup-tabs">
            <button type="button" class="${state.authTab === "password" ? "active" : ""}" data-action="switch-auth-tab" data-tab="password">Login</button>
            <button type="button" class="${state.authTab === "create-account" ? "active" : ""}" data-action="switch-auth-tab" data-tab="create-account">Sign Up</button>
          </div>
        `
            : ""
        }
        ${state.error ? `<div class="status-banner error auth-status auth-popup-status">${escapeHtml(state.error)}</div>` : ""}
        ${state.authChallenge ? renderSecondFactorForm() : state.authTab === "create-account" ? renderSetupForm() : renderLoginForm()}
      </div>
    </div>
  `;
}

function renderBusinessWorkspaceOptions() {
  const workspaces = Array.isArray(state.bootstrap?.workspaces) ? state.bootstrap.workspaces : [];
  if (!workspaces.length) {
    return "";
  }

  return `
    <div class="auth-workspace-list">
      <div class="eyebrow">Available Local Workspaces</div>
      <div class="auth-workspace-tags">
        ${workspaces.map((workspace) => `
          <button
            type="button"
            class="ghost-button compact-button"
            data-action="use-workspace-key"
            data-workspace-key="${escapeAttr(workspace.workspaceKey)}"
          >
            ${escapeHtml(workspace.businessName)} | ${escapeHtml(workspace.workspaceKey)}
          </button>
        `).join("")}
      </div>
    </div>
  `;
}

function renderBusinessLogoEditor({ hiddenName, value = "", label = "Business Logo", helper = "", removeAction = "", fallbackName = "Business" }) {
  const hasCustomLogo = Boolean(value);
  const fallbackLogo = businessPlaceholderLogo(fallbackName);
  return `
    <div class="field full-span business-logo-field">
      <label>${escapeHtml(label)}</label>
      <div class="business-logo-editor">
        <div class="business-logo-preview ${hasCustomLogo ? "" : "using-fallback"}">
          <img
            src="${escapeAttr(value || fallbackLogo)}"
            alt="${hasCustomLogo ? "Business logo preview" : "Business placeholder preview"}"
            data-business-logo-preview
            data-fallback-src="${escapeAttr(fallbackLogo)}"
          />
        </div>
        <div class="business-logo-editor-copy">
          <input type="hidden" name="${escapeAttr(hiddenName)}" value="${escapeAttr(value)}" />
          <input type="file" accept="image/*" data-action="business-logo-upload" />
          <div class="helper-text" data-business-logo-status>
            ${escapeHtml(helper || (hasCustomLogo ? `Custom business logo ready for this workspace. Images up to ${MAX_IMAGE_UPLOAD_SIZE_LABEL} are supported and large files are optimized automatically.` : `Upload a business logo up to ${MAX_IMAGE_UPLOAD_SIZE_LABEL}, or continue with a company placeholder until one is added. Large images are optimized automatically.`))}
          </div>
          ${
            removeAction
              ? `<button type="button" class="ghost-button compact-button" data-action="${escapeAttr(removeAction)}">Remove Custom Logo</button>`
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

function renderSetupForm() {
  return `
    <div class="auth-copy-block">
      <h2>Create a business workspace</h2>
      <p class="section-subtitle">Set up a new company, create the owner account, define how money is received, and establish the security and recovery rules from day one.</p>
    </div>
    <form id="setup-form" class="form-grid auth-form-grid">
      <div class="full-span auth-stage-title">Stage 1. Workspace Identity</div>
      <div class="field full-span">
        <label>Business Name</label>
        <input name="businessName" required placeholder="Your Business Name" />
      </div>
      <div class="field">
        <label>Workspace ID</label>
        <input name="workspaceKey" placeholder="my-business-suite" />
      </div>
      <div class="field">
        <label>Legal Business Name</label>
        <input name="legalName" placeholder="Registered business name" />
      </div>
      <div class="field">
        <label>Branch Name</label>
        <input name="branchName" placeholder="Main Branch" />
      </div>
      ${renderBusinessLogoEditor({
        hiddenName: "logoDataUrl",
        fallbackName: "Business",
        helper: "This appears inside the business workspace after login.",
      })}
      <div class="field">
        <label>Contact Phone</label>
        <input name="contactPhone" placeholder="+254..." />
      </div>
      <div class="field">
        <label>Contact Email</label>
        <input name="contactEmail" type="email" placeholder="hello@business.com" />
      </div>
      <div class="field full-span">
        <label>Business Address</label>
        <input name="address" placeholder="City, street, building" />
      </div>
      <div class="field">
        <label>Tax / Registration ID</label>
        <input name="taxId" placeholder="KRA PIN / tax reference" />
      </div>
      <div class="field">
        <label>Support Contact Name</label>
        <input name="supportName" placeholder="Operations Desk" />
      </div>

      <div class="full-span auth-stage-title">Stage 2. Owner Credentials</div>
      <div class="field">
        <label>Owner Full Name</label>
        <input name="fullName" required placeholder="System Administrator" />
      </div>
      <div class="field">
        <label>Username</label>
        <input name="username" required placeholder="admin" />
      </div>
      <div class="field">
        <label>Email</label>
        <input name="email" type="email" placeholder="owner@yourbusiness.com" />
      </div>
      <div class="field">
        <label>Password</label>
        <input name="password" type="password" required placeholder="At least 8 characters" />
      </div>
      <div class="field">
        <label>Confirm Password</label>
        <input name="confirmPassword" type="password" required placeholder="Repeat password" />
      </div>
      <div class="field">
        <label>Owner Security PIN</label>
        <input name="pin" type="password" inputmode="numeric" maxlength="6" placeholder="6-digit PIN for second step" />
      </div>
      <div class="field">
        <label>Confirm Security PIN</label>
        <input name="confirmPin" type="password" inputmode="numeric" maxlength="6" placeholder="Repeat 6-digit PIN" />
      </div>

      <div class="full-span auth-stage-title">Stage 3. Security & Recovery</div>
      <div class="field">
        <label>Second Authentication Stage</label>
        <select name="secondFactorMode">
          <option value="NONE">Password only</option>
          <option value="OWNER_ONLY">Owner login requires second step</option>
          <option value="ALL_USERS">All users require second step</option>
        </select>
      </div>
      <div class="field">
        <label>Failed Login Limit</label>
        <input name="loginAttemptLimit" type="number" min="3" step="1" value="5" />
      </div>
      <div class="field">
        <label>Lock Duration (Minutes)</label>
        <input name="lockMinutes" type="number" min="5" step="1" value="15" />
      </div>
      <div class="field">
        <label>Backup Retention</label>
        <input name="backupRetention" type="number" min="5" step="1" value="20" />
      </div>
      <div class="field">
        <label><input type="checkbox" name="autoBackupEnabled" value="true" checked /> Enable automatic backup snapshots</label>
      </div>

      <div class="full-span auth-stage-title">Stage 4. Payment Routing & Receipt</div>
      <div class="full-span auth-checkbox-grid">
        ${PAYMENT_METHODS.map((method) => `
          <label class="auth-check-card">
            <input type="checkbox" name="enabledMethods" value="${escapeAttr(method)}" checked />
            <span>${escapeHtml(method)}</span>
          </label>
        `).join("")}
      </div>
      <div class="field">
        <label>M-Pesa Line / Till</label>
        <input name="routeMpesaTarget" placeholder="Business M-Pesa line or till number" />
      </div>
      <div class="field">
        <label>Paybill Number</label>
        <input name="routePaybillTarget" placeholder="Paybill number" />
      </div>
      <div class="field">
        <label>Airtel Money Line</label>
        <input name="routeAirtelTarget" placeholder="Business Airtel line" />
      </div>
      <div class="field">
        <label>Bank Transfer Account</label>
        <input name="routeBankTarget" placeholder="Bank account or code" />
      </div>
      <div class="field full-span">
        <label>Receipt Header Title</label>
        <input name="headerTitle" placeholder="Official Receipt" />
      </div>
      <div class="field full-span">
        <label>Receipt Footer Note</label>
        <textarea name="footerNote" rows="2" placeholder="Thank you for choosing us."></textarea>
      </div>
      <div class="field full-span">
        <label>Return Policy</label>
        <textarea name="returnPolicy" rows="2" placeholder="Goods once sold can only be returned according to business policy."></textarea>
      </div>

      <div class="full-span auth-stage-title">Stage 5. Compliance Acceptance</div>
      <div class="full-span auth-legal-card">
        <strong>Operational and legal notice</strong>
        <span>This setup includes privacy, payment, and backup controls inspired by current authentication, payment-security, and data-protection guidance, but each business should still review local legal, tax, employment, and payment-provider obligations with qualified advisors.</span>
      </div>
      <div class="field full-span">
        <label><input type="checkbox" name="accepted" value="true" required /> I confirm that the business owner accepts the platform terms, privacy handling rules, and backup responsibilities.</label>
      </div>
      <div class="full-span">
        <button class="primary-button auth-submit" type="submit">Create Workspace</button>
      </div>
    </form>
  `;
}

function renderLoginForm() {
  const secondFactorMode = state.bootstrap?.workspaceConfig?.securityPolicy?.secondFactorMode || "NONE";
  const preferredWorkspace = state.authWorkspaceKey || currentWorkspaceKey();
  return `
    <div class="auth-copy-block">
      <h2>Login</h2>
      <p class="section-subtitle">Enter the workspace ID, username, and password to access the workspace.${secondFactorMode !== "NONE" && currentWorkspaceKey() ? " A second security step may appear after password verification." : ""}</p>
    </div>
    <form id="login-form" class="form-grid single auth-form-grid">
      <input type="hidden" name="authMode" value="password" />
      <div class="field">
        <label>Workspace ID</label>
        <input name="workspaceKey" required placeholder="workspace-id" value="${escapeAttr(preferredWorkspace)}" />
      </div>
      <div class="field">
        <label>Username</label>
        <input name="username" required placeholder="Username" />
      </div>
      <div class="field">
        <label>Password</label>
        <input name="password" type="password" required placeholder="Password" />
      </div>
      <div>
        <button class="primary-button auth-submit" type="submit">Login</button>
      </div>
      ${renderBusinessWorkspaceOptions()}
      <div class="auth-form-switch">
        Need a workspace?
        <button type="button" class="inline-link-button" data-action="switch-auth-tab" data-tab="create-account">Create Workspace</button>
      </div>
    </form>
  `;
}

function renderSecondFactorForm() {
  return `
    <div class="auth-copy-block">
      <h2>Security verification</h2>
      <p class="section-subtitle">A password check has passed. Enter the 6-digit account PIN to complete sign-in for workspace ${escapeHtml(state.authChallenge?.workspaceKey || currentWorkspaceKey() || "-")}.</p>
    </div>
    <form id="second-factor-form" class="form-grid single auth-form-grid">
      <div class="field">
        <label>Workspace ID</label>
        <input value="${escapeAttr(state.authChallenge?.workspaceKey || currentWorkspaceKey() || "")}" disabled />
      </div>
      <div class="field">
        <label>Username</label>
        <input value="${escapeAttr(state.authChallenge?.username || "")}" disabled />
      </div>
      <div class="field">
        <label>Security PIN</label>
        <input name="pin" type="password" inputmode="numeric" maxlength="6" required placeholder="6-digit PIN" />
      </div>
      <div>
        <button class="primary-button auth-submit" type="submit">Verify and Login</button>
      </div>
      <div class="auth-form-switch">
        Need to restart?
        <button type="button" class="inline-link-button" data-action="reset-auth-challenge">Back to Login</button>
      </div>
    </form>
  `;
}

function renderPinDots(value) {
  const dots = Array.from({ length: 6 }, (_, index) => `<span class="pin-dot ${index < value.length ? "filled" : ""}"></span>`).join("");
  return `<div class="pin-dot-row">${dots}</div>`;
}

function renderPinKey(key) {
  if (key === "clear") {
    return `<button class="pin-key danger" type="button" data-action="clear-login-pin">C</button>`;
  }
  if (key === "back") {
    return `<button class="pin-key warning" type="button" data-action="backspace-login-pin">${icon("backspace")}</button>`;
  }
  return `<button class="pin-key" type="button" data-action="append-login-pin" data-digit="${key}">${key}</button>`;
}

function renderIntroModal() {
  if (!state.bootstrap || !state.showIntro) {
    return "";
  }

  return `
    <section class="splash-intro-screen" aria-label="Benjoji Business Suite intro">
      <div class="splash-intro-illustration" aria-hidden="true">
        <div class="splash-gold-halo"></div>
        <div class="splash-chart-glow splash-chart-glow-left"></div>
        <div class="splash-chart-glow splash-chart-glow-right"></div>
        <div class="splash-chart-panel splash-chart-panel-bars">
          <span style="height: 38%"></span>
          <span style="height: 54%"></span>
          <span style="height: 72%"></span>
          <span style="height: 62%"></span>
          <span style="height: 86%"></span>
          <span style="height: 100%"></span>
        </div>
        <div class="splash-chart-panel splash-chart-panel-line">
          <span></span>
          <span></span>
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
      <div class="splash-intro-modal" role="presentation">
        <div class="splash-intro-center">
          <div class="splash-intro-logo-wrap">
            <img class="splash-intro-logo" src="${PRODUCT_LOGO}" alt="Benjoji Business Suite logo" />
          </div>
          <div class="splash-intro-title-block">
            <div class="splash-intro-kicker">Business Management Platform</div>
            <h1>${escapeHtml(PRODUCT_NAME)}</h1>
          </div>
          <p>One connected workspace for sales, stock, reports, payments, and business operations.</p>
          <div class="splash-intro-progress">
            <span></span>
          </div>
        </div>
        <div class="splash-intro-footer">
          <span>Opening workspace...</span>
        </div>
      </div>
    </section>
  `;
}

function renderSecurityModal() {
  if (!state.securityPrompt) {
    return "";
  }

  const defaultMode = state.bootstrap?.user?.hasPin ? "pin" : "password";
  return `
    <div class="modal-layer open security-layer">
      <button type="button" class="settings-backdrop" data-action="cancel-security-prompt" aria-label="Close security prompt"></button>
      <div class="inventory-modal security-modal app-card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Security Check</div>
            <h2 class="section-title">${escapeHtml(state.securityPrompt.title)}</h2>
            <div class="section-subtitle">Enter the current user passkey to continue.</div>
          </div>
          <button class="ghost-button icon-button" type="button" data-action="cancel-security-prompt">${icon("close")}</button>
        </div>
        <form id="security-verify-form" class="form-grid auth-form-grid">
          <div class="field">
            <label>Verification Mode</label>
            <select name="authMode">
              <option value="pin" ${defaultMode === "pin" ? "selected" : ""}>PIN</option>
              <option value="password" ${defaultMode === "password" ? "selected" : ""}>Password</option>
            </select>
          </div>
          <div class="field">
            <label>PIN</label>
            <input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Current user PIN" />
          </div>
          <div class="field full-span">
            <label>Password</label>
            <input name="password" type="password" placeholder="Current user password" />
          </div>
          <div class="full-span action-bar">
            <button class="primary-button" type="submit">Approve Action</button>
            <button class="secondary-button" type="button" data-action="cancel-security-prompt">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

function renderSalePaymentModal() {
  if (!state.saleDraft.paymentStageOpen) {
    return "";
  }

  const totalDue = saleTotalDue();
  const totalPaid = saleTotalPaid();
  const balance = totalDue - totalPaid;
  const paymentConfig = getPaymentConfig(state.saleDraft.paymentForm.paymentMethod);
  const hasPayments = state.saleDraft.payments.length > 0;
  const shouldAutoApplyDraft = shouldAutoApplyCurrentSalePayment();
  const completeLabel = shouldAutoApplyDraft
    ? "Apply Payment & Finalize"
    : hasPayments
      ? balance > 0.0001
        ? "Finalize As Partial / Credit"
        : "Finalize Sale"
      : "Finalize As Credit";

  return `
      <div class="modal-layer open pos-payment-layer">
        <button type="button" class="settings-backdrop" data-action="close-sale-payment" aria-label="Close payment popup"></button>
        <div class="inventory-modal payment-modal app-card" role="dialog" aria-modal="true" aria-labelledby="sale-payment-title">
          <div class="section-header payment-modal-header">
            <div>
              <div class="eyebrow">Checkout Payment</div>
              <h2 id="sale-payment-title" class="section-title">Collect payment and confirm tender</h2>
              <div class="section-subtitle">Choose the payment method, enter the tender, then finalize the sale from this popup.</div>
            </div>
            <button class="ghost-button icon-button" type="button" data-action="close-sale-payment">${icon("close")}</button>
          </div>

          <div class="payment-modal-body">
            <div class="payment-modal-summary">
              ${summaryLine("Items", state.saleDraft.items.reduce((sum, item) => sum + item.quantity, 0))}
              ${summaryLine("Amount Due", money(totalDue))}
              ${summaryLine("Paid So Far", money(totalPaid))}
              ${summaryLine(balance >= 0 ? "Remaining" : "Change", money(Math.abs(balance)))}
            </div>

            ${renderSalePaymentStage(paymentConfig, balance)}
          </div>

          <div class="action-bar payment-modal-actions">
            <button class="secondary-button" type="button" data-action="close-sale-payment">Back To Basket</button>
            <button class="primary-button complete-sale-button" type="button" data-action="finalize-sale">${escapeHtml(completeLabel)}</button>
          </div>
        </div>
      </div>
    `;
}

function renderPaymentStatusModal() {
  if (!["processing", "success"].includes(state.paymentWorkflow.status)) {
    return "";
  }

  return `
      <div class="modal-layer open payment-status-layer">
        <div class="payment-status-modal app-card ${state.paymentWorkflow.status}" role="dialog" aria-modal="true" aria-live="polite">
          <div class="payment-status-icon">${icon(state.paymentWorkflow.status === "processing" ? "spinner" : "success")}</div>
          <div class="eyebrow">${state.paymentWorkflow.status === "processing" ? "Processing Payment" : "Payment Successful"}</div>
          <h2 class="section-title">${escapeHtml(state.paymentWorkflow.heading || "")}</h2>
          <div class="section-subtitle">${escapeHtml(state.paymentWorkflow.message || "")}</div>
          ${state.paymentWorkflow.detail ? `<div class="payment-status-detail">${escapeHtml(state.paymentWorkflow.detail)}</div>` : ""}
        </div>
      </div>
    `;
}

function renderReceiptModal() {
  if (state.paymentWorkflow.status !== "receipt") {
    return "";
  }

  const receiptNumber = state.paymentWorkflow.sale?.receiptNumber || "Receipt";
  return `
    <div class="modal-layer open receipt-layer">
      <button type="button" class="settings-backdrop" data-action="close-receipt-popup" aria-label="Close receipt popup"></button>
      <div class="inventory-modal receipt-modal app-card" role="dialog" aria-modal="true" aria-labelledby="receipt-popup-title">
        <div class="section-header">
          <div>
            <div class="eyebrow">Receipt Ready</div>
            <h2 id="receipt-popup-title" class="section-title">${escapeHtml(receiptNumber)}</h2>
            <div class="section-subtitle">Payment has been completed successfully. You can now print or download the receipt.</div>
          </div>
          <button class="ghost-button icon-button" type="button" data-action="close-receipt-popup">${icon("close")}</button>
        </div>

        <div class="receipt-output receipt-popup-output">${escapeHtml(state.paymentWorkflow.receiptText || "")}</div>

        <div class="action-bar receipt-modal-actions">
          <button class="secondary-button" type="button" data-action="print-receipt-popup">${icon("printer")}<span>Print</span></button>
          <button class="secondary-button" type="button" data-action="download-receipt-popup">${icon("download")}<span>Download</span></button>
          <button class="primary-button" type="button" data-action="close-receipt-popup">Done</button>
        </div>
      </div>
    </div>
  `;
}

function renderAppShell() {
  const user = state.bootstrap.user;
  const businessName = currentBusinessName();
  const businessBranch = currentBusinessBranch();
  const businessLogo = currentBusinessLogo();
  const roleLabel = currentUserRoleLabel();

  return screenShell(`
    <div class="app-shell super-shell">
      ${state.error ? `<div class="status-banner error">${escapeHtml(state.error)}</div>` : ""}
      <div class="workspace-layout super-layout">
        <aside class="super-rail app-card">
          <div class="super-brand">
            <img class="brand-logo" src="${escapeAttr(businessLogo)}" alt="${escapeAttr(businessName)} logo" />
            <div>
              <div class="super-brand-name">${escapeHtml(businessName)}</div>
              <div class="super-brand-role">${escapeHtml(businessBranch)}</div>
            </div>
          </div>

          <div class="super-user-card">
            <strong>${escapeHtml(user.fullName)}</strong>
            <span>${escapeHtml(roleLabel)}</span>
            <small>${escapeHtml(currentPanelLabel())}</small>
          </div>

          <nav class="super-nav">
            ${getNavigationItems().map((item) => navButton(item.view, item.label, item.iconName)).join("")}
          </nav>
        </aside>

        <main class="workspace-main super-main ${state.activeView === "sales" ? "pos-main-shell" : isCompactTopbarView() ? "compact-main-shell" : ""}">
          <header class="super-topbar app-card ${isCompactTopbarView() ? "compact-topbar" : ""} ${state.activeView === "sales" ? "pos-topbar-compact" : ""}">
            <div class="super-topbar-left">
              <div class="super-view-copy">
                <div class="super-view-kicker">${escapeHtml(currentBusinessName())} Workspace</div>
                <h1 class="super-title">${escapeHtml(getViewTitle())}</h1>
                ${isCompactTopbarView() ? "" : `<div class="brand-subtitle">${escapeHtml(getViewSubtitle())}</div>`}
              </div>
            </div>
            <div class="super-topbar-center">
              <div class="super-branch-chip">
                <span>${escapeHtml(currentBusinessBranch())}</span>
              </div>
            </div>
            <div class="super-topbar-right">
              ${state.activeView === "sales" ? renderPosStatusPills() : ""}
              <div class="super-user-pill">
                <div class="super-user-pill-copy">
                  <strong>${escapeHtml(user.fullName)}</strong>
                  <span>${escapeHtml(roleLabel)}</span>
                </div>
              </div>
              <div class="workspace-chip subtle live-datetime-chip">
                <span data-live-date></span>
                <strong data-live-time></strong>
              </div>
              <button type="button" class="menu-trigger" data-action="toggle-settings" aria-label="Open settings">
                ${icon("menu")}
              </button>
              <button class="secondary-button topbar-logout-button" type="button" data-action="logout">
                ${icon("logout")}
                <span>Logout</span>
              </button>
            </div>
          </header>

          ${renderActiveView()}
        </main>
      </div>

      ${renderSettingsDrawer()}
      ${renderSecurityModal()}
      ${renderReportDayModal()}
      ${renderSalePaymentModal()}
      ${renderPaymentStatusModal()}
      ${renderReceiptModal()}
    </div>
  `);
}

function getNavigationItems() {
  const isOwner = state.bootstrap.user?.role === "OWNER";
  return [
    { view: "dashboard", label: "Dashboard", iconName: "dashboard" },
    { view: "sales", label: "POS Terminal", iconName: "sales" },
    { view: "invoice", label: "Invoices", iconName: "invoice" },
    { view: "inventory", label: "Products", iconName: "inventory" },
    { view: "held", label: "Held Sales", iconName: "held" },
    { view: "returns", label: "Returns", iconName: "returns" },
    { view: "debts", label: "Accounting", iconName: "debts" },
    { view: "reports", label: "Reports", iconName: "reports" },
    ...(isOwner ? [{ view: "control", label: "Control Center", iconName: "database" }] : []),
    ...(isOwner ? [{ view: "access", label: "User Management", iconName: "access" }] : []),
  ];
}

function getViewTitle() {
  const titles = {
    dashboard: state.bootstrap.user?.role === "OWNER" ? "Admin Dashboard" : "Manager Dashboard",
    sales: "Point of Sale",
    invoice: "Invoice Desk",
    inventory: "Product Management",
    held: "Held Sales",
    returns: "Returns Desk",
    debts: "Accounting and Debt Control",
    reports: "Reports and Ledgers",
    control: "Business Control Center",
    access: "User Management",
  };
  return titles[state.activeView] || "Business Workspace";
}

function getViewSubtitle() {
  const subtitles = {
    dashboard: "Monitor sales, users, low stock, and quick actions from one organized control center.",
    sales: "Supermarket-style cashier workflow with scan input, tender selection, held baskets, and order summary.",
    invoice: "Prepare customer invoice details away from the till and preview named invoices for the current basket or past sales.",
    inventory: "Create products, assign barcodes, and watch live stock levels from the admin product panel.",
    held: "Suspend baskets during checkout and resume them from the held sales queue.",
    returns: "Prepare reverse transactions and return approvals in the same retail shell.",
    debts: "Track outstanding balances and clear customer debt with approved payments.",
    reports: "Review daily, weekly, monthly, and annual summaries with payment breakdowns and activity calendar tracking.",
    control: "Configure business profile, payment routes, receipts, security rules, backup recovery, and compliance controls.",
    access: "Control who can log in, which role they get, and whether they use password or PIN login.",
  };
  return subtitles[state.activeView] || "";
}

function isCompactTopbarView() {
  return state.activeView === "sales" || state.activeView === "invoice";
}

function renderPosStatusPills() {
  return `
    <div class="super-status-strip">
      <span class="super-status-pill ${state.scannerPaused ? "warning" : "ready"}">${icon("scanner")}${state.scannerPaused ? "Scanner Paused" : "Scanner Ready"}</span>
      <span class="super-status-pill ${state.saleDraft.paymentStageOpen ? "warning" : ""}">${icon("cash")}${state.saleDraft.paymentStageOpen ? "Payment Open" : "Basket Mode"}</span>
    </div>
  `;
}

function navButton(view, label, iconName) {
  return `
    <button type="button" class="rail-button super-nav-button ${state.activeView === view ? "active" : ""}" data-action="navigate" data-view="${view}">
      ${icon(iconName)}
      <span>${escapeHtml(label)}</span>
    </button>
  `;
}

function renderSettingsDrawer() {
  const query = state.settingsQuery.trim().toLowerCase();
  const sections = getSettingsSections();
  const items = getSettingsItems();
  const selectedSection = query ? "search" : sections.some((section) => section.id === state.settingsSection) ? state.settingsSection : sections[0]?.id;
  const visibleItems = query
    ? items.filter((item) => `${item.title} ${item.description} ${item.keywords} ${item.status || ""}`.toLowerCase().includes(query))
    : items.filter((item) => item.sections.includes(selectedSection));
  const activeSectionMeta = sections.find((section) => section.id === selectedSection) || null;

  return `
      <div class="settings-layer ${state.settingsOpen ? "open" : ""}">
        <button type="button" class="settings-backdrop" data-action="close-settings" aria-label="Close settings"></button>
        <aside class="settings-drawer app-card">
          <div class="drawer-header">
            <div>
              <div class="eyebrow">Settings</div>
              <h2>Workspace controls</h2>
              <p class="settings-header-copy">A cleaner place to manage appearance, cashier tools, access, and session controls.</p>
            </div>
            <button type="button" class="ghost-button icon-button" data-action="close-settings" aria-label="Close settings">
              ${icon("close")}
            </button>
          </div>

          ${renderSettingsSummary()}

          <div class="settings-layout">
            <nav class="settings-section-nav" aria-label="Settings sections">
              <form id="settings-search-form" class="settings-search-form">
                <div class="field search-field">
                  <label>Search Settings</label>
                  <input name="settingsQuery" value="${escapeAttr(state.settingsQuery)}" placeholder="Theme, scanner, receipt, intro, logout..." />
                </div>
                <div class="search-actions settings-search-actions">
                  <button class="secondary-button compact-button" type="button" data-action="clear-settings-search">Clear</button>
                </div>
              </form>

              <div class="settings-section-list">
                ${sections.map((section) => `
                  <button
                    type="button"
                    class="settings-section-button ${selectedSection === section.id && !query ? "active" : ""}"
                    data-action="select-settings-section"
                    data-section="${section.id}">
                    <span class="settings-section-label">${escapeHtml(section.label)}</span>
                    <span class="settings-section-copy">${escapeHtml(section.description)}</span>
                  </button>
                `).join("")}
              </div>
            </nav>

            <div class="settings-content">
              <div class="settings-content-head">
                <div>
                  <div class="eyebrow">${query ? "Search Results" : "Settings Section"}</div>
                  <h3>${escapeHtml(query ? `Results for "${state.settingsQuery}"` : activeSectionMeta?.label || "Settings")}</h3>
                  <p>${escapeHtml(query ? "Matching controls are shown below." : activeSectionMeta?.description || "Choose a section to manage the workspace.")}</p>
                </div>
                <div class="workspace-chip subtle">${visibleItems.length} item${visibleItems.length === 1 ? "" : "s"}</div>
              </div>

              <div class="settings-grid settings-card-grid">
                ${
                  visibleItems.length
                    ? visibleItems.map((item) => renderSettingsCard(item)).join("")
                    : `<div class="empty-state">No settings matched "${escapeHtml(state.settingsQuery)}".</div>`
                }
              </div>
            </div>
          </div>
        </aside>
      </div>
    `;
}

function renderSettingsSummary() {
  const user = state.bootstrap.user;
  const securityMode = readableSecondFactorMode(state.bootstrap?.workspaceConfig?.securityPolicy?.secondFactorMode || "NONE");

  return `
    <section class="settings-summary-card">
      <div class="settings-summary-main">
        <div class="settings-summary-user">
          <div class="settings-summary-avatar">${icon("user")}</div>
          <div>
            <strong>${escapeHtml(user.fullName)}</strong>
            <span>${escapeHtml(user.role === "OWNER" ? "Owner / Manager" : "Cashier / Staff")}</span>
          </div>
        </div>
        <div class="settings-summary-note">
          Use this panel to manage real workspace controls without repeating the whole app navigation.
        </div>
      </div>

      <div class="settings-summary-metrics">
        ${renderSettingsStat("Theme", state.theme === "dark" ? "Dark" : "Light")}
        ${renderSettingsStat("Scanner", state.scannerPaused ? "Paused" : "Active")}
        ${renderSettingsStat("Receipt", state.receiptPrintDefault ? "Default On" : "Default Off")}
        ${renderSettingsStat("Login", securityMode)}
      </div>
    </section>
  `;
}

function renderSettingsStat(label, value) {
  return `
    <div class="settings-stat-card">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function getSettingsSections() {
  const isOwner = state.bootstrap.user?.role === "OWNER";

  return [
    {
      id: "overview",
      label: "Overview",
      description: "See the current workspace status and the most-used controls.",
    },
    {
      id: "appearance",
      label: "Appearance",
      description: "Manage theme display and onboarding help.",
    },
    {
      id: "pos-tools",
      label: "POS Tools",
      description: "Control scanner and receipt behavior for the cashier desk.",
    },
    ...(isOwner
      ? [{
          id: "access",
          label: "Access",
          description: "Manage user access and owner-only security tools.",
        }, {
          id: "governance",
          label: "Governance",
          description: "Control business profile, receipts, payments, backups, and compliance.",
        }]
      : []),
    {
      id: "session",
      label: "Session",
      description: "Secure session controls for the current user.",
    },
  ];
}

function getSettingsItems() {
  const isOwner = state.bootstrap.user?.role === "OWNER";
  return [
    {
      sections: ["overview", "appearance"],
      type: "theme",
      iconName: "theme",
      title: "Appearance",
      description: `Switch between light and dark theme. Current: ${state.theme}.`,
      status: state.theme === "dark" ? "Dark theme active" : "Light theme active",
      keywords: "theme dark light appearance",
      buttonLabel: state.theme === "dark" ? "Use Light Theme" : "Use Dark Theme",
      tone: "blue",
    },
    {
      sections: ["overview", "pos-tools"],
      type: "scanner",
      iconName: "scanner",
      title: "Scanner Control",
      description: state.scannerPaused
          ? "The POS scanner is currently paused. Unpause it when you want the till to accept scan input again."
          : "The POS scanner is currently active. Pause it if you want to stop scan input at the till.",
      status: state.scannerPaused ? "Scanner paused" : "Scanner active",
      keywords: "scanner pause unpause till pos barcode",
      buttonLabel: state.scannerPaused ? "Unpause Scanner" : "Pause Scanner",
      tone: "green",
    },
    {
      sections: ["overview", "pos-tools"],
      type: "receipt-default",
      iconName: "printer",
      title: "Receipt Defaults",
      description: state.receiptPrintDefault
          ? "New sales start with receipt printing enabled."
          : "New sales start with receipt printing switched off until the cashier turns it on.",
      status: state.receiptPrintDefault ? "Receipt printing starts enabled" : "Receipt printing starts disabled",
      keywords: "receipt default printing printer pos",
      buttonLabel: state.receiptPrintDefault ? "Default Receipt On" : "Default Receipt Off",
      tone: "gold",
    },
    {
      sections: ["overview", "appearance"],
      type: "intro",
      iconName: "dashboard",
      title: "Replay Intro",
      description: "Open the welcome intro and quick start guide again.",
      status: "Helpful for staff onboarding",
      keywords: "intro welcome onboarding guide tutorial",
      buttonLabel: "Open Intro",
      tone: "red",
    },
      ...(isOwner
        ? [{
            sections: ["access"],
            type: "open-view",
            view: "access",
            iconName: "access",
            title: "User Management",
            description: "Create accounts and control who can access the system.",
            status: "Owner-only access control",
            keywords: "users account access owner staff login",
            buttonLabel: "Open User Management",
            tone: "blue",
          }, {
            sections: ["overview", "governance"],
            type: "open-view",
            view: "control",
            iconName: "database",
            title: "Business Control Center",
            description: "Configure business identity, payment routing, receipt branding, security policy, backups, and compliance.",
            status: "Owner-only administration",
            keywords: "business control payments receipt backup legal compliance settings",
            buttonLabel: "Open Control Center",
            tone: "gold",
          }]
        : []),
      {
        sections: ["session"],
        type: "logout",
        iconName: "logout",
        title: "Log Out",
        description: "End the current session securely from the clerk workspace.",
        status: "Closes the current session",
        keywords: "logout sign out session exit",
        buttonLabel: "Log Out",
        tone: "red",
      },
    ];
}

function renderSettingsCard(item) {
  const action =
    item.type === "open-view"
      ? `data-action="open-setting-view" data-view="${item.view}"`
      : item.type === "theme"
        ? `data-action="toggle-theme"`
        : item.type === "scanner"
          ? `data-action="toggle-scanner"`
          : item.type === "receipt-default"
            ? `data-action="toggle-receipt-default"`
            : item.type === "intro"
              ? `data-action="open-intro"`
                : `data-action="logout"`;

    return `
      <div class="settings-card settings-card-${escapeAttr(item.tone || "default")}">
        <div class="settings-card-icon">${icon(item.iconName)}</div>
        <div class="settings-card-copy">
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description)}</p>
          ${item.status ? `<div class="settings-card-status">${escapeHtml(item.status)}</div>` : ""}
        </div>
        <div class="settings-card-action">
          <button type="button" class="${item.type === "logout" ? "danger-button" : "secondary-button"}" ${action}>
            ${item.type === "logout" ? `${icon("logout")}<span>${escapeHtml(item.buttonLabel)}</span>` : escapeHtml(item.buttonLabel)}
          </button>
        </div>
      </div>
    `;
}

function renderActionChoiceButton({ title, description = "", iconName, tone = "blue", type = "button", attrs = "", badge = "" }) {
  return `
    <button type="${escapeAttr(type)}" class="action-choice-card tone-${escapeAttr(tone)}" ${attrs}>
      <span class="action-choice-icon">${icon(iconName)}</span>
      <span class="action-choice-copy">
        <strong>${escapeHtml(title)}</strong>
        ${description ? `<span>${escapeHtml(description)}</span>` : ""}
      </span>
      ${badge ? `<span class="action-choice-badge">${escapeHtml(badge)}</span>` : ""}
    </button>
  `;
}

function renderActiveView() {
  switch (state.activeView) {
    case "control":
      return renderControlCenterView();
    case "inventory":
      return renderInventoryView();
    case "sales":
      return renderSalesView();
    case "invoice":
      return renderInvoiceView();
    case "held":
      return renderHeldSalesView();
    case "returns":
      return renderReturnsView();
    case "debts":
      return renderDebtsView();
    case "reports":
      return renderReportsView();
    case "access":
      return renderAccessView();
    default:
      return renderDashboardView();
  }
}

function renderControlCenterView() {
  if (state.bootstrap.user?.role !== "OWNER") {
    return `<div class="empty-state">Only the owner can access the business control center.</div>`;
  }

  const control = state.ownerControl || {
    businessProfile: {},
    receiptProfile: {},
    paymentProfile: { enabledMethods: PAYMENT_METHODS, routes: {} },
    securityPolicy: {},
    complianceProfile: {},
    backups: [],
    dataDirectory: "-",
    databasePath: "-",
  };

  const business = control.businessProfile || {};
  const receipt = control.receiptProfile || {};
  const payments = control.paymentProfile || { enabledMethods: PAYMENT_METHODS, routes: {} };
  const security = control.securityPolicy || {};
  const compliance = control.complianceProfile || {};

  return `
    <div class="view-stack control-center-screen">
      <section class="metrics-grid super-metrics-grid">
        ${renderDashboardMetric("Payment Methods", payments.enabledMethods?.length || 0, "cash", "green", "", "Configured for this business", false)}
        ${renderDashboardMetric("Backups Stored", control.backups?.length || 0, "database", "blue", "", "Local recovery snapshots available", false)}
        ${renderDashboardMetric("Second Factor", readableSecondFactorMode(security.secondFactorMode), "access", "yellow", "", "Authentication stage policy", false)}
        ${renderDashboardMetric("Compliance", compliance.accepted ? "Accepted" : "Pending", "reports", "red", "", compliance.accepted ? "Policy acceptance recorded" : "Owner review still needed", false)}
      </section>

      <section class="control-grid">
        <article class="panel-card app-card control-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Business Profile</div>
              <h2 class="section-title">How this business appears across the suite</h2>
              <div class="section-subtitle">This controls the business logo, visible business name, branch label, support details, and printed receipt references inside the workspace.</div>
            </div>
          </div>
          <form id="business-profile-form" class="form-grid">
            <div class="field"><label>Business Name</label><input name="businessName" value="${escapeAttr(business.businessName || state.bootstrap.businessName || "")}" required /></div>
            <div class="field"><label>Legal Name</label><input name="legalName" value="${escapeAttr(business.legalName || "")}" /></div>
            <div class="field"><label>Branch Name</label><input name="branchName" value="${escapeAttr(business.branchName || "")}" /></div>
            ${renderBusinessLogoEditor({
              hiddenName: "logoDataUrl",
              value: business.logoDataUrl || "",
              fallbackName: business.businessName || state.bootstrap.businessName || "Business",
              helper: "This logo appears on the workspace rail and business-branded areas after login.",
              removeAction: "clear-business-logo",
            })}
            <div class="field"><label>Contact Phone</label><input name="contactPhone" value="${escapeAttr(business.contactPhone || "")}" /></div>
            <div class="field"><label>Contact Email</label><input name="contactEmail" type="email" value="${escapeAttr(business.contactEmail || "")}" /></div>
            <div class="field"><label>Tax / Registration ID</label><input name="taxId" value="${escapeAttr(business.taxId || "")}" /></div>
            <div class="field full-span"><label>Address</label><input name="address" value="${escapeAttr(business.address || "")}" /></div>
            <div class="field"><label>Support Contact</label><input name="supportName" value="${escapeAttr(business.supportName || "")}" /></div>
            <div class="field"><label>Support Phone</label><input name="supportPhone" value="${escapeAttr(business.supportPhone || "")}" /></div>
            <div class="field"><label>Support Email</label><input name="supportEmail" type="email" value="${escapeAttr(business.supportEmail || "")}" /></div>
            <div class="full-span"><button class="primary-button" type="submit">Save Business Profile</button></div>
          </form>
        </article>

        <article class="panel-card app-card control-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Receipt Branding</div>
              <h2 class="section-title">How receipts should look for this business</h2>
              <div class="section-subtitle">Set the receipt heading, footer, and return-policy wording that should appear after payment.</div>
            </div>
          </div>
          <form id="receipt-profile-form" class="form-grid">
            <div class="field full-span"><label>Receipt Header Title</label><input name="headerTitle" value="${escapeAttr(receipt.headerTitle || "")}" /></div>
            <div class="field full-span"><label>Footer Note</label><textarea name="footerNote" rows="3">${escapeHtml(receipt.footerNote || "")}</textarea></div>
            <div class="field full-span"><label>Return Policy</label><textarea name="returnPolicy" rows="3">${escapeHtml(receipt.returnPolicy || "")}</textarea></div>
            <div class="field"><label><input type="checkbox" name="showContact" value="true" ${receipt.showContact ? "checked" : ""} /> Show contact details on receipts</label></div>
            <div class="field"><label><input type="checkbox" name="showTaxId" value="true" ${receipt.showTaxId ? "checked" : ""} /> Show tax ID on receipts</label></div>
            <div class="field"><label><input type="checkbox" name="printLogoNote" value="true" ${receipt.printLogoNote ? "checked" : ""} /> Show suite branding note</label></div>
            <div class="full-span"><button class="primary-button" type="submit">Save Receipt Profile</button></div>
          </form>
        </article>

        <article class="panel-card app-card control-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Payment Routing</div>
              <h2 class="section-title">Which payment methods this business actually accepts</h2>
              <div class="section-subtitle">Enable only the methods this client uses and set the destination line, till, paybill, terminal, or bank route for each one.</div>
            </div>
          </div>
          <form id="payment-profile-form" class="form-grid control-payment-form">
            <div class="full-span auth-checkbox-grid">
              ${PAYMENT_METHODS.map((method) => `
                <label class="auth-check-card payment-method-card ${payments.enabledMethods?.includes(method) ? "active" : ""}" data-payment-method-card="${escapeAttr(method)}">
                  <input type="checkbox" name="enabledMethods" value="${escapeAttr(method)}" ${payments.enabledMethods?.includes(method) ? "checked" : ""} />
                  <span>${escapeHtml(method)}</span>
                </label>
              `).join("")}
            </div>
            ${PAYMENT_METHODS.map((method) => renderPaymentRouteEditor(method, payments.routes?.[method] || {}, payments.enabledMethods?.includes(method))).join("")}
            <div class="full-span"><button class="primary-button" type="submit">Save Payment Routing</button></div>
          </form>
        </article>

        <article class="panel-card app-card control-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Security & Recovery</div>
              <h2 class="section-title">Control sign-in stages, lockouts, and backup safety</h2>
              <div class="section-subtitle">Inspired by current authentication and recovery guidance: password-first access, optional second step, controlled retries, and recoverable backups.</div>
            </div>
          </div>
          <form id="security-policy-form" class="form-grid">
            <div class="field">
              <label>Second Authentication Stage</label>
              <select name="secondFactorMode">
                <option value="NONE" ${security.secondFactorMode === "NONE" ? "selected" : ""}>Password only</option>
                <option value="OWNER_ONLY" ${security.secondFactorMode === "OWNER_ONLY" ? "selected" : ""}>Owner requires second step</option>
                <option value="ALL_USERS" ${security.secondFactorMode === "ALL_USERS" ? "selected" : ""}>All users require second step</option>
              </select>
            </div>
            <div class="field"><label>Failed Login Limit</label><input name="loginAttemptLimit" type="number" min="3" value="${escapeAttr(security.loginAttemptLimit || 5)}" /></div>
            <div class="field"><label>Lock Duration (Minutes)</label><input name="lockMinutes" type="number" min="5" value="${escapeAttr(security.lockMinutes || 15)}" /></div>
            <div class="field"><label>Backup Retention</label><input name="backupRetention" type="number" min="5" value="${escapeAttr(security.backupRetention || 20)}" /></div>
            <div class="field"><label><input type="checkbox" name="autoBackupEnabled" value="true" ${security.autoBackupEnabled ? "checked" : ""} /> Enable automatic backup snapshots</label></div>
            <div class="field full-span"><label>Account Provisioning</label><input value="Workspace owners create staff accounts from User Management." disabled /></div>
            <div class="field"><label>Incident Contact Name</label><input name="incidentContactName" value="${escapeAttr(security.incidentContactName || "")}" /></div>
            <div class="field"><label>Incident Contact Phone</label><input name="incidentContactPhone" value="${escapeAttr(security.incidentContactPhone || "")}" /></div>
            <div class="field"><label>Incident Contact Email</label><input name="incidentContactEmail" type="email" value="${escapeAttr(security.incidentContactEmail || "")}" /></div>
            <div class="full-span"><button class="primary-button" type="submit">Save Security Policy</button></div>
          </form>
        </article>

        <article class="panel-card app-card control-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Backup & Recovery</div>
              <h2 class="section-title">Local resilience if the system fails</h2>
              <div class="section-subtitle">Snapshots are saved in the local app data directory so the business can recover critical records after a workstation or app issue.</div>
            </div>
          </div>
          <form id="backup-form" class="form-grid single">
            <div class="field">
              <label>Manual Backup Reason</label>
              <input name="reason" placeholder="Before system update or end-of-day archive" />
            </div>
            <div>
              <button class="primary-button" type="submit">Create Backup Snapshot</button>
            </div>
          </form>
          <div class="summary-lines control-backup-meta">
            ${summaryLine("Data Directory", control.dataDirectory || "-")}
            ${summaryLine("Database Path", control.databasePath || "-")}
          </div>
          <div class="table-wrap control-backup-table">
            <table>
              <thead><tr><th>Created</th><th>Reason</th><th>Actor</th><th>File</th><th>Actions</th></tr></thead>
              <tbody>
                ${(control.backups?.length
                  ? control.backups.map((backup) => `
                    <tr>
                      <td>${escapeHtml(backup.createdAt)}</td>
                      <td>${escapeHtml(backup.reason || "manual")}</td>
                      <td>${escapeHtml(backup.actor || "System")}</td>
                      <td>${escapeHtml(backup.fileName)}</td>
                      <td>
                        <div class="table-inline-actions">
                          <button class="secondary-button compact-button" type="button" data-action="download-backup" data-file-name="${escapeAttr(backup.fileName)}">Download</button>
                          <button class="ghost-button compact-button" type="button" data-action="restore-backup" data-file-name="${escapeAttr(backup.fileName)}">Restore</button>
                        </div>
                      </td>
                    </tr>
                  `).join("")
                  : `<tr><td colspan="5">No backup snapshots have been created yet.</td></tr>`)}
              </tbody>
            </table>
          </div>
        </article>

        <article class="panel-card app-card control-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Compliance & Legal</div>
              <h2 class="section-title">Store the owner's operating rules and acknowledgement</h2>
              <div class="section-subtitle">This creates a visible compliance record inside the suite. It is not a substitute for local legal review.</div>
            </div>
          </div>
          <form id="compliance-profile-form" class="form-grid">
            <div class="field"><label>Terms Version</label><input name="termsVersion" value="${escapeAttr(compliance.termsVersion || "")}" /></div>
            <div class="field"><label>Privacy Version</label><input name="privacyVersion" value="${escapeAttr(compliance.privacyVersion || "")}" /></div>
            <div class="field"><label>Backup Policy Version</label><input name="backupPolicyVersion" value="${escapeAttr(compliance.backupPolicyVersion || "")}" /></div>
            <div class="field full-span"><label>Legal Notice</label><textarea name="legalNotice" rows="4">${escapeHtml(compliance.legalNotice || "")}</textarea></div>
            <div class="field full-span"><label>Privacy Summary</label><textarea name="privacySummary" rows="3">${escapeHtml(compliance.privacySummary || "")}</textarea></div>
            <div class="field full-span"><label>Incident Response Summary</label><textarea name="incidentResponseSummary" rows="3">${escapeHtml(compliance.incidentResponseSummary || "")}</textarea></div>
            <div class="field full-span"><label><input type="checkbox" name="accepted" value="true" ${compliance.accepted ? "checked" : ""} /> Owner acknowledges the current terms, privacy, backup, and operational rules for this workspace.</label></div>
            <div class="full-span"><button class="primary-button" type="submit">Save Compliance Record</button></div>
          </form>
          <div class="summary-lines">
            ${summaryLine("Accepted", compliance.accepted ? "Yes" : "No")}
            ${summaryLine("Accepted At", compliance.acceptedAt || "-")}
            ${summaryLine("Accepted By", compliance.acceptedBy || "-")}
          </div>
        </article>
      </section>
    </div>
  `;
}

function renderPaymentRouteEditor(method, route, enabled) {
  return `
    <section class="full-span control-route-card ${enabled ? "enabled" : "disabled"}" data-route-method="${escapeAttr(method)}">
      <div class="control-route-card-head">
        <div>
          <h3>${escapeHtml(method)}</h3>
          <p>${enabled ? "This payment method is active for the business. Update its destination and labels here." : "Enable this method above if the business should collect payments through it."}</p>
        </div>
        <span class="workspace-chip subtle" data-route-status>${enabled ? "Enabled" : "Disabled"}</span>
      </div>
      <div class="control-route-grid">
        <div class="field">
          <label>${escapeHtml(method)} Label</label>
          <input name="route_${escapeAttr(method)}_label" value="${escapeAttr(route.label || "")}" ${enabled ? "" : "readonly"} />
        </div>
        <div class="field">
          <label>${escapeHtml(method)} Target</label>
          <input name="route_${escapeAttr(method)}_target" value="${escapeAttr(route.targetNumber || "")}" ${enabled ? "" : "readonly"} />
        </div>
        <div class="field">
          <label>${escapeHtml(method)} Account / Desk</label>
          <input name="route_${escapeAttr(method)}_account" value="${escapeAttr(route.accountName || "")}" ${enabled ? "" : "readonly"} />
        </div>
      </div>
    </section>
  `;
}

function readableSecondFactorMode(mode) {
  if (mode === "OWNER_ONLY") return "Owner Only";
  if (mode === "ALL_USERS") return "All Users";
  return "Password Only";
}

function renderDashboardView() {
  const dashboard = state.dashboard || {
    productCount: 0,
    stockMovementCount: 0,
    salesCount: 0,
    openDebtCount: 0,
    todaySalesCount: 0,
    todaySalesValue: 0,
    totalSalesValue: 0,
    totalCollected: 0,
    outstandingDebt: 0,
  };
  const recentSales = state.sales.slice(0, 6);
  const lowStockProducts = state.products.filter((product) => product.stockQuantity <= 10).slice(0, 6);
  const isOwner = state.bootstrap.user?.role === "OWNER";
  const todaySales = state.sales.filter((sale) => sale.date === currentLocalIsoDate());
  const dashboardDetail = !isOwner && state.dashboardDetail === "users" ? "low-stock" : state.dashboardDetail;

  return `
    <div class="view-stack dashboard-screen">
      <section class="metrics-grid super-metrics-grid">
        ${renderDashboardMetric("Today's Sales", money(dashboard.todaySalesValue), "sales", "green", "today-sales", `${dashboard.todaySalesCount} closed sale${dashboard.todaySalesCount === 1 ? "" : "s"} today`)}
        ${renderDashboardMetric("Total Sales", money(dashboard.totalSalesValue), "reports", "blue", "total-sales", `${state.sales.length} recorded sale${state.sales.length === 1 ? "" : "s"} overall`)}
        ${renderDashboardMetric("Outstanding Debt", money(dashboard.outstandingDebt), "debts", "red", "outstanding-debt", `${state.openCredits.length} customer balance${state.openCredits.length === 1 ? "" : "s"} still open`)}
        ${renderDashboardMetric(isOwner ? "Total Users" : "Low Stock Items", isOwner ? state.users.length : lowStockProducts.length, isOwner ? "access" : "inventory", "yellow", isOwner ? "users" : "low-stock", isOwner ? "View everyone allowed to access the system" : "View products that need restocking soon")}
      </section>

      ${renderDashboardDetailsPanel({
        detail: dashboardDetail,
        isOwner,
        todaySales,
        lowStockProducts,
      })}

      <section class="dashboard-main-grid">
        <section class="table-card app-card super-panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Recent Transactions</h2>
              <div class="section-subtitle">Latest receipts from the cashier desk and completed sales.</div>
            </div>
          </div>
          ${
            recentSales.length
              ? `
            <div class="table-wrap">
              <table>
                <thead><tr><th>Receipt</th><th>Cashier</th><th>Total</th><th>Payment</th><th>Date</th></tr></thead>
                <tbody>
                  ${recentSales.map((sale) => `
                    <tr>
                      <td>${escapeHtml(sale.receiptNumber || sale.id)}</td>
                      <td>${escapeHtml(sale.processedBy)}</td>
                      <td>${money(sale.totalAmount)}</td>
                      <td>${pill(statusTone(sale.status), sale.paymentSummary)}</td>
                      <td>${escapeHtml(`${sale.date} ${sale.time}`)}</td>
                    </tr>
                  `).join("")}
                </tbody>
              </table>
            </div>
          `
              : `<div class="empty-state">No transactions yet.</div>`
          }
        </section>

        <section class="panel-card app-card quick-actions-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Quick Actions</h2>
              <div class="section-subtitle">Jump straight into the next retail task.</div>
            </div>
          </div>
          <div class="section-action-grid quick-action-grid">
            ${renderActionChoiceButton({
              title: "Open POS",
              description: "Move straight to the cashier desk and start scanning.",
              iconName: "sales",
              tone: "red",
              attrs: `data-action="navigate" data-view="sales"`,
            })}
            ${renderActionChoiceButton({
              title: "Process Return",
              description: "Open the returns desk and handle reversal flow.",
              iconName: "returns",
              tone: "gold",
              attrs: `data-action="navigate" data-view="returns"`,
            })}
            ${renderActionChoiceButton({
              title: "View Inventory",
              description: "Check products, stock levels, and low-stock items.",
              iconName: "inventory",
              tone: "blue",
              attrs: `data-action="navigate" data-view="inventory"`,
            })}
            ${renderActionChoiceButton({
              title: "View Reports",
              description: "Open reports, accounting, and daily activity views.",
              iconName: "reports",
              tone: "green",
              attrs: `data-action="navigate" data-view="reports"`,
            })}
          </div>
        </section>
      </section>

      <section class="dashboard-main-grid">
        <section class="panel-card app-card super-panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Payment Channels</h2>
              <div class="section-subtitle">How money is currently coming into the system.</div>
            </div>
          </div>
          ${renderPaymentBreakdownBars(state.accounting?.paymentBreakdown || [])}
        </section>

        <section class="panel-card app-card super-panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Low Stock Alert</h2>
              <div class="section-subtitle">Items that need attention before the next sales rush.</div>
            </div>
          </div>
          ${
            lowStockProducts.length
              ? `
            <div class="list-card">
              ${lowStockProducts.map((product) => `
                <div class="list-item low-stock-row">
                  <strong>${escapeHtml(product.name)}</strong>
                  <span>${escapeHtml(product.productCode || product.id)}</span>
                  <span>${pill(product.stockQuantity <= 3 ? "danger" : "warning", `Stock ${product.stockQuantity}`)}</span>
                </div>
              `).join("")}
            </div>
          `
              : `<div class="empty-state">No low-stock alerts right now.</div>`
          }
        </section>
      </section>
    </div>
  `;
}

function renderDashboardMetric(label, value, iconName, tone, detail = "", hint = "") {
  const content = `
    <div class="super-metric-icon">${icon(iconName)}</div>
    <div>
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(String(value))}</div>
      ${hint ? `<div class="metric-hint">${escapeHtml(hint)}</div>` : ""}
    </div>
  `;

  if (detail) {
    return `
      <button type="button" class="metric-card app-card super-metric-card tone-${tone} dashboard-metric-button ${state.dashboardDetail === detail ? "active" : ""}" data-action="set-dashboard-detail" data-detail="${detail}" aria-pressed="${state.dashboardDetail === detail ? "true" : "false"}">
        ${content}
      </button>
    `;
  }

  return `
    <div class="metric-card app-card super-metric-card tone-${tone}">
      ${content}
    </div>
  `;
}

function renderDashboardDetailsPanel({ detail, isOwner, todaySales, lowStockProducts }) {
  const detailMeta = getDashboardDetailMeta(detail, isOwner);
  let content = "";

  if (detail === "today-sales") {
    content = renderSalesTable(todaySales);
  } else if (detail === "outstanding-debt") {
    content = renderDebtTable(state.openCredits);
  } else if (detail === "users" && isOwner) {
    content = renderUsersTable(state.users);
  } else if (detail === "low-stock") {
    content = renderProductsTable(lowStockProducts);
  } else {
    content = renderSalesTable(state.sales);
  }

  return `
    <section class="table-card app-card super-panel-card dashboard-detail-panel">
      <div class="section-header">
        <div>
          <h2 class="section-title">${escapeHtml(detailMeta.title)}</h2>
          <div class="section-subtitle">${escapeHtml(detailMeta.subtitle)}</div>
        </div>
        ${detailMeta.view ? `<button class="secondary-button compact-button" type="button" data-action="navigate" data-view="${detailMeta.view}">Open ${escapeHtml(detailMeta.cta)}</button>` : ""}
      </div>
      ${content}
    </section>
  `;
}

function getDashboardDetailMeta(detail, isOwner) {
  if (detail === "today-sales") {
    return {
      title: "Today's Sales",
      subtitle: `Completed sales for ${currentLocalIsoDate()}.`,
      view: "reports",
      cta: "Reports",
    };
  }
  if (detail === "outstanding-debt") {
    return {
      title: "Outstanding Debt",
      subtitle: "Customers with balances that still need to be cleared.",
      view: "debts",
      cta: "Debt Desk",
    };
  }
  if (detail === "users" && isOwner) {
    return {
      title: "All Users",
      subtitle: "Every account currently allowed to access this business workspace.",
      view: "access",
      cta: "Access Control",
    };
  }
  if (detail === "low-stock") {
    return {
      title: "Low Stock Items",
      subtitle: "Products that need attention before the next till rush.",
      view: "inventory",
      cta: "Inventory",
    };
  }
  return {
    title: "Total Sales",
    subtitle: "All recorded sales in the current database.",
    view: "reports",
    cta: "Reports",
  };
}

function metricCard(label, value, hint) {
  return `
    <div class="metric-card app-card">
      <div class="metric-label">${escapeHtml(label)}</div>
      <div class="metric-value">${escapeHtml(String(value))}</div>
      <div class="metric-hint">${escapeHtml(hint)}</div>
    </div>
  `;
}

function renderPaymentBreakdownBars(items) {
  if (!items.length) {
    return `<div class="empty-state">No payment breakdown yet. Complete some sales to populate this area.</div>`;
  }

  const max = Math.max(...items.map((item) => Number(item.total || 0)), 1);
  return `
    <div class="bars-list">
      ${items.map((item) => `
        <div class="bar-row">
          <div class="bar-row-head">
            <span>${escapeHtml(item.paymentMethod)}</span>
            <strong>${money(item.total)}</strong>
          </div>
          <div class="bar-track">
            <span class="bar-fill" style="width: ${(Number(item.total || 0) / max) * 100}%"></span>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderInventoryView() {
  const canManage = canManageInventory();
  const totalUnits = state.products.reduce((sum, product) => sum + product.stockQuantity, 0);
  const lowStockProducts = state.products.filter((product) => product.stockQuantity <= 10);
  const lowStockCount = lowStockProducts.length;
  return `
    <div class="view-stack inventory-screen">
      <section class="inventory-toolbar app-card">
        <div>
          <h2 class="section-title">All Products</h2>
          <div class="section-subtitle">Create and manage barcode-ready products for the cashier lane.</div>
        </div>
        ${
          canManage
            ? `<button type="button" class="primary-button" data-action="open-inventory-form">Add New Product</button>`
            : `<div class="workspace-chip subtle">Owner access required to change inventory</div>`
        }
      </section>

      <section class="metrics-grid inventory-summary-grid">
        ${renderInventoryMetric("Products", state.products.length, "inventory", "blue", "products", "View all registered products")}
        ${renderInventoryMetric("Units In Stock", totalUnits, "scanner", "green", "units", "Review current stock across all products")}
        ${renderInventoryMetric("Low Stock", lowStockCount, "returns", "yellow", "low-stock", "See products that need restocking")}
        ${renderInventoryMetric("Stock Records", state.stockRecords.length, "reports", "red", "records", "Open the stock movement ledger")}
      </section>

      ${renderInventoryDetailPanel({ totalUnits, lowStockProducts, canManage })}

      ${state.inventoryFormOpen ? renderInventoryModal() : ""}
    </div>
  `;
}

function renderInventoryMetric(label, value, iconName, tone, detail, hint = "") {
  return `
    <button type="button" class="metric-card app-card super-metric-card tone-${tone} dashboard-metric-button ${state.inventoryDetail === detail ? "active" : ""}" data-action="set-inventory-detail" data-detail="${detail}" aria-pressed="${state.inventoryDetail === detail ? "true" : "false"}">
      <div class="super-metric-icon">${icon(iconName)}</div>
      <div>
        <div class="metric-label">${escapeHtml(label)}</div>
        <div class="metric-value">${escapeHtml(String(value))}</div>
        ${hint ? `<div class="metric-hint">${escapeHtml(hint)}</div>` : ""}
      </div>
    </button>
  `;
}

function renderInventoryDetailPanel({ totalUnits, lowStockProducts, canManage }) {
  const detail = state.inventoryDetail || "products";
  const stockSortedProducts = [...state.products].sort((left, right) => right.stockQuantity - left.stockQuantity || left.name.localeCompare(right.name));
  const meta = getInventoryDetailMeta(detail, totalUnits, lowStockProducts.length, canManage);
  const content = detail === "records"
    ? renderStockTable(state.stockRecords)
    : detail === "low-stock"
      ? renderProductsTable(lowStockProducts, canManage)
      : detail === "units"
        ? renderProductsTable(stockSortedProducts, canManage)
        : renderProductsTable(state.products, canManage);
  const actionButton = meta.actionLabel
    ? meta.actionName === "set-inventory-detail"
      ? `<button class="secondary-button compact-button" type="button" data-action="${meta.actionName}" data-detail="${escapeAttr(meta.actionDetail || "products")}" ${meta.actionDisabled ? "disabled" : ""}>${escapeHtml(meta.actionLabel)}</button>`
      : `<button class="secondary-button compact-button" type="button" data-action="${meta.actionName}" ${meta.actionDisabled ? "disabled" : ""}>${escapeHtml(meta.actionLabel)}</button>`
    : "";

  return `
    <section class="table-card app-card super-panel-card dashboard-detail-panel">
      <div class="section-header">
        <div>
          <h2 class="section-title">${escapeHtml(meta.title)}</h2>
          <div class="section-subtitle">${escapeHtml(meta.subtitle)}</div>
        </div>
        ${actionButton}
      </div>
      ${content}
    </section>
  `;
}

function getInventoryDetailMeta(detail, totalUnits, lowStockCount, canManage) {
  if (detail === "units") {
    return {
      title: "Units In Stock",
      subtitle: `${totalUnits} units are currently recorded across ${state.products.length} product${state.products.length === 1 ? "" : "s"}.`,
      actionLabel: canManage ? "Add New Product" : "",
      actionName: canManage ? "open-inventory-form" : "",
      actionDisabled: false,
    };
  }

  if (detail === "low-stock") {
    return {
      title: "Low Stock Products",
      subtitle: lowStockCount
        ? `${lowStockCount} product${lowStockCount === 1 ? "" : "s"} need restocking soon.`
        : "No products are currently below the low-stock threshold.",
      actionLabel: "Show All Products",
      actionName: "set-inventory-detail",
      actionDetail: "products",
      actionDisabled: false,
    };
  }

  if (detail === "records") {
    return {
      title: "Stock Records",
      subtitle: "Every stock-in and stock-out action stays traceable here.",
      actionLabel: "",
      actionName: "",
      actionDisabled: false,
    };
  }

  return {
    title: "Product Management",
    subtitle: "Barcode, pricing, stock levels, and current shelf readiness.",
    actionLabel: canManage ? "Add New Product" : "",
    actionName: canManage ? "open-inventory-form" : "",
    actionDisabled: false,
  };
}

function renderInventoryModal() {
  const selectedProduct = state.products.find((product) => product.id === state.inventoryProductId) || null;
  const isEditMode = state.inventoryFormMode === "edit";
  const isAdjustMode = state.inventoryFormMode === "adjust";
  const adjustTitle = state.inventoryStockAction === "STOCK_OUT" ? "Remove Stock" : "Add Stock";

  if (isEditMode && !selectedProduct) {
    return "";
  }

  if (isAdjustMode && !selectedProduct) {
    return "";
  }

  return `
    <div class="modal-layer open">
      <button type="button" class="settings-backdrop" data-action="close-inventory-form" aria-label="Close product form"></button>
      <div class="inventory-modal app-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">${
              isEditMode
                ? "Edit Product"
                : isAdjustMode
                  ? adjustTitle
                  : "Add New Product"
            }</h2>
            <div class="section-subtitle">${
              isEditMode
                ? "Update product details, barcode, and selling price."
                : isAdjustMode
                  ? `${adjustTitle} for the selected product and keep the movement recorded.`
                  : "Barcode auto-entry, pricing, and initial stock for the POS counter."
            }</div>
          </div>
          <button class="ghost-button icon-button" type="button" data-action="close-inventory-form">${icon("close")}</button>
        </div>
        ${
          isAdjustMode
            ? `
          <form id="inventory-stock-adjust-form" class="form-grid inventory-form-grid">
            <input type="hidden" name="productId" value="${escapeAttr(selectedProduct.id)}" />
            <input type="hidden" name="actionType" value="${escapeAttr(state.inventoryStockAction)}" />
            <div class="field">
              <label>Product Name</label>
              <input value="${escapeAttr(selectedProduct.name)}" disabled />
            </div>
            <div class="field">
              <label>Barcode / Product Code</label>
              <input value="${escapeAttr(selectedProduct.productCode || "-")}" disabled />
            </div>
            <div class="field">
              <label>Current Stock</label>
              <input value="${escapeAttr(String(selectedProduct.stockQuantity))}" disabled />
            </div>
            <div class="field">
              <label>${state.inventoryStockAction === "STOCK_OUT" ? "Quantity To Remove" : "Quantity To Add"}</label>
              <input name="quantity" type="number" min="1" step="1" required />
            </div>
            <div class="field full-span">
              <label>Authorized By</label>
              <input name="authorizedBy" placeholder="${escapeAttr(state.bootstrap.user.fullName)}" />
            </div>
            <div class="full-span action-bar">
              <button class="primary-button auth-submit" type="submit">${escapeHtml(adjustTitle)}</button>
              <button class="secondary-button" type="button" data-action="close-inventory-form">Cancel</button>
            </div>
          </form>
        `
            : `
          <form id="${isEditMode ? "inventory-edit-form" : "inventory-form"}" class="form-grid inventory-form-grid">
            ${isEditMode ? `<input type="hidden" name="productId" value="${escapeAttr(selectedProduct.id)}" />` : ""}
            <div class="field">
              <label>Product Name</label>
              <input name="name" required value="${escapeAttr(isEditMode ? selectedProduct.name : "")}" />
            </div>
            <div class="field">
              <label>Barcode / Product Code</label>
              <input name="productCode" placeholder="Optional code for scanning" value="${escapeAttr(isEditMode ? selectedProduct.productCode : "")}" />
            </div>
            <div class="field">
              <label>Cost / Selling Price (KES)</label>
              <input name="unitPrice" type="number" min="0.01" step="0.01" required value="${escapeAttr(isEditMode ? String(selectedProduct.unitPrice) : "")}" />
            </div>
            ${
              isEditMode
                ? `
            <div class="field">
              <label>Current Stock</label>
              <input value="${escapeAttr(String(selectedProduct.stockQuantity))}" disabled />
            </div>
            `
                : `
            <div class="field">
              <label>Initial Stock</label>
              <input name="quantity" type="number" min="1" step="1" required />
            </div>
            `
            }
            <div class="field full-span">
              <label>Authorized By</label>
              <input name="authorizedBy" placeholder="${escapeAttr(state.bootstrap.user.fullName)}" value="${escapeAttr(state.bootstrap.user.fullName)}" />
            </div>
            <div class="full-span action-bar">
              <button class="primary-button auth-submit" type="submit">${isEditMode ? "Save Changes" : "Add Product"}</button>
              <button class="secondary-button" type="button" data-action="close-inventory-form">Cancel</button>
            </div>
          </form>
        `
        }
      </div>
    </div>
  `;
}

function renderInvoiceView() {
  const basketItems = state.saleDraft.items;
  const selectedCustomerName = state.invoiceDraft.customerName || state.saleDraft.customerName || "Walk-in Customer";
  const selectedPhoneNumber = state.invoiceDraft.phoneNumber || state.saleDraft.phoneNumber || "-";
  const selectedCustomerId = state.invoiceDraft.customerIdNumber || state.saleDraft.customerIdNumber || "-";
  const subtotal = saleSubtotalAmount();
  const taxAmount = saleVatAmount();
  const totalDue = saleTotalDue();
  const recentInvoices = state.sales.slice(0, 8);

  return `
    <div class="view-stack invoice-screen">
      <div class="split-layout invoice-layout">
        <section class="panel-card app-card super-panel-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Invoice Details</div>
              <h2 class="section-title">Customer invoice desk</h2>
              <div class="section-subtitle">Customer details live here now, not in the POS screen. Fill them only when you need a named invoice.</div>
            </div>
          </div>
          <form id="invoice-form" class="form-grid">
            <div class="field">
              <label>Customer Name</label>
              <input name="customerName" value="${escapeAttr(state.invoiceDraft.customerName)}" placeholder="Customer or business name" />
            </div>
            <div class="field">
              <label>Phone Number</label>
              <input name="phoneNumber" value="${escapeAttr(state.invoiceDraft.phoneNumber)}" placeholder="2547..." />
            </div>
            <div class="field">
              <label>ID / Reference Number</label>
              <input name="customerIdNumber" value="${escapeAttr(state.invoiceDraft.customerIdNumber)}" placeholder="Optional ID or invoice reference" />
            </div>
            <div class="field">
              <label>Notes</label>
              <input name="notes" value="${escapeAttr(state.invoiceDraft.notes)}" placeholder="Optional invoice notes" />
            </div>
            <div class="full-span action-bar">
              <button class="primary-button" type="submit">Generate Invoice Preview</button>
              <button class="secondary-button" type="button" data-action="sync-invoice-from-sale">Use Last Saved Customer</button>
              <button class="ghost-button" type="button" data-action="clear-invoice-draft">Clear Invoice Form</button>
            </div>
          </form>

          <div class="summary-lines invoice-summary-lines">
            ${summaryLine("Items In Current Basket", basketItems.reduce((sum, item) => sum + item.quantity, 0))}
            ${summaryLine("Subtotal", money(subtotal))}
            ${summaryLine("VAT Included (16%)", money(taxAmount))}
            ${summaryLine("Invoice Total", money(totalDue))}
          </div>
        </section>

        <section class="panel-card app-card super-panel-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Invoice Preview</div>
              <h2 class="section-title">Current basket invoice</h2>
              <div class="section-subtitle">This preview uses the basket currently on the POS and the customer details entered here.</div>
            </div>
          </div>
          <div class="receipt-output invoice-preview-output">${
            state.invoiceDraft.output
              ? escapeHtml(state.invoiceDraft.output)
              : renderInvoicePreviewText({
                  customerName: selectedCustomerName,
                  phoneNumber: selectedPhoneNumber,
                  customerIdNumber: selectedCustomerId,
                  notes: state.invoiceDraft.notes,
                  items: basketItems,
                  subtotal,
                  taxAmount,
                  totalDue,
                })
          }</div>
        </section>
      </div>

      <section class="table-card app-card super-panel-card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Invoices</div>
            <h2 class="section-title">Recent recorded invoices</h2>
            <div class="section-subtitle">These come from completed sales already saved in the system.</div>
          </div>
        </div>
        ${renderInvoiceTable(recentInvoices)}
      </section>
    </div>
  `;
}

function renderProductsGrid() {
  if (!state.products.length) {
    return `<div class="empty-state">No products available yet.</div>`;
  }

  return `
    <div class="product-mini-grid">
      ${state.products.slice(0, 8).map((product) => `
        <div class="product-mini-card">
          <strong>${escapeHtml(product.name)}</strong>
          <span>${escapeHtml(product.productCode || "No code")}</span>
          <span>${money(product.unitPrice)}</span>
          <span>Stock ${product.stockQuantity}</span>
        </div>
      `).join("")}
    </div>
  `;
}

function renderSalesView() {
  const subtotal = saleSubtotalAmount();
  const taxAmount = saleVatAmount();
  const totalDue = saleTotalDue();
  const totalPaid = saleTotalPaid();
  const balance = totalDue - totalPaid;
  const filteredProducts = filterProducts(state.saleDraft.search);
  const scanMatch = resolveSearchProduct(state.saleDraft.search);
  const itemCount = state.saleDraft.items.reduce((sum, item) => sum + item.quantity, 0);
  const itemLabel = `${itemCount} ${itemCount === 1 ? "item" : "items"}`;
  const scannerStatusClass = state.scannerPaused ? "paused" : state.saleDraft.paymentStageOpen ? "locked" : "ready";
  const scannerTitle = state.scannerPaused ? "Scanner Paused" : state.saleDraft.paymentStageOpen ? "Payment Mode Active" : "Scanner Ready";
  const scannerMessage = state.scannerPaused
    ? "Scanner input is paused from Settings. Unpause it there when you want to continue scanning."
    : state.saleDraft.paymentStageOpen
      ? "Basket editing is locked while the cashier is collecting payment. Use Back To Basket to continue scanning."
      : "Waiting for barcode, product code, or typed product name.";

  return `
    <div class="view-stack pos-screen">
      <div class="pos-terminal-shell pos-simple-shell">
        <section class="pos-center-column app-card pos-center-stage">
          <div class="pos-meta-strip">
            <span class="pos-meta-pill strong">${itemLabel}</span>
            <span class="pos-meta-pill">${money(totalDue)} total</span>
            <span class="pos-meta-pill ${scannerStatusClass === "ready" ? "accent-green" : scannerStatusClass === "paused" ? "accent-gold" : "accent-red"}">${scannerTitle}</span>
            <span class="pos-meta-pill ${state.saleDraft.paymentStageOpen ? "accent-red" : "accent-green"}">${state.saleDraft.paymentStageOpen ? "Payment popup open" : "Basket mode"}</span>
          </div>

          <form id="sale-search-form" class="pos-search-shell">
            <div class="pos-scan-bar">
              <input id="sale-search-input" name="search" value="${escapeAttr(state.saleDraft.search)}" placeholder="${state.scannerPaused ? "Scanner paused in Settings" : state.saleDraft.paymentStageOpen ? "Payment mode active. Go back to basket to scan again." : "Scan barcode or enter product code"}" autocomplete="off" autofocus ${state.scannerPaused || state.saleDraft.paymentStageOpen ? "disabled" : ""} />
              <button class="search-trigger" type="submit" ${state.scannerPaused || state.saleDraft.paymentStageOpen ? "disabled" : ""}>${icon("search")}</button>
            </div>
            <div class="scan-status-row">
              <span class="helper-text">${
                state.scannerPaused
                  ? "The till is paused from Settings."
                  : state.saleDraft.paymentStageOpen
                    ? "Payment stage is open. Move back to basket if you need to add more items."
                    : state.saleDraft.search
                      ? `${filteredProducts.length} match(es) found`
                      : "Scan a barcode or type a product code to add items."
              }</span>
              ${!state.scannerPaused && !state.saleDraft.paymentStageOpen && scanMatch ? `<button class="ghost-button compact-button" type="button" data-action="quick-add-product" data-product-id="${scanMatch.id}">Add Exact Match</button>` : ""}
            </div>
            ${!state.scannerPaused && !state.saleDraft.paymentStageOpen && state.saleDraft.search ? `<div class="pos-search-results-card pos-floating-search-results">${renderScanResults(filteredProducts)}</div>` : ""}
          </form>

          <div class="pos-cart-card pos-cart-stage">
            <div class="section-header pos-table-title-row">
              <div>
                <h3 class="section-title">Scanned Items</h3>
                <div class="section-subtitle">Scan items and open payment when ready.</div>
              </div>
              <div class="pos-title-pills">
                <div class="pos-item-counter">${itemLabel}</div>
                <div class="pos-total-chip">${money(totalDue)}</div>
              </div>
            </div>
            ${renderReceiptTable()}
          </div>

          <div class="pos-bottom-actions">
            <button class="danger-button pos-action-button" type="button" data-action="reset-sale-draft">Clear</button>
            <button class="secondary-button pos-action-button hold-button" type="button" data-action="hold-sale" ${state.saleDraft.paymentStageOpen ? "disabled" : ""}>Hold Sale</button>
            ${
              state.saleDraft.paymentStageOpen
                ? `<button class="primary-button pos-action-button checkout-button" type="button" data-action="close-sale-payment">Back To Basket</button>`
                : `<button class="primary-button pos-action-button checkout-button" type="button" data-action="open-sale-payment" ${!state.saleDraft.items.length ? "disabled" : ""}>Payment</button>`
            }
          </div>
        </section>

        <aside class="pos-order-column app-card pos-summary-stage">
          <div class="section-header pos-summary-header">
            <div>
              <h3 class="section-title">Order Summary</h3>
              <div class="section-subtitle">${state.saleDraft.paymentStageOpen ? "Finalize tender in the payment popup." : "Review the basket here, then open payment."}</div>
            </div>
          </div>

          ${renderOrderSummaryList()}

          <div class="order-totals pos-summary-totals">
            ${summaryLine("Items", itemCount)}
            ${summaryLine("Subtotal", money(subtotal))}
            ${summaryLine("VAT Included (16%)", money(taxAmount))}
            ${state.saleDraft.paymentStageOpen ? summaryLine("Paid", money(totalPaid)) : ""}
            ${state.saleDraft.paymentStageOpen ? summaryLine(balance >= 0 ? "Balance" : "Change", money(Math.abs(balance))) : ""}
          </div>

          <div class="pos-total-block">
            <span>Total Amount</span>
            <strong>${money(totalDue)}</strong>
          </div>

          <div class="pos-summary-actions">
            ${
              state.saleDraft.paymentStageOpen
                ? `<button class="secondary-button pos-summary-button checkout-button" type="button" data-action="close-sale-payment">Back To Basket</button>`
                : ``
            }
            <button class="primary-button complete-sale-button pos-summary-button" type="button" data-action="${state.saleDraft.paymentStageOpen ? "close-sale-payment" : "open-sale-payment"}" ${!state.saleDraft.items.length ? "disabled" : ""}>${state.saleDraft.paymentStageOpen ? "Payment Popup Open" : "Open Payment"}</button>
          </div>

          ${
            state.saleDraft.output
              ? `<div class="receipt-output compact-output pos-summary-output">${escapeHtml(state.saleDraft.output)}</div>`
              : `<div class="pos-summary-note">${state.saleDraft.paymentStageOpen ? "The cashier is now in payment mode. Complete the sale from the popup." : "Payment methods only appear in the popup after scanning is complete."}</div>`
          }
        </aside>
      </div>
    </div>
  `;
}

function renderPosSupportPanel(itemCount, totalDue, balance, paymentConfig) {
  return `
    <section class="panel-card app-card pos-customer-card pos-support-card">
      <div class="section-header pos-support-header">
        <div>
          <h3 class="section-title">Invoice Desk</h3>
          <div class="section-subtitle">${balance > 0 ? "If this sale becomes partial or credit, the system will still ask for the customer name before saving it." : "Customer details were moved out of POS. Use the invoice tab only when you need a named invoice."}</div>
        </div>
      </div>
      <div class="list-card pos-sidebar-list">
        <div class="list-item">Items on till: <strong>${itemCount}</strong></div>
        <div class="list-item">Running total: <strong>${money(totalDue)}</strong></div>
        <div class="list-item">Named customer invoices are now handled from <strong>Invoices</strong>, not from the cashier lane.</div>
      </div>
      <button class="secondary-button pos-summary-button" type="button" data-action="navigate" data-view="invoice">Open Invoice Tab</button>
    </section>

    <section class="panel-card app-card pos-method-card pos-support-card">
      <div class="section-header pos-support-header">
        <div>
          <h3 class="section-title">Payment Methods</h3>
          <div class="section-subtitle">${state.saleDraft.paymentStageOpen ? "The payment popup is open. Complete the tender there." : "Select a payment channel now, then open payment when the basket is ready."}</div>
        </div>
      </div>
      <div class="tender-method-grid tender-method-grid-pos">
        ${renderTenderKey("Cash")}
        ${renderTenderKey("M-Pesa")}
        ${renderTenderKey("Gift Card")}
        ${renderTenderKey("Card")}
      </div>
      <div class="mini-method-row">
        <button class="ghost-button compact-button" type="button" data-action="select-sale-method" data-method="Buy Goods">Buy Goods</button>
        <button class="ghost-button compact-button" type="button" data-action="select-sale-method" data-method="Paybill">Paybill</button>
        <button class="ghost-button compact-button" type="button" data-action="select-sale-method" data-method="Airtel Money">Airtel Money</button>
        <button class="ghost-button compact-button" type="button" data-action="select-sale-method" data-method="Bank Transfer">Bank Transfer</button>
      </div>

      <div class="pos-payment-entry">
        <div class="list-card pos-sidebar-list">
          <div class="list-item">Selected tender: <strong>${escapeHtml(state.saleDraft.paymentForm.paymentMethod)}</strong></div>
          <div class="list-item">Receipt printing default: <strong>${state.saleDraft.printReceipt ? "On" : "Off"}</strong></div>
          <div class="list-item">${
            state.saleDraft.paymentStageOpen
              ? "Payment popup is active. Use it to complete the sale."
              : "Tap the payment button to open the checkout popup."
          }</div>
        </div>
        <button class="primary-button complete-sale-button" type="button" data-action="${state.saleDraft.paymentStageOpen ? "close-sale-payment" : "open-sale-payment"}" ${!state.saleDraft.items.length && !state.saleDraft.paymentStageOpen ? "disabled" : ""}>${state.saleDraft.paymentStageOpen ? "Close Payment Popup" : "Open Payment Popup"}</button>
      </div>
    </section>
  `;
}

function renderSalePaymentStage(paymentConfig, balance) {
  const nextBalance = Math.max(balance, 0);
  return `
    <div class="pos-payment-stage pos-payment-stage-sidebar">
      <div class="amount-due-card">
        <span>Amount To Pay</span>
        <strong>${money(nextBalance)}</strong>
      </div>

      <div class="payment-flow-card">
        <div class="section-header split-top">
          <div>
            <h3 class="section-title">Payment Progress</h3>
            <div class="section-subtitle">Add one or many payment lines. This supports split payment like M-Pesa first and Cash second.</div>
          </div>
        </div>
        <div class="payment-progress-grid">
          ${summaryLine("Total Due", money(saleTotalDue()))}
          ${summaryLine("Paid So Far", money(saleTotalPaid()))}
          ${summaryLine(balance > 0 ? "Balance Remaining" : "Change To Return", money(Math.abs(balance)))}
        </div>
        ${
          nextBalance > 0.0001
            ? `
          <div class="split-payment-helper">
            <span>Quick split helpers</span>
            <div class="split-payment-actions">
              <button class="secondary-button compact-button" type="button" data-action="set-sale-payment-method-and-balance" data-method="Cash">Balance To Cash</button>
              <button class="secondary-button compact-button" type="button" data-action="set-sale-payment-method-and-balance" data-method="M-Pesa">Balance To M-Pesa</button>
              <button class="secondary-button compact-button" type="button" data-action="set-sale-payment-method-and-balance" data-method="Card">Balance To Card</button>
            </div>
          </div>
        `
            : `<div class="split-payment-helper split-payment-ready">Payment amount is already enough. You can complete the sale now.</div>`
        }
      </div>

      <div class="payment-method-picker">
        <div class="section-header split-top">
          <div>
            <h3 class="section-title">Payment Method</h3>
            <div class="section-subtitle">Choose whether the customer is paying with cash, M-Pesa, Airtel Money, card, or another method.</div>
          </div>
          <div class="workspace-chip subtle">${escapeHtml(state.saleDraft.paymentForm.paymentMethod)}</div>
        </div>
        <div class="tender-method-grid popup-payment-method-grid">
          ${availablePaymentMethods().map((method) => renderTenderKey(method)).join("")}
        </div>
      </div>

      <div class="receipt-print-row">
        <span>${state.saleDraft.printReceipt ? "Receipt printing is enabled for this sale." : "Receipt printing is off for this sale."}</span>
        <button class="secondary-button compact-button" type="button" data-action="toggle-print-receipt">${state.saleDraft.printReceipt ? "Turn Off" : "Turn On"}</button>
      </div>

      ${renderTenderForm(paymentConfig, balance)}
      <div class="pos-payment-draft-head">
        <strong>Payment Lines</strong>
        ${state.saleDraft.payments.length ? `<button class="ghost-button compact-button" type="button" data-action="clear-sale-payments">Clear Lines</button>` : ""}
      </div>
      ${renderPaymentDraftTable(state.saleDraft.payments, "sale")}
    </div>
  `;
}

function renderHeldSalesView() {
  return `
    <div class="view-stack">
      <section class="table-card app-card super-panel-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Held Sales Queue</h2>
            <div class="section-subtitle">Resume suspended baskets when the cashier returns to them.</div>
          </div>
        </div>
        ${
          state.heldSales.length
            ? `
          <div class="list-card">
            ${state.heldSales.map((heldSale) => `
              <div class="settings-card held-sale-row">
                <div class="settings-card-copy">
                  <h3>${escapeHtml(heldSale.label)}</h3>
                  <p>${heldSale.items.length} items | ${money(heldSale.totalDue)} | Held at ${escapeHtml(heldSale.createdAt)}</p>
                </div>
                <button type="button" class="secondary-button" data-action="resume-held-sale" data-held-id="${escapeAttr(heldSale.id)}">Resume</button>
                <button type="button" class="danger-button" data-action="delete-held-sale" data-held-id="${escapeAttr(heldSale.id)}">Delete</button>
              </div>
            `).join("")}
          </div>
        `
            : `<div class="empty-state">No held sales yet. Use Hold Sale on the POS screen to suspend a basket.</div>`
        }
      </section>
    </div>
  `;
}

function renderReturnsView() {
  return `
    <div class="view-stack">
      <section class="panel-card app-card super-panel-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Returns Desk</h2>
            <div class="section-subtitle">The return workflow shell is ready next to the cashier views.</div>
          </div>
        </div>
        <div class="list-card">
          <div class="list-item">The UI lane for returns is now placed in the system like a supermarket counter.</div>
          <div class="list-item">Next step is connecting original receipt lookup, quantity reversal, and stock re-entry rules.</div>
          <div class="list-item">Until then, sales, held sales, debts, and inventory are fully usable from the same shell.</div>
        </div>
        <div class="section-action-grid returns-action-grid">
          ${renderActionChoiceButton({
            title: "Open POS",
            description: "Go back to the cashier lane and continue selling.",
            iconName: "sales",
            tone: "red",
            attrs: `data-action="navigate" data-view="sales"`,
          })}
          ${renderActionChoiceButton({
            title: "Held Sales",
            description: "Resume or clear suspended baskets from the queue.",
            iconName: "returns",
            tone: "gold",
            attrs: `data-action="navigate" data-view="held"`,
          })}
          ${renderActionChoiceButton({
            title: "Inventory",
            description: "Check stock before processing any product return.",
            iconName: "inventory",
            tone: "blue",
            attrs: `data-action="navigate" data-view="inventory"`,
          })}
        </div>
      </section>
    </div>
  `;
}

function filterProducts(query) {
  const search = normalizeText(query);
  if (!search) return state.products;
  return state.products.filter((product) =>
    normalizeText(product.name).includes(search) ||
    normalizeText(product.productCode).includes(search) ||
    normalizeText(product.id).includes(search)
  );
}

function resolveSearchProduct(query) {
  const search = normalizeText(query);
  if (!search) return null;

  const exactCode = state.products.find((product) => normalizeText(product.productCode) === search);
  if (exactCode) return exactCode;

  const exactName = state.products.find((product) => normalizeText(product.name) === search);
  if (exactName) return exactName;

  const exactId = state.products.find((product) => normalizeText(product.id) === search);
  if (exactId) return exactId;

  const filtered = filterProducts(search);
  return filtered.length === 1 ? filtered[0] : null;
}

function renderCatalogCard(product) {
  const cartQuantity = getCartQuantity(product.id);
  const remaining = Math.max(product.stockQuantity - cartQuantity, 0);
  return `
    <div class="catalog-card ${remaining <= 0 ? "sold-out" : ""}">
      <div class="catalog-card-top">
        <div>
          <strong>${escapeHtml(product.name)}</strong>
          <div class="helper-text">${escapeHtml(product.productCode || product.id)}</div>
          <div class="muted">${money(product.unitPrice)}</div>
        </div>
        <span class="pill ${remaining <= 3 ? "warning" : "success"}">${remaining <= 0 ? "Out" : `Stock ${remaining}`}</span>
      </div>
      <p>${remaining <= 0 ? "This item is fully reserved in the cart or out of stock." : "Ready to add to the checkout cart."}</p>
      <button class="primary-button add-button" type="button" data-action="quick-add-product" data-product-id="${product.id}" ${remaining <= 0 ? "disabled" : ""}>Add 1 To Cart</button>
    </div>
  `;
}

function renderScanResults(products) {
  if (!products.length) {
    return `<div class="empty-state">No products matched the current scan or search.</div>`;
  }

  return `
    <div class="scan-results">
      ${products.slice(0, 10).map((product) => {
        const reserved = getCartQuantity(product.id);
        const remaining = Math.max(product.stockQuantity - reserved, 0);
        return `
          <div class="scan-result-row ${remaining <= 0 ? "sold-out" : ""}">
            <div class="scan-result-main">
              <strong>${escapeHtml(product.name)}</strong>
              <div class="helper-text">${escapeHtml(product.productCode || product.id)}</div>
            </div>
            <div class="scan-result-price">${money(product.unitPrice)}</div>
            <div class="scan-result-stock">${remaining <= 0 ? "Out" : `Stock ${remaining}`}</div>
            <button class="primary-button compact-button" type="button" data-action="quick-add-product" data-product-id="${product.id}" ${remaining <= 0 ? "disabled" : ""}>Add</button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderReceiptTable() {
  return `
    <div class="receipt-table">
      <div class="receipt-head">
        <span>#</span>
        <span>Barcode</span>
        <span>Product</span>
        <span>Qty</span>
        <span>Price</span>
        <span>Total</span>
        <span>Action</span>
      </div>
      <div class="receipt-body">
        ${
          state.saleDraft.items.length
            ? state.saleDraft.items.map((item, index) => `
        <div class="receipt-row">
          <span>${index + 1}</span>
          <span class="receipt-code">${escapeHtml(productLookup(item.productId)?.productCode || item.productId)}</span>
          <span class="receipt-name">${escapeHtml(item.productName)}</span>
          <span class="receipt-qty">
            <button type="button" class="ghost-button compact-button" data-action="decrement-sale-item" data-index="${index}">-</button>
            <form class="receipt-qty-editor" data-sale-quantity-form="true">
              <input type="hidden" name="index" value="${index}" />
              <input class="receipt-qty-input" name="quantity" type="number" min="1" max="${Math.max(productLookup(item.productId)?.stockQuantity || item.quantity, 1)}" step="1" value="${item.quantity}" />
              <button type="submit" class="ghost-button compact-button receipt-qty-save">Set</button>
            </form>
            <button type="button" class="ghost-button compact-button" data-action="increment-sale-item" data-index="${index}" ${(productLookup(item.productId)?.stockQuantity || item.quantity) <= item.quantity ? "disabled" : ""}>+</button>
          </span>
          <span>${money(item.unitPrice)}</span>
          <strong>${money(item.subtotal)}</strong>
          <button type="button" class="ghost-button compact-button" data-action="remove-sale-item" data-index="${index}">Void</button>
        </div>
      `).join("")
            : `
        <div class="receipt-empty-state">
          <strong>No scanned items yet</strong>
          <span>Use the scan lane above to start the basket. Matching products will appear immediately while you type.</span>
        </div>
      `
        }
      </div>
    </div>
  `;
}

function renderTenderKey(method) {
  const methodIcons = {
    Cash: "cash",
    "M-Pesa": "mpesa",
    "Gift Card": "gift",
    Card: "card",
    "Buy Goods": "sales",
    Paybill: "reports",
    "Airtel Money": "phone",
    "Bank Transfer": "database",
  };
  return `
    <button type="button" class="tender-key ${state.saleDraft.paymentForm.paymentMethod === method ? "active" : ""}" data-action="select-sale-method" data-method="${method}">
      <span class="tender-key-indicator ${state.saleDraft.paymentForm.paymentMethod === method ? "active" : ""}"></span>
      <span class="tender-key-icon">${icon(methodIcons[method] || "sales")}</span>
      <span>${escapeHtml(method)}</span>
    </button>
  `;
}

function renderTenderForm(config, balance) {
  const remaining = Math.max(balance, 0);
  const isCash = state.saleDraft.paymentForm.paymentMethod === "Cash";
  const quickAmounts = isCash ? [
    { label: "Exact", action: "remaining" },
    { label: "Round 100", action: "round-100" },
    { label: "Round 500", action: "round-500" },
    { label: "Round 1000", action: "round-1000" },
  ] : [
    { label: "Use Balance", action: "remaining" },
  ];

  return `
    <form id="sale-payment-form" class="tender-form pos-tender-form">
      <div class="tender-form-grid">
        <div class="field">
          <label>Payment Method</label>
          <select name="paymentMethod" data-action="change-sale-payment-method">
            ${paymentOptions(state.saleDraft.paymentForm.paymentMethod)}
          </select>
        </div>
        <div class="field">
          <label>${isCash ? "Amount Received" : "Amount To Approve"}</label>
          <input name="amount" type="number" min="0.01" step="0.01" required value="${escapeAttr(state.saleDraft.paymentForm.amount)}" placeholder="${remaining > 0 ? remaining.toFixed(2) : "0.00"}" />
        </div>
        <div class="field">
          <label>${isCash ? "Confirmation" : "Approval Mode"}</label>
          <select name="approvalMode">
            ${config.approvalModes.map((mode) => `<option value="${escapeAttr(mode)}" ${mode === state.saleDraft.paymentForm.approvalMode ? "selected" : ""}>${escapeHtml(mode)}</option>`).join("")}
          </select>
        </div>
        ${renderCompactTenderFields(config)}
      </div>
      <div class="tender-quick-row">
        ${quickAmounts.map((item) => `<button class="secondary-button compact-button" type="button" data-action="fill-sale-payment" data-mode="${item.action}">${escapeHtml(item.label)}</button>`).join("")}
      </div>
      <div class="action-bar">
        <button class="primary-button" type="submit">Add Payment</button>
      </div>
    </form>
  `;
}

function renderCompactTenderFields(config) {
  const fields = [];

  if (config.showPhone) {
    fields.push(`
      <div class="field">
        <label>${escapeHtml(config.phoneLabel || "Customer Phone")}</label>
        <input name="customerPhone" value="${escapeAttr(state.saleDraft.paymentForm.customerPhone || state.saleDraft.phoneNumber || "")}" placeholder="${escapeAttr(config.phonePlaceholder || "")}" />
      </div>
    `);
  }

  if (config.showTarget) {
    fields.push(`
      <div class="field">
        <label>${escapeHtml(config.targetLabel)}</label>
        <input name="targetNumber" value="${escapeAttr(state.saleDraft.paymentForm.targetNumber)}" placeholder="${escapeAttr(config.targetPlaceholder || "")}" />
      </div>
    `);
  }

  if (config.showReference) {
    fields.push(`
      <div class="field">
        <label>${escapeHtml(config.referenceLabel || "Reference")}</label>
        <input name="accountReference" value="${escapeAttr(state.saleDraft.paymentForm.accountReference)}" placeholder="${escapeAttr(config.referencePlaceholder || "")}" />
      </div>
    `);
  }

  if (config.showPurpose) {
    fields.push(`
      <div class="field full-span">
        <label>${escapeHtml(config.purposeLabel || "Purpose")}</label>
        <input name="paymentPurpose" value="${escapeAttr(state.saleDraft.paymentForm.paymentPurpose)}" placeholder="${escapeAttr(config.purposePlaceholder || "")}" />
      </div>
    `);
  }

  return fields.join("");
}

function renderOrderSummaryList() {
  if (!state.saleDraft.items.length) {
    return `<div class="empty-state">No items in the current basket.</div>`;
  }

  return `
    <div class="order-summary-list">
      ${state.saleDraft.items.map((item) => `
        <div class="order-summary-item">
          <div>
            <strong>${escapeHtml(item.productName)}</strong>
            <div class="muted">${escapeHtml(productLookup(item.productId)?.productCode || item.productId)} x${item.quantity}</div>
          </div>
          <strong>${money(item.subtotal)}</strong>
        </div>
      `).join("")}
    </div>
  `;
}

function renderCartList() {
  if (!state.saleDraft.items.length) {
    return `<div class="empty-state">No items in the cart yet. Use the product search on the left to begin.</div>`;
  }

  return `
    <div class="cart-list">
      ${state.saleDraft.items.map((item, index) => `
        <div class="cart-item">
          <div class="cart-item-copy">
            <strong>${escapeHtml(item.productName)}</strong>
            <div class="muted">${money(item.unitPrice)} each</div>
          </div>
          <div class="cart-item-controls">
            <button type="button" class="ghost-button compact-button" data-action="decrement-sale-item" data-index="${index}">-</button>
            <span class="cart-qty">${item.quantity}</span>
            <button type="button" class="ghost-button compact-button" data-action="increment-sale-item" data-index="${index}">+</button>
          </div>
          <div class="cart-item-total">${money(item.subtotal)}</div>
          <button type="button" class="ghost-button compact-button" data-action="remove-sale-item" data-index="${index}">Remove</button>
        </div>
      `).join("")}
      <div class="action-bar">
        <button type="button" class="secondary-button" data-action="clear-sale-items">Clear Cart</button>
      </div>
    </div>
  `;
}

function renderPaymentMetaFields(config, paymentForm, defaultPhone) {
  return `
    ${config.showPhone ? `
      <div class="field">
        <label>${escapeHtml(config.phoneLabel)}</label>
        <input name="customerPhone" value="${escapeAttr(paymentForm.customerPhone || defaultPhone || "")}" placeholder="${escapeAttr(config.phonePlaceholder || "")}" />
      </div>
    ` : ""}
    ${config.showTarget ? `
      <div class="field">
        <label>${escapeHtml(config.targetLabel)}</label>
        <input name="targetNumber" value="${escapeAttr(paymentForm.targetNumber)}" placeholder="${escapeAttr(config.targetPlaceholder || "")}" />
      </div>
    ` : ""}
    ${config.showReference ? `
      <div class="field">
        <label>${escapeHtml(config.referenceLabel)}</label>
        <input name="accountReference" value="${escapeAttr(paymentForm.accountReference)}" placeholder="${escapeAttr(config.referencePlaceholder || "")}" />
      </div>
    ` : ""}
    ${config.showPurpose ? `
      <div class="field full-span">
        <label>${escapeHtml(config.purposeLabel)}</label>
        <input name="paymentPurpose" value="${escapeAttr(paymentForm.paymentPurpose)}" placeholder="${escapeAttr(config.purposePlaceholder || "")}" />
      </div>
    ` : ""}
  `;
}

function renderPaymentDraftTable(payments, scope) {
  if (!payments.length) {
    return `<div class="empty-state" style="margin-top: 16px;">No payment lines added yet.</div>`;
  }

  return `
    <div class="payment-line-list">
      ${payments.map((payment, index) => `
        <div class="payment-line">
          <div>
            <strong>${escapeHtml(payment.paymentMethod)}</strong>
            <div class="muted">${escapeHtml(payment.approvalMode || "")}</div>
            ${paymentDetail(payment) ? `<div class="helper-text">${escapeHtml(paymentDetail(payment))}</div>` : ""}
          </div>
          <div class="payment-line-right">
            <strong>${money(payment.amount)}</strong>
            <button type="button" class="ghost-button compact-button" data-action="${scope === "sale" ? "remove-sale-payment" : "remove-debt-payment"}" data-index="${index}">Remove</button>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDebtsView() {
  const currentDebt = state.openCredits.find((credit) => credit.customerName === state.debtDraft.customerName);
  const draftPaid = debtTotalPaid();
  const remaining = Math.max((currentDebt?.amountOwed || 0) - draftPaid, 0);
  const paymentConfig = getPaymentConfig(state.debtDraft.paymentForm.paymentMethod);

  return `
    <div class="view-stack">
      <div class="split-layout">
        <section class="table-card app-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Debt Payments</div>
              <h2 class="section-title">Outstanding balances</h2>
              <div class="section-subtitle">Select a customer and clear their balance with one or many payment lines.</div>
            </div>
          </div>
          ${renderDebtTable(state.openCredits)}
        </section>

        <section class="panel-card app-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Debt Builder</div>
              <h2 class="section-title">Process customer debt payment</h2>
            </div>
          </div>
          <form id="debt-customer-form" class="form-grid">
            <div class="field full-span">
              <label>Selected Customer</label>
              <select name="customerName" required>
                <option value="">Select a customer</option>
                ${state.openCredits.map((credit) => `
                  <option value="${escapeAttr(credit.customerName)}" ${credit.customerName === state.debtDraft.customerName ? "selected" : ""}>
                    ${escapeHtml(credit.customerName)} | ${money(credit.amountOwed)}
                  </option>
                `).join("")}
              </select>
            </div>
            <div class="full-span">
              <button class="secondary-button" type="submit">Save Customer</button>
            </div>
          </form>

          <form id="debt-payment-form" class="form-grid" style="margin-top: 18px;">
            <div class="field">
              <label>Payment Method</label>
              <select name="paymentMethod" data-action="change-debt-payment-method">
                ${paymentOptions(state.debtDraft.paymentForm.paymentMethod)}
              </select>
            </div>
            <div class="field">
              <label>Amount</label>
              <input name="amount" type="number" min="0.01" step="0.01" required value="${escapeAttr(state.debtDraft.paymentForm.amount)}" />
            </div>
            <div class="field">
              <label>Approval Mode</label>
              <select name="approvalMode">
                ${paymentConfig.approvalModes.map((mode) => `<option value="${escapeAttr(mode)}" ${mode === state.debtDraft.paymentForm.approvalMode ? "selected" : ""}>${escapeHtml(mode)}</option>`).join("")}
              </select>
            </div>
            ${renderPaymentMetaFields(paymentConfig, state.debtDraft.paymentForm, "")}
            <div class="full-span action-bar">
              <button class="primary-button" type="submit">Add Debt Payment</button>
              <button class="secondary-button" type="button" data-action="clear-debt-payments">Clear Draft</button>
            </div>
          </form>

          ${renderPaymentDraftTable(state.debtDraft.payments, "debt")}

          <div class="summary-lines" style="margin-top: 18px;">
            ${summaryLine("Outstanding", money(currentDebt?.amountOwed || 0))}
            ${summaryLine("Draft Paid", money(draftPaid))}
            ${summaryLine("Remaining", money(remaining))}
          </div>

          <div class="action-bar" style="margin-top: 18px;">
            <button type="button" class="primary-button" data-action="finalize-debt-payment">Process Debt Payment</button>
          </div>

          <div class="receipt-output" style="margin-top: 18px;">${state.debtDraft.output ? escapeHtml(state.debtDraft.output) : "Complete a debt payment to preview the receipt and approval messages."}</div>
        </section>
      </div>

      <section class="table-card app-card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Credit Records</div>
            <h2 class="section-title">All debt history</h2>
          </div>
        </div>
        ${renderCreditTable(state.credits)}
      </section>
    </div>
  `;
}

function renderReportsView() {
  const accounting = state.accounting || {
    salesCount: 0,
    totalSalesValue: 0,
    totalPaidReceived: 0,
    collectedDuringSales: 0,
    totalCreditSold: 0,
    outstandingDebt: 0,
    paymentBreakdown: [],
  };

  return `
    <div class="view-stack">
      <div class="split-layout">
        <section class="panel-card app-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Reports</div>
              <h2 class="section-title">Generate daily, weekly, monthly, and annual summaries</h2>
            </div>
          </div>
          <form id="report-form" class="form-grid">
            <div class="field">
              <label>Date</label>
              <input name="reportDate" type="date" value="${escapeAttr(state.reportDate)}" required />
            </div>
            <div class="field full-span report-kind-field">
              <div class="section-action-grid report-kind-grid">
                ${renderActionChoiceButton({
                  title: "Daily Report",
                  description: "Summarize today or any selected day.",
                  iconName: "reports",
                  tone: "red",
                  type: "submit",
                  attrs: `name="kind" value="daily"`,
                })}
                ${renderActionChoiceButton({
                  title: "Weekly Report",
                  description: "See weekly sales and stock movement.",
                  iconName: "dashboard",
                  tone: "gold",
                  type: "submit",
                  attrs: `name="kind" value="weekly"`,
                })}
                ${renderActionChoiceButton({
                  title: "Monthly Report",
                  description: "Review monthly revenue and activity.",
                  iconName: "inventory",
                  tone: "blue",
                  type: "submit",
                  attrs: `name="kind" value="monthly"`,
                })}
                ${renderActionChoiceButton({
                  title: "Annual Report",
                  description: "Capture the yearly picture for accounting.",
                  iconName: "database",
                  tone: "green",
                  type: "submit",
                  attrs: `name="kind" value="annual"`,
                })}
                ${renderActionChoiceButton({
                  title: "Accounting Summary",
                  description: "Show the current accounting breakdown.",
                  iconName: "cash",
                  tone: "blue",
                  attrs: `data-action="show-accounting"`,
                })}
              </div>
            </div>
          </form>
          <div class="report-output compact-output">${state.reportOutput ? escapeHtml(state.reportOutput) : "Choose a report type to preview it here."}</div>
        </section>

        <section class="panel-card app-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Accounting</div>
              <h2 class="section-title">Live accounting snapshot</h2>
            </div>
          </div>
          <div class="summary-lines">
            ${summaryLine("Number of Sales", accounting.salesCount)}
            ${summaryLine("Total Sales Value", money(accounting.totalSalesValue))}
            ${summaryLine("Total Paid Received", money(accounting.totalPaidReceived))}
            ${summaryLine("Collected During Sales", money(accounting.collectedDuringSales))}
            ${summaryLine("Total Credit Sold", money(accounting.totalCreditSold))}
            ${summaryLine("Outstanding Debt", money(accounting.outstandingDebt))}
          </div>
          <div style="margin-top: 18px;">
            ${renderPaymentBreakdownBars(accounting.paymentBreakdown)}
          </div>
        </section>
      </div>

      ${state.lastReport ? renderGeneratedReportPanel(state.lastReport) : ""}

      <section class="panel-card app-card super-panel-card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Activity Calendar</div>
            <h2 class="section-title">Sales tracking by date</h2>
            <div class="section-subtitle">Press any day to view sold items, stock movement, payment methods, and end-of-day staff details.</div>
          </div>
          <div class="action-bar">
            <button class="secondary-button compact-button" type="button" data-action="calendar-prev-month">Previous Month</button>
            <button class="secondary-button compact-button" type="button" data-action="calendar-today">Today</button>
            <button class="secondary-button compact-button" type="button" data-action="calendar-next-month">Next Month</button>
          </div>
        </div>
        ${renderActivityCalendar()}
      </section>

      <section class="table-card app-card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Ledger</div>
            <h2 class="section-title">Payment records</h2>
          </div>
        </div>
        ${renderPaymentLedgerTable(state.paymentLedger)}
      </section>
    </div>
  `;
}

function renderActivityCalendar() {
  const [year, month] = state.calendarAnchorDate.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1));
  const startWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const salesByDay = new Map();
  const stockByDay = new Map();

  for (const sale of state.sales) {
    if (!sale?.date || !sale.date.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
      continue;
    }
    const dayKey = Number(sale.date.slice(8, 10));
    salesByDay.set(dayKey, (salesByDay.get(dayKey) || 0) + 1);
  }

  for (const record of state.stockRecords) {
    if (!record?.date || !record.date.startsWith(`${year}-${String(month).padStart(2, "0")}`)) {
      continue;
    }
    const dayKey = Number(record.date.slice(8, 10));
    stockByDay.set(dayKey, (stockByDay.get(dayKey) || 0) + 1);
  }

  const cells = [];
  for (let index = 0; index < startWeekday; index += 1) {
    cells.push(`<div class="calendar-cell empty"></div>`);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const count = salesByDay.get(day) || 0;
    const stockCount = stockByDay.get(day) || 0;
    const isSelected = iso === state.reportDate;
    const toneClass = count >= 5 ? "busy" : count >= 2 ? "active" : count >= 1 ? "light" : "";
    cells.push(`
      <button type="button" class="calendar-cell calendar-cell-button ${toneClass} ${isSelected ? "selected" : ""}" data-action="open-report-day" data-date="${iso}">
        <strong>${day}</strong>
        <span>${count ? `${count} sale${count === 1 ? "" : "s"}` : "No sales"}</span>
        <span>${stockCount ? `${stockCount} stock ${stockCount === 1 ? "entry" : "entries"}` : "No stock record"}</span>
      </button>
    `);
  }

  return `
    <div class="activity-calendar">
      <div class="calendar-header-row">
        <strong>${new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-KE", { month: "long", year: "numeric" })}</strong>
        <span class="muted">Selected report date: ${escapeHtml(state.reportDate)}</span>
      </div>
      <div class="calendar-weekdays">
        <span>Sun</span>
        <span>Mon</span>
        <span>Tue</span>
        <span>Wed</span>
        <span>Thu</span>
        <span>Fri</span>
        <span>Sat</span>
      </div>
      <div class="calendar-grid">
        ${cells.join("")}
      </div>
    </div>
  `;
}

function renderGeneratedReportPanel(report) {
  const sales = Array.isArray(report.sales) ? report.sales : [];
  const soldItems = summarizeSoldItems(sales);
  const totalItems = soldItems.reduce((sum, item) => sum + item.quantity, 0);
  const paymentMethodsUsed = report.paymentBreakdown?.length
    ? report.paymentBreakdown.map((entry) => entry.paymentMethod).join(", ")
    : "No payment methods recorded";
  const canOpenDayPopup = report.kind === "daily";

  return `
    <section class="panel-card app-card super-panel-card report-sales-card">
      <div class="section-header">
        <div>
          <div class="eyebrow">${escapeHtml(report.title || "Sales Report")}</div>
          <h2 class="section-title">${escapeHtml(report.kind === "daily" ? `What was sold on ${formatDisplayDate(report.dateOrRange)}` : "Sales breakdown for the selected period")}</h2>
          <div class="section-subtitle">See the items sold, payment methods used, cashier activity, and the value moved in this report period.</div>
        </div>
        ${canOpenDayPopup ? `<button class="secondary-button compact-button" type="button" data-action="open-report-day" data-date="${escapeAttr(report.dateOrRange)}">Open Day Popup</button>` : ""}
      </div>

      <div class="payment-modal-summary report-summary-grid">
        ${summaryLine("Sales Recorded", sales.length)}
        ${summaryLine("Items Sold", totalItems)}
        ${summaryLine("Payment Methods", paymentMethodsUsed)}
        ${summaryLine("Stock Movement", `IN ${report.stockMovement?.stockIn || 0} / OUT ${report.stockMovement?.stockOut || 0}`)}
      </div>

      <div class="day-activity-grid report-activity-grid">
        <section class="day-activity-panel">
          <div class="section-header">
            <div>
              <h3 class="section-title">Items Sold</h3>
              <div class="section-subtitle">This shows the products that made up the report totals.</div>
            </div>
          </div>
          ${renderSoldItemsTable(soldItems, "No sold items found in this report period.")}
        </section>

        <section class="day-activity-panel">
          <div class="section-header">
            <div>
              <h3 class="section-title">Sales Transactions</h3>
              <div class="section-subtitle">Each checkout included in the report period.</div>
            </div>
          </div>
          ${renderSalesActivityTable(sales, { showDate: report.kind !== "daily" })}
        </section>
      </div>
    </section>
  `;
}

function renderReportDayModal() {
  if (!state.reportDayModalDate) {
    return "";
  }

  const activity = buildDayActivity(state.reportDayModalDate);

  return `
    <div class="modal-layer open report-day-layer">
      <button type="button" class="settings-backdrop" data-action="close-report-day-modal" aria-label="Close day activity popup"></button>
      <div class="inventory-modal report-day-modal app-card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Daily Activity</div>
            <h2 class="section-title">${escapeHtml(formatDisplayDate(state.reportDayModalDate))}</h2>
            <div class="section-subtitle">Review sales, stock entries, payment methods, and end-of-day staff details for this date.</div>
          </div>
          <button class="ghost-button icon-button" type="button" data-action="close-report-day-modal">${icon("close")}</button>
        </div>

        <div class="payment-modal-summary report-summary-grid">
          ${summaryLine("Sales", activity.sales.length)}
          ${summaryLine("Items Sold", activity.totalItems)}
          ${summaryLine("Stock In", activity.stockIn)}
          ${summaryLine("Stock Out", activity.stockOut)}
        </div>

        <div class="day-activity-grid">
          <section class="day-activity-panel">
            <div class="section-header">
              <div>
                <h3 class="section-title">Products Bought</h3>
                <div class="section-subtitle">All products sold on this day, grouped by item.</div>
              </div>
            </div>
            ${renderSoldItemsTable(activity.soldItems, "No products were sold on this day.")}
          </section>

          <section class="day-activity-panel">
            <div class="section-header">
              <div>
                <h3 class="section-title">Payment Methods Used</h3>
                <div class="section-subtitle">Tender methods collected during the day.</div>
              </div>
            </div>
            ${renderPaymentBreakdownBars(activity.paymentBreakdown)}
            <div class="day-payment-note">${escapeHtml(activity.paymentBreakdown.length ? activity.paymentBreakdown.map((entry) => `${entry.paymentMethod}: ${money(entry.total)}`).join(" | ") : "No payments were recorded on this day.")}</div>
          </section>
        </div>

        <div class="day-activity-grid">
          <section class="day-activity-panel">
            <div class="section-header">
              <div>
                <h3 class="section-title">Sales Processed That Day</h3>
                <div class="section-subtitle">Each sale, what was bought, the cashier, and the tender used.</div>
              </div>
            </div>
            ${renderSalesActivityTable(activity.sales, { showDate: false })}
          </section>

          <section class="day-activity-panel">
            <div class="section-header">
              <div>
                <h3 class="section-title">Stock Activity</h3>
                <div class="section-subtitle">Which stock entered or left the business on this day.</div>
              </div>
            </div>
            ${renderStockTable(activity.stockRecords)}
          </section>
        </div>

        <section class="day-activity-panel">
          <div class="section-header">
            <div>
              <h3 class="section-title">End Of Day Staff Sign-Off</h3>
              <div class="section-subtitle">Staff names are matched to the current user list so you can see the work number for the day summary.</div>
            </div>
          </div>
          ${renderStaffSignoffTable(activity.staffSignoff)}
        </section>
      </div>
    </div>
  `;
}

function summarizeSoldItems(sales) {
  const items = new Map();

  for (const sale of sales) {
    for (const item of sale.items || []) {
      const current = items.get(item.productName) || { productName: item.productName, quantity: 0, value: 0 };
      current.quantity += Number(item.quantity || 0);
      current.value += Number(item.subtotal || 0);
      items.set(item.productName, current);
    }
  }

  return [...items.values()].sort((left, right) => right.quantity - left.quantity || right.value - left.value);
}

function renderSoldItemsTable(items, emptyMessage) {
  if (!items.length) {
    return `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product</th><th>Quantity Sold</th><th>Sales Value</th></tr></thead>
        <tbody>
          ${items.map((item) => `
            <tr>
              <td>${escapeHtml(item.productName)}</td>
              <td>${item.quantity}</td>
              <td>${money(item.value)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSalesActivityTable(sales, { showDate = true } = {}) {
  if (!sales.length) {
    return `<div class="empty-state">No sales were recorded for this selection.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>${showDate ? "Date" : "Time"}</th><th>Receipt</th><th>Items</th><th>Payment Method</th><th>Staff</th><th>Total</th></tr></thead>
        <tbody>
          ${sales.map((sale) => `
            <tr>
              <td>${escapeHtml(showDate ? `${sale.date} ${sale.time}` : sale.time)}</td>
              <td>${escapeHtml(sale.receiptNumber || sale.invoiceNumber || sale.id)}</td>
              <td>${escapeHtml((sale.items || []).map((item) => `${item.productName} x${item.quantity}`).join(", ") || "-")}</td>
              <td>${escapeHtml((sale.payments || []).map((payment) => payment.paymentMethod).join(", ") || sale.paymentSummary || "-")}</td>
              <td>${escapeHtml(sale.processedBy || "-")}</td>
              <td>${money(sale.totalAmount)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function buildDayActivity(date) {
  const sales = state.sales
    .filter((sale) => sale.date === date)
    .sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`));
  const stockRecords = state.stockRecords
    .filter((record) => record.date === date)
    .sort((left, right) => `${left.date} ${left.time}`.localeCompare(`${right.date} ${right.time}`));
  const soldItems = summarizeSoldItems(sales);
  const paymentMap = new Map();

  for (const sale of sales) {
    for (const payment of sale.payments || []) {
      paymentMap.set(payment.paymentMethod, (paymentMap.get(payment.paymentMethod) || 0) + Number(payment.amount || 0));
    }
  }

  const staffNames = new Set();
  for (const sale of sales) {
    if (sale.processedBy) {
      staffNames.add(sale.processedBy);
    }
  }
  for (const record of stockRecords) {
    if (record.authorizedBy) {
      staffNames.add(record.authorizedBy);
    }
  }

  return {
    sales,
    stockRecords,
    soldItems,
    totalItems: soldItems.reduce((sum, item) => sum + item.quantity, 0),
    stockIn: stockRecords.filter((record) => record.actionType === "STOCK_IN").reduce((sum, record) => sum + Number(record.quantityChanged || 0), 0),
    stockOut: stockRecords.filter((record) => record.actionType === "STOCK_OUT").reduce((sum, record) => sum + Number(record.quantityChanged || 0), 0),
    paymentBreakdown: [...paymentMap.entries()].map(([paymentMethod, total]) => ({ paymentMethod, total })),
    staffSignoff: [...staffNames].map((name) => buildStaffSignoffRow(name, sales, stockRecords)),
  };
}

function buildStaffSignoffRow(name, sales, stockRecords) {
  const normalized = normalizeText(name);
  const user = state.users.find((entry) => normalizeText(entry.fullName) === normalized)
    || state.users.find((entry) => normalizeText(entry.username) === normalized);
  const salesCount = sales.filter((sale) => normalizeText(sale.processedBy) === normalized).length;
  const stockCount = stockRecords.filter((record) => normalizeText(record.authorizedBy) === normalized).length;

  return {
    name,
    role: user?.role || "STAFF",
    workNumber: user ? `${user.username} / #${user.id}` : "Not linked to a saved user",
    activity: salesCount || stockCount ? `${salesCount} sale${salesCount === 1 ? "" : "s"}, ${stockCount} stock action${stockCount === 1 ? "" : "s"}` : "Recorded on this day",
  };
}

function renderStaffSignoffTable(rows) {
  if (!rows.length) {
    return `<div class="empty-state">No staff activity was recorded for this day yet.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Staff Member</th><th>Role</th><th>Work Number</th><th>Activity</th><th>Signature</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.name)}</td>
              <td>${pill(statusTone(row.role), row.role)}</td>
              <td>${escapeHtml(row.workNumber)}</td>
              <td>${escapeHtml(row.activity)}</td>
              <td>________________</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function formatDisplayDate(date) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date || "-";
  }

  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function renderAccessView() {
  const isOwner = state.bootstrap.user?.role === "OWNER";
  if (!isOwner) {
    return `<div class="empty-state">Only the owner can access this section.</div>`;
  }
  const secondFactorMode = state.bootstrap?.workspaceConfig?.securityPolicy?.secondFactorMode || "NONE";

  return `
    <div class="view-stack">
      <div class="split-layout">
        <section class="panel-card app-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Users</div>
              <h2 class="section-title">Create another account</h2>
              <div class="section-subtitle">The owner decides who can access the system and which accounts must complete the second authentication stage.</div>
            </div>
          </div>
          <form id="access-form" class="form-grid">
            <div class="field">
              <label>Full Name</label>
              <input name="fullName" required />
            </div>
            <div class="field">
              <label>Username</label>
              <input name="username" required />
            </div>
            <div class="field">
              <label>Email</label>
              <input name="email" type="email" />
            </div>
            <div class="field">
              <label>Role</label>
              <select name="role">
                <option value="STAFF">Staff</option>
                <option value="OWNER">Owner</option>
              </select>
            </div>
            <div class="field">
              <label>Password</label>
              <input name="password" type="password" required />
            </div>
            <div class="field">
              <label>Confirm Password</label>
              <input name="confirmPassword" type="password" required />
            </div>
            <div class="field">
              <label>Access PIN</label>
              <input name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="${secondFactorMode === "NONE" ? "Optional 6-digit PIN" : "Required 6-digit PIN for second-step login"}" />
            </div>
            <div class="field">
              <label>Confirm PIN</label>
              <input name="confirmPin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" placeholder="Repeat PIN" />
            </div>
            <div class="full-span">
              <button class="primary-button" type="submit">Create Account</button>
            </div>
          </form>
        </section>

        <section class="panel-card app-card">
          <div class="section-header">
            <div>
              <div class="eyebrow">Protection</div>
              <h2 class="section-title">Access rules</h2>
            </div>
          </div>
          <div class="list-card">
            <div class="list-item">Each business workspace has its own owner account and its own isolated data.</div>
            <div class="list-item">Only logged-in users can access the business workspace.</div>
            <div class="list-item">Only the owner can create extra users from inside the app.</div>
            <div class="list-item">Current second-step policy: ${escapeHtml(readableSecondFactorMode(secondFactorMode))}.</div>
            <div class="list-item">Roles, sessions, and security state are stored in the local database.</div>
          </div>
        </section>
      </div>

      <section class="table-card app-card">
        <div class="section-header">
          <div>
            <div class="eyebrow">Users</div>
            <h2 class="section-title">Accounts with access</h2>
          </div>
        </div>
        ${renderUsersTable(state.users)}
      </section>
    </div>
  `;
}

function summaryLine(label, value) {
  return `<div class="summary-line"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function renderProductsTable(products, canManage = canManageInventory()) {
  if (!products.length) {
    return `<div class="empty-state">No products available yet.</div>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product</th><th>Barcode</th><th>Unit Price</th><th>Stock</th><th>Updated</th><th>Actions</th></tr></thead>
        <tbody>
          ${products.map((product) => `
            <tr>
              <td>${escapeHtml(product.name)}</td>
              <td>${escapeHtml(product.productCode || "-")}</td>
              <td>${money(product.unitPrice)}</td>
              <td>${pill(product.stockQuantity <= 3 ? "danger" : product.stockQuantity <= 10 ? "warning" : "success", `Stock ${product.stockQuantity}`)}</td>
              <td>${escapeHtml(product.updatedAt)}</td>
              <td class="inventory-actions-cell">
                ${
                  canManage
                    ? `
                  <div class="inventory-row-actions">
                    <button class="ghost-button compact-button" type="button" data-action="edit-product" data-product-id="${escapeAttr(product.id)}">Edit</button>
                    <button class="secondary-button compact-button" type="button" data-action="stock-in-product" data-product-id="${escapeAttr(product.id)}">Stock In</button>
                    <button class="danger-button compact-button" type="button" data-action="stock-out-product" data-product-id="${escapeAttr(product.id)}" ${product.stockQuantity <= 0 ? "disabled" : ""}>Stock Out</button>
                  </div>
                `
                    : `<span class="muted">View only</span>`
                }
              </td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderStockTable(records) {
  if (!records.length) {
    return `<div class="empty-state">No stock activity recorded yet.</div>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product</th><th>Action</th><th>Quantity</th><th>By</th><th>Date</th><th>Time</th></tr></thead>
        <tbody>
          ${records.map((record) => `
            <tr>
              <td>${escapeHtml(record.productName)}</td>
              <td>${pill(record.actionType === "STOCK_IN" ? "success" : "warning", record.actionType)}</td>
              <td>${record.quantityChanged}</td>
              <td>${escapeHtml(record.authorizedBy)}</td>
              <td>${escapeHtml(record.date)}</td>
              <td>${escapeHtml(record.time)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSalesTable(sales) {
  if (!sales.length) return `<div class="empty-state">No sales yet.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Transaction</th><th>Customer</th><th>Total</th><th>Paid</th><th>Balance</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${sales.map((sale) => `
            <tr>
              <td>${escapeHtml(sale.id)}</td>
              <td>${escapeHtml(sale.customerName)}</td>
              <td>${money(sale.totalAmount)}</td>
              <td>${money(sale.totalPaid)}</td>
              <td>${money(sale.balance)}</td>
              <td>${pill(statusTone(sale.status), sale.status)}</td>
              <td>${escapeHtml(sale.date)} ${escapeHtml(sale.time)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderInvoiceTable(sales) {
  if (!sales.length) {
    return `<div class="empty-state">No completed invoices yet.</div>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Invoice</th><th>Receipt</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${sales.map((sale) => `
            <tr>
              <td>${escapeHtml(sale.invoiceNumber || "-")}</td>
              <td>${escapeHtml(sale.receiptNumber || "-")}</td>
              <td>${escapeHtml(sale.customerName || "Walk-in Customer")}</td>
              <td>${money(sale.totalAmount)}</td>
              <td>${pill(statusTone(sale.status), sale.status)}</td>
              <td>${escapeHtml(sale.date)} ${escapeHtml(sale.time)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCreditTable(credits) {
  if (!credits.length) return `<div class="empty-state">No credit records yet.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Customer</th><th>Transaction</th><th>Amount Owed</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${credits.map((credit) => `
            <tr>
              <td>${escapeHtml(credit.customerName)}</td>
              <td>${escapeHtml(credit.transactionId)}</td>
              <td>${money(credit.amountOwed)}</td>
              <td>${pill(statusTone(credit.status), credit.status)}</td>
              <td>${escapeHtml(credit.date)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderUsersTable(users) {
  if (!users.length) {
    return `<div class="empty-state">No user accounts found yet.</div>`;
  }

  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Full Name</th><th>Username</th><th>Email</th><th>Role</th><th>PIN</th><th>Created</th></tr></thead>
        <tbody>
          ${users.map((user) => `
            <tr>
              <td>${escapeHtml(user.fullName)}</td>
              <td>${escapeHtml(user.username)}</td>
              <td>${escapeHtml(user.email || "-")}</td>
              <td>${pill(user.role === "OWNER" ? "success" : "warning", user.role)}</td>
              <td>${pill(user.hasPin ? "success" : "warning", user.hasPin ? "PIN Ready" : "Password Only")}</td>
              <td>${escapeHtml(user.createdAt)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderDebtTable(credits) {
  if (!credits.length) return `<div class="empty-state">No outstanding customer debts right now.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Customer</th><th>Transaction</th><th>Amount Owed</th><th>Status</th><th>Use</th></tr></thead>
        <tbody>
          ${credits.map((credit) => `
            <tr>
              <td>${escapeHtml(credit.customerName)}</td>
              <td>${escapeHtml(credit.transactionId)}</td>
              <td>${money(credit.amountOwed)}</td>
              <td>${pill(statusTone(credit.status), credit.status)}</td>
              <td><button type="button" class="secondary-button" data-action="select-credit" data-customer="${escapeAttr(credit.customerName)}">Select</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderInvoicePreviewText({ customerName, phoneNumber, customerIdNumber, notes, items, subtotal, taxAmount, totalDue }) {
  return [
    "INVOICE PREVIEW",
    "----------------------------------------",
    `Customer: ${customerName || "Walk-in Customer"}`,
    `Phone: ${phoneNumber || "-"}`,
    `ID / Reference: ${customerIdNumber || "-"}`,
    `Date: ${currentLocalIsoDate()}`,
    notes ? `Notes: ${notes}` : null,
    "----------------------------------------",
    ...(items.length
      ? items.map((item) => `${item.productName} x${item.quantity} @ ${money(item.unitPrice)} = ${money(item.subtotal)}`)
      : ["No POS basket items yet. Scan items from the POS first."]),
    "----------------------------------------",
    `Subtotal: ${money(subtotal)}`,
    `VAT Included (16%): ${money(taxAmount)}`,
    `Total Due: ${money(totalDue)}`,
  ].filter(Boolean).join("\n");
}

function renderPaymentLedgerTable(entries) {
  if (!entries.length) return `<div class="empty-state">No payments recorded yet.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Reference</th><th>Customer</th><th>Source</th><th>Method</th><th>Details</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
        <tbody>
          ${entries.map((entry) => `
            <tr>
              <td>${escapeHtml(entry.referenceId)}</td>
              <td>${escapeHtml(entry.customerName)}</td>
              <td>${pill(entry.sourceType === "SALE" ? "success" : "warning", entry.sourceType)}</td>
              <td>${escapeHtml(entry.paymentMethod)}</td>
              <td>${escapeHtml(entry.detailSummary || "-")}</td>
              <td>${money(entry.amount)}</td>
              <td>${escapeHtml(entry.confirmationStatus)}</td>
              <td>${escapeHtml(entry.date)} ${escapeHtml(entry.time)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function syncBusinessLogoEditor(form, statusText = "") {
  if (!(form instanceof HTMLFormElement)) return;
  const hidden = form.querySelector('input[name="logoDataUrl"]');
  const preview = form.querySelector("[data-business-logo-preview]");
  const status = form.querySelector("[data-business-logo-status]");
  if (!(hidden instanceof HTMLInputElement) || !(preview instanceof HTMLImageElement)) return;

  const fallbackSrc = preview.dataset.fallbackSrc || PRODUCT_LOGO;
  const hasCustomLogo = Boolean(hidden.value);
  preview.src = hasCustomLogo ? hidden.value : fallbackSrc;
  preview.alt = hasCustomLogo ? "Business logo preview" : "Business placeholder preview";
  preview.parentElement?.classList.toggle("using-fallback", !hasCustomLogo);

  if (status instanceof HTMLElement) {
    status.textContent = statusText || (hasCustomLogo
      ? "Custom business logo ready for this workspace."
      : "Using a company placeholder until a business logo is uploaded.");
  }
}

function syncPaymentProfileForm(form) {
  if (!(form instanceof HTMLFormElement)) {
    return;
  }

  const enabledMethods = new Set(
    [...form.querySelectorAll('input[name="enabledMethods"]:checked')]
      .map((input) => input instanceof HTMLInputElement ? input.value : "")
      .filter(Boolean),
  );

  form.querySelectorAll("[data-payment-method-card]").forEach((card) => {
    const method = card.getAttribute("data-payment-method-card") || "";
    card.classList.toggle("active", enabledMethods.has(method));
  });

  form.querySelectorAll("[data-route-method]").forEach((card) => {
    const method = card.getAttribute("data-route-method") || "";
    const enabled = enabledMethods.has(method);
    card.classList.toggle("enabled", enabled);
    card.classList.toggle("disabled", !enabled);
    card.querySelectorAll("input").forEach((input) => {
      if (input instanceof HTMLInputElement) {
        input.readOnly = !enabled;
      }
    });
    const badge = card.querySelector("[data-route-status]");
    if (badge instanceof HTMLElement) {
      badge.textContent = enabled ? "Enabled" : "Disabled";
    }
  });
}

function setBusinessLogoProcessing(form, isProcessing) {
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  form.dataset.logoProcessing = isProcessing ? "true" : "false";
  form.querySelectorAll('button[type="submit"]').forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.disabled = isProcessing;
    }
  });
}

async function waitForPendingBusinessLogoUpload(form) {
  if (!(form instanceof HTMLFormElement)) {
    return;
  }
  const pending = pendingLogoUploads.get(form);
  if (pending) {
    await pending;
  }
}

async function handleBusinessLogoFileSelection(input) {
  if (!(input instanceof HTMLInputElement) || !(input.form instanceof HTMLFormElement)) return;
  const file = input.files?.[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) {
    alert("Choose an image file for the business logo.");
    input.value = "";
    return;
  }
  if (file.size > MAX_IMAGE_UPLOAD_SIZE_BYTES) {
    alert(`Choose a business logo smaller than ${MAX_IMAGE_UPLOAD_SIZE_LABEL}.`);
    input.value = "";
    return;
  }

  const hidden = input.form.querySelector('input[name="logoDataUrl"]');
  if (!(hidden instanceof HTMLInputElement)) return;

  const form = input.form;
  const uploadTask = (async () => {
    setBusinessLogoProcessing(form, true);
    syncBusinessLogoEditor(form, "Preparing the business logo...");
    hidden.value = await createBusinessLogoDataUrl(file);
    syncBusinessLogoEditor(form, `${file.name} is ready as the business logo.`);
    if (form.id === "business-profile-form") {
      syncWorkspaceBrandPreviewFromBusinessForm(form);
    }
  })();

  pendingLogoUploads.set(form, uploadTask);
  try {
    await uploadTask;
  } finally {
    if (pendingLogoUploads.get(form) === uploadTask) {
      pendingLogoUploads.delete(form);
    }
    setBusinessLogoProcessing(form, false);
  }
}

async function createBusinessLogoDataUrl(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for the business logo.");
  }
  if (file.type === "image/svg+xml") {
    return readFileAsDataUrl(file);
  }

  const image = await loadImageFromFile(file);
  const scale = Math.min(1, LOGO_IMAGE_MAX_DIMENSION / Math.max(image.naturalWidth || image.width || 1, image.naturalHeight || image.height || 1));
  const width = Math.max(1, Math.round((image.naturalWidth || image.width || 1) * scale));
  const height = Math.max(1, Math.round((image.naturalHeight || image.height || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) {
    return readFileAsDataUrl(file);
  }

  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);

  const optimizedBlob = await canvasToBlob(canvas, "image/webp", LOGO_IMAGE_OUTPUT_QUALITY)
    || await canvasToBlob(canvas, "image/jpeg", LOGO_IMAGE_OUTPUT_QUALITY)
    || file;
  return readFileAsDataUrl(optimizedBlob);
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That image could not be processed. Try another file."));
    };
    image.src = objectUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(new Error("The selected image could not be read."));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  try {
    if (action === "switch-auth-tab") {
      state.authTab = target.dataset.tab;
      state.authPopupOpen = true;
      state.authChallenge = null;
      state.error = "";
      state.authPin = "";
      return render();
    }
    if (action === "open-auth-popup") {
      state.authTab = target.dataset.tab || "password";
      state.authPopupOpen = true;
      state.authChallenge = null;
      state.error = "";
      state.notice = "";
      state.authPin = "";
      return render();
    }
    if (action === "use-workspace-key") {
      state.authWorkspaceKey = target.dataset.workspaceKey || "";
      state.authTab = "password";
      state.authPopupOpen = true;
      state.authChallenge = null;
      state.error = "";
      return render();
    }
    if (action === "close-auth-popup") {
      state.authPopupOpen = false;
      state.authChallenge = null;
      state.error = "";
      state.notice = "";
      return render();
    }
    if (action === "reset-auth-challenge") {
      state.authChallenge = null;
      state.authTab = "password";
      state.error = "";
      state.notice = "";
      return render();
    }
    if (action === "install-app") {
      state.error = "";
      if (deferredInstallPrompt) {
        const installEvent = deferredInstallPrompt;
        deferredInstallPrompt = null;
        installEvent.prompt();
        const result = await installEvent.userChoice;
        if (result?.outcome !== "accepted") {
          deferredInstallPrompt = installEvent;
          state.notice = "Install was cancelled. You can try again whenever you're ready.";
        } else {
          state.notice = "Installation started. Open the new app window or home-screen icon once it finishes.";
        }
      } else if (isIosDevice()) {
        state.notice = "On iPhone, open this in Safari, tap Share, then choose Add to Home Screen.";
      } else {
        state.notice = "Install is available on supported browsers once the app is opened from a secure hosted URL.";
      }
      return render();
    }
    if (action === "navigate") {
      state.activeView = target.dataset.view;
      state.settingsOpen = false;
      render();
      if (state.activeView === "sales") {
        focusSaleSearchInputSoon();
      }
      return;
    }
    if (action === "set-dashboard-detail") {
      state.dashboardDetail = target.dataset.detail || "today-sales";
      return render();
    }
    if (action === "set-inventory-detail") {
      state.inventoryDetail = target.dataset.detail || "products";
      return render();
    }
    if (action === "toggle-settings") {
      state.settingsOpen = !state.settingsOpen;
      return render();
    }
    if (action === "close-settings") {
      state.settingsOpen = false;
      return render();
    }
      if (action === "open-setting-view") {
        state.activeView = target.dataset.view;
        state.settingsOpen = false;
        return render();
      }
      if (action === "select-settings-section") {
        state.settingsSection = target.dataset.section || "overview";
        state.settingsQuery = "";
        return render();
      }
    if (action === "open-intro") {
      state.showIntro = true;
      state.settingsOpen = false;
      return render();
    }
    if (action === "close-intro") {
      state.showIntro = false;
      return render();
    }
    if (action === "toggle-theme") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("benjoji_theme", state.theme);
      return render();
    }
    if (action === "toggle-scanner") {
      state.scannerPaused = !state.scannerPaused;
      localStorage.setItem("benjoji_scanner_paused", String(state.scannerPaused));
      return render();
    }
    if (action === "toggle-receipt-default") {
      state.receiptPrintDefault = !state.receiptPrintDefault;
      localStorage.setItem("benjoji_receipt_print_default", String(state.receiptPrintDefault));
      state.saleDraft.printReceipt = state.receiptPrintDefault;
      return render();
    }
    if (action === "logout") {
      await api("/api/auth/logout", { method: "POST" });
      resetStateAfterLogout();
      await loadBootstrap();
      return render();
    }
    if (action === "clear-business-logo") {
      const form = target.closest("form");
      if (!(form instanceof HTMLFormElement)) return;
      const hidden = form.querySelector('input[name="logoDataUrl"]');
      const fileInput = form.querySelector('input[type="file"][data-action="business-logo-upload"]');
      if (hidden instanceof HTMLInputElement) {
        hidden.value = "";
      }
      if (fileInput instanceof HTMLInputElement) {
        fileInput.value = "";
      }
      syncBusinessLogoEditor(form);
      if (form.id === "business-profile-form") {
        syncWorkspaceBrandPreviewFromBusinessForm(form);
      }
      return;
    }
    if (action === "append-login-pin") {
      if (state.authPin.length < 6) {
        state.authPin += target.dataset.digit || "";
      }
      return render();
    }
    if (action === "clear-login-pin") {
      state.authPin = "";
      return render();
    }
    if (action === "backspace-login-pin") {
      state.authPin = state.authPin.slice(0, -1);
      return render();
    }
    if (action === "open-inventory-form") {
      ensureOwnerInventoryAccess();
      state.inventoryFormOpen = true;
      state.inventoryFormMode = "create";
      state.inventoryProductId = "";
      state.inventoryStockAction = "STOCK_IN";
      return render();
    }
    if (action === "close-inventory-form") {
      resetInventoryModalState();
      return render();
    }
    if (action === "edit-product") {
      ensureOwnerInventoryAccess();
      state.inventoryFormOpen = true;
      state.inventoryFormMode = "edit";
      state.inventoryProductId = target.dataset.productId || "";
      state.inventoryStockAction = "STOCK_IN";
      return render();
    }
    if (action === "stock-in-product") {
      ensureOwnerInventoryAccess();
      state.inventoryFormOpen = true;
      state.inventoryFormMode = "adjust";
      state.inventoryProductId = target.dataset.productId || "";
      state.inventoryStockAction = "STOCK_IN";
      return render();
    }
    if (action === "stock-out-product") {
      ensureOwnerInventoryAccess();
      state.inventoryFormOpen = true;
      state.inventoryFormMode = "adjust";
      state.inventoryProductId = target.dataset.productId || "";
      state.inventoryStockAction = "STOCK_OUT";
      return render();
    }
    if (action === "quick-add-product") {
      addProductToCart(target.dataset.productId, 1);
      state.saleDraft.search = "";
      render();
      return focusSaleSearchInputSoon();
    }
    if (action === "select-sale-method") {
      const previousForm = state.saleDraft.paymentForm;
      state.saleDraft.paymentForm = {
        ...defaultPaymentDraft(target.dataset.method),
        amount: previousForm.amount || `${Math.max(remainingSaleBalance(), 0) || ""}`,
        customerPhone: previousForm.customerPhone || state.saleDraft.phoneNumber || "",
        paymentPurpose: previousForm.paymentPurpose || "",
      };
      return render();
    }
    if (action === "open-sale-payment") {
      if (!state.saleDraft.items.length) {
        throw new Error("Add items before moving to payment.");
      }
      if (!state.saleDraft.paymentForm.amount) {
        state.saleDraft.paymentForm.amount = `${remainingSaleBalance() || ""}`;
      }
      state.saleDraft.paymentStageOpen = true;
      render();
      return focusSalePaymentFieldSoon();
    }
    if (action === "close-sale-payment") {
      if (["processing", "success"].includes(state.paymentWorkflow.status)) {
        return;
      }
      state.saleDraft.paymentStageOpen = false;
      return render();
    }
    if (action === "toggle-print-receipt") {
      state.saleDraft.printReceipt = !state.saleDraft.printReceipt;
      return render();
    }
    if (action === "fill-sale-payment") {
      state.saleDraft.paymentForm.amount = String(resolveTenderPreset(target.dataset.mode));
      render();
      return focusSalePaymentFieldSoon();
    }
    if (action === "set-sale-payment-method-and-balance") {
      const previousForm = state.saleDraft.paymentForm;
      const method = target.dataset.method || previousForm.paymentMethod;
      state.saleDraft.paymentForm = {
        ...defaultPaymentDraft(method),
        amount: `${remainingSaleBalance().toFixed(2)}`,
        customerPhone: previousForm.customerPhone || state.saleDraft.phoneNumber || "",
        paymentPurpose: previousForm.paymentPurpose || "",
      };
      render();
      return focusSalePaymentFieldSoon();
    }
    if (action === "clear-sale-search") {
      state.saleDraft.search = "";
      render();
      return focusSaleSearchInputSoon();
    }
      if (action === "clear-settings-search") {
        state.settingsQuery = "";
        state.settingsSection = "overview";
        return render();
      }
    if (action === "clear-invoice-draft") {
      state.invoiceDraft = createInvoiceDraft();
      return render();
    }
    if (action === "sync-invoice-from-sale") {
      state.invoiceDraft = {
        ...state.invoiceDraft,
        customerName: state.saleDraft.customerName || state.invoiceDraft.customerName,
        phoneNumber: state.saleDraft.phoneNumber || state.invoiceDraft.phoneNumber,
        customerIdNumber: state.saleDraft.customerIdNumber || state.invoiceDraft.customerIdNumber,
        output: "",
      };
      return render();
    }
    if (action === "clear-sale-items") {
      state.saleDraft.items = [];
      return render();
    }
    if (action === "clear-sale-payments") {
      state.saleDraft.payments = [];
      state.saleDraft.paymentForm = defaultPaymentDraft(state.saleDraft.paymentForm.paymentMethod);
      return render();
    }
    if (action === "remove-sale-item") {
      state.securityPrompt = {
        title: "Remove item from basket",
        nextAction: "remove-sale-item-approved",
        index: Number(target.dataset.index),
      };
      return render();
    }
    if (action === "increment-sale-item") {
      updateSaleItemQuantity(Number(target.dataset.index), 1);
      return render();
    }
    if (action === "decrement-sale-item") {
      state.securityPrompt = {
        title: "Reduce item quantity",
        nextAction: "decrement-sale-item-approved",
        index: Number(target.dataset.index),
      };
      return render();
    }
      if (action === "cancel-security-prompt") {
        state.securityPrompt = null;
        return render();
      }
      if (action === "open-report-day") {
        const selectedDate = target.dataset.date || state.reportDate;
        state.reportDate = selectedDate;
        state.calendarAnchorDate = selectedDate;
        state.reportDayModalDate = selectedDate;
        return render();
      }
      if (action === "close-report-day-modal") {
        state.reportDayModalDate = "";
        return render();
      }
      if (action === "calendar-prev-month") {
        state.calendarAnchorDate = shiftIsoMonth(state.calendarAnchorDate, -1);
        state.reportDate = state.calendarAnchorDate;
        state.reportDayModalDate = "";
        return render();
      }
      if (action === "calendar-next-month") {
        state.calendarAnchorDate = shiftIsoMonth(state.calendarAnchorDate, 1);
        state.reportDate = state.calendarAnchorDate;
        state.reportDayModalDate = "";
        return render();
      }
      if (action === "calendar-today") {
        state.calendarAnchorDate = currentLocalIsoDate();
        state.reportDate = state.calendarAnchorDate;
        state.reportDayModalDate = "";
        return render();
      }
    if (action === "remove-sale-payment") {
      state.saleDraft.payments.splice(Number(target.dataset.index), 1);
      return render();
    }
    if (action === "reset-sale-draft") {
      state.saleDraft = createSaleDraft();
      state.invoiceDraft = createInvoiceDraft();
      return render();
    }
    if (action === "hold-sale") {
      holdCurrentSale();
      state.activeView = "held";
      return render();
    }
    if (action === "resume-held-sale") {
      resumeHeldSale(target.dataset.heldId);
      state.activeView = "sales";
      render();
      return focusSaleSearchInputSoon();
    }
    if (action === "delete-held-sale") {
      deleteHeldSale(target.dataset.heldId);
      return render();
    }
    if (action === "select-credit") {
      state.activeView = "debts";
      state.debtDraft.customerName = target.dataset.customer;
      return render();
    }
    if (action === "clear-debt-payments") {
      state.debtDraft.payments = [];
      state.debtDraft.output = "";
      state.debtDraft.paymentForm = defaultPaymentDraft(state.debtDraft.paymentForm.paymentMethod);
      return render();
    }
    if (action === "remove-debt-payment") {
      state.debtDraft.payments.splice(Number(target.dataset.index), 1);
      return render();
    }
      if (action === "show-accounting") {
        state.reportOutput = renderAccountingText(state.accounting);
        state.lastReport = null;
        return render();
      }
    if (action === "close-receipt-popup") {
      state.paymentWorkflow = createPaymentWorkflowState();
      return render();
    }
    if (action === "print-receipt-popup") {
      printReceiptPopup();
      return;
    }
    if (action === "download-receipt-popup") {
      downloadReceiptPopup();
      return;
    }
    if (action === "download-backup") {
      downloadBackupSnapshot(target.dataset.fileName);
      return;
    }
    if (action === "restore-backup") {
      const fileName = target.dataset.fileName || "";
      const confirmed = window.confirm(`Restore backup "${fileName}"?\n\nThis will replace the current business data and sign you out so the restored workspace can reload safely.`);
      if (!confirmed) {
        return;
      }
      const result = await api("/api/admin/backups/restore", {
        method: "POST",
        body: { fileName },
      });
      resetStateAfterLogout();
      await loadBootstrap();
      state.error = "";
      render();
      alert(result.message || "Backup restored successfully. Please sign in again.");
      return;
    }
    if (action === "finalize-sale") {
      await finalizeSale();
      return;
    }
    if (action === "finalize-debt-payment") {
      await finalizeDebtPayment();
      return;
    }
  } catch (error) {
    alert(error.message);
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.type === "file" && target.dataset.action === "business-logo-upload") {
    handleBusinessLogoFileSelection(target).catch((error) => {
      target.value = "";
      alert(error.message || "The selected image could not be uploaded.");
    });
    return;
  }
  if (target instanceof HTMLInputElement && target.form?.id === "payment-profile-form" && target.name === "enabledMethods") {
    syncPaymentProfileForm(target.form);
    return;
  }
  if (!(target instanceof HTMLSelectElement)) return;

  if (target.dataset.action === "change-sale-payment-method") {
    const previousForm = state.saleDraft.paymentForm;
    state.saleDraft.paymentForm = {
      ...defaultPaymentDraft(target.value),
      amount: previousForm.amount || `${Math.max(remainingSaleBalance(), 0) || ""}`,
      customerPhone: previousForm.customerPhone || state.saleDraft.phoneNumber || "",
      paymentPurpose: previousForm.paymentPurpose || "",
    };
    render();
    return focusSalePaymentFieldSoon();
  }

  if (target.dataset.action === "change-debt-payment-method") {
    state.debtDraft.paymentForm = defaultPaymentDraft(target.value);
    render();
  }
});

document.addEventListener("input", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement)) return;

  if (target.form?.id === "login-form" && target.name === "workspaceKey") {
    state.authWorkspaceKey = target.value.trim();
    return;
  }

  if (target.form?.id === "business-profile-form" && (target.name === "businessName" || target.name === "branchName")) {
    syncWorkspaceBrandPreviewFromBusinessForm(target.form);
    return;
  }

  if (target.form?.id === "sale-search-form" && target.name === "search") {
    const caret = target.selectionStart ?? target.value.length;
    state.saleDraft.search = target.value;
    render();
    requestAnimationFrame(() => {
      const searchInput = document.querySelector('#sale-search-form input[name="search"]');
      if (searchInput instanceof HTMLInputElement) {
        searchInput.focus();
        searchInput.setSelectionRange(caret, caret);
      }
    });
  }

  if (target.form?.id === "sale-customer-form") {
    state.saleDraft = {
      ...state.saleDraft,
      [target.name]: target.value,
    };
  }

  if (target.form?.id === "invoice-form") {
    state.invoiceDraft = {
      ...state.invoiceDraft,
      [target.name]: target.value,
    };
  }

  if (target.form?.id === "sale-payment-form") {
    state.saleDraft.paymentForm = {
      ...state.saleDraft.paymentForm,
      [target.name]: target.value,
    };
  }

  if (target.form?.id === "report-form" && target.name === "reportDate") {
    state.reportDate = target.value;
    state.calendarAnchorDate = target.value || state.calendarAnchorDate;
    state.reportDayModalDate = "";
    state.lastReport = null;
    render();
  }

  if (target.form?.id === "settings-search-form" && target.name === "settingsQuery") {
    const caret = target.selectionStart ?? target.value.length;
    state.settingsQuery = target.value || "";
    render();
    requestAnimationFrame(() => {
      const searchInput = document.querySelector('#settings-search-form input[name="settingsQuery"]');
      if (searchInput instanceof HTMLInputElement) {
        searchInput.focus();
        searchInput.setSelectionRange(caret, caret);
      }
    });
  }

  if (target.form?.id === "debt-payment-form") {
    state.debtDraft.paymentForm = {
      ...state.debtDraft.paymentForm,
      [target.name]: target.value,
    };
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;

  try {
    if (form.id === "setup-form") {
      await waitForPendingBusinessLogoUpload(form);
      const data = buildWorkspaceSetupPayload(form);
      const result = await api("/api/auth/register", { method: "POST", body: data });
      state.authWorkspaceKey = result.workspace?.workspaceKey || data.workspaceKey || "";
      if (state.authWorkspaceKey) {
        localStorage.setItem("benjoji_last_workspace", state.authWorkspaceKey);
      }
      resetStateAfterLogin();
      await loadBootstrap();
      await loadAppData();
      return render();
    }

    if (form.id === "login-form") {
      const data = formDataObject(form);
      const result = await api("/api/auth/login", { method: "POST", body: data });
      if (result.requiresSecondFactor) {
        state.authChallenge = {
          challengeId: result.challengeId,
          username: data.username,
          workspaceKey: data.workspaceKey,
        };
        state.authWorkspaceKey = data.workspaceKey || "";
        if (state.authWorkspaceKey) {
          localStorage.setItem("benjoji_last_workspace", state.authWorkspaceKey);
        }
        state.error = "";
        return render();
      }
      state.authWorkspaceKey = data.workspaceKey || "";
      if (state.authWorkspaceKey) {
        localStorage.setItem("benjoji_last_workspace", state.authWorkspaceKey);
      }
      resetStateAfterLogin();
      await loadBootstrap();
      await loadAppData();
      return render();
    }

    if (form.id === "second-factor-form") {
      const data = formDataObject(form);
      await api("/api/auth/login/verify-second-factor", {
        method: "POST",
        body: {
          challengeId: state.authChallenge?.challengeId,
          workspaceKey: state.authChallenge?.workspaceKey,
          pin: data.pin,
        },
      });
      if (state.authChallenge?.workspaceKey) {
        localStorage.setItem("benjoji_last_workspace", state.authChallenge.workspaceKey);
      }
      resetStateAfterLogin();
      await loadBootstrap();
      await loadAppData();
      return render();
    }

    if (form.id === "inventory-form") {
      ensureOwnerInventoryAccess();
      await api("/api/products", { method: "POST", body: formDataObject(form) });
      form.reset();
      resetInventoryModalState();
      await refreshData();
      return;
    }

    if (form.id === "inventory-edit-form") {
      ensureOwnerInventoryAccess();
      const data = formDataObject(form);
      await api(`/api/products/${encodeURIComponent(data.productId)}`, {
        method: "PUT",
        body: {
          name: data.name,
          productCode: data.productCode,
          unitPrice: data.unitPrice,
        },
      });
      resetInventoryModalState();
      await refreshData();
      return;
    }

    if (form.id === "inventory-stock-adjust-form") {
      ensureOwnerInventoryAccess();
      const data = formDataObject(form);
      await api(`/api/products/${encodeURIComponent(data.productId)}/stock`, {
        method: "POST",
        body: {
          quantity: data.quantity,
          actionType: data.actionType,
          authorizedBy: data.authorizedBy,
        },
      });
      resetInventoryModalState();
      await refreshData();
      return;
    }

    if (form.id === "settings-search-form") {
      const data = formDataObject(form);
      state.settingsQuery = data.settingsQuery || "";
      if (!state.settingsQuery) {
        state.settingsSection = "overview";
      }
      return render();
    }

    if (form.id === "sale-search-form") {
      if (state.scannerPaused) {
        throw new Error("Scanner input is paused. Unpause it from Settings first.");
      }
      if (state.saleDraft.paymentStageOpen) {
        throw new Error("Payment mode is active. Go back to basket to scan more items.");
      }
      const data = formDataObject(form);
      state.saleDraft.search = data.search || "";
      const matchedProduct = resolveSearchProduct(state.saleDraft.search);
      if (matchedProduct) {
        addProductToCart(matchedProduct.id, 1);
        state.saleDraft.search = "";
      }
      render();
      return focusSaleSearchInputSoon();
    }

    if (form.id === "invoice-form") {
      const data = formDataObject(form);
      state.invoiceDraft = {
        ...state.invoiceDraft,
        customerName: data.customerName || "",
        phoneNumber: data.phoneNumber || "",
        customerIdNumber: data.customerIdNumber || "",
        notes: data.notes || "",
      };
      state.saleDraft = {
        ...state.saleDraft,
        customerName: data.customerName || state.saleDraft.customerName,
        phoneNumber: data.phoneNumber || state.saleDraft.phoneNumber,
        customerIdNumber: data.customerIdNumber || state.saleDraft.customerIdNumber,
      };
      state.invoiceDraft.output = renderInvoicePreviewText({
        customerName: state.invoiceDraft.customerName || "Walk-in Customer",
        phoneNumber: state.invoiceDraft.phoneNumber || "-",
        customerIdNumber: state.invoiceDraft.customerIdNumber || "-",
        notes: state.invoiceDraft.notes,
        items: state.saleDraft.items,
        subtotal: saleSubtotalAmount(),
        taxAmount: saleVatAmount(),
        totalDue: saleTotalDue(),
      });
      return render();
    }

    if (form.id === "sale-payment-form") {
      const data = formDataObject(form);
      stageSalePaymentDraft(data);
      render();
      return focusSalePaymentFieldSoon();
    }

    if (form.matches("[data-sale-quantity-form='true']")) {
      const data = formDataObject(form);
      const index = Number(data.index);
      const nextQuantity = Number(data.quantity);
      applySaleQuantityChange(index, nextQuantity);
      return render();
    }

    if (form.id === "debt-customer-form") {
      const data = formDataObject(form);
      state.debtDraft.customerName = data.customerName || "";
      return render();
    }

    if (form.id === "debt-payment-form") {
      const data = formDataObject(form);
      state.debtDraft.payments.push(buildPaymentPayload(data, "", "debt"));
      state.debtDraft.paymentForm = defaultPaymentDraft(data.paymentMethod || state.debtDraft.paymentForm.paymentMethod);
      return render();
    }

    if (form.id === "report-form") {
      const data = formDataObject(form);
      const button = event.submitter;
      state.reportDate = data.reportDate;
      state.calendarAnchorDate = data.reportDate;
      state.reportDayModalDate = "";
      const endpoint =
        button.value === "weekly"
          ? `/api/reports/weekly?date=${state.reportDate}`
          : button.value === "monthly"
            ? `/api/reports/monthly?date=${state.reportDate}`
            : button.value === "annual"
              ? `/api/reports/annual?date=${state.reportDate}`
              : `/api/reports/daily?date=${state.reportDate}`;
      const result = await api(endpoint);
      state.lastReport = {
        ...result,
        kind: button.value || "daily",
      };
      state.reportOutput = renderReportText(result);
      return render();
    }

    if (form.id === "access-form") {
      const data = formDataObject(form);
      await api("/api/auth/register-user", { method: "POST", body: data });
      form.reset();
      await refreshData();
      state.activeView = "access";
      return;
    }

    if (form.id === "business-profile-form") {
      await waitForPendingBusinessLogoUpload(form);
      const result = await api("/api/admin/business-profile", { method: "PUT", body: formDataObject(form) });
      applyBusinessProfileToState(result.businessProfile || {}, result.workspaceSummary || null);
      if (result.workspaceConfig && state.bootstrap) {
        state.bootstrap.workspaceConfig = result.workspaceConfig;
      }
      render();
      await refreshData();
      state.activeView = "control";
      return;
    }

    if (form.id === "receipt-profile-form") {
      await api("/api/admin/receipt-profile", { method: "PUT", body: buildReceiptProfilePayload(form) });
      await refreshData();
      state.activeView = "control";
      return;
    }

    if (form.id === "payment-profile-form") {
      await api("/api/admin/payment-profile", { method: "PUT", body: buildPaymentProfilePayload(form) });
      await refreshData();
      state.activeView = "control";
      return;
    }

    if (form.id === "security-policy-form") {
      await api("/api/admin/security-policy", { method: "PUT", body: buildSecurityPolicyPayload(form) });
      await refreshData();
      state.activeView = "control";
      return;
    }

    if (form.id === "backup-form") {
      await api("/api/admin/backups", { method: "POST", body: formDataObject(form) });
      await refreshData();
      state.activeView = "control";
      alert("Backup snapshot created successfully.");
      return;
    }

    if (form.id === "compliance-profile-form") {
      await api("/api/admin/compliance-profile", {
        method: "PUT",
        body: {
          ...buildComplianceProfilePayload(form),
          acceptedBy: state.bootstrap.user?.fullName || "",
        },
      });
      await refreshData();
      state.activeView = "control";
      return;
    }

    if (form.id === "security-verify-form") {
      const data = formDataObject(form);
      await api("/api/auth/verify", { method: "POST", body: data });
      applyApprovedSecurityAction();
      state.securityPrompt = null;
      render();
      return focusSaleSearchInputSoon();
    }
  } catch (error) {
    if (["setup-form", "login-form", "second-factor-form"].includes(form.id)) {
      state.error = error.message;
      return render();
    }
    alert(error.message);
  }
});

function buildPaymentPayload(data, fallbackPhone, scope) {
  const paymentMethod = data.paymentMethod;
  const amount = Number(data.amount || remainingSaleBalance());
  const route = getPaymentRouteConfig(paymentMethod);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Payment amount must be greater than zero.");
  }

  if (scope === "sale" && paymentMethod !== "Cash") {
    const remaining = remainingSaleBalance();
    if (amount > remaining + 0.0001) {
      throw new Error(`${paymentMethod} cannot be added above the current remaining balance. Use Cash if you need to return change.`);
    }
  }

  return {
    paymentMethod,
    amount,
    approvalMode: data.approvalMode || getPaymentConfig(paymentMethod).approvalModes[0],
    customerPhone: data.customerPhone || fallbackPhone || "",
    targetNumber: data.targetNumber || route.targetNumber || "",
    accountReference: data.accountReference || "",
    paymentPurpose: data.paymentPurpose || (scope === "sale" ? "Retail checkout" : ""),
  };
}

function initInstallSupport() {
  globalThis.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    state.notice = "";
    render();
  });

  globalThis.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    state.notice = "Benjoji Business Suite was installed successfully.";
    render();
  });
}

function stageSalePaymentDraft(data) {
  const payload = buildPaymentPayload(data, state.saleDraft.phoneNumber, "sale");
  state.saleDraft.payments.push(payload);
  state.saleDraft.paymentForm = {
    ...defaultPaymentDraft(data.paymentMethod || state.saleDraft.paymentForm.paymentMethod),
    amount: "",
    customerPhone: data.customerPhone || state.saleDraft.phoneNumber || "",
    paymentPurpose: data.paymentPurpose || "",
  };
  return payload;
}

function shouldAutoApplyCurrentSalePayment() {
  const amount = Number(state.saleDraft.paymentForm.amount);
  if (!Number.isFinite(amount) || amount <= 0.0001) {
    return false;
  }
  return remainingSaleBalance() > 0.0001 || state.saleDraft.payments.length === 0;
}

async function finalizeSale() {
  const totalDue = saleTotalDue();
  const pendingPayment = shouldAutoApplyCurrentSalePayment()
    ? buildPaymentPayload({ ...state.saleDraft.paymentForm }, state.saleDraft.phoneNumber, "sale")
    : null;
  const finalPayments = pendingPayment ? [...state.saleDraft.payments, pendingPayment] : [...state.saleDraft.payments];
  const totalPaid = finalPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const printReceipt = state.saleDraft.printReceipt;
  const paymentMethodsLabel = selectedSalePaymentMethods(finalPayments).join(" + ") || state.saleDraft.paymentForm.paymentMethod || "Payment";
  if (totalPaid + 0.0001 < totalDue) {
    ensureCreditCustomerDetails();
  }

  const payload = {
    customerName: state.saleDraft.customerName,
    phoneNumber: state.saleDraft.phoneNumber,
    processedBy: state.saleDraft.processedBy || state.bootstrap.user.fullName,
    items: state.saleDraft.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    payments: finalPayments,
  };

  try {
    const shouldShowProcessing = saleNeedsAsyncProcessing(finalPayments);
    if (shouldShowProcessing) {
      state.paymentWorkflow = {
        ...createPaymentWorkflowState(),
        status: "processing",
        heading: buildProcessingHeading(finalPayments),
        message: buildProcessingMessage(finalPayments),
        detail: `${paymentMethodsLabel} | ${money(totalPaid || totalDue)}`,
      };
      render();
      await wait(1400);
    }

    const result = await api("/api/sales", { method: "POST", body: payload });
    const receiptText = renderSaleText(result.sale, printReceipt);

    state.paymentWorkflow = {
      status: "success",
      heading: `${paymentMethodsLabel} payment successful`,
      message: `${timeGreetingMessage()} Thank you for shopping with ${state.bootstrap?.businessName || "the business"}.`,
      detail: `${money(totalPaid)} received`,
      receiptText,
      sale: result.sale,
      printReceipt,
    };
    render();
    await wait(1400);

    await loadBootstrap();
    if (state.bootstrap.user) {
      await loadAppData();
    }

    state.saleDraft = {
      ...createSaleDraft(),
      output: receiptText,
    };
    state.invoiceDraft = createInvoiceDraft();
    state.paymentWorkflow = {
      status: "receipt",
      heading: "Receipt ready",
      message: "",
      detail: printReceipt ? "Printing receipt automatically..." : "",
      receiptText,
      sale: result.sale,
      printReceipt,
    };
    render();
    if (printReceipt) {
      await wait(180);
      printReceiptPopup(true);
    }
  } catch (error) {
    state.paymentWorkflow = createPaymentWorkflowState();
    render();
    throw error;
  }
}

async function finalizeDebtPayment() {
  const payload = {
    customerName: state.debtDraft.customerName,
    payments: state.debtDraft.payments,
  };

  const result = await api("/api/credits/pay", { method: "POST", body: payload });
  state.debtDraft.output = renderDebtPaymentText(result.debtPayment);
  state.debtDraft.payments = [];
  state.debtDraft.paymentForm = defaultPaymentDraft("Cash");
  await refreshData();
  render();
}

function addProductToCart(productId, quantity) {
  if (state.scannerPaused) {
    throw new Error("Scanner input is paused. Unpause it from Settings first.");
  }
  if (state.saleDraft.paymentStageOpen) {
    throw new Error("Payment mode is active. Go back to basket to add more items.");
  }

  const product = state.products.find((entry) => entry.id === productId);
  if (!product) {
    throw new Error("Product not found.");
  }

  const nextRequested = getCartQuantity(productId) + quantity;
  if (nextRequested > product.stockQuantity) {
    throw new Error(`Insufficient stock for ${product.name}.`);
  }

  const existing = state.saleDraft.items.find((item) => item.productId === productId);
  if (existing) {
    existing.quantity += quantity;
    existing.subtotal = existing.quantity * existing.unitPrice;
    return;
  }

  state.saleDraft.items.push({
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice: product.unitPrice,
    subtotal: product.unitPrice * quantity,
  });
}

function setSaleItemQuantity(index, nextQuantity) {
  const item = state.saleDraft.items[index];
  if (!item) {
    throw new Error("Sale item not found.");
  }

  const product = productLookup(item.productId);
  if (!product) {
    throw new Error("Product not found.");
  }

  const safeQuantity = Math.floor(Number(nextQuantity));
  if (!Number.isFinite(safeQuantity) || safeQuantity < 0) {
    throw new Error("Quantity must be a whole number.");
  }
  if (safeQuantity === 0) {
    state.saleDraft.items.splice(index, 1);
    return;
  }
  if (safeQuantity > product.stockQuantity) {
    throw new Error(`Only ${product.stockQuantity} units are available for ${product.name}.`);
  }

  item.quantity = safeQuantity;
  item.subtotal = item.quantity * item.unitPrice;
}

function updateSaleItemQuantity(index, delta) {
  const item = state.saleDraft.items[index];
  if (!item) return;
  setSaleItemQuantity(index, item.quantity + delta);
}

function applyApprovedSecurityAction() {
  if (!state.securityPrompt) {
    return;
  }

  if (state.securityPrompt.nextAction === "remove-sale-item-approved") {
    state.saleDraft.items.splice(Number(state.securityPrompt.index), 1);
    return;
  }

  if (state.securityPrompt.nextAction === "decrement-sale-item-approved") {
    updateSaleItemQuantity(Number(state.securityPrompt.index), -1);
    return;
  }

  if (state.securityPrompt.nextAction === "set-sale-item-quantity-approved") {
    setSaleItemQuantity(Number(state.securityPrompt.index), Number(state.securityPrompt.quantity));
  }
}

function applySaleQuantityChange(index, nextQuantity) {
  const item = state.saleDraft.items[index];
  if (!item) {
    throw new Error("Sale item not found.");
  }

  const safeQuantity = Math.floor(Number(nextQuantity));
  if (!Number.isFinite(safeQuantity) || safeQuantity <= 0) {
    throw new Error("Quantity must be at least 1.");
  }
  if (safeQuantity === item.quantity) {
    return;
  }

  if (safeQuantity < item.quantity) {
    state.securityPrompt = {
      title: "Reduce or remove item quantity",
      nextAction: "set-sale-item-quantity-approved",
      index,
      quantity: safeQuantity,
    };
    return;
  }

  setSaleItemQuantity(index, safeQuantity);
}

function getCartQuantity(productId) {
  return state.saleDraft.items
    .filter((item) => item.productId === productId)
    .reduce((sum, item) => sum + item.quantity, 0);
}

function shiftIsoMonth(isoDate, amount) {
  const [year, month] = isoDate.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + amount, 1));
  return shifted.toISOString().slice(0, 10);
}

function saleSubtotalAmount() {
  return state.saleDraft.items.reduce((sum, item) => sum + item.subtotal, 0);
}

function saleVatAmount() {
  const subtotal = saleSubtotalAmount();
  return Number((subtotal - (subtotal / (1 + VAT_RATE))).toFixed(2));
}

function saleTotalDue() {
  return Number(saleSubtotalAmount().toFixed(2));
}

function saleTotalPaid() {
  return state.saleDraft.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

function remainingSaleBalance() {
  return Math.max(saleTotalDue() - saleTotalPaid(), 0);
}

function debtTotalPaid() {
  return state.debtDraft.payments.reduce((sum, payment) => sum + payment.amount, 0);
}

function resolveTenderPreset(mode) {
  const remaining = remainingSaleBalance();
  if (mode === "remaining") {
    return remaining.toFixed(2);
  }
  if (mode === "round-100") {
    return roundUpTo(remaining, 100).toFixed(2);
  }
  if (mode === "round-500") {
    return roundUpTo(remaining, 500).toFixed(2);
  }
  if (mode === "round-1000") {
    return roundUpTo(remaining, 1000).toFixed(2);
  }
  return remaining.toFixed(2);
}

function roundUpTo(amount, step) {
  if (amount <= 0) return 0;
  return Math.ceil(amount / step) * step;
}

function saleNeedsAsyncProcessing(payments = state.saleDraft.payments) {
  const asyncMethods = new Set(["M-Pesa", "Airtel Money", "Bank Transfer", "Buy Goods", "Paybill", "Card"]);
  return payments.some((payment) => asyncMethods.has(payment.paymentMethod));
}

function selectedSalePaymentMethods(payments = state.saleDraft.payments) {
  return [...new Set(payments.map((payment) => payment.paymentMethod))];
}

function buildProcessingHeading(payments = state.saleDraft.payments) {
  const digitalMethods = selectedSalePaymentMethods(payments)
    .filter((method) => ["M-Pesa", "Airtel Money", "Bank Transfer", "Buy Goods", "Paybill", "Card"].includes(method));
  return digitalMethods.length ? `${digitalMethods.join(" + ")} payment in progress` : "Payment in progress";
}

function buildProcessingMessage(payments = state.saleDraft.payments) {
  const digitalMethods = selectedSalePaymentMethods(payments)
    .filter((method) => ["M-Pesa", "Airtel Money", "Bank Transfer", "Buy Goods", "Paybill", "Card"].includes(method));
  if (!digitalMethods.length) {
    return "Processing payment and preparing confirmation.";
  }
  return `Processing ${digitalMethods.join(", ")}. Please wait while we confirm the payment.`;
}

function timeGreetingMessage() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning.";
  if (hour >= 12 && hour < 17) return "Good day.";
  if (hour >= 17 && hour < 21) return "Good evening.";
  return "Good night.";
}

function wait(milliseconds) {
  const schedule = typeof window.setTimeout === "function"
    ? window.setTimeout.bind(window)
    : (typeof setTimeout === "function" ? setTimeout : (fn) => fn());
  return new Promise((resolve) => schedule(resolve, milliseconds));
}

function productLookup(productId) {
  return state.products.find((product) => product.id === productId) || null;
}

function focusSaleSearchInputSoon() {
  if (state.scannerPaused || state.saleDraft.paymentStageOpen) {
    return;
  }
  requestAnimationFrame(() => {
    const searchInput = document.getElementById("sale-search-input");
    if (searchInput instanceof HTMLInputElement && !searchInput.disabled) {
      searchInput.focus();
      searchInput.select();
    }
  });
}

function canManageInventory() {
  return state.bootstrap?.user?.role === "OWNER";
}

function ensureOwnerInventoryAccess() {
  if (!canManageInventory()) {
    throw new Error("Only the owner can change inventory.");
  }
}

function focusSalePaymentFieldSoon() {
  requestAnimationFrame(() => {
    const amountInput = document.querySelector('#sale-payment-form input[name="amount"]');
    if (amountInput instanceof HTMLInputElement && !amountInput.disabled) {
      amountInput.focus();
      amountInput.select();
    }
  });
}

function resetInventoryModalState() {
  state.inventoryFormOpen = false;
  state.inventoryFormMode = "create";
  state.inventoryProductId = "";
  state.inventoryStockAction = "STOCK_IN";
}

async function refreshData() {
  await loadBootstrap();
  if (state.bootstrap.user) {
    await loadAppData();
  }
  render();
}

function resetStateAfterLogin() {
  state.error = "";
  state.reportOutput = "";
  state.lastReport = null;
  state.reportDayModalDate = "";
  state.reportDate = currentLocalIsoDate();
  state.calendarAnchorDate = currentLocalIsoDate();
  state.authPin = "";
  state.authTab = "password";
  state.authChallenge = null;
  state.authPopupOpen = false;
  state.authWorkspaceKey = currentWorkspaceKey() || getLastWorkspaceKey();
  state.settingsSection = "overview";
  state.settingsQuery = "";
  state.settingsOpen = false;
  state.showIntro = false;
}

function resetStateAfterLogout() {
  state.notice = "";
  state.dashboard = null;
  state.dashboardDetail = "today-sales";
  state.inventoryDetail = "products";
  state.products = [];
  state.stockRecords = [];
  state.sales = [];
  state.credits = [];
  state.openCredits = [];
  state.paymentLedger = [];
  state.accounting = null;
  state.users = [];
  state.ownerControl = null;
  resetInventoryModalState();
  state.saleDraft = createSaleDraft();
  state.invoiceDraft = createInvoiceDraft();
  state.paymentWorkflow = createPaymentWorkflowState();
  state.debtDraft = createDebtDraft();
  state.activeView = "dashboard";
  state.settingsOpen = false;
  state.settingsQuery = "";
  state.settingsSection = "overview";
  state.reportOutput = "";
  state.lastReport = null;
  state.reportDayModalDate = "";
  state.reportDate = currentLocalIsoDate();
  state.calendarAnchorDate = currentLocalIsoDate();
  state.showIntro = false;
  state.authPin = "";
  state.authTab = "password";
  state.authChallenge = null;
  state.authPopupOpen = false;
  state.authWorkspaceKey = getLastWorkspaceKey();
  state.securityPrompt = null;
}

function ensureCreditCustomerDetails() {
  if (!state.saleDraft.customerName) {
    const customerName = window.prompt("This sale has an unpaid balance. Enter the customer name to continue with partial / credit checkout:");
    if (!customerName || !customerName.trim()) {
      throw new Error("Customer name is required for partial or credit sales.");
    }
    state.saleDraft.customerName = customerName.trim();
  }

  if (!state.saleDraft.phoneNumber) {
    const phoneNumber = window.prompt("Enter the customer phone number for the credit record. You can leave it blank if not available:", state.saleDraft.phoneNumber || "");
    state.saleDraft.phoneNumber = (phoneNumber || "").trim();
  }
}

function renderSaleText(sale, printReceipt = true) {
  const business = state.bootstrap?.workspaceConfig?.businessProfile || {};
  const receipt = state.bootstrap?.workspaceConfig?.receiptProfile || {};
  const paymentLines = sale.payments.flatMap((payment) => {
    const intro = `${payment.paymentMethod}: ${money(payment.amount)}${payment.detailSummary ? ` | ${payment.detailSummary}` : ""}`;
    return [intro, ...payment.messages];
  });

  return [
    business.businessName || state.bootstrap?.businessName || PRODUCT_NAME,
    business.branchName ? `Branch: ${business.branchName}` : null,
    receipt.headerTitle || "Official Receipt",
    business.contactPhone && receipt.showContact ? `Phone: ${business.contactPhone}` : null,
    business.contactEmail && receipt.showContact ? `Email: ${business.contactEmail}` : null,
    business.address && receipt.showContact ? `Address: ${business.address}` : null,
    business.taxId && receipt.showTaxId ? `Tax ID: ${business.taxId}` : null,
    "----------------------------------------",
    `INVOICE: ${sale.invoiceNumber}`,
    `Customer: ${sale.customerName}`,
    `Processed By: ${sale.processedBy}`,
    `Date: ${sale.date} ${sale.time}`,
    "----------------------------------------",
    ...sale.items.map((item) => `${item.productName} x${item.quantity} @ ${money(item.unitPrice)} = ${money(item.subtotal)}`),
    "----------------------------------------",
    `Subtotal: ${money(sale.subtotalAmount || sale.items.reduce((sum, item) => sum + item.subtotal, 0))}`,
    `VAT Included (16%): ${money(sale.taxAmount || 0)}`,
    `Total Due: ${money(sale.totalAmount)}`,
    "",
    ...paymentLines,
    "",
    `RECEIPT: ${sale.receiptNumber}`,
    `Transaction: ${sale.saleId}`,
    `Total Paid: ${money(sale.totalPaid)}`,
    `Balance: ${money(sale.balance)}`,
    `Change: ${money(sale.changeReturned)}`,
    `Status: ${sale.status}`,
    `Payment Summary: ${sale.paymentSummary}`,
    `Receipt Printing: ${printReceipt ? "Enabled" : "Skipped"}`,
    receipt.footerNote ? "" : null,
    receipt.footerNote || null,
    receipt.returnPolicy || null,
    receipt.printLogoNote ? `${PRODUCT_NAME}` : null,
  ].filter(Boolean).join("\n");
}

function renderDebtPaymentText(result) {
  return [
    ...result.payments.flatMap((payment) => {
      const intro = `${payment.paymentMethod}: ${money(payment.amount)}${payment.detailSummary ? ` | ${payment.detailSummary}` : ""}`;
      return [intro, ...payment.messages];
    }),
    "",
    `Debt Payment Receipt: ${result.debtPaymentId}`,
    `Customer: ${result.customerName}`,
    `Total Paid: ${money(result.totalPaid)}`,
    `Applied Amount: ${money(result.appliedAmount)}`,
    `Remaining Debt: ${money(result.remainingDebt)}`,
    `Change Returned: ${money(result.changeReturned)}`,
    `Status: ${result.status}`,
  ].join("\n");
}

function renderReportText(report) {
  return [
    report.title,
    report.businessName,
    `Date / Range: ${report.dateOrRange}`,
    "----------------------------------------",
    `Sales Recorded: ${(report.sales || []).length}`,
    `Total Sales: ${money(report.totalSales)}`,
    `Total Paid: ${money(report.totalPaid)}`,
    `Total Credit: ${money(report.totalCredit)}`,
    `Outstanding Debt: ${money(report.outstandingDebt)}`,
    `Payment Breakdown: ${report.paymentBreakdown.length ? report.paymentBreakdown.map((item) => `${item.paymentMethod}=${money(item.total)}`).join(", ") : "No payments recorded"}`,
    `Most Sold Products: ${report.mostSoldProducts.length ? report.mostSoldProducts.map((item) => `${item.productName} (${item.quantity})`).join(", ") : "None"}`,
    `Stock In: ${report.stockMovement.stockIn}`,
    `Stock Out: ${report.stockMovement.stockOut}`,
  ].join("\n");
}

function receiptFileName() {
  const receiptNumber = state.paymentWorkflow.sale?.receiptNumber || "receipt";
  return `${receiptNumber.replace(/[^a-z0-9-_]/gi, "_")}.txt`;
}

function downloadReceiptPopup() {
  if (!state.paymentWorkflow.receiptText) {
    return;
  }

  const blob = new Blob([state.paymentWorkflow.receiptText], { type: "text/plain;charset=utf-8" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = receiptFileName();
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function downloadBackupSnapshot(fileName) {
  if (!fileName) {
    return;
  }
  const link = document.createElement("a");
  link.href = `/api/admin/backups/download?fileName=${encodeURIComponent(fileName)}`;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function printReceiptPopup(silent = false) {
  if (!state.paymentWorkflow.receiptText) {
    return false;
  }

  const frame = document.createElement("iframe");
  frame.setAttribute("aria-hidden", "true");
  frame.style.position = "fixed";
  frame.style.right = "0";
  frame.style.bottom = "0";
  frame.style.width = "0";
  frame.style.height = "0";
  frame.style.border = "0";
  document.body.appendChild(frame);

  const frameDoc = frame.contentWindow?.document;
  if (!frameDoc || !frame.contentWindow) {
    frame.remove();
    if (!silent) {
      alert("Printing is not available right now.");
    }
    return false;
  }

  frameDoc.open();
  frameDoc.write(`
    <html>
      <head>
        <title>${escapeHtml(state.paymentWorkflow.sale?.receiptNumber || "Receipt")}</title>
        <style>
          body { font-family: Consolas, monospace; padding: 24px; white-space: pre-wrap; line-height: 1.5; }
        </style>
      </head>
      <body>${escapeHtml(state.paymentWorkflow.receiptText)}</body>
    </html>
  `);
  frameDoc.close();
  frame.contentWindow.focus();
  frame.contentWindow.print();
  window.setTimeout(() => frame.remove(), 1200);
  return true;
}

function renderAccountingText(accounting) {
  if (!accounting) {
    return "Accounting Summary\n----------------------------------------\nNo accounting data available yet.";
  }

  return [
    "Accounting Summary",
    "----------------------------------------",
    `Sales Count: ${accounting.salesCount}`,
    `Total Sales Value: ${money(accounting.totalSalesValue)}`,
    `Total Paid Received: ${money(accounting.totalPaidReceived)}`,
    `Collected During Sales: ${money(accounting.collectedDuringSales)}`,
    `Total Credit Sold: ${money(accounting.totalCreditSold)}`,
    `Outstanding Debt: ${money(accounting.outstandingDebt)}`,
    `Payment Breakdown: ${accounting.paymentBreakdown.length ? accounting.paymentBreakdown.map((item) => `${item.paymentMethod}=${money(item.total)}`).join(", ") : "No payments recorded"}`,
  ].join("\n");
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json" },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function formDataObject(form) {
  const data = new FormData(form);
  const output = {};
  for (const [key, value] of data.entries()) {
    if (Object.prototype.hasOwnProperty.call(output, key)) {
      if (Array.isArray(output[key])) {
        output[key].push(value);
      } else {
        output[key] = [output[key], value];
      }
    } else {
      output[key] = value;
    }
  }
  return output;
}

function paymentOptions(selectedMethod) {
  return availablePaymentMethods()
    .map((method) => `<option value="${escapeAttr(method)}" ${method === selectedMethod ? "selected" : ""}>${escapeHtml(method)}</option>`)
    .join("");
}

function buildWorkspaceSetupPayload(form) {
  const data = formDataObject(form);
  return {
    ...data,
    autoBackupEnabled: Boolean(data.autoBackupEnabled),
    showContact: true,
    showTaxId: true,
    printLogoNote: true,
    enabledMethods: normalizeArray(data.enabledMethods),
    routes: {
      "M-Pesa": { targetNumber: data.routeMpesaTarget || "" },
      Paybill: { targetNumber: data.routePaybillTarget || "" },
      "Airtel Money": { targetNumber: data.routeAirtelTarget || "" },
      "Bank Transfer": { targetNumber: data.routeBankTarget || "" },
    },
    accepted: Boolean(data.accepted),
    acceptedBy: data.fullName || data.username || "",
  };
}

function buildPaymentProfilePayload(form) {
  const data = formDataObject(form);
  const enabledMethods = normalizeArray(data.enabledMethods);
  return {
    enabledMethods,
    routes: PAYMENT_METHODS.reduce((acc, method) => {
      acc[method] = {
        label: data[`route_${method}_label`] || "",
        targetNumber: data[`route_${method}_target`] || "",
        accountName: data[`route_${method}_account`] || "",
      };
      return acc;
    }, {}),
  };
}

function buildReceiptProfilePayload(form) {
  const data = formDataObject(form);
  return {
    ...data,
    showContact: checkboxValue(form, "showContact"),
    showTaxId: checkboxValue(form, "showTaxId"),
    printLogoNote: checkboxValue(form, "printLogoNote"),
  };
}

function buildSecurityPolicyPayload(form) {
  const data = formDataObject(form);
  return {
    ...data,
    autoBackupEnabled: checkboxValue(form, "autoBackupEnabled"),
  };
}

function buildComplianceProfilePayload(form) {
  const data = formDataObject(form);
  return {
    ...data,
    accepted: checkboxValue(form, "accepted"),
  };
}

function normalizeArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === "") return [];
  return [value];
}

function checkboxValue(form, name) {
  const field = form.querySelector(`[name="${CSS.escape(name)}"]`);
  return field instanceof HTMLInputElement ? field.checked : false;
}

function paymentDetail(payment) {
  return [payment.customerPhone, payment.targetNumber, payment.accountReference, payment.paymentPurpose]
    .filter(Boolean)
    .join(" | ");
}

function money(value) {
  return `KES ${Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pill(tone, label) {
  return `<span class="pill ${tone}">${escapeHtml(String(label))}</span>`;
}

function statusTone(status) {
  if (["PAID", "CLEARED", "OWNER", "STOCK_IN"].includes(status)) return "success";
  if (["PARTIAL", "OUTSTANDING", "STAFF", "STOCK_OUT", "DEBT PARTIAL"].includes(status)) return "warning";
  return "danger";
}

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}

function icon(name) {
  const icons = {
    menu: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"></path></svg>',
    close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"></path></svg>',
    search: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10.5 18a7.5 7.5 0 1 1 5.3-2.2L21 21"></path></svg>',
    backspace: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 6H9l-6 6 6 6h12zM15 9l-4 6M11 9l4 6"></path></svg>',
    dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h7V4H4zM13 20h7v-9h-7zM13 4h7v7h-7zM4 20h7v-5H4z"></path></svg>',
    inventory: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v13H4zM8 7V4h8v3"></path></svg>',
    sales: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v14H5zM8 9h8M8 13h5"></path></svg>',
    debts: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16v12H4zM8 10h8M8 14h4"></path></svg>',
    reports: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20V9M12 20V4M18 20v-7"></path></svg>',
    access: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0"></path></svg>',
    held: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v5l4 2M12 3a9 9 0 1 0 9 9"></path></svg>',
    invoice: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l3 3v15H6zM9 9h6M9 13h6M9 17h4"></path></svg>',
    returns: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5M20 12H4"></path></svg>',
    logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 17l5-5-5-5M15 12H3M20 4v16"></path></svg>',
    theme: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 9 9A7 7 0 0 1 12 3z"></path></svg>',
    scanner: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7V5h2M15 5h2v2M17 15v2h-2M9 17H7v-2M5 10h14M5 14h14"></path></svg>',
    printer: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 8V4h10v4M6 17h12v3H6zM5 9h14a2 2 0 0 1 2 2v4H3v-4a2 2 0 0 1 2-2z"></path></svg>',
    download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11M8 10l4 4 4-4M5 19h14"></path></svg>',
    card: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3zM3 11h18M7 15h2"></path></svg>',
    biometric: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.3 0 6 2.7 6 6v2M12 3C8.7 3 6 5.7 6 9v2M8 13v1a4 4 0 0 0 8 0v-1M12 21v-3"></path></svg>',
    spinner: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4a8 8 0 1 0 8 8"></path></svg>',
    success: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7"></path></svg>',
    cash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7h18v10H3zM7 12h10M7 9h.01M17 15h.01"></path></svg>',
    mpesa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM9 17h6"></path></svg>',
    gift: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12H4v8h16zM4 12h16M12 4v16M7.5 7A2.5 2.5 0 0 1 12 9.5 2.5 2.5 0 0 1 16.5 7"></path></svg>',
    phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3h10v18H7zM10 18h4"></path></svg>',
    user: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM5 20a7 7 0 0 1 14 0"></path></svg>',
    database: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zm0 5c0 1.7 3.6 3 8 3s8-1.3 8-3m-16 5c0 1.7 3.6 3 8 3s8-1.3 8-3"></path></svg>',
  };
  return `<span class="inline-icon">${icons[name] || icons.dashboard}</span>`;
}
