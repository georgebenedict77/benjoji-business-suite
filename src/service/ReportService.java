package service;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import model.CreditRecord;
import model.Report;
import model.SalesRecord;
import model.StockRecord;
import service.PaymentService.PaymentLedgerEntry;
import util.DateTimeUtil;
import util.Formatter;
import util.IDGenerator;

public class ReportService {
    private final List<Report> reports = new ArrayList<>();

    public Report generateDailySalesReport(String businessName, LocalDate targetDate, List<SalesRecord> salesRecords,
            List<CreditRecord> creditRecords, List<PaymentLedgerEntry> paymentLedgerEntries, String preparedBy, String authorizedBy,
            String signaturePlaceholder) {
        return buildReport("DAILY SALES REPORT", businessName, DateTimeUtil.formatDate(targetDate), targetDate, targetDate, salesRecords,
                creditRecords, paymentLedgerEntries, preparedBy, authorizedBy, signaturePlaceholder);
    }

    public Report generateWeeklySalesReport(String businessName, LocalDate anchorDate, List<SalesRecord> salesRecords,
            List<CreditRecord> creditRecords, List<PaymentLedgerEntry> paymentLedgerEntries, String preparedBy, String authorizedBy,
            String signaturePlaceholder) {
        LocalDate startDate = DateTimeUtil.startOfWeek(anchorDate);
        LocalDate endDate = DateTimeUtil.endOfWeek(anchorDate);
        String range = DateTimeUtil.formatDate(startDate) + " to " + DateTimeUtil.formatDate(endDate);
        return buildReport("WEEKLY SALES REPORT", businessName, range, startDate, endDate, salesRecords, creditRecords,
                paymentLedgerEntries, preparedBy, authorizedBy, signaturePlaceholder);
    }

    public List<Report> getReports() {
        return Collections.unmodifiableList(reports);
    }

    public String formatReport(Report report, LocalDate startDate, LocalDate endDate, List<StockRecord> stockRecords) {
        StringBuilder builder = new StringBuilder();
        builder.append(Formatter.line()).append(System.lineSeparator());
        builder.append(report.getReportType()).append(System.lineSeparator());
        builder.append(report.getBusinessName()).append(System.lineSeparator());
        builder.append("Date / Range: ").append(report.getDateOrRange()).append(System.lineSeparator());
        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append("Total Sales: ").append(Formatter.currency(report.getTotalSales())).append(System.lineSeparator());
        builder.append("Total Paid: ").append(Formatter.currency(report.getTotalPaid())).append(System.lineSeparator());
        builder.append("Total Credit: ").append(Formatter.currency(report.getTotalCredit())).append(System.lineSeparator());
        builder.append("Outstanding Debt: ").append(Formatter.currency(report.getOutstandingDebt())).append(System.lineSeparator());
        builder.append("Payment Breakdown: ").append(report.getPaymentMethodBreakdown()).append(System.lineSeparator());

        if ("WEEKLY SALES REPORT".equals(report.getReportType())) {
            int stockIn = 0;
            int stockOut = 0;
            for (StockRecord record : stockRecords) {
                if (!DateTimeUtil.isWithinRange(record.getDate(), startDate, endDate)) {
                    continue;
                }
                if ("STOCK_IN".equalsIgnoreCase(record.getActionType())) {
                    stockIn += record.getQuantityChanged();
                } else if ("STOCK_OUT".equalsIgnoreCase(record.getActionType())) {
                    stockOut += record.getQuantityChanged();
                }
            }
            builder.append("Stock Movement In: ").append(stockIn).append(System.lineSeparator());
            builder.append("Stock Movement Out: ").append(stockOut).append(System.lineSeparator());
        }

        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append("Prepared By: ").append(report.getPreparedBy()).append(System.lineSeparator());
        builder.append("Authorized By: ").append(report.getAuthorizedBy()).append(System.lineSeparator());
        builder.append("Signature: ").append(report.getSignaturePlaceholder()).append(System.lineSeparator());
        builder.append(Formatter.line());
        return builder.toString();
    }

    private Report buildReport(String reportType, String businessName, String dateOrRange, LocalDate startDate, LocalDate endDate,
            List<SalesRecord> salesRecords, List<CreditRecord> creditRecords, List<PaymentLedgerEntry> paymentLedgerEntries,
            String preparedBy, String authorizedBy, String signaturePlaceholder) {
        List<SalesRecord> filteredSales = salesRecords.stream()
                .filter(record -> DateTimeUtil.isWithinRange(record.getDate(), startDate, endDate)).toList();

        double totalSales = filteredSales.stream().mapToDouble(SalesRecord::getTotalAmount).sum();
        double totalCredit = filteredSales.stream().mapToDouble(SalesRecord::getBalance).sum();
        double outstandingDebt = creditRecords.stream().filter(CreditRecord::hasOutstandingBalance).mapToDouble(CreditRecord::getAmountOwed)
                .sum();

        Map<String, Double> paymentBreakdown = new LinkedHashMap<>();
        for (PaymentLedgerEntry entry : paymentLedgerEntries) {
            if (!DateTimeUtil.isWithinRange(entry.getDate(), startDate, endDate)) {
                continue;
            }
            paymentBreakdown.merge(entry.getPaymentMethod(), entry.getAmount(), Double::sum);
        }
        double totalPaid = paymentBreakdown.values().stream().mapToDouble(Double::doubleValue).sum();

        Report report = new Report(IDGenerator.generate("RPT"), reportType, businessName, dateOrRange, totalSales, totalPaid, totalCredit,
                outstandingDebt, formatPaymentBreakdown(paymentBreakdown), preparedBy, authorizedBy, signaturePlaceholder);
        reports.add(report);
        return report;
    }

    private String formatPaymentBreakdown(Map<String, Double> breakdown) {
        if (breakdown.isEmpty()) {
            return "No payments recorded";
        }

        StringBuilder builder = new StringBuilder();
        boolean first = true;
        for (Map.Entry<String, Double> entry : breakdown.entrySet()) {
            if (!first) {
                builder.append(", ");
            }
            builder.append(entry.getKey()).append("=").append(Formatter.currency(entry.getValue()));
            first = false;
        }
        return builder.toString();
    }
}
