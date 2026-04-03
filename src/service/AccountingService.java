package service;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import model.CreditRecord;
import model.SalesRecord;
import service.PaymentService.PaymentLedgerEntry;
import util.Formatter;

public class AccountingService {
    public String generateAccountingSummary(String businessName, List<SalesRecord> salesRecords, List<CreditRecord> creditRecords,
            List<PaymentLedgerEntry> paymentLedgerEntries) {
        double totalSales = salesRecords.stream().mapToDouble(SalesRecord::getTotalAmount).sum();
        double totalPaid = paymentLedgerEntries.stream().mapToDouble(PaymentLedgerEntry::getAmount).sum();
        double totalPaidAtSale = salesRecords.stream().mapToDouble(SalesRecord::getTotalPaid).sum();
        double totalCreditSales = salesRecords.stream().mapToDouble(SalesRecord::getBalance).sum();
        double outstandingDebt = creditRecords.stream().filter(CreditRecord::hasOutstandingBalance).mapToDouble(CreditRecord::getAmountOwed)
                .sum();

        Map<String, Double> paymentBreakdown = new LinkedHashMap<>();
        for (PaymentLedgerEntry entry : paymentLedgerEntries) {
            paymentBreakdown.merge(entry.getPaymentMethod(), entry.getAmount(), Double::sum);
        }

        StringBuilder builder = new StringBuilder();
        builder.append(Formatter.line()).append(System.lineSeparator());
        builder.append("ACCOUNTING SUMMARY").append(System.lineSeparator());
        builder.append(businessName).append(System.lineSeparator());
        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append("Number of sales: ").append(salesRecords.size()).append(System.lineSeparator());
        builder.append("Total sales value: ").append(Formatter.currency(totalSales)).append(System.lineSeparator());
        builder.append("Total paid received: ").append(Formatter.currency(totalPaid)).append(System.lineSeparator());
        builder.append("Collected during original sales: ").append(Formatter.currency(totalPaidAtSale)).append(System.lineSeparator());
        builder.append("Total credit sold: ").append(Formatter.currency(totalCreditSales)).append(System.lineSeparator());
        builder.append("Outstanding debt: ").append(Formatter.currency(outstandingDebt)).append(System.lineSeparator());
        builder.append("Payment method totals: ");

        if (paymentBreakdown.isEmpty()) {
            builder.append("No payments recorded").append(System.lineSeparator());
        } else {
            builder.append(System.lineSeparator());
            for (Map.Entry<String, Double> entry : paymentBreakdown.entrySet()) {
                builder.append("- ").append(entry.getKey()).append(": ").append(Formatter.currency(entry.getValue()))
                        .append(System.lineSeparator());
            }
        }

        builder.append(Formatter.line());
        return builder.toString();
    }
}
