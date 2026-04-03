package model;

import util.InputValidator;

public class SaleItem {
    private final Product product;
    private final int quantity;
    private final double subtotal;

    public SaleItem(Product product, int quantity) {
        if (product == null) {
            throw new IllegalArgumentException("Product is required.");
        }
        this.product = product;
        this.quantity = InputValidator.requirePositiveQuantity(quantity, "Sale quantity");
        this.subtotal = product.getUnitPrice() * quantity;
    }

    public Product getProduct() {
        return product;
    }

    public int getQuantity() {
        return quantity;
    }

    public double getSubtotal() {
        return subtotal;
    }
}

