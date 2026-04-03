package model;

import util.InputValidator;

public class Product {
    private final String productId;
    private String productName;
    private double unitPrice;
    private int stockQuantity;

    public Product(String productId, String productName, double unitPrice, int stockQuantity) {
        this.productId = InputValidator.requireNonBlank(productId, "Product ID");
        this.productName = InputValidator.requireNonBlank(productName, "Product name");
        this.unitPrice = InputValidator.requirePositiveAmount(unitPrice, "Unit price");
        this.stockQuantity = InputValidator.requirePositiveQuantity(stockQuantity, "Stock quantity");
    }

    public String getProductId() {
        return productId;
    }

    public String getProductName() {
        return productName;
    }

    public void setProductName(String productName) {
        this.productName = InputValidator.requireNonBlank(productName, "Product name");
    }

    public double getUnitPrice() {
        return unitPrice;
    }

    public void setUnitPrice(double unitPrice) {
        this.unitPrice = InputValidator.requirePositiveAmount(unitPrice, "Unit price");
    }

    public int getStockQuantity() {
        return stockQuantity;
    }

    public void increaseStockQuantity(int quantity) {
        stockQuantity += InputValidator.requirePositiveQuantity(quantity, "Quantity");
    }

    public void decreaseStockQuantity(int quantity) {
        int safeQuantity = InputValidator.requirePositiveQuantity(quantity, "Quantity");
        if (safeQuantity > stockQuantity) {
            throw new IllegalArgumentException("Insufficient stock for " + productName + ".");
        }
        stockQuantity -= safeQuantity;
    }
}

