package model;

import util.InputValidator;

public class Customer {
    private final String customerId;
    private String customerName;
    private String phoneNumber;
    private double outstandingDebt;

    public Customer(String customerId, String customerName, String phoneNumber) {
        this.customerId = InputValidator.requireNonBlank(customerId, "Customer ID");
        this.customerName = InputValidator.requireNonBlank(customerName, "Customer name");
        this.phoneNumber = phoneNumber == null ? "" : phoneNumber.trim();
        this.outstandingDebt = 0.0;
    }

    public String getCustomerId() {
        return customerId;
    }

    public String getCustomerName() {
        return customerName;
    }

    public void setCustomerName(String customerName) {
        this.customerName = InputValidator.requireNonBlank(customerName, "Customer name");
    }

    public String getPhoneNumber() {
        return phoneNumber;
    }

    public void setPhoneNumber(String phoneNumber) {
        this.phoneNumber = phoneNumber == null ? "" : phoneNumber.trim();
    }

    public double getOutstandingDebt() {
        return outstandingDebt;
    }

    public void addDebt(double amount) {
        outstandingDebt += InputValidator.requirePositiveAmount(amount, "Debt amount");
    }

    public double settleDebt(double amount) {
        double safeAmount = InputValidator.requirePositiveAmount(amount, "Debt payment");
        double appliedAmount = Math.min(safeAmount, outstandingDebt);
        outstandingDebt -= appliedAmount;
        return appliedAmount;
    }
}

