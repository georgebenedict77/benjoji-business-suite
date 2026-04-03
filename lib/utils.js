const crypto = require("node:crypto");

const SUPPORTED_PAYMENT_METHODS = [
  "Cash",
  "M-Pesa",
  "Buy Goods",
  "Paybill",
  "Airtel Money",
  "Card",
  "Gift Card",
  "Bank Transfer",
];

const DEFAULT_APPROVAL_MODE = {
  Cash: "Cash Desk",
  "M-Pesa": "STK Push",
  "Buy Goods": "SIM Toolkit",
  Paybill: "SIM Toolkit",
  "Airtel Money": "USSD Prompt",
  Card: "POS Terminal",
  "Gift Card": "Gift Voucher",
  "Bank Transfer": "Bank App",
};

function requireText(value, fieldName) {
  const safe = (value || "").toString().trim();
  if (!safe) {
    throw new Error(`${fieldName} is required.`);
  }
  return safe;
}

function optionalText(value) {
  const safe = (value || "").toString().trim();
  return safe || "";
}

function requireUsername(value) {
  const username = requireText(value, "Username");
  if (!/^[a-zA-Z0-9._-]{3,30}$/.test(username)) {
    throw new Error("Username must be 3-30 characters and use letters, numbers, dots, dashes, or underscores.");
  }
  return username;
}

function requirePassword(value) {
  const password = requireText(value, "Password");
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters.");
  }
  return password;
}

function requirePin(value) {
  const pin = requireText(value, "Access PIN");
  if (!/^\d{6}$/.test(pin)) {
    throw new Error("Access PIN must be exactly 6 digits.");
  }
  return pin;
}

function requirePositiveNumber(value, fieldName) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be greater than zero.`);
  }
  return amount;
}

function requirePositiveInteger(value, fieldName) {
  const amount = Number(value);
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error(`${fieldName} must be a whole number greater than zero.`);
  }
  return amount;
}

function normalizeRole(value) {
  const role = (value || "").toString().trim().toUpperCase();
  if (!["OWNER", "STAFF"].includes(role)) {
    throw new Error("Role must be OWNER or STAFF.");
  }
  return role;
}

function normalizePaymentMethod(value) {
  const safe = requireText(value, "Payment method");
  const normalized = SUPPORTED_PAYMENT_METHODS.find((entry) => entry.toLowerCase() === safe.toLowerCase());
  if (!normalized) {
    throw new Error("Unsupported payment method.");
  }
  return normalized;
}

function formatCurrency(amount) {
  return `KES ${Number(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function defaultApprovalMode(method) {
  return DEFAULT_APPROVAL_MODE[method] || "Manual Confirmation";
}

function sanitizePaymentMeta(method, inputMeta = {}) {
  const meta = {
    approvalMode: optionalText(inputMeta.approvalMode) || defaultApprovalMode(method),
    customerPhone: optionalText(inputMeta.customerPhone || inputMeta.phoneNumber),
    targetNumber: optionalText(inputMeta.targetNumber || inputMeta.tillNumber || inputMeta.businessNumber),
    accountReference: optionalText(inputMeta.accountReference || inputMeta.referenceCode),
    paymentPurpose: optionalText(inputMeta.paymentPurpose || inputMeta.purpose),
    note: optionalText(inputMeta.note),
  };

  if (method === "Cash") {
    meta.approvalMode = "Cash Desk";
  }

  return meta;
}

function summarizePaymentDetail(method, inputMeta = {}) {
  const meta = sanitizePaymentMeta(method, inputMeta);
  const parts = [];

  if (meta.approvalMode) {
    parts.push(meta.approvalMode);
  }
  if (meta.customerPhone) {
    parts.push(meta.customerPhone);
  }
  if (meta.targetNumber) {
    parts.push(meta.targetNumber);
  }
  if (meta.accountReference) {
    parts.push(meta.accountReference);
  }
  if (meta.paymentPurpose) {
    parts.push(meta.paymentPurpose);
  }

  return parts.join(" | ");
}

function buildPaymentMessages(method, amount, inputMeta = {}) {
  const formatted = formatCurrency(amount);
  const meta = sanitizePaymentMeta(method, inputMeta);
  const detailText = meta.paymentPurpose ? `Purpose: ${meta.paymentPurpose}.` : "";

  if (method === "Cash") {
    return [`Cash received: ${formatted}`, "Cash payment confirmed."];
  }
  if (method === "Card") {
    return [
      `Sending ${formatted} to the POS terminal...`,
      meta.accountReference ? `Approval code: ${meta.accountReference}.` : "Waiting for card approval...",
      "Card payment confirmed.",
    ];
  }
  if (method === "Gift Card") {
    return [
      `Validating gift card payment for ${formatted}.`,
      meta.accountReference ? `Gift card reference: ${meta.accountReference}.` : "Enter the gift card or voucher reference.",
      "Gift card payment confirmed.",
    ];
  }
  if (method === "M-Pesa") {
    if (meta.approvalMode === "SIM Toolkit") {
      return [
        `Open SIM Toolkit > M-Pesa for ${formatted}.`,
        meta.customerPhone ? `Customer phone: ${meta.customerPhone}.` : "Use the customer's M-Pesa line to continue.",
        detailText || "Confirm the business line and amount before sending.",
        "Waiting for SIM Toolkit confirmation...",
        "M-Pesa payment confirmed.",
      ];
    }
    if (meta.approvalMode === "Manual Confirmation") {
      return [
        `Manually confirm incoming M-Pesa payment for ${formatted}.`,
        meta.accountReference ? `Reference: ${meta.accountReference}.` : "Check the transaction message from M-Pesa.",
        "M-Pesa payment approved.",
      ];
    }
    return [
      `Preparing M-Pesa STK push for ${formatted}.`,
      meta.customerPhone ? `Prompt sent to ${meta.customerPhone}.` : "Customer phone not provided; prompt will be simulated.",
      detailText || "Ask the customer to approve the STK prompt on the phone.",
      "M-Pesa payment confirmed.",
    ];
  }
  if (method === "Buy Goods") {
    return [
      "Open M-Pesa SIM Toolkit > Lipa na M-Pesa > Buy Goods.",
      `Enter Till Number ${meta.targetNumber || "BUSINESS TILL"} and amount ${formatted}.`,
      detailText || "Confirm the till details on the customer phone.",
      "Buy Goods payment confirmed.",
    ];
  }
  if (method === "Paybill") {
    return [
      "Open M-Pesa SIM Toolkit > Lipa na M-Pesa > Paybill.",
      `Enter Business Number ${meta.targetNumber || "PAYBILL"} and amount ${formatted}.`,
      meta.accountReference ? `Account Reference: ${meta.accountReference}.` : "Add the correct account reference before approval.",
      "Paybill payment confirmed.",
    ];
  }
  if (method === "Airtel Money") {
    return [
      `Prepare Airtel Money payment for ${formatted}.`,
      meta.customerPhone ? `Customer line: ${meta.customerPhone}.` : "Use the customer Airtel line to complete the payment.",
      detailText || "Confirm the Airtel Money prompt on the handset.",
      "Airtel Money payment confirmed.",
    ];
  }
  if (method === "Bank Transfer") {
    return [
      `Waiting for bank transfer confirmation of ${formatted}.`,
      meta.accountReference ? `Reference: ${meta.accountReference}.` : "Record the bank reference after approval.",
      "Bank transfer confirmed.",
    ];
  }
  return [`Processing ${method} payment for ${formatted}...`, "Waiting for confirmation...", `${method} payment confirmed.`];
}

function summarizePayments(payments) {
  if (!payments.length) {
    return "No payment received";
  }
  const grouped = new Map();
  for (const payment of payments) {
    grouped.set(payment.paymentMethod, (grouped.get(payment.paymentMethod) || 0) + payment.amount);
  }
  return [...grouped.entries()].map(([method, amount]) => `${method}: ${formatCurrency(amount)}`).join(" | ");
}

function isoDateToday() {
  return new Date().toISOString().slice(0, 10);
}

function timestampNow() {
  const now = new Date();
  const iso = now.toISOString();
  return {
    iso,
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
  };
}

function startOfWeek(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  const day = date.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diff);
  return date.toISOString().slice(0, 10);
}

function endOfWeek(isoDate) {
  const start = new Date(`${startOfWeek(isoDate)}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 6);
  return start.toISOString().slice(0, 10);
}

function startOfMonth(isoDate) {
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1)).toISOString().slice(0, 10);
}

function endOfMonth(isoDate) {
  const [year, month] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function startOfYear(isoDate) {
  const [year] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, 0, 1)).toISOString().slice(0, 10);
}

function endOfYear(isoDate) {
  const [year] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(year, 11, 31)).toISOString().slice(0, 10);
}

function generateId(prefix) {
  return `${prefix}-${isoDateToday().replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

module.exports = {
  SUPPORTED_PAYMENT_METHODS,
  buildPaymentMessages,
  defaultApprovalMode,
  endOfWeek,
  endOfMonth,
  endOfYear,
  formatCurrency,
  generateId,
  isoDateToday,
  normalizePaymentMethod,
  normalizeRole,
  optionalText,
  requirePassword,
  requirePin,
  requirePositiveInteger,
  requirePositiveNumber,
  requireText,
  requireUsername,
  sanitizePaymentMeta,
  startOfMonth,
  startOfWeek,
  startOfYear,
  summarizePaymentDetail,
  summarizePayments,
  timestampNow,
};
