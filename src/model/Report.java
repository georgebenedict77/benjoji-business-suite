package model;

import util.InputValidator;

public class Report {
    private final String reportId;
    private final String reportType;
    private final String businessName;
    private final String dateOrRange;
    private final double totalSales;
    private final double totalPaid;
    private final double totalCredit;
    private final double outstandingDebt;
    private final String paymentMethodBreakdown;
    private final String preparedBy;
    private final String authorizedBy;
    private final String signaturePlaceholder;

    public Report(String reportId, String reportType, String businessName, String dateOrRange, double totalSales, double totalPaid,
            double totalCredit, double outstandingDebt, String paymentMethodBreakdown, String preparedBy, String authorizedBy,
            String signaturePlaceholder) {
        this.reportId = InputValidator.requireNonBlank(reportId, "Report ID");
        this.reportType = InputValidator.requireNonBlank(reportType, "Report type");
        this.businessName = InputValidator.requireNonBlank(businessName, "Business name");
        this.dateOrRange = InputValidator.requireNonBlank(dateOrRange, "Date or range");
        this.totalSales = totalSales;
        this.totalPaid = totalPaid;
        this.totalCredit = totalCredit;
        this.outstandingDebt = outstandingDebt;
        this.paymentMethodBreakdown = InputValidator.requireNonBlank(paymentMethodBreakdown, "Payment breakdown");
        this.preparedBy = InputValidator.requireNonBlank(preparedBy, "Prepared by");
        this.authorizedBy = InputValidator.requireNonBlank(authorizedBy, "Authorized by");
        this.signaturePlaceholder = InputValidator.requireNonBlank(signaturePlaceholder, "Signature placeholder");
    }

    public String getReportId() {
        return reportId;
    }

    public String getReportType() {
        return reportType;
    }

    public String getBusinessName() {
        return businessName;
    }

    public String getDateOrRange() {
        return dateOrRange;
    }

    public double getTotalSales() {
        return totalSales;
    }

    public double getTotalPaid() {
        return totalPaid;
    }

    public double getTotalCredit() {
        return totalCredit;
    }

    public double getOutstandingDebt() {
        return outstandingDebt;
    }

    public String getPaymentMethodBreakdown() {
        return paymentMethodBreakdown;
    }

    public String getPreparedBy() {
        return preparedBy;
    }

    public String getAuthorizedBy() {
        return authorizedBy;
    }

    public String getSignaturePlaceholder() {
        return signaturePlaceholder;
    }
}
