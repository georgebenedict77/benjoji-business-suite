package service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;

import model.Product;
import model.SaleItem;
import model.StockRecord;
import util.DateTimeUtil;
import util.Formatter;
import util.IDGenerator;
import util.InputValidator;

public class InventoryService {
    private final List<Product> products = new ArrayList<>();
    private final List<StockRecord> stockRecords = new ArrayList<>();

    public Product addOrStockInProduct(String productName, double unitPrice, int quantity, String authorizedBy) {
        String normalizedProductName = InputValidator.normalizeProductName(productName);
        InputValidator.requirePositiveAmount(unitPrice, "Unit price");
        InputValidator.requirePositiveQuantity(quantity, "Quantity");

        Product product = findProductByName(normalizedProductName).orElse(null);
        if (product == null) {
            product = new Product(IDGenerator.generate("PRD"), normalizedProductName, unitPrice, quantity);
            products.add(product);
        } else {
            product.setUnitPrice(unitPrice);
            product.increaseStockQuantity(quantity);
        }

        stockRecords.add(createStockRecord(product.getProductName(), quantity, "STOCK_IN", authorizedBy, "N/A"));
        return product;
    }

    public Optional<Product> findProductByName(String productName) {
        if (InputValidator.isBlank(productName)) {
            return Optional.empty();
        }
        String normalized = productName.trim();
        return products.stream().filter(product -> product.getProductName().equalsIgnoreCase(normalized)).findFirst();
    }

    public boolean isStockAvailable(Product product, int quantity) {
        return product != null && quantity > 0 && product.getStockQuantity() >= quantity;
    }

    public List<StockRecord> reduceStockForSale(List<SaleItem> saleItems, String authorizedBy, String transactionId) {
        List<StockRecord> generatedRecords = new ArrayList<>();
        for (SaleItem item : saleItems) {
            item.getProduct().decreaseStockQuantity(item.getQuantity());
            StockRecord record = createStockRecord(item.getProduct().getProductName(), item.getQuantity(), "STOCK_OUT", authorizedBy,
                    transactionId);
            stockRecords.add(record);
            generatedRecords.add(record);
        }
        return generatedRecords;
    }

    public List<Product> getProducts() {
        return Collections.unmodifiableList(products);
    }

    public List<StockRecord> getStockRecords() {
        return Collections.unmodifiableList(stockRecords);
    }

    public String getInventorySnapshot() {
        if (products.isEmpty()) {
            return "No products available. Add stock first.";
        }

        StringBuilder builder = new StringBuilder();
        builder.append(Formatter.line()).append(System.lineSeparator());
        builder.append("CURRENT INVENTORY").append(System.lineSeparator());
        builder.append(Formatter.shortLine()).append(System.lineSeparator());
        builder.append(String.format("%-16s %-24s %-14s %-10s%n", "Product ID", "Product", "Unit Price", "Stock"));
        builder.append(Formatter.shortLine()).append(System.lineSeparator());

        products.stream().sorted(Comparator.comparing(Product::getProductName, String.CASE_INSENSITIVE_ORDER)).forEach(product -> builder
                .append(String.format("%-16s %-24s %-14s %-10d%n", Formatter.truncate(product.getProductId(), 16),
                        Formatter.truncate(product.getProductName(), 24), Formatter.currency(product.getUnitPrice()),
                        product.getStockQuantity())));

        builder.append(Formatter.line());
        return builder.toString();
    }

    private StockRecord createStockRecord(String productName, int quantityChanged, String actionType, String authorizedBy,
            String referenceTransactionId) {
        String approvedBy = InputValidator.isBlank(authorizedBy) ? "System" : authorizedBy.trim();
        return new StockRecord(IDGenerator.generate("STK"), productName, quantityChanged, actionType, DateTimeUtil.currentDateString(),
                DateTimeUtil.currentTimeString(), approvedBy, "________________", referenceTransactionId);
    }
}

