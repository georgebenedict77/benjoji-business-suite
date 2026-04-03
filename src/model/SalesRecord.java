package model;

import util.InputValidator;

public class SalesRecord {
    private final String salesRecordId;
    private final String transactionId;
    private final String customerName;
    private final double totalAmount;
    private final double totalPaid;
    private final double balance;
    private final String paymentSummary;
    private final String status;
    private final String date;
    private final String time;

    public SalesRecord(String salesRecordId, String transactionId, String customerName, double totalAmount, double totalPaid,
            double balance, String paymentSummary, String status, String date, String time) {
        this.salesRecordId = InputValidator.requireNonBlank(salesRecordId, "Sales record ID");
        this.transactionId = InputValidator.requireNonBlank(transactionId, "Transaction ID");
        this.customerName = InputValidator.requireNonBlank(customerName, "Customer name");
        this.totalAmount = totalAmount;
        this.totalPaid = totalPaid;
        this.balance = balance;
        this.paymentSummary = InputValidator.requireNonBlank(paymentSummary, "Payment summary");
        this.status = InputValidator.requireNonBlank(status, "Sales status");
        this.date = InputValidator.requireNonBlank(date, "Sales date");
        this.time = InputValidator.requireNonBlank(time, "Sales time");
    }

    public String getSalesRecordId() {
        return salesRecordId;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public String getCustomerName() {
        return customerName;
    }

    public double getTotalAmount() {
        return totalAmount;
    }

    public double getTotalPaid() {
        return totalPaid;
    }

    public double getBalance() {
        return balance;
    }

    public String getPaymentSummary() {
        return paymentSummary;
    }

    public String getStatus() {
        return status;
    }

    public String getDate() {
        return date;
    }

    public String getTime() {
        return time;
    }
}

