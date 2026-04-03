const appEl = document.getElementById("app");

const state = {
  theme: localStorage.getItem("benjoji_theme") || "light",
  bootstrap: null,
  activeView: "dashboard",
  loading: false,
  error: "",
  authTab: "login",
  dashboard: null,
  products: [],
  stockRecords: [],
  sales: [],
  credits: [],
  openCredits: [],
  paymentLedger: [],
  accounting: null,
  users: [],
  saleDraft: {
    customerName: "",
    phoneNumber: "",
    processedBy: "",
    items: [],
    payments: [],
    output: "",
  },
  debtDraft: {
    customerName: "",
    payments: [],
    output: "",
  },
  reportDate: new Date().toISOString().slice(0, 10),
  reportOutput: "",
};

init();

async function init() {
  applyTheme();
  await loadBootstrap();
  if (state.bootstrap?.user) {
    await loadAppData();
  }
  render();
}

function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
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
  } else {
    state.users = [];
  }
}

function render() {
  applyTheme();

  if (!state.bootstrap) {
    appEl.innerHTML = screenShell(`<div class="empty-state">Loading application...</div>`);
    return;
  }

  if (!state.bootstrap.hasUsers || !state.bootstrap.user) {
    appEl.innerHTML = renderAuthScreen();
  } else {
    appEl.innerHTML = renderAppShell();
  }
}

function screenShell(content) {
  return `<div class="shell">${content}</div>`;
}

function renderAuthScreen() {
  const isSetup = !state.bootstrap.hasUsers;
  const title = isSetup ? "Create the owner account" : "Sign in to your workspace";
  const subtitle = isSetup
    ? "This first account becomes the system owner and controls who else can access the system."
    : "Log in to manage inventory, sales, credit, reports, and user access.";

  const form = isSetup ? renderSetupForm() : renderLoginForm();

  return screenShell(`
    <div class="auth-shell hero-card">
      <div class="hero-banner">
        <div>
          <div class="brand-row">
            <div class="brand-badge">
              <span class="brand-icon">B</span>
              <span>BENJOJI Payment Handling System</span>
            </div>
            <button class="theme-toggle" data-action="toggle-theme">${state.theme === "dark" ? "Light Theme" : "Dark Theme"}</button>
          </div>
          <h1 class="hero-title">A secure business system you can actually open, see, and use.</h1>
          <p class="hero-text">
            Responsive on desktop and mobile-sized screens, with account protection, inventory, sales, debt tracking, receipts,
            reports, and user access control.
          </p>
        </div>
        <div class="hero-bullets">
          <div class="hero-pill">Light and dark theme support</div>
          <div class="hero-pill">Embedded SQLite database</div>
          <div class="hero-pill">Login, create account, and owner-only access control</div>
          <div class="hero-pill">Inventory, sales, debt payments, and reports</div>
        </div>
      </div>
      <div class="auth-layout">
        <div class="auth-form-wrap">
          <h2 class="auth-heading">${title}</h2>
          <p class="auth-subtitle">${subtitle}</p>
          ${state.error ? `<div class="status-text error">${escapeHtml(state.error)}</div>` : ""}
          ${form}
        </div>
        <div class="auth-form-wrap">
          <h3 class="section-title">What this app already includes</h3>
          <div class="list-card" style="margin-top: 18px;">
            <div class="list-item">Responsive layout that adapts to larger desktop screens and smaller mobile screens.</div>
            <div class="list-item">Protected access with owner and staff roles.</div>
            <div class="list-item">Sales flow with multiple payment methods, partial payments, and credit tracking.</div>
            <div class="list-item">Debt repayment workflow with proper accounting totals.</div>
            <div class="list-item">Reports and records stored in the local SQLite database.</div>
          </div>
        </div>
      </div>
    </div>
  `);
}

function renderSetupForm() {
  return `
    <form id="setup-form" class="form-grid">
      <div class="field full-span">
        <label>Business Name</label>
        <input name="businessName" required placeholder="BENJOJI Business" />
      </div>
      <div class="field">
        <label>Owner Full Name</label>
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
        <label>Password</label>
        <input name="password" type="password" required />
      </div>
      <div class="field full-span">
        <label>Confirm Password</label>
        <input name="confirmPassword" type="password" required />
      </div>
      <div class="full-span">
        <button class="primary-button" type="submit">Create Owner Account</button>
      </div>
    </form>
  `;
}

function renderLoginForm() {
  return `
    <div class="tabs-inline">
      <button type="button" class="${state.authTab === "login" ? "active" : ""}" data-action="switch-auth-tab" data-tab="login">Login</button>
      <button type="button" class="${state.authTab === "owner-create" ? "active" : ""}" data-action="switch-auth-tab" data-tab="owner-create">Need Owner Help?</button>
    </div>
    ${
      state.authTab === "login"
        ? `
      <form id="login-form" class="form-grid single">
        <div class="field">
          <label>Username</label>
          <input name="username" required />
        </div>
        <div class="field">
          <label>Password</label>
          <input name="password" type="password" required />
        </div>
        <div>
          <button class="primary-button" type="submit">Login</button>
        </div>
      </form>
    `
        : `
      <div class="list-item" style="margin-top: 20px;">
        Additional accounts are created by the system owner after login. If you do not have an account yet, ask the owner to open the
        <strong>Access</strong> section and create one for you.
      </div>
    `
    }
  `;
}

function renderAppShell() {
  const user = state.bootstrap.user;
  const businessName = state.bootstrap.businessName;
  return screenShell(`
    <div class="app-shell">
      <div class="app-header glass-card">
        <div>
          <div class="brand-badge">
            <span class="brand-icon">B</span>
            <span>${escapeHtml(businessName)}</span>
          </div>
          <h1 class="header-title">Business Control Center</h1>
          <div class="header-subtitle">Responsive inventory, payment, credit, reporting, and access management.</div>
        </div>
        <div class="toolbar-row">
          <div class="user-chip">${escapeHtml(user.fullName)} · ${escapeHtml(user.role)}</div>
          <button class="theme-toggle" data-action="toggle-theme">${state.theme === "dark" ? "Light Theme" : "Dark Theme"}</button>
          <button class="danger-button" data-action="logout">Logout</button>
        </div>
      </div>
      <div class="app-nav">
        ${navButton("dashboard", "Dashboard")}
        ${navButton("inventory", "Inventory")}
        ${navButton("sales", "Sales")}
        ${navButton("debts", "Debt Payments")}
        ${navButton("reports", "Reports")}
        ${navButton("access", "Access", user.role !== "OWNER")}
      </div>
      ${renderActiveView()}
    </div>
  `);
}

function navButton(view, label, hidden = false) {
  if (hidden) return "";
  return `<button class="nav-tab ${state.activeView === view ? "active" : ""}" data-action="navigate" data-view="${view}">${label}</button>`;
}

function renderActiveView() {
  switch (state.activeView) {
    case "inventory":
      return renderInventoryView();
    case "sales":
      return renderSalesView();
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

function renderDashboardView() {
  const dashboard = state.dashboard || {
    productCount: 0,
    stockMovementCount: 0,
    salesCount: 0,
    openDebtCount: 0,
    totalSalesValue: 0,
    totalCollected: 0,
    outstandingDebt: 0,
  };

  return `
    <div class="section-stack">
      <div class="metrics-grid">
        ${metricCard("Products", dashboard.productCount)}
        ${metricCard("Stock Movements", dashboard.stockMovementCount)}
        ${metricCard("Sales", dashboard.salesCount)}
        ${metricCard("Open Debts", dashboard.openDebtCount)}
        ${metricCard("Sales Value", money(dashboard.totalSalesValue))}
        ${metricCard("Collected", money(dashboard.totalCollected))}
        ${metricCard("Outstanding Debt", money(dashboard.outstandingDebt))}
      </div>
      <div class="two-column">
        <div class="panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Getting started</h2>
              <div class="section-subtitle">Use these quick actions to move through the workflow.</div>
            </div>
          </div>
          <div class="list-card">
            <div class="list-item">1. Add or stock-in products in the Inventory section.</div>
            <div class="list-item">2. Build a cart in Sales, add one or many payment methods, then finalize.</div>
            <div class="list-item">3. Use Debt Payments to settle customer balances later.</div>
            <div class="list-item">4. Generate daily or weekly reports and review accounting totals.</div>
          </div>
        </div>
        <div class="panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Recent debt snapshot</h2>
              <div class="section-subtitle">Outstanding customer balances that still need follow-up.</div>
            </div>
          </div>
          ${state.openCredits.length ? `
            <div class="list-card">
              ${state.openCredits.slice(0, 5).map((credit) => `
                <div class="list-item">
                  <strong>${escapeHtml(credit.customerName)}</strong><br />
                  <span class="muted">${escapeHtml(credit.transactionId)}</span><br />
                  <span>${money(credit.amountOwed)}</span>
                </div>
              `).join("")}
            </div>
          ` : `<div class="empty-state">No outstanding debts right now.</div>`}
        </div>
      </div>
    </div>
  `;
}

function renderInventoryView() {
  return `
    <div class="section-stack">
      <div class="two-column">
        <div class="panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Add Product / Stock In</h2>
              <div class="section-subtitle">New products are created here, and existing products can be stocked in again.</div>
            </div>
          </div>
          <form id="inventory-form" class="form-grid">
            <div class="field">
              <label>Product Name</label>
              <input name="name" required />
            </div>
            <div class="field">
              <label>Unit Price</label>
              <input name="unitPrice" type="number" min="0.01" step="0.01" required />
            </div>
            <div class="field">
              <label>Quantity</label>
              <input name="quantity" type="number" min="1" step="1" required />
            </div>
            <div class="field">
              <label>Authorized By</label>
              <input name="authorizedBy" placeholder="${escapeHtml(state.bootstrap.user.fullName)}" />
            </div>
            <div class="full-span">
              <button class="primary-button" type="submit">Save Product / Stock In</button>
            </div>
          </form>
        </div>
        <div class="panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Inventory Snapshot</h2>
              <div class="section-subtitle">Current products, prices, and stock levels.</div>
            </div>
          </div>
          ${renderProductsTable(state.products)}
        </div>
      </div>
      <div class="table-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Stock Activity</h2>
            <div class="section-subtitle">Every stock in and stock out movement is traceable.</div>
          </div>
        </div>
        ${renderStockTable(state.stockRecords)}
      </div>
    </div>
  `;
}

function renderSalesView() {
  const totalDue = state.saleDraft.items.reduce((sum, item) => sum + item.subtotal, 0);
  const totalPaid = state.saleDraft.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const balance = totalDue - totalPaid;

  return `
    <div class="section-stack">
      <div class="two-column">
        <div class="section-stack">
          <div class="panel-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Customer and Sale Details</h2>
                <div class="section-subtitle">Walk-in customers are allowed for fully paid sales.</div>
              </div>
            </div>
            <form id="sale-meta-form" class="form-grid">
              <div class="field">
                <label>Customer Name</label>
                <input name="customerName" value="${escapeAttr(state.saleDraft.customerName)}" />
              </div>
              <div class="field">
                <label>Phone Number</label>
                <input name="phoneNumber" value="${escapeAttr(state.saleDraft.phoneNumber)}" />
              </div>
              <div class="field full-span">
                <label>Processed By</label>
                <input name="processedBy" value="${escapeAttr(state.saleDraft.processedBy || state.bootstrap.user.fullName)}" />
              </div>
              <div class="full-span">
                <button class="secondary-button" type="submit">Save Draft Details</button>
              </div>
            </form>
          </div>
          <div class="panel-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Cart Builder</h2>
                <div class="section-subtitle">Add products and quantities before payment.</div>
              </div>
            </div>
            <form id="sale-item-form" class="form-grid">
              <div class="field">
                <label>Product</label>
                <select name="productId" required>
                  <option value="">Select a product</option>
                  ${state.products.map((product) => `<option value="${product.id}">${escapeHtml(product.name)} · ${money(product.unitPrice)} · stock ${product.stockQuantity}</option>`).join("")}
                </select>
              </div>
              <div class="field">
                <label>Quantity</label>
                <input name="quantity" type="number" min="1" step="1" required />
              </div>
              <div class="full-span action-bar">
                <button class="primary-button" type="submit">Add Item</button>
                <button class="secondary-button" type="button" data-action="clear-sale-items">Clear Cart</button>
              </div>
            </form>
            ${renderSaleItemsTable(state.saleDraft.items)}
          </div>
        </div>
        <div class="section-stack">
          <div class="panel-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Payment Builder</h2>
                <div class="section-subtitle">Use one or many methods, or leave the balance as credit.</div>
              </div>
            </div>
            <form id="sale-payment-form" class="form-grid">
              <div class="field">
                <label>Payment Method</label>
                <select name="paymentMethod" required>
                  <option value="">Select a method</option>
                  ${paymentOptions()}
                </select>
              </div>
              <div class="field">
                <label>Amount</label>
                <input name="amount" type="number" min="0.01" step="0.01" required />
              </div>
              <div class="full-span action-bar">
                <button class="primary-button" type="submit">Add Payment</button>
                <button class="secondary-button" type="button" data-action="clear-sale-payments">Clear Payments</button>
              </div>
            </form>
            ${renderSalePaymentsTable(state.saleDraft.payments)}
            <div class="summary-lines">
              ${summaryLine("Total Due", money(totalDue))}
              ${summaryLine("Total Paid", money(totalPaid))}
              ${summaryLine(balance >= 0 ? "Balance" : "Change", balance >= 0 ? money(balance) : money(Math.abs(balance)))}
            </div>
            <div class="action-bar">
              <button class="primary-button" data-action="finalize-sale">Finalize Sale</button>
              <button class="danger-button" data-action="reset-sale-draft">Reset Draft</button>
            </div>
          </div>
          <div class="panel-card">
            <div class="section-header">
              <div>
                <h2 class="section-title">Invoice and Receipt Output</h2>
                <div class="section-subtitle">Your finalized sale output appears here.</div>
              </div>
            </div>
            <div class="receipt-output">${state.saleDraft.output ? escapeHtml(state.saleDraft.output) : "Finalize a sale to preview the invoice, payment flow, and receipt."}</div>
          </div>
        </div>
      </div>
      <div class="table-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Sales Records</h2>
            <div class="section-subtitle">Stored sales history from the database.</div>
          </div>
        </div>
        ${renderSalesTable(state.sales)}
      </div>
    </div>
  `;
}

function renderDebtsView() {
  const currentDebt = state.openCredits.find((credit) => credit.customerName === state.debtDraft.customerName);
  const draftPaid = state.debtDraft.payments.reduce((sum, payment) => sum + payment.amount, 0);
  const remaining = Math.max((currentDebt?.amountOwed || 0) - draftPaid, 0);

  return `
    <div class="section-stack">
      <div class="two-column">
        <div class="table-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Outstanding Debts</h2>
              <div class="section-subtitle">Select a customer to begin the repayment flow.</div>
            </div>
          </div>
          ${renderDebtTable(state.openCredits)}
        </div>
        <div class="panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Debt Payment Builder</h2>
              <div class="section-subtitle">Later debt repayments also update accounting totals.</div>
            </div>
          </div>
          <form id="debt-payment-form" class="form-grid">
            <div class="field full-span">
              <label>Selected Customer</label>
              <select name="customerName" required>
                <option value="">Select a customer</option>
                ${state.openCredits.map((credit) => `<option value="${escapeAttr(credit.customerName)}" ${credit.customerName === state.debtDraft.customerName ? "selected" : ""}>${escapeHtml(credit.customerName)} · ${money(credit.amountOwed)}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label>Payment Method</label>
              <select name="paymentMethod" required>
                <option value="">Select a method</option>
                ${paymentOptions()}
              </select>
            </div>
            <div class="field">
              <label>Amount</label>
              <input name="amount" type="number" min="0.01" step="0.01" required />
            </div>
            <div class="full-span action-bar">
              <button class="primary-button" type="submit">Add Debt Payment</button>
              <button class="secondary-button" type="button" data-action="clear-debt-payments">Clear Draft</button>
            </div>
          </form>
          ${renderSalePaymentsTable(state.debtDraft.payments)}
          <div class="summary-lines">
            ${summaryLine("Outstanding", money(currentDebt?.amountOwed || 0))}
            ${summaryLine("Draft Paid", money(draftPaid))}
            ${summaryLine("Remaining", money(remaining))}
          </div>
          <div class="action-bar">
            <button class="primary-button" data-action="finalize-debt-payment">Process Debt Payment</button>
          </div>
          <div class="receipt-output" style="margin-top: 16px;">${state.debtDraft.output ? escapeHtml(state.debtDraft.output) : "Complete a debt payment to preview the receipt and confirmation flow."}</div>
        </div>
      </div>
      <div class="table-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">All Credit Records</h2>
            <div class="section-subtitle">This includes outstanding, partial, and cleared debt records.</div>
          </div>
        </div>
        ${renderCreditTable(state.credits)}
      </div>
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
    <div class="section-stack">
      <div class="two-column">
        <div class="panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Report Generator</h2>
              <div class="section-subtitle">Generate daily or weekly reports using the selected date.</div>
            </div>
          </div>
          <form id="report-form" class="form-grid">
            <div class="field">
              <label>Date</label>
              <input name="reportDate" type="date" value="${escapeAttr(state.reportDate)}" required />
            </div>
            <div class="field full-span action-bar">
              <button class="primary-button" name="kind" value="daily" type="submit">Generate Daily Report</button>
              <button class="secondary-button" name="kind" value="weekly" type="submit">Generate Weekly Report</button>
              <button class="ghost-button" type="button" data-action="show-accounting">Show Accounting Summary</button>
            </div>
          </form>
          <div class="report-output">${state.reportOutput ? escapeHtml(state.reportOutput) : "Choose a report type to preview the output here."}</div>
        </div>
        <div class="panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Accounting Snapshot</h2>
              <div class="section-subtitle">A quick live summary pulled from the database.</div>
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
          <div class="table-wrap" style="margin-top: 16px;">
            <table>
              <thead><tr><th>Payment Method</th><th>Total</th></tr></thead>
              <tbody>
                ${accounting.paymentBreakdown.length
                  ? accounting.paymentBreakdown.map((item) => `<tr><td>${escapeHtml(item.paymentMethod)}</td><td>${money(item.total)}</td></tr>`).join("")
                  : `<tr><td colspan="2">No payments recorded yet.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="table-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Payment Ledger</h2>
            <div class="section-subtitle">All recorded payment entries, including debt repayments.</div>
          </div>
        </div>
        ${renderPaymentLedgerTable(state.paymentLedger)}
      </div>
    </div>
  `;
}

function renderAccessView() {
  const isOwner = state.bootstrap.user?.role === "OWNER";
  if (!isOwner) {
    return `<div class="empty-state">Only the owner can access this section.</div>`;
  }

  return `
    <div class="section-stack">
      <div class="two-column">
        <div class="panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Create Another Account</h2>
              <div class="section-subtitle">Owner-managed access ensures only approved users can enter the system.</div>
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
            <div class="full-span">
              <button class="primary-button" type="submit">Create Account</button>
            </div>
          </form>
        </div>
        <div class="panel-card">
          <div class="section-header">
            <div>
              <h2 class="section-title">Access Rules</h2>
              <div class="section-subtitle">Current protection model for the local app.</div>
            </div>
          </div>
          <div class="list-card">
            <div class="list-item">The first registered account becomes the owner.</div>
            <div class="list-item">Only signed-in users can use the app.</div>
            <div class="list-item">Only owners can create additional accounts.</div>
            <div class="list-item">Roles are stored in the database and returned after login.</div>
          </div>
        </div>
      </div>
      <div class="table-card">
        <div class="section-header">
          <div>
            <h2 class="section-title">Existing Users</h2>
            <div class="section-subtitle">Review the accounts that currently have access to the system.</div>
          </div>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Full Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              ${state.users.length
                ? state.users.map((user) => `
                  <tr>
                    <td>${escapeHtml(user.fullName)}</td>
                    <td>${escapeHtml(user.username)}</td>
                    <td>${escapeHtml(user.email || "-")}</td>
                    <td>${pill(user.role === "OWNER" ? "success" : "warning", user.role)}</td>
                    <td>${escapeHtml(user.createdAt)}</td>
                  </tr>
                `).join("")
                : `<tr><td colspan="5">No users found.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function metricCard(label, value) {
  return `
    <div class="metric-card">
      <div class="metric-label">${escapeHtml(String(label))}</div>
      <div class="metric-value">${escapeHtml(String(value))}</div>
    </div>
  `;
}

function summaryLine(label, value) {
  return `<div class="summary-line"><span>${escapeHtml(String(label))}</span><strong>${escapeHtml(String(value))}</strong></div>`;
}

function renderProductsTable(products) {
  if (!products.length) {
    return `<div class="empty-state">No products available yet.</div>`;
  }
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Product</th><th>Unit Price</th><th>Stock</th><th>Updated</th></tr></thead>
        <tbody>
          ${products.map((product) => `
            <tr>
              <td>${escapeHtml(product.name)}</td>
              <td>${money(product.unitPrice)}</td>
              <td>${product.stockQuantity}</td>
              <td>${escapeHtml(product.updatedAt)}</td>
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
              <td>${escapeHtml(sale.date)}</td>
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
              <td><button class="secondary-button" data-action="select-credit" data-customer="${escapeAttr(credit.customerName)}">Select</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPaymentLedgerTable(entries) {
  if (!entries.length) return `<div class="empty-state">No payments recorded yet.</div>`;
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Reference</th><th>Customer</th><th>Source</th><th>Method</th><th>Amount</th><th>Date</th></tr></thead>
        <tbody>
          ${entries.map((entry) => `
            <tr>
              <td>${escapeHtml(entry.referenceId)}</td>
              <td>${escapeHtml(entry.customerName)}</td>
              <td>${pill(entry.sourceType === "SALE" ? "success" : "warning", entry.sourceType)}</td>
              <td>${escapeHtml(entry.paymentMethod)}</td>
              <td>${money(entry.amount)}</td>
              <td>${escapeHtml(entry.date)} ${escapeHtml(entry.time)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSaleItemsTable(items) {
  if (!items.length) return `<div class="empty-state" style="margin-top: 16px;">No cart items yet.</div>`;
  return `
    <div class="table-wrap" style="margin-top: 16px;">
      <table>
        <thead><tr><th>Product</th><th>Qty</th><th>Unit Price</th><th>Subtotal</th><th>Action</th></tr></thead>
        <tbody>
          ${items.map((item, index) => `
            <tr>
              <td>${escapeHtml(item.productName)}</td>
              <td>${item.quantity}</td>
              <td>${money(item.unitPrice)}</td>
              <td>${money(item.subtotal)}</td>
              <td><button class="ghost-button" data-action="remove-sale-item" data-index="${index}">Remove</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSalePaymentsTable(payments) {
  if (!payments.length) return `<div class="empty-state" style="margin-top: 16px;">No payment entries yet.</div>`;
  return `
    <div class="table-wrap" style="margin-top: 16px;">
      <table>
        <thead><tr><th>Method</th><th>Amount</th><th>Action</th></tr></thead>
        <tbody>
          ${payments.map((payment, index) => `
            <tr>
              <td>${escapeHtml(payment.paymentMethod)}</td>
              <td>${money(payment.amount)}</td>
              <td><button class="ghost-button" data-action="${payments === state.saleDraft.payments ? "remove-sale-payment" : "remove-debt-payment"}" data-index="${index}">Remove</button></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

document.addEventListener("click", async (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;
  try {
    if (action === "toggle-theme") {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("benjoji_theme", state.theme);
      return render();
    }
    if (action === "switch-auth-tab") {
      state.authTab = target.dataset.tab;
      return render();
    }
    if (action === "navigate") {
      state.activeView = target.dataset.view;
      return render();
    }
    if (action === "logout") {
      await api("/api/auth/logout", { method: "POST" });
      resetStateAfterLogout();
      await loadBootstrap();
      return render();
    }
    if (action === "clear-sale-items") {
      state.saleDraft.items = [];
      return render();
    }
    if (action === "clear-sale-payments") {
      state.saleDraft.payments = [];
      return render();
    }
    if (action === "remove-sale-item") {
      state.saleDraft.items.splice(Number(target.dataset.index), 1);
      return render();
    }
    if (action === "remove-sale-payment") {
      state.saleDraft.payments.splice(Number(target.dataset.index), 1);
      return render();
    }
    if (action === "reset-sale-draft") {
      state.saleDraft = { customerName: "", phoneNumber: "", processedBy: "", items: [], payments: [], output: "" };
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
      return render();
    }
    if (action === "remove-debt-payment") {
      state.debtDraft.payments.splice(Number(target.dataset.index), 1);
      return render();
    }
    if (action === "show-accounting") {
      state.reportOutput = renderAccountingText(state.accounting);
      return render();
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
    state.error = error.message;
    render();
  }
});

document.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.target;

  try {
    if (form.id === "setup-form") {
      const data = formDataObject(form);
      await api("/api/auth/register", { method: "POST", body: data });
      resetStateAfterLogin();
      await loadBootstrap();
      await loadAppData();
      return render();
    }

    if (form.id === "login-form") {
      const data = formDataObject(form);
      await api("/api/auth/login", { method: "POST", body: data });
      resetStateAfterLogin();
      await loadBootstrap();
      await loadAppData();
      return render();
    }

    if (form.id === "inventory-form") {
      await api("/api/products", { method: "POST", body: formDataObject(form) });
      form.reset();
      await refreshData();
      return;
    }

    if (form.id === "sale-meta-form") {
      const data = formDataObject(form);
      state.saleDraft.customerName = data.customerName;
      state.saleDraft.phoneNumber = data.phoneNumber;
      state.saleDraft.processedBy = data.processedBy;
      return render();
    }

    if (form.id === "sale-item-form") {
      const data = formDataObject(form);
      const product = state.products.find((entry) => entry.id === data.productId);
      if (!product) throw new Error("Select a valid product.");
      const quantity = Number(data.quantity);
      if (!Number.isInteger(quantity) || quantity <= 0) {
        throw new Error("Quantity must be greater than zero.");
      }
      state.saleDraft.items.push({
        productId: product.id,
        productName: product.name,
        quantity,
        unitPrice: product.unitPrice,
        subtotal: product.unitPrice * quantity,
      });
      form.reset();
      return render();
    }

    if (form.id === "sale-payment-form") {
      const data = formDataObject(form);
      state.saleDraft.payments.push({
        paymentMethod: data.paymentMethod,
        amount: Number(data.amount),
      });
      form.reset();
      return render();
    }

    if (form.id === "debt-payment-form") {
      const data = formDataObject(form);
      state.debtDraft.customerName = data.customerName;
      state.debtDraft.payments.push({
        paymentMethod: data.paymentMethod,
        amount: Number(data.amount),
      });
      form.reset();
      return render();
    }

    if (form.id === "report-form") {
      const button = event.submitter;
      state.reportDate = form.elements.reportDate.value;
      const endpoint = button.value === "weekly" ? `/api/reports/weekly?date=${state.reportDate}` : `/api/reports/daily?date=${state.reportDate}`;
      const result = await api(endpoint);
      state.reportOutput = renderReportText(result);
      return render();
    }

    if (form.id === "access-form") {
      const data = formDataObject(form);
      await api("/api/auth/register", { method: "POST", body: { ...data, businessName: state.bootstrap.businessName } });
      form.reset();
      await refreshData();
      state.activeView = "access";
      return;
    }
  } catch (error) {
    alert(error.message);
  }
});

async function finalizeSale() {
  const payload = {
    customerName: state.saleDraft.customerName,
    phoneNumber: state.saleDraft.phoneNumber,
    processedBy: state.saleDraft.processedBy || state.bootstrap.user.fullName,
    items: state.saleDraft.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
    payments: state.saleDraft.payments,
  };
  const result = await api("/api/sales", { method: "POST", body: payload });
  state.saleDraft.output = renderSaleText(result.sale);
  state.saleDraft.items = [];
  state.saleDraft.payments = [];
  await refreshData();
  render();
}

async function finalizeDebtPayment() {
  const payload = {
    customerName: state.debtDraft.customerName,
    payments: state.debtDraft.payments,
  };
  const result = await api("/api/credits/pay", { method: "POST", body: payload });
  state.debtDraft.output = renderDebtPaymentText(result.debtPayment);
  state.debtDraft.payments = [];
  await refreshData();
  render();
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
}

function resetStateAfterLogout() {
  state.dashboard = null;
  state.products = [];
  state.stockRecords = [];
  state.sales = [];
  state.credits = [];
  state.openCredits = [];
  state.paymentLedger = [];
  state.accounting = null;
  state.users = [];
  state.saleDraft = { customerName: "", phoneNumber: "", processedBy: "", items: [], payments: [], output: "" };
  state.debtDraft = { customerName: "", payments: [], output: "" };
  state.activeView = "dashboard";
}

function renderSaleText(sale) {
  const paymentLines = sale.payments.flatMap((payment) => payment.messages);
  return [
    `INVOICE: ${sale.invoiceNumber}`,
    `Customer: ${sale.customerName}`,
    `Date: ${sale.date} ${sale.time}`,
    "----------------------------------------",
    ...sale.items.map((item) => `${item.productName} x${item.quantity} @ ${money(item.unitPrice)} = ${money(item.subtotal)}`),
    "----------------------------------------",
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
  ].join("\n");
}

function renderDebtPaymentText(result) {
  return [
    ...result.payments.flatMap((payment) => payment.messages),
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

function renderAccountingText(accounting) {
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
  return Object.fromEntries(data.entries());
}

function paymentOptions() {
  return ["Cash", "M-Pesa", "Buy Goods", "Paybill", "Airtel Money", "Card", "Bank Transfer"]
    .map((method) => `<option value="${method}">${method}</option>`)
    .join("");
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
