package model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import util.InputValidator;

public class Transaction {
    private final String transactionId;
    private final Invoice invoice;
    private final List<Payment> payments;
    private final double totalDue;
    private final double totalPaid;
    private final double balanceRemaining;
    private final double changeReturned;
    private final String status;
    private final String date;
    private final String time;

    public Transaction(String transactionId, Invoice invoice, List<Payment> payments, double totalDue, double totalPaid,
            double balanceRemaining, double changeReturned, String status, String date, String time) {
        this.transactionId = InputValidator.requireNonBlank(transactionId, "Transaction ID");
        if (invoice == null) {
            throw new IllegalArgumentException("Invoice is required.");
        }
        this.invoice = invoice;
        this.payments = payments == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(payments));
        this.totalDue = totalDue;
        this.totalPaid = totalPaid;
        this.balanceRemaining = balanceRemaining;
        this.changeReturned = changeReturned;
        this.status = InputValidator.requireNonBlank(status, "Transaction status");
        this.date = InputValidator.requireNonBlank(date, "Transaction date");
        this.time = InputValidator.requireNonBlank(time, "Transaction time");
    }

    public String getTransactionId() {
        return transactionId;
    }

    public Invoice getInvoice() {
        return invoice;
    }

    public List<Payment> getPayments() {
        return payments;
    }

    public double getTotalDue() {
        return totalDue;
    }

    public double getTotalPaid() {
        return totalPaid;
    }

    public double getBalanceRemaining() {
        return balanceRemaining;
    }

    public double getChangeReturned() {
        return changeReturned;
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

