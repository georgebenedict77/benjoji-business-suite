package util;

public final class InputValidator {
    private InputValidator() {
    }

    public static String requireNonBlank(String value, String fieldName) {
        if (isBlank(value)) {
            throw new IllegalArgumentException(fieldName + " cannot be empty.");
        }
        return value.trim();
    }

    public static double requirePositiveAmount(double value, String fieldName) {
        if (value <= 0) {
            throw new IllegalArgumentException(fieldName + " must be greater than zero.");
        }
        return value;
    }

    public static int requirePositiveQuantity(int value, String fieldName) {
        if (value <= 0) {
            throw new IllegalArgumentException(fieldName + " must be greater than zero.");
        }
        return value;
    }

    public static boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }

    public static String normalizeWalkInCustomer(String customerName) {
        return isBlank(customerName) ? "Walk-in Customer" : customerName.trim();
    }

    public static String normalizeProductName(String productName) {
        return requireNonBlank(productName, "Product name");
    }
}

