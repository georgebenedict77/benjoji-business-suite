const { getBusinessName, getWorkspaceDb, scalarValue } = require("./workspace-db");
const { getAllowedPaymentMethods, getPaymentRoute, recordAutomaticBackup } = require("./workspace-control");
const {
  buildPaymentMessages,
  createHttpError,
  defaultApprovalMode,
  formatCurrency,
  generateId,
  normalizePaymentMethod,
  optionalText,
  requirePositiveInteger,
  requirePositiveNumber,
  requireText,
  sanitizePaymentMeta,
  startOfMonth,
  startOfWeek,
  startOfYear,
  endOfMonth,
  endOfWeek,
  endOfYear,
  summarizePaymentDetail,
  summarizePayments,
  timestampNow,
} = require("./utils");

const VAT_RATE = 0.16;

function roundAmount(value) {
  return Number(Number(value || 0).toFixed(2));
}

function listProducts(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
  return db.prepare(`
    SELECT id, name, product_code, unit_price, stock_quantity, created_at, updated_at
    FROM products
    ORDER BY LOWER(name) ASC
  `).all().map((row) => ({
    id: row.id,
    name: row.name,
    productCode: row.product_code || "",
    unitPrice: row.unit_price,
    stockQuantity: row.stock_quantity,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

function addOrStockInProduct(workspaceKey, { name, productCode, unitPrice, quantity, authorizedBy }) {
  const db = getWorkspaceDb(workspaceKey);
  const productName = requireText(name, "Product name");
  const code = optionalText(productCode);
  const price = requirePositiveNumber(unitPrice, "Unit price");
  const qty = requirePositiveInteger(quantity, "Quantity");
  const doneBy = optionalText(authorizedBy) || "System";
  const now = timestampNow();

  const existingByName = db.prepare("SELECT * FROM products WHERE LOWER(name) = LOWER(?)").get(productName);
  const existingByCode = code ? db.prepare("SELECT * FROM products WHERE product_code = ?").get(code) : null;

  if (existingByName && existingByCode && existingByName.id !== existingByCode.id) {
    throw createHttpError("That product code is already assigned to another product.", 409);
  }

  const existing = existingByCode || existingByName;
  let productId = existing?.id;

  if (existing) {
    db.prepare(`
      UPDATE products
      SET product_code = ?, unit_price = ?, stock_quantity = stock_quantity + ?, updated_at = ?
      WHERE id = ?
    `).run(code || existing.product_code || null, price, qty, now.iso, existing.id);
  } else {
    productId = generateId("PRD");
    db.prepare(`
      INSERT INTO products (id, name, product_code, unit_price, stock_quantity, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(productId, productName, code || null, price, qty, now.iso, now.iso);
  }

  db.prepare(`
    INSERT INTO stock_records (id, product_id, product_name, quantity_changed, action_type, date, time, authorized_by, reference_transaction_id)
    VALUES (?, ?, ?, ?, 'STOCK_IN', ?, ?, ?, 'N/A')
  `).run(generateId("STK"), productId, productName, qty, now.date, now.time, doneBy);
  recordAutomaticBackup(workspaceKey, "stock-in", doneBy);
}

function updateProductDetails(workspaceKey, { productId, name, productCode, unitPrice }) {
  const db = getWorkspaceDb(workspaceKey);
  const itemId = requireText(productId, "Product");
  const productName = requireText(name, "Product name");
  const code = optionalText(productCode);
  const price = requirePositiveNumber(unitPrice, "Unit price");
  const now = timestampNow();

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(itemId);
  if (!product) {
    throw createHttpError("Product not found.", 404);
  }

  const duplicateName = db.prepare("SELECT id FROM products WHERE LOWER(name) = LOWER(?) AND id != ?").get(productName, itemId);
  if (duplicateName) {
    throw createHttpError("Another product is already using that name.", 409);
  }

  if (code) {
    const duplicateCode = db.prepare("SELECT id FROM products WHERE product_code = ? AND id != ?").get(code, itemId);
    if (duplicateCode) {
      throw createHttpError("That product code is already assigned to another product.", 409);
    }
  }

  db.prepare(`
    UPDATE products
    SET name = ?, product_code = ?, unit_price = ?, updated_at = ?
    WHERE id = ?
  `).run(productName, code || null, price, now.iso, itemId);
  recordAutomaticBackup(workspaceKey, "product-update", "Inventory Control");
}

function adjustProductStock(workspaceKey, { productId, quantity, actionType, authorizedBy }) {
  const db = getWorkspaceDb(workspaceKey);
  const itemId = requireText(productId, "Product");
  const qty = requirePositiveInteger(quantity, "Quantity");
  const move = requireText(actionType, "Stock action").toUpperCase();
  const doneBy = optionalText(authorizedBy) || "System";
  const now = timestampNow();

  if (!["STOCK_IN", "STOCK_OUT"].includes(move)) {
    throw createHttpError("Stock action must be STOCK_IN or STOCK_OUT.", 400);
  }

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(itemId);
  if (!product) {
    throw createHttpError("Product not found.", 404);
  }

  if (move === "STOCK_OUT" && product.stock_quantity < qty) {
    throw createHttpError(`Cannot remove ${qty} units. Only ${product.stock_quantity} left in stock.`, 400);
  }

  const quantityDelta = move === "STOCK_IN" ? qty : -qty;

  db.prepare(`
    UPDATE products
    SET stock_quantity = stock_quantity + ?, updated_at = ?
    WHERE id = ?
  `).run(quantityDelta, now.iso, itemId);

  db.prepare(`
    INSERT INTO stock_records (id, product_id, product_name, quantity_changed, action_type, date, time, authorized_by, reference_transaction_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'MANUAL')
  `).run(generateId("STK"), itemId, product.name, qty, move, now.date, now.time, doneBy);
  recordAutomaticBackup(workspaceKey, `manual-${move.toLowerCase()}`, doneBy);
}

function listStockRecords(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
  return db.prepare(`
    SELECT id, product_name, quantity_changed, action_type, date, time, authorized_by, reference_transaction_id
    FROM stock_records
    ORDER BY date DESC, time DESC
  `).all().map((row) => ({
    id: row.id,
    productName: row.product_name,
    quantityChanged: row.quantity_changed,
    actionType: row.action_type,
    date: row.date,
    time: row.time,
    authorizedBy: row.authorized_by,
    referenceTransactionId: row.reference_transaction_id,
  }));
}

function listSales(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
  return db.prepare(`
    SELECT *
    FROM sales
    ORDER BY date DESC, time DESC
  `).all().map((row) => mapSale(workspaceKey, row));
}

function listCredits(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
  return db.prepare(`
    SELECT *
    FROM credits
    ORDER BY date DESC, time DESC
  `).all().map(mapCredit);
}

function listOpenCredits(workspaceKey) {
  return listCredits(workspaceKey).filter((credit) => credit.amountOwed > 0.0001);
}

function listUsers(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
  return db.prepare(`
    SELECT id, full_name, username, email, role, status, created_at, pin_hash, pin_salt
    FROM users
    ORDER BY created_at DESC
  `).all().map((row) => ({
    id: row.id,
    fullName: row.full_name,
    username: row.username,
    email: row.email,
    role: row.role,
    status: row.status || "ACTIVE",
    hasPin: Boolean(row.pin_hash && row.pin_salt),
    createdAt: row.created_at,
  }));
}

function listPaymentLedger(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
  return db.prepare(`
    SELECT reference_id, customer_name, source_type, payment_method, amount, confirmation_status, meta_json, date, time
    FROM payments
    ORDER BY date DESC, time DESC
  `).all().map((row) => ({
    referenceId: row.reference_id,
    customerName: row.customer_name,
    sourceType: row.source_type,
    paymentMethod: row.payment_method,
    amount: row.amount,
    confirmationStatus: row.confirmation_status,
    paymentMeta: parsePaymentMeta(row.meta_json),
    detailSummary: summarizePaymentDetail(row.payment_method, parsePaymentMeta(row.meta_json)),
    date: row.date,
    time: row.time,
  }));
}

function getDashboardSummary(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
  const today = timestampNow().date;
  return {
    productCount: scalarValue(db, "SELECT COUNT(*) AS value FROM products"),
    stockMovementCount: scalarValue(db, "SELECT COUNT(*) AS value FROM stock_records"),
    salesCount: scalarValue(db, "SELECT COUNT(*) AS value FROM sales"),
    openDebtCount: scalarValue(db, "SELECT COUNT(*) AS value FROM credits WHERE amount_owed > 0.0001"),
    todaySalesCount: scalarValue(db, "SELECT COUNT(*) AS value FROM sales WHERE date = ?", today),
    todaySalesValue: scalarValue(db, "SELECT COALESCE(SUM(total_amount), 0) AS value FROM sales WHERE date = ?", today),
    totalSalesValue: scalarValue(db, "SELECT COALESCE(SUM(total_amount), 0) AS value FROM sales"),
    totalCollected: scalarValue(db, "SELECT COALESCE(SUM(amount), 0) AS value FROM payments"),
    outstandingDebt: scalarValue(db, "SELECT COALESCE(SUM(amount_owed), 0) AS value FROM credits WHERE amount_owed > 0.0001"),
  };
}

function createSale(workspaceKey, { customerName, phoneNumber, processedBy, items, payments }) {
  const db = getWorkspaceDb(workspaceKey);
  if (!Array.isArray(items) || items.length === 0) {
    throw createHttpError("Add at least one product to the sale.", 400);
  }

  const cashier = optionalText(processedBy) || "Sales Desk";
  const customerPhone = optionalText(phoneNumber);
  const cartLines = [];
  let subTotal = 0;

  for (const item of items) {
    const productId = requireText(item.productId, "Product");
    const quantity = requirePositiveInteger(item.quantity, "Quantity");
    const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
    if (!product) {
      throw createHttpError("One of the selected products no longer exists.", 404);
    }
    if (product.stock_quantity < quantity) {
      throw createHttpError(`Insufficient stock for ${product.name}.`, 400);
    }
    const subtotal = product.unit_price * quantity;
    subTotal += subtotal;
    cartLines.push({
      productId: product.id,
      productName: product.name,
      quantity,
      unitPrice: product.unit_price,
      subtotal,
    });
  }

  const paidLines = buildPayments(workspaceKey, payments || []);
  const totalPaid = paidLines.reduce((sum, payment) => sum + payment.amount, 0);
  // Prices are VAT inclusive already, so reports only need the VAT part extracted out.
  const taxAmount = roundAmount(subTotal - (subTotal / (1 + VAT_RATE)));
  const totalAmount = roundAmount(subTotal);

  if (totalPaid + 0.0001 < totalAmount && !optionalText(customerName)) {
    throw createHttpError("Credit or partial payment requires a customer name.", 400);
  }

  const buyerName = optionalText(customerName) || "Walk-in Customer";
  const now = timestampNow();
  const saleId = generateId("TRX");
  const invoiceNumber = generateId("INV");
  const receiptNumber = generateId("RCT");
  const balance = Math.max(totalAmount - totalPaid, 0);
  const changeReturned = Math.max(totalPaid - totalAmount, 0);
  const status = totalPaid <= 0.0001 ? "CREDIT" : totalPaid + 0.0001 < totalAmount ? "PARTIAL" : "PAID";
  const paymentSummary = summarizePayments(paidLines);

  runInTransaction(db, () => {
    db.prepare(`
      INSERT INTO sales (
        id, invoice_number, receipt_number, customer_name, phone_number, total_amount, total_paid, balance, change_returned,
        tax_amount, status, payment_summary, processed_by, date, time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(saleId, invoiceNumber, receiptNumber, buyerName, customerPhone, totalAmount, totalPaid, balance, changeReturned,
      taxAmount, status, paymentSummary, cashier, now.date, now.time);

    const saleItemStatement = db.prepare(`
      INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const productUpdateStatement = db.prepare(`
      UPDATE products
      SET stock_quantity = stock_quantity - ?, updated_at = ?
      WHERE id = ?
    `);
    const stockRecordStatement = db.prepare(`
      INSERT INTO stock_records (id, product_id, product_name, quantity_changed, action_type, date, time, authorized_by, reference_transaction_id)
      VALUES (?, ?, ?, ?, 'STOCK_OUT', ?, ?, ?, ?)
    `);
    const paymentStatement = db.prepare(`
      INSERT INTO payments (id, sale_id, debt_payment_id, source_type, reference_id, customer_name, payment_method, amount, confirmation_status, meta_json, date, time)
      VALUES (?, ?, NULL, 'SALE', ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of cartLines) {
      saleItemStatement.run(saleId, item.productId, item.productName, item.quantity, item.unitPrice, item.subtotal);
      productUpdateStatement.run(item.quantity, now.iso, item.productId);
      stockRecordStatement.run(generateId("STK"), item.productId, item.productName, item.quantity, now.date, now.time,
        cashier, saleId);
    }

    for (const payment of paidLines) {
      paymentStatement.run(payment.id, saleId, saleId, buyerName, payment.paymentMethod, payment.amount,
        payment.confirmationStatus, JSON.stringify(payment.paymentMeta), now.date, now.time);
    }

    if (balance > 0.0001) {
      db.prepare(`
        INSERT INTO credits (id, customer_name, phone_number, transaction_id, amount_owed, original_amount, status, date, time)
        VALUES (?, ?, ?, ?, ?, ?, 'OUTSTANDING', ?, ?)
      `).run(generateId("CRD"), buyerName, customerPhone, saleId, balance, balance, now.date, now.time);
    }
  });

  recordAutomaticBackup(workspaceKey, "sale-completed", cashier);

  return {
    saleId,
    invoiceNumber,
    receiptNumber,
    customerName: buyerName,
    phoneNumber: customerPhone,
    subtotalAmount: subTotal,
    taxAmount,
    totalAmount,
    totalPaid,
    balance,
    changeReturned,
    status,
    paymentSummary,
    processedBy: cashier,
    date: now.date,
    time: now.time,
    items: cartLines,
    payments: paidLines,
  };
}

function createDebtPayment(workspaceKey, { customerName, payments }) {
  const db = getWorkspaceDb(workspaceKey);
  const customer = requireText(customerName, "Customer name");
  const paidLines = buildPayments(workspaceKey, payments || []);
  if (paidLines.length === 0) {
    throw createHttpError("Add at least one debt payment.", 400);
  }

  const openCredits = db.prepare(`
    SELECT *
    FROM credits
    WHERE LOWER(customer_name) = LOWER(?) AND amount_owed > 0.0001
    ORDER BY date ASC, time ASC
  `).all(customer);

  if (!openCredits.length) {
    throw createHttpError("No outstanding debt was found for that customer.", 404);
  }

  const now = timestampNow();
  const debtPaymentId = generateId("DTP");
  const totalPaid = paidLines.reduce((sum, payment) => sum + payment.amount, 0);
  let remainingDraft = totalPaid;
  let appliedAmount = 0;

  runInTransaction(db, () => {
    const updateCredit = db.prepare(`
      UPDATE credits
      SET amount_owed = ?, status = ?
      WHERE id = ?
    `);
    const paymentStatement = db.prepare(`
      INSERT INTO payments (id, sale_id, debt_payment_id, source_type, reference_id, customer_name, payment_method, amount, confirmation_status, meta_json, date, time)
      VALUES (?, NULL, ?, 'DEBT_PAYMENT', ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const credit of openCredits) {
      if (remainingDraft <= 0.0001) {
        break;
      }
      const applied = Math.min(credit.amount_owed, remainingDraft);
      const nextAmount = credit.amount_owed - applied;
      appliedAmount += applied;
      remainingDraft -= applied;
      updateCredit.run(nextAmount, nextAmount > 0.0001 ? "PARTIAL" : "CLEARED", credit.id);
    }

    const remainingDebt = scalarValue(db, `
      SELECT COALESCE(SUM(amount_owed), 0) AS value
      FROM credits
      WHERE LOWER(customer_name) = LOWER(?)
    `, customer);

    db.prepare(`
      INSERT INTO debt_payments (id, customer_name, total_paid, applied_amount, remaining_debt, change_returned, date, time)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(debtPaymentId, customer, totalPaid, appliedAmount, remainingDebt, Math.max(totalPaid - appliedAmount, 0),
      now.date, now.time);

    for (const payment of paidLines) {
      paymentStatement.run(payment.id, debtPaymentId, debtPaymentId, customer, payment.paymentMethod, payment.amount,
        payment.confirmationStatus, JSON.stringify(payment.paymentMeta), now.date, now.time);
    }
  });

  recordAutomaticBackup(workspaceKey, "debt-payment", customer);

  const remainingDebt = scalarValue(db, `
    SELECT COALESCE(SUM(amount_owed), 0) AS value
    FROM credits
    WHERE LOWER(customer_name) = LOWER(?)
  `, customer);

  return {
    debtPaymentId,
    customerName: customer,
    totalPaid,
    appliedAmount,
    remainingDebt,
    changeReturned: Math.max(totalPaid - appliedAmount, 0),
    date: now.date,
    time: now.time,
    status: remainingDebt > 0.0001 ? "DEBT PARTIAL" : "DEBT CLEARED",
    payments: paidLines,
  };
}

function buildAccountingSummary(workspaceKey) {
  const db = getWorkspaceDb(workspaceKey);
  const paymentBreakdown = db.prepare(`
    SELECT payment_method, COALESCE(SUM(amount), 0) AS total
    FROM payments
    GROUP BY payment_method
    ORDER BY payment_method ASC
  `).all().map((row) => ({
    paymentMethod: row.payment_method,
    total: row.total,
  }));

  return {
    businessName: getBusinessName(workspaceKey),
    salesCount: scalarValue(db, "SELECT COUNT(*) AS value FROM sales"),
    totalSalesValue: scalarValue(db, "SELECT COALESCE(SUM(total_amount), 0) AS value FROM sales"),
    totalPaidReceived: scalarValue(db, "SELECT COALESCE(SUM(amount), 0) AS value FROM payments"),
    collectedDuringSales: scalarValue(db, "SELECT COALESCE(SUM(total_paid), 0) AS value FROM sales"),
    totalCreditSold: scalarValue(db, "SELECT COALESCE(SUM(balance), 0) AS value FROM sales WHERE balance > 0.0001"),
    outstandingDebt: scalarValue(db, "SELECT COALESCE(SUM(amount_owed), 0) AS value FROM credits WHERE amount_owed > 0.0001"),
    paymentBreakdown,
  };
}

function buildReport(workspaceKey, kind, date) {
  const db = getWorkspaceDb(workspaceKey);
  const today = optionalText(date) || timestampNow().date;
  const range = reportRange(kind, today);
  const sales = db.prepare(`
    SELECT *
    FROM sales
    WHERE date BETWEEN ? AND ?
    ORDER BY date DESC, time DESC
  `).all(range.start, range.end).map((row) => mapSale(workspaceKey, row));
  const credits = db.prepare(`
    SELECT *
    FROM credits
    WHERE date BETWEEN ? AND ?
    ORDER BY date DESC, time DESC
  `).all(range.start, range.end).map(mapCredit);
  const stock = db.prepare(`
    SELECT *
    FROM stock_records
    WHERE date BETWEEN ? AND ?
    ORDER BY date DESC, time DESC
  `).all(range.start, range.end);
  const paymentBreakdown = db.prepare(`
    SELECT payment_method, COALESCE(SUM(amount), 0) AS total
    FROM payments
    WHERE date BETWEEN ? AND ?
    GROUP BY payment_method
    ORDER BY payment_method ASC
  `).all(range.start, range.end).map((row) => ({
    paymentMethod: row.payment_method,
    total: row.total,
  }));
  const productTotals = new Map();

  for (const sale of sales) {
    for (const item of sale.items) {
      productTotals.set(item.productName, (productTotals.get(item.productName) || 0) + item.quantity);
    }
  }

  const mostSoldProducts = [...productTotals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 5)
    .map(([productName, quantity]) => ({ productName, quantity }));

  return {
    reportId: generateId("RPT"),
    reportType: kind.toUpperCase(),
    title: `${kind.toUpperCase()} REPORT`,
    businessName: getBusinessName(workspaceKey),
    dateOrRange: range.label,
    totalSales: roundAmount(sales.reduce((sum, sale) => sum + sale.totalAmount, 0)),
    totalPaid: roundAmount(sales.reduce((sum, sale) => sum + sale.totalPaid, 0)),
    totalCredit: roundAmount(credits.reduce((sum, credit) => sum + credit.originalAmount, 0)),
    outstandingDebt: roundAmount(credits.reduce((sum, credit) => sum + credit.amountOwed, 0)),
    paymentBreakdown,
    mostSoldProducts,
    stockMovement: {
      stockIn: stock.filter((record) => record.action_type === "STOCK_IN").length,
      stockOut: stock.filter((record) => record.action_type === "STOCK_OUT").length,
      records: stock.map((record) => ({
        id: record.id,
        productName: record.product_name,
        quantityChanged: record.quantity_changed,
        actionType: record.action_type,
        date: record.date,
        time: record.time,
        authorizedBy: record.authorized_by,
        referenceTransactionId: record.reference_transaction_id,
      })),
    },
    sales,
    credits,
    preparedBy: "System",
    authorizedBy: "Owner / Manager",
    signaturePlaceholder: "__________________",
  };
}

function reportRange(kind, date) {
  const reportKind = requireText(kind, "Report type").toLowerCase();
  if (reportKind === "weekly") {
    return {
      start: startOfWeek(date),
      end: endOfWeek(date),
      label: `${startOfWeek(date)} to ${endOfWeek(date)}`,
    };
  }
  if (reportKind === "monthly") {
    return {
      start: startOfMonth(date),
      end: endOfMonth(date),
      label: `${startOfMonth(date)} to ${endOfMonth(date)}`,
    };
  }
  if (reportKind === "annual") {
    return {
      start: startOfYear(date),
      end: endOfYear(date),
      label: `${startOfYear(date)} to ${endOfYear(date)}`,
    };
  }
  return {
    start: date,
    end: date,
    label: date,
  };
}

function buildPayments(workspaceKey, inputPayments) {
  const allowedMethods = getAllowedPaymentMethods(workspaceKey);
  return inputPayments.map((payment) => {
    const paymentMethod = normalizePaymentMethod(payment.paymentMethod);
    if (!allowedMethods.includes(paymentMethod)) {
      throw createHttpError(`${paymentMethod} is not enabled for this business.`, 400);
    }
    const amount = requirePositiveNumber(payment.amount, "Payment amount");
    const route = getPaymentRoute(workspaceKey, paymentMethod) || {};
    const paymentMeta = sanitizePaymentMeta(paymentMethod, {
      ...route,
      ...payment,
      targetNumber: payment.targetNumber || route.targetNumber,
    });
    const approvalMode = paymentMeta.approvalMode || defaultApprovalMode(paymentMethod);
    return {
      id: generateId("PAY"),
      paymentMethod,
      amount,
      confirmationStatus: paymentMethod === "Cash" ? "CONFIRMED" : `${approvalMode.toUpperCase()} APPROVED (SIMULATED)`,
      paymentMeta,
      detailSummary: summarizePaymentDetail(paymentMethod, paymentMeta),
      messages: buildPaymentMessages(paymentMethod, amount, paymentMeta),
    };
  });
}

function mapSale(workspaceKey, row) {
  const db = getWorkspaceDb(workspaceKey);
  const items = db.prepare(`
    SELECT product_id, product_name, quantity, unit_price, subtotal
    FROM sale_items
    WHERE sale_id = ?
  `).all(row.id).map((item) => ({
    productId: item.product_id,
    productName: item.product_name,
    quantity: item.quantity,
    unitPrice: item.unit_price,
    subtotal: item.subtotal,
  }));

  const payments = db.prepare(`
    SELECT payment_method, amount, confirmation_status, source_type, meta_json
    FROM payments
    WHERE sale_id = ?
    ORDER BY rowid ASC
  `).all(row.id).map((payment) => ({
    paymentMethod: payment.payment_method,
    amount: payment.amount,
    confirmationStatus: payment.confirmation_status,
    sourceType: payment.source_type,
    paymentMeta: parsePaymentMeta(payment.meta_json),
    detailSummary: summarizePaymentDetail(payment.payment_method, parsePaymentMeta(payment.meta_json)),
    messages: buildPaymentMessages(payment.payment_method, payment.amount, parsePaymentMeta(payment.meta_json)),
  }));

  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    receiptNumber: row.receipt_number,
    customerName: row.customer_name,
    phoneNumber: row.phone_number,
    subtotalAmount: roundAmount(items.reduce((sum, item) => sum + item.subtotal, 0)),
    taxAmount: row.tax_amount || 0,
    totalAmount: row.total_amount,
    totalPaid: row.total_paid,
    balance: row.balance,
    changeReturned: row.change_returned,
    status: row.status,
    paymentSummary: row.payment_summary,
    processedBy: row.processed_by,
    date: row.date,
    time: row.time,
    items,
    payments,
  };
}

function mapCredit(row) {
  return {
    id: row.id,
    customerName: row.customer_name,
    phoneNumber: row.phone_number,
    transactionId: row.transaction_id,
    amountOwed: row.amount_owed,
    originalAmount: row.original_amount,
    status: row.status,
    date: row.date,
    time: row.time,
  };
}

function parsePaymentMeta(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function runInTransaction(db, action) {
  db.exec("BEGIN");
  try {
    action();
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

module.exports = {
  addOrStockInProduct,
  adjustProductStock,
  buildAccountingSummary,
  buildReport,
  createDebtPayment,
  createSale,
  getDashboardSummary,
  listCredits,
  listOpenCredits,
  listPaymentLedger,
  listProducts,
  listSales,
  listStockRecords,
  listUsers,
  updateProductDetails,
};
