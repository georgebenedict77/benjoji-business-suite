package model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import util.InputValidator;

public class Receipt {
    private final String receiptNumber;
    private final String businessName;
    private final String customerName;
    private final String transactionId;
    private final String invoiceNumber;
    private final List<SaleItem> saleItems;
    private final List<Payment> payments;
    private final double totalDue;
    private final double totalPaid;
    private final double balanceRemaining;
    private final double changeReturned;
    private final String status;
    private final String date;
    private final String time;

    public Receipt(String receiptNumber, String businessName, String customerName, String transactionId, String invoiceNumber,
            List<SaleItem> saleItems, List<Payment> payments, double totalDue, double totalPaid, double balanceRemaining,
            double changeReturned, String status, String date, String time) {
        this.receiptNumber = InputValidator.requireNonBlank(receiptNumber, "Receipt number");
        this.businessName = InputValidator.requireNonBlank(businessName, "Business name");
        this.customerName = InputValidator.requireNonBlank(customerName, "Customer name");
        this.transactionId = InputValidator.requireNonBlank(transactionId, "Transaction ID");
        this.invoiceNumber = InputValidator.requireNonBlank(invoiceNumber, "Invoice number");
        this.saleItems = saleItems == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(saleItems));
        this.payments = payments == null ? List.of() : Collections.unmodifiableList(new ArrayList<>(payments));
        this.totalDue = totalDue;
        this.totalPaid = totalPaid;
        this.balanceRemaining = balanceRemaining;
        this.changeReturned = changeReturned;
        this.status = InputValidator.requireNonBlank(status, "Receipt status");
        this.date = InputValidator.requireNonBlank(date, "Receipt date");
        this.time = InputValidator.requireNonBlank(time, "Receipt time");
    }

    public String getReceiptNumber() {
        return receiptNumber;
    }

    public String getBusinessName() {
        return businessName;
    }

    public String getCustomerName() {
        return customerName;
    }

    public String getTransactionId() {
        return transactionId;
    }

    public String getInvoiceNumber() {
        return invoiceNumber;
    }

    public List<SaleItem> getSaleItems() {
        return saleItems;
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

