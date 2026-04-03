package ui;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import model.CreditRecord;
import model.Invoice;
import model.Payment;
import model.Product;
import model.Receipt;
import model.Report;
import model.SaleItem;
import model.SalesRecord;
import model.StockRecord;
import model.Transaction;
import service.AccountingService;
import service.AuthorizationService;
import service.CreditService;
import service.InventoryService;
import service.PaymentService;
import service.PaymentService.PaymentLedgerEntry;
import service.ReceiptService;
import service.ReportService;
import service.SalesService;
import util.DateTimeUtil;
import util.Formatter;
import util.InputValidator;

public class DesktopAppController {
    private final String businessName;
    private final InventoryService inventoryService = new InventoryService();
    private final SalesService salesService = new SalesService();
    private final PaymentService paymentService = new PaymentService();
    private final CreditService creditService = new CreditService();
    private final ReceiptService receiptService = new ReceiptService();
    private final ReportService reportService = new ReportService();
    private final AccountingService accountingService = new AccountingService();
    private final AuthorizationService authorizationService = new AuthorizationService();

    public DesktopAppController(String businessName) {
        this.businessName = InputValidator.requireNonBlank(businessName, "Business name");
    }

    public String getBusinessName() {
        return businessName;
    }

    public List<String> getSupportedPaymentMethods() {
        return paymentService.getSupportedPaymentMethods();
    }

    public List<Product> getProducts() {
        return inventoryService.getProducts();
    }

    public List<StockRecord> getStockRecords() {
        return inventoryService.getStockRecords();
    }

    public List<SalesRecord> getSalesRecords() {
        return salesService.getSalesRecords();
    }

    public List<CreditRecord> getCreditRecords() {
        return creditService.getCreditRecords();
    }

    public List<CreditRecord> getOpenCreditRecords() {
        return creditService.getOpenCreditRecords();
    }

    public List<PaymentLedgerEntry> getPaymentLedgerEntries() {
        return paymentService.getPaymentLedgerEntries();
    }

    public Product addOrStockInProduct(String productName, double unitPrice, int quantity, String authorizedBy) {
        return inventoryService.addOrStockInProduct(productName, unitPrice, quantity, authorizedBy);
    }

    public DashboardSummary getDashboardSummary() {
        double totalSalesValue = salesService.getSalesRecords().stream().mapToDouble(SalesRecord::getTotalAmount).sum();
        double totalCollected = paymentService.getPaymentLedgerEntries().stream().mapToDouble(PaymentLedgerEntry::getAmount).sum();
        double outstandingDebt = creditService.getCreditRecords().stream().filter(CreditRecord::hasOutstandingBalance)
                .mapToDouble(CreditRecord::getAmountOwed).sum();

        return new DashboardSummary(inventoryService.getProducts().size(), inventoryService.getStockRecords().size(),
                salesService.getSalesRecords().size(), creditService.getOpenCreditRecords().size(), totalSalesValue, totalCollected,
                outstandingDebt);
    }

    public SaleResult processSale(String customerName, String phoneNumber, String processedBy, List<SaleInput> saleInputs,
            List<PaymentInput> paymentInputs) {
        if (saleInputs == null || saleInputs.isEmpty()) {
            throw new IllegalArgumentException("Add at least one product to the sale.");
        }

        List<SaleItem> saleItems = new ArrayList<>();
        for (SaleInput input : saleInputs) {
            Product product = inventoryService.findProductByName(input.productName())
                    .orElseThrow(() -> new IllegalArgumentException("Product not found: " + input.productName()));
            saleItems.add(salesService.createSaleItem(product, input.quantity()));
        }

        double totalDue = saleItems.stream().mapToDouble(SaleItem::getSubtotal).sum();
        double totalPaid = paymentInputs == null ? 0.0 : paymentInputs.stream().mapToDouble(PaymentInput::amount).sum();
        if (totalPaid + 0.0001 < totalDue && InputValidator.isBlank(customerName)) {
            throw new IllegalArgumentException("Credit or partial payment requires a customer name.");
        }

        Invoice invoice = salesService.createInvoice(businessName, customerName, saleItems);
        List<Payment> payments = createPayments(paymentInputs);
        Transaction transaction = paymentService.finalizeTransaction(invoice, payments);
        inventoryService.reduceStockForSale(invoice.getSaleItems(), InputValidator.isBlank(processedBy) ? "Sales Desk" : processedBy,
                transaction.getTransactionId());
        salesService.recordSale(transaction, paymentService.buildPaymentSummary(transaction.getPayments()));

        CreditRecord createdCreditRecord = null;
        if (transaction.getBalanceRemaining() > 0.0001) {
            createdCreditRecord = creditService.createCreditRecord(invoice.getCustomerName(), phoneNumber, transaction.getTransactionId(),
                    transaction.getBalanceRemaining());
        }

        Receipt receipt = receiptService.generateSaleReceipt(businessName, transaction);
        String details = buildSaleDetails(invoice, payments, receipt, createdCreditRecord);
        return new SaleResult(transaction, receipt, createdCreditRecord, details);
    }

    public DebtPaymentResult settleDebt(String customerName, List<PaymentInput> paymentInputs) {
        if (paymentInputs == null || paymentInputs.isEmpty()) {
            throw new IllegalArgumentException("Add at least one payment entry.");
        }

        List<Payment> payments = createPayments(paymentInputs);
        CreditService.DebtPaymentResult result = creditService.processDebtPayment(customerName, payments.stream().mapToDouble(Payment::getAmount).sum());
        Receipt receipt = receiptService.generateDebtPaymentReceipt(businessName, result.getCustomer().getCustomerName(), payments,
                result.getAppliedAmount(), result.getRemainingDebt(), result.getChangeReturned());
        paymentService.recordDebtPayment(result.getCustomer().getCustomerName(), receipt.getTransactionId(), payments);

        StringBuilder builder = new StringBuilder();
        appendPaymentMessages(builder, payments);
        if (builder.length() > 0) {
            builder.append(System.lineSeparator());
        }
        builder.append(receiptService.formatReceipt(receipt));
        return new DebtPaymentResult(receipt, result.getRemainingDebt(), builder.toString());
    }

    public String generateDailyReport(LocalDate targetDate, String preparedBy, String authorizedBy) {
        LocalDate safeDate = targetDate == null ? DateTimeUtil.currentDate() : targetDate;
        Report report = reportService.generateDailySalesReport(businessName, safeDate, salesService.getSalesRecords(),
                creditService.getCreditRecords(), paymentService.getPaymentLedgerEntries(),
                authorizationService.resolvePreparedBy(preparedBy), authorizationService.resolveAuthorizedBy(authorizedBy),
                authorizationService.signaturePlaceholder());
        return reportService.formatReport(report, safeDate, safeDate, inventoryService.getStockRecords());
    }

    public String generateWeeklyReport(LocalDate anchorDate, String preparedBy, String authorizedBy) {
        LocalDate safeDate = anchorDate == null ? DateTimeUtil.currentDate() : anchorDate;
        LocalDate startDate = DateTimeUtil.startOfWeek(safeDate);
        LocalDate endDate = DateTimeUtil.endOfWeek(safeDate);
        Report report = reportService.generateWeeklySalesReport(businessName, safeDate, salesService.getSalesRecords(),
                creditService.getCreditRecords(), paymentService.getPaymentLedgerEntries(),
                authorizationService.resolvePreparedBy(preparedBy), authorizationService.resolveAuthorizedBy(authorizedBy),
                authorizationService.signaturePlaceholder());
        return reportService.formatReport(report, startDate, endDate, inventoryService.getStockRecords());
    }

    public String generateAccountingSummary() {
        return accountingService.generateAccountingSummary(businessName, salesService.getSalesRecords(), creditService.getCreditRecords(),
                paymentService.getPaymentLedgerEntries());
    }

    private List<Payment> createPayments(List<PaymentInput> paymentInputs) {
        List<Payment> payments = new ArrayList<>();
        if (paymentInputs == null) {
            return payments;
        }

        for (PaymentInput input : paymentInputs) {
            payments.add(paymentService.createPayment(input.paymentMethod(), input.amount()));
        }
        return payments;
    }

    private String buildSaleDetails(Invoice invoice, List<Payment> payments, Receipt receipt, CreditRecord createdCreditRecord) {
        StringBuilder builder = new StringBuilder();
        builder.append(formatInvoice(invoice)).append(System.lineSeparator()).append(System.lineSeparator());
        appendPaymentMessages(builder, payments);
        if (!payments.isEmpty()) {
            builder.append(System.lineSeparator()).append(System.lineSeparator());
        }
        builder.append(receiptService.formatReceipt(receipt));
        if (createdCreditRecord != null) {
            builder.append(System.lineSeparator()).append(System.lineSeparator())
                    .append("Credit record created for ")
                    .append(createdCreditRecord.getCustomer().getCustomerName())
                    .append(" with outstanding balance ")
                    .append(Formatter.currency(createdCreditRecord.getAmountOwed()))
                    .append(".");
        }
        return builder.toString();
    }

    private void appendPaymentMessages(StringBuilder builder, List<Payment> payments) {
        boolean firstMessage = true;
        for (Payment payment : payments) {
            for (String message : paymentService.buildPaymentProcessingMessages(payment.getPaymentMethod(), payment.getAmount())) {
                if (!firstMessage) {
                    builder.append(System.lineSeparator());
                }
                builder.append(message);
                firstMessage = false;
            }
        }
    }

    private String formatInvoice(Invoice invoice) {
        StringBuilder builder = new StringBuilder();
        builder.append(Formatter.line()).append(System.lineSeparator());
        builder.append("INVOICE: ").append(invoice.getInvoiceNumber()).append(System.lineSeparator());
        builder.append("Business: ").append(invoice.getBusinessName()).append(System.lineSeparator());
        builder.append("Customer: ").append(invoice.getCustomerName()).append(System.lineSeparator());
        builder.append("Date: ").append(invoice.getDate()).append(" ").append(invoice.getTime()).append(System.lineSeparator());
        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        for (SaleItem item : invoice.getSaleItems()) {
            builder.append("- ").append(item.getProduct().getProductName()).append(" x").append(item.getQuantity()).append(" @ ")
                    .append(Formatter.currency(item.getProduct().getUnitPrice())).append(" = ")
                    .append(Formatter.currency(item.getSubtotal())).append(System.lineSeparator());
        }
        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append("Total Due: ").append(Formatter.currency(invoice.getTotalAmount())).append(System.lineSeparator());
        builder.append(Formatter.line());
        return builder.toString();
    }

    public record SaleInput(String productName, int quantity) {
    }

    public record PaymentInput(String paymentMethod, double amount) {
    }

    public record DashboardSummary(int productCount, int stockMovementCount, int salesCount, int openDebtCount, double totalSalesValue,
            double totalCollected, double outstandingDebt) {
    }

    public record SaleResult(Transaction transaction, Receipt receipt, CreditRecord createdCreditRecord, String detailText) {
    }

    public record DebtPaymentResult(Receipt receipt, double remainingDebt, String detailText) {
    }
}
