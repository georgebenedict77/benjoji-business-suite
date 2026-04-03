package service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

import model.Invoice;
import model.Product;
import model.SaleItem;
import model.SalesRecord;
import model.Transaction;
import util.DateTimeUtil;
import util.Formatter;
import util.IDGenerator;
import util.InputValidator;

public class SalesService {
    private final List<SalesRecord> salesRecords = new ArrayList<>();

    public SaleItem createSaleItem(Product product, int quantity) {
        if (product == null) {
            throw new IllegalArgumentException("Select a valid product.");
        }
        int safeQuantity = InputValidator.requirePositiveQuantity(quantity, "Quantity");
        if (safeQuantity > product.getStockQuantity()) {
            throw new IllegalArgumentException("Insufficient stock for " + product.getProductName() + ".");
        }
        return new SaleItem(product, safeQuantity);
    }

    public Invoice createInvoice(String businessName, String customerName, List<SaleItem> saleItems) {
        return new Invoice(IDGenerator.generate("INV"), InputValidator.requireNonBlank(businessName, "Business name"),
                InputValidator.normalizeWalkInCustomer(customerName), saleItems, DateTimeUtil.currentDateString(),
                DateTimeUtil.currentTimeString());
    }

    public SalesRecord recordSale(Transaction transaction, String paymentSummary) {
        if (transaction == null) {
            throw new IllegalArgumentException("Transaction is required.");
        }

        SalesRecord record = new SalesRecord(IDGenerator.generate("SAL"), transaction.getTransactionId(),
                transaction.getInvoice().getCustomerName(), transaction.getTotalDue(), transaction.getTotalPaid(),
                transaction.getBalanceRemaining(), paymentSummary, transaction.getStatus(), transaction.getDate(), transaction.getTime());
        salesRecords.add(record);
        return record;
    }

    public List<SalesRecord> getSalesRecords() {
        return Collections.unmodifiableList(salesRecords);
    }

    public String formatSalesRecords() {
        if (salesRecords.isEmpty()) {
            return "No sales records available yet.";
        }

        StringBuilder builder = new StringBuilder();
        builder.append(Formatter.line()).append(System.lineSeparator());
        builder.append("SALES RECORDS").append(System.lineSeparator());
        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append(String.format("%-16s %-20s %-14s %-14s %-12s %-12s%n", "Transaction", "Customer", "Total", "Paid", "Balance",
                "Status"));
        builder.append(Formatter.shortLine()).append(System.lineSeparator());

        for (SalesRecord record : salesRecords) {
            builder.append(String.format("%-16s %-20s %-14s %-14s %-12s %-12s%n", Formatter.truncate(record.getTransactionId(), 16),
                    Formatter.truncate(record.getCustomerName(), 20), Formatter.currency(record.getTotalAmount()),
                    Formatter.currency(record.getTotalPaid()), Formatter.currency(record.getBalance()),
                    Formatter.truncate(record.getStatus(), 12)));
        }

        builder.append(Formatter.line());
        return builder.toString();
    }
}

