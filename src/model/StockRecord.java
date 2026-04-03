package model;

import util.InputValidator;

public class StockRecord {
    private final String stockRecordId;
    private final String productName;
    private final int quantityChanged;
    private final String actionType;
    private final String date;
    private final String time;
    private final String authorizedBy;
    private final String signaturePlaceholder;
    private final String referenceTransactionId;

    public StockRecord(String stockRecordId, String productName, int quantityChanged, String actionType, String date, String time,
            String authorizedBy, String signaturePlaceholder, String referenceTransactionId) {
        this.stockRecordId = InputValidator.requireNonBlank(stockRecordId, "Stock record ID");
        this.productName = InputValidator.requireNonBlank(productName, "Product name");
        this.quantityChanged = InputValidator.requirePositiveQuantity(quantityChanged, "Quantity changed");
        this.actionType = InputValidator.requireNonBlank(actionType, "Action type");
        this.date = InputValidator.requireNonBlank(date, "Stock record date");
        this.time = InputValidator.requireNonBlank(time, "Stock record time");
        this.authorizedBy = InputValidator.requireNonBlank(authorizedBy, "Authorized by");
        this.signaturePlaceholder = InputValidator.requireNonBlank(signaturePlaceholder, "Signature placeholder");
        this.referenceTransactionId = InputValidator.requireNonBlank(referenceTransactionId, "Reference transaction ID");
    }

    public String getStockRecordId() {
        return stockRecordId;
    }

    public String getProductName() {
        return productName;
    }

    public int getQuantityChanged() {
        return quantityChanged;
    }

    public String getActionType() {
        return actionType;
    }

    public String getDate() {
        return date;
    }

    public String getTime() {
        return time;
    }

    public String getAuthorizedBy() {
        return authorizedBy;
    }

    public String getSignaturePlaceholder() {
        return signaturePlaceholder;
    }

    public String getReferenceTransactionId() {
        return referenceTransactionId;
    }
}

