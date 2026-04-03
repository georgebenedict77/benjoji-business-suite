package service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import model.Invoice;
import model.Payment;
import model.Transaction;
import util.DateTimeUtil;
import util.Formatter;
import util.IDGenerator;
import util.InputValidator;

public class PaymentService {
    private static final List<String> SUPPORTED_PAYMENT_METHODS = List.of("Cash", "M-Pesa", "Buy Goods", "Paybill", "Airtel Money",
            "Card", "Bank Transfer");

    private final List<Transaction> transactions = new ArrayList<>();
    private final List<PaymentLedgerEntry> paymentLedgerEntries = new ArrayList<>();

    public List<String> getSupportedPaymentMethods() {
        return SUPPORTED_PAYMENT_METHODS;
    }

    public boolean isSupportedPaymentMethod(String paymentMethod) {
        if (InputValidator.isBlank(paymentMethod)) {
            return false;
        }
        return SUPPORTED_PAYMENT_METHODS.stream().anyMatch(method -> method.equalsIgnoreCase(paymentMethod.trim()));
    }

    public Payment createPayment(String paymentMethod, double amount) {
        String normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
        return new Payment(IDGenerator.generate("PAY"), normalizedPaymentMethod, amount, confirmationStatusFor(normalizedPaymentMethod));
    }

    public Transaction finalizeTransaction(Invoice invoice, List<Payment> payments) {
        if (invoice == null) {
            throw new IllegalArgumentException("Invoice is required.");
        }

        List<Payment> safePayments = payments == null ? List.of() : payments;
        double totalPaid = safePayments.stream().mapToDouble(Payment::getAmount).sum();
        double totalDue = invoice.getTotalAmount();
        double balanceRemaining = Math.max(totalDue - totalPaid, 0.0);
        double changeReturned = Math.max(totalPaid - totalDue, 0.0);

        Transaction transaction = new Transaction(IDGenerator.generate("TRX"), invoice, safePayments, totalDue, totalPaid,
                balanceRemaining, changeReturned, determineStatus(totalPaid, totalDue), DateTimeUtil.currentDateString(),
                DateTimeUtil.currentTimeString());
        transactions.add(transaction);
        recordLedgerEntries("SALE", transaction.getTransactionId(), invoice.getCustomerName(), transaction.getPayments(),
                transaction.getDate(), transaction.getTime());
        return transaction;
    }

    public List<Transaction> getTransactions() {
        return Collections.unmodifiableList(transactions);
    }

    public List<PaymentLedgerEntry> getPaymentLedgerEntries() {
        return Collections.unmodifiableList(paymentLedgerEntries);
    }

    public String buildPaymentSummary(List<Payment> payments) {
        if (payments == null || payments.isEmpty()) {
            return "No payment received";
        }
        Map<String, Double> paymentTotals = new LinkedHashMap<>();
        for (Payment payment : payments) {
            paymentTotals.merge(payment.getPaymentMethod(), payment.getAmount(), Double::sum);
        }
        StringBuilder builder = new StringBuilder();
        boolean first = true;
        for (Map.Entry<String, Double> entry : paymentTotals.entrySet()) {
            if (!first) {
                builder.append(" | ");
            }
            builder.append(entry.getKey()).append(": ").append(Formatter.currency(entry.getValue()));
            first = false;
        }
        return builder.toString();
    }

    public List<String> buildPaymentProcessingMessages(String paymentMethod, double amount) {
        String normalizedPaymentMethod = normalizePaymentMethod(paymentMethod);
        String formattedAmount = Formatter.currency(amount);

        if ("Cash".equalsIgnoreCase(normalizedPaymentMethod)) {
            return List.of("Cash received: " + formattedAmount, "Cash payment confirmed.");
        }

        if ("Card".equalsIgnoreCase(normalizedPaymentMethod)) {
            return List.of("Initiating card approval for " + formattedAmount + "...", "Waiting for card confirmation...",
                    "Card payment confirmed.");
        }

        return List.of("Processing " + normalizedPaymentMethod + " payment for " + formattedAmount + "...",
                "Waiting for confirmation...", normalizedPaymentMethod + " payment confirmed.");
    }

    public void recordDebtPayment(String customerName, String referenceId, List<Payment> payments) {
        String safeCustomer = InputValidator.isBlank(customerName) ? "Customer" : customerName.trim();
        recordLedgerEntries("DEBT_PAYMENT", referenceId, safeCustomer, payments, DateTimeUtil.currentDateString(),
                DateTimeUtil.currentTimeString());
    }

    private String normalizePaymentMethod(String paymentMethod) {
        String safeMethod = InputValidator.requireNonBlank(paymentMethod, "Payment method");
        return SUPPORTED_PAYMENT_METHODS.stream().filter(method -> method.equalsIgnoreCase(safeMethod.trim())).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Unsupported payment method: " + safeMethod));
    }

    private String confirmationStatusFor(String paymentMethod) {
        return "Cash".equalsIgnoreCase(paymentMethod) ? "CONFIRMED" : "CONFIRMED (SIMULATED)";
    }

    private String determineStatus(double totalPaid, double totalDue) {
        if (totalPaid <= 0.0001) {
            return "CREDIT";
        }
        if (totalPaid + 0.0001 < totalDue) {
            return "PARTIAL";
        }
        return "PAID";
    }

    private void recordLedgerEntries(String sourceType, String referenceId, String customerName, List<Payment> payments, String date,
            String time) {
        if (payments == null) {
            return;
        }

        for (Payment payment : payments) {
            paymentLedgerEntries.add(new PaymentLedgerEntry(IDGenerator.generate("LED"), sourceType, referenceId, customerName,
                    payment.getPaymentMethod(), payment.getAmount(), date, time));
        }
    }

    public static class PaymentLedgerEntry {
        private final String ledgerEntryId;
        private final String sourceType;
        private final String referenceId;
        private final String customerName;
        private final String paymentMethod;
        private final double amount;
        private final String date;
        private final String time;

        public PaymentLedgerEntry(String ledgerEntryId, String sourceType, String referenceId, String customerName, String paymentMethod,
                double amount, String date, String time) {
            this.ledgerEntryId = ledgerEntryId;
            this.sourceType = sourceType;
            this.referenceId = referenceId;
            this.customerName = customerName;
            this.paymentMethod = paymentMethod;
            this.amount = amount;
            this.date = date;
            this.time = time;
        }

        public String getLedgerEntryId() {
            return ledgerEntryId;
        }

        public String getSourceType() {
            return sourceType;
        }

        public String getReferenceId() {
            return referenceId;
        }

        public String getCustomerName() {
            return customerName;
        }

        public String getPaymentMethod() {
            return paymentMethod;
        }

        public double getAmount() {
            return amount;
        }

        public String getDate() {
            return date;
        }

        public String getTime() {
            return time;
        }
    }
}
