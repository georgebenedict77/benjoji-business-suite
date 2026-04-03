package model;

import util.InputValidator;

public class Payment {
    private final String paymentId;
    private final String paymentMethod;
    private final double amount;
    private final String confirmationStatus;

    public Payment(String paymentId, String paymentMethod, double amount, String confirmationStatus) {
        this.paymentId = InputValidator.requireNonBlank(paymentId, "Payment ID");
        this.paymentMethod = InputValidator.requireNonBlank(paymentMethod, "Payment method");
        this.amount = InputValidator.requirePositiveAmount(amount, "Payment amount");
        this.confirmationStatus = InputValidator.requireNonBlank(confirmationStatus, "Confirmation status");
    }

    public String getPaymentId() {
        return paymentId;
    }

    public String getPaymentMethod() {
        return paymentMethod;
    }

    public double getAmount() {
        return amount;
    }

    public String getConfirmationStatus() {
        return confirmationStatus;
    }
}

