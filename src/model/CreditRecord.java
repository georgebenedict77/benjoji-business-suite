package model;

import util.InputValidator;

public class CreditRecord {
    private final String creditId;
    private final Customer customer;
    private final String transactionId;
    private double amountOwed;
    private final String date;
    private final String time;
    private String status;

    public CreditRecord(String creditId, Customer customer, String transactionId, double amountOwed, String date, String time,
            String status) {
        this.creditId = InputValidator.requireNonBlank(creditId, "Credit ID");
        if (customer == null) {
            throw new IllegalArgumentException("Customer is required.");
        }
        this.customer = customer;
        this.transactionId = InputValidator.requireNonBlank(transactionId, "Transaction ID");
        this.amountOwed = InputValidator.requirePositiveAmount(amountOwed, "Amount owed");
        this.date = InputValidator.requireNonBlank(date, "Credit date");
        this.time = InputValidator.requireNonBlank(time, "Credit time");
        this.status = InputValidator.requireNonBlank(status, "Credit status");
    }

    public String getCreditId() {
        return creditId;
    }

    public Customer getCustomer() {
        return customer;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public double getAmountOwed() {
        return amountOwed;
    }

    public String getDate() {
        return date;
    }

    public String getTime() {
        return time;
    }

    public String getStatus() {
        return status;
    }

    public boolean hasOutstandingBalance() {
        return amountOwed > 0.0001;
    }

    public double applyPayment(double paymentAmount) {
        double safeAmount = InputValidator.requirePositiveAmount(paymentAmount, "Credit payment");
        double appliedAmount = Math.min(amountOwed, safeAmount);
        amountOwed -= appliedAmount;
        status = hasOutstandingBalance() ? "PARTIAL" : "CLEARED";
        return appliedAmount;
    }
}

