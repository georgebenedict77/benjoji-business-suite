package service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

import model.CreditRecord;
import model.Customer;
import util.DateTimeUtil;
import util.Formatter;
import util.IDGenerator;
import util.InputValidator;

public class CreditService {
    private final List<CreditRecord> creditRecords = new ArrayList<>();
    private final Map<String, Customer> customersByName = new LinkedHashMap<>();

    public CreditRecord createCreditRecord(String customerName, String phoneNumber, String transactionId, double amountOwed) {
        String normalizedName = InputValidator.requireNonBlank(customerName, "Customer name");
        String key = customerKey(normalizedName);
        Customer customer = customersByName.computeIfAbsent(key,
                unused -> new Customer(IDGenerator.generate("CUS"), normalizedName, phoneNumber));

        if (InputValidator.isBlank(customer.getPhoneNumber()) && !InputValidator.isBlank(phoneNumber)) {
            customer.setPhoneNumber(phoneNumber);
        }

        customer.addDebt(amountOwed);
        CreditRecord record = new CreditRecord(IDGenerator.generate("CRD"), customer, transactionId, amountOwed,
                DateTimeUtil.currentDateString(), DateTimeUtil.currentTimeString(), "OUTSTANDING");
        creditRecords.add(record);
        return record;
    }

    public Optional<Customer> findCustomerByName(String customerName) {
        if (InputValidator.isBlank(customerName)) {
            return Optional.empty();
        }
        return Optional.ofNullable(customersByName.get(customerKey(customerName)));
    }

    public List<CreditRecord> getCreditRecords() {
        return Collections.unmodifiableList(creditRecords);
    }

    public List<CreditRecord> getOpenCreditRecords() {
        return creditRecords.stream().filter(CreditRecord::hasOutstandingBalance).toList();
    }

    public DebtPaymentResult processDebtPayment(String customerName, double amountPaid) {
        Customer customer = findCustomerByName(customerName)
                .orElseThrow(() -> new IllegalArgumentException("Customer debt record not found."));

        if (customer.getOutstandingDebt() <= 0.0001) {
            throw new IllegalArgumentException(customer.getCustomerName() + " has no outstanding debt.");
        }

        double paymentRemaining = InputValidator.requirePositiveAmount(amountPaid, "Debt payment");
        List<CreditRecord> affectedRecords = new ArrayList<>();

        for (CreditRecord record : creditRecords) {
            if (!record.getCustomer().getCustomerId().equals(customer.getCustomerId()) || !record.hasOutstandingBalance()) {
                continue;
            }

            double appliedAmount = record.applyPayment(paymentRemaining);
            if (appliedAmount > 0) {
                customer.settleDebt(appliedAmount);
                paymentRemaining -= appliedAmount;
                affectedRecords.add(record);
            }

            if (paymentRemaining <= 0.0001) {
                break;
            }
        }

        double appliedAmount = amountPaid - paymentRemaining;
        return new DebtPaymentResult(customer, appliedAmount, customer.getOutstandingDebt(), paymentRemaining,
                Collections.unmodifiableList(affectedRecords));
    }

    public String formatCreditRecords() {
        if (creditRecords.isEmpty()) {
            return "No credit records available yet.";
        }

        StringBuilder builder = new StringBuilder();
        builder.append(Formatter.line()).append(System.lineSeparator());
        builder.append("CREDIT RECORDS").append(System.lineSeparator());
        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append(String.format("%-16s %-20s %-18s %-14s %-12s%n", "Credit ID", "Customer", "Transaction", "Amount Owed",
                "Status"));
        builder.append(Formatter.shortLine()).append(System.lineSeparator());

        for (CreditRecord record : creditRecords) {
            builder.append(String.format("%-16s %-20s %-18s %-14s %-12s%n", Formatter.truncate(record.getCreditId(), 16),
                    Formatter.truncate(record.getCustomer().getCustomerName(), 20), Formatter.truncate(record.getTransactionId(), 18),
                    Formatter.currency(record.getAmountOwed()), Formatter.truncate(record.getStatus(), 12)));
        }

        builder.append(Formatter.line());
        return builder.toString();
    }

    public String formatOpenCreditRecords() {
        List<CreditRecord> openRecords = getOpenCreditRecords();
        if (openRecords.isEmpty()) {
            return "No outstanding customer debts.";
        }

        StringBuilder builder = new StringBuilder();
        builder.append(Formatter.line()).append(System.lineSeparator());
        builder.append("OUTSTANDING CUSTOMER DEBTS").append(System.lineSeparator());
        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append(String.format("%-16s %-20s %-18s %-14s %-12s%n", "Credit ID", "Customer", "Transaction", "Amount Owed",
                "Status"));
        builder.append(Formatter.shortLine()).append(System.lineSeparator());

        for (CreditRecord record : openRecords) {
            builder.append(String.format("%-16s %-20s %-18s %-14s %-12s%n", Formatter.truncate(record.getCreditId(), 16),
                    Formatter.truncate(record.getCustomer().getCustomerName(), 20), Formatter.truncate(record.getTransactionId(), 18),
                    Formatter.currency(record.getAmountOwed()), Formatter.truncate(record.getStatus(), 12)));
        }

        builder.append(Formatter.line());
        return builder.toString();
    }

    private String customerKey(String customerName) {
        return customerName.trim().toLowerCase(Locale.US);
    }

    public static class DebtPaymentResult {
        private final Customer customer;
        private final double appliedAmount;
        private final double remainingDebt;
        private final double changeReturned;
        private final List<CreditRecord> affectedRecords;

        public DebtPaymentResult(Customer customer, double appliedAmount, double remainingDebt, double changeReturned,
                List<CreditRecord> affectedRecords) {
            this.customer = customer;
            this.appliedAmount = appliedAmount;
            this.remainingDebt = remainingDebt;
            this.changeReturned = changeReturned;
            this.affectedRecords = affectedRecords;
        }

        public Customer getCustomer() {
            return customer;
        }

        public double getAppliedAmount() {
            return appliedAmount;
        }

        public double getRemainingDebt() {
            return remainingDebt;
        }

        public double getChangeReturned() {
            return changeReturned;
        }

        public List<CreditRecord> getAffectedRecords() {
            return affectedRecords;
        }
    }
}

