package model;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import util.InputValidator;

public class Invoice {
    private final String invoiceNumber;
    private final String businessName;
    private final String customerName;
    private final List<SaleItem> saleItems;
    private final double totalAmount;
    private final String date;
    private final String time;

    public Invoice(String invoiceNumber, String businessName, String customerName, List<SaleItem> saleItems, String date, String time) {
        this.invoiceNumber = InputValidator.requireNonBlank(invoiceNumber, "Invoice number");
        this.businessName = InputValidator.requireNonBlank(businessName, "Business name");
        this.customerName = InputValidator.requireNonBlank(customerName, "Customer name");
        if (saleItems == null || saleItems.isEmpty()) {
            throw new IllegalArgumentException("An invoice must contain at least one sale item.");
        }
        this.saleItems = Collections.unmodifiableList(new ArrayList<>(saleItems));
        this.totalAmount = this.saleItems.stream().mapToDouble(SaleItem::getSubtotal).sum();
        this.date = InputValidator.requireNonBlank(date, "Invoice date");
        this.time = InputValidator.requireNonBlank(time, "Invoice time");
    }

    public String getInvoiceNumber() {
        return invoiceNumber;
    }

    public String getBusinessName() {
        return businessName;
    }

    public String getCustomerName() {
        return customerName;
    }

    public List<SaleItem> getSaleItems() {
        return saleItems;
    }

    public double getTotalAmount() {
        return totalAmount;
    }

    public String getDate() {
        return date;
    }

    public String getTime() {
        return time;
    }
}

