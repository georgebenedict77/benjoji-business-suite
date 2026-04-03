package util;

import java.util.Locale;

public final class Formatter {
    private Formatter() {
    }

    public static String currency(double amount) {
        return String.format(Locale.US, "KES %,.2f", amount);
    }

    public static String line() {
        return "================================================================";
    }

    public static String shortLine() {
        return "------------------------------------------------------------";
    }

    public static String truncate(String value, int width) {
        if (value == null) {
            return "";
        }
        if (value.length() <= width) {
            return value;
        }
        if (width <= 3) {
            return value.substring(0, width);
        }
        return value.substring(0, width - 3) + "...";
    }

    public static String padRight(String value, int width) {
        return String.format(Locale.US, "%-" + width + "s", truncate(value, width));
    }
}

