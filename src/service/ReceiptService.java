package service;

import java.util.List;

import model.Invoice;
import model.Payment;
import model.Receipt;
import model.SaleItem;
import model.Transaction;
import util.DateTimeUtil;
import util.Formatter;
import util.IDGenerator;

public class ReceiptService {
    public Receipt generateSaleReceipt(String businessName, Transaction transaction) {
        Invoice invoice = transaction.getInvoice();
        return new Receipt(IDGenerator.generate("RCT"), businessName, invoice.getCustomerName(), transaction.getTransactionId(),
                invoice.getInvoiceNumber(), invoice.getSaleItems(), transaction.getPayments(), transaction.getTotalDue(),
                transaction.getTotalPaid(), transaction.getBalanceRemaining(), transaction.getChangeReturned(), transaction.getStatus(),
                transaction.getDate(), transaction.getTime());
    }

    public Receipt generateDebtPaymentReceipt(String businessName, String customerName, List<Payment> payments, double appliedAmount,
            double remainingDebt, double changeReturned) {
        double totalDebtBeforePayment = appliedAmount + remainingDebt;
        String status = remainingDebt > 0.0001 ? "DEBT PARTIAL" : "DEBT CLEARED";
        return new Receipt(IDGenerator.generate("RCT"), businessName, customerName, IDGenerator.generate("DTP"), "DEBT-ACCOUNT", List.of(),
                payments, totalDebtBeforePayment, appliedAmount, remainingDebt, changeReturned, status, DateTimeUtil.currentDateString(),
                DateTimeUtil.currentTimeString());
    }

    public String formatReceipt(Receipt receipt) {
        StringBuilder builder = new StringBuilder();
        builder.append(Formatter.line()).append(System.lineSeparator());
        builder.append(receipt.getBusinessName()).append(System.lineSeparator());
        builder.append("RECEIPT: ").append(receipt.getReceiptNumber()).append(System.lineSeparator());
        builder.append("Customer: ").append(receipt.getCustomerName()).append(System.lineSeparator());
        builder.append("Transaction: ").append(receipt.getTransactionId()).append(System.lineSeparator());
        builder.append("Invoice: ").append(receipt.getInvoiceNumber()).append(System.lineSeparator());
        builder.append("Date: ").append(receipt.getDate()).append(" ").append(receipt.getTime()).append(System.lineSeparator());
        builder.append(Formatter.shortLine()).append(System.lineSeparator());

        if (receipt.getSaleItems().isEmpty()) {
            builder.append("Debt payment receipt").append(System.lineSeparator());
        } else {
            builder.append("Items").append(System.lineSeparator());
            for (SaleItem item : receipt.getSaleItems()) {
                builder.append("- ").append(item.getProduct().getProductName()).append(" x").append(item.getQuantity()).append(" @ ")
                        .append(Formatter.currency(item.getProduct().getUnitPrice())).append(" = ")
                        .append(Formatter.currency(item.getSubtotal())).append(System.lineSeparator());
            }
        }

        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append("Payments").append(System.lineSeparator());
        if (receipt.getPayments().isEmpty()) {
            builder.append("- No payment received").append(System.lineSeparator());
        } else {
            for (Payment payment : receipt.getPayments()) {
                builder.append("- ").append(payment.getPaymentMethod()).append(": ").append(Formatter.currency(payment.getAmount()))
                        .append(" [").append(payment.getConfirmationStatus()).append("]").append(System.lineSeparator());
            }
        }

        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append("Total Due: ").append(Formatter.currency(receipt.getTotalDue())).append(System.lineSeparator());
        builder.append("Total Paid: ").append(Formatter.currency(receipt.getTotalPaid())).append(System.lineSeparator());
        builder.append("Balance: ").append(Formatter.currency(receipt.getBalanceRemaining())).append(System.lineSeparator());
        builder.append("Change: ").append(Formatter.currency(receipt.getChangeReturned())).append(System.lineSeparator());
        builder.append("Status: ").append(receipt.getStatus()).append(System.lineSeparator());
        builder.append(Formatter.line());
        return builder.toString();
    }
}

